import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';

const QUEUE_KEY = 'matchmaking:queue';
const USER_DATA_PREFIX = 'matchmaking:user:';
const MATCHED_SET = 'matched:users';

/** Grace period before treating a disconnect as permanent (covers mobile tab switches, network blips) */
const DISCONNECT_GRACE_MS = 8000;

export interface ActiveMatch {
  user1Id: string;
  user2Id: string;
  roomName: string;
  startedAt: number;
}

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  readonly activeMatches = new Map<string, ActiveMatch>();
  private readonly userToMatch = new Map<string, string>();

  /** Users currently being torn down — prevents re-queue during teardown */
  private readonly tearingDown = new Set<string>();

  /** Pending disconnect timers — cancelled if user reconnects within grace period */
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();

  /** Currently connected users (by userId) — for active user count */
  private readonly activeUsers = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private voiceService: VoiceService,
  ) {}

  // ─── Presence tracking ────────────────────────────────────────────────

  addActiveUser(userId: string): boolean {
    if (this.activeUsers.has(userId)) {
      this.logger.log(`[presence] duplicate connect ignored for userId=${userId} (already active)`);
      return false;
    }
    this.activeUsers.add(userId);
    this.logger.log(`[presence] active user added: userId=${userId} total=${this.activeUsers.size}`);
    return true;
  }

  removeActiveUser(userId: string): boolean {
    if (!this.activeUsers.has(userId)) return false;
    this.activeUsers.delete(userId);
    this.logger.log(`[presence] active user removed: userId=${userId} total=${this.activeUsers.size}`);
    return true;
  }

  getActiveUserCount(): number {
    return this.activeUsers.size;
  }

  async getSearchingCount(redis: Redis): Promise<number> {
    return redis.zcard(QUEUE_KEY);
  }

  broadcastPresence(server: any, redis?: Redis) {
    const count = this.getActiveUserCount();
    const payload: any = { active: count };
    // Include searching count if redis is available (best-effort)
    if (redis) {
      redis.zcard(QUEUE_KEY).then((searching) => {
        server.emit('presence:update', { active: count, searching });
      }).catch(() => {
        server.emit('presence:update', payload);
      });
    } else {
      server.emit('presence:update', payload);
    }
    this.logger.log(`[presence] broadcast active=${count}`);
  }

  // ─── forceCleanupUser ──────────────────────────────────────────────────
  /** Remove ALL stale state for a user so they can cleanly rejoin queue */
  async forceCleanupUser(userId: string, redis: Redis) {
    this.logger.log(`[forceCleanup] userId=${userId} — clearing all stale state`);

    // Clear stale match references
    const staleMatchId = this.userToMatch.get(userId);
    if (staleMatchId) {
      this.activeMatches.delete(staleMatchId);
      this.userToMatch.delete(userId);
      this.logger.log(`[forceCleanup] removed stale matchId=${staleMatchId} for userId=${userId}`);
    }

    // Release teardown lock
    this.tearingDown.delete(userId);

    // Clear Redis state
    await Promise.all([
      redis.zrem(QUEUE_KEY, userId),
      redis.srem(MATCHED_SET, userId),
      redis.del(`${USER_DATA_PREFIX}${userId}`),
    ]);
  }

  // ─── joinQueue ────────────────────────────────────────────────────────
  async joinQueue(
    userId: string,
    data: { lat?: number; lng?: number; preferences?: any },
    redis: Redis,
    server?: any,
  ): Promise<{ status: string }> {
    this.logger.log(`[joinQueue] userId=${userId}`);

    // ── GUARD: if teardown is in progress, wait briefly then force-clear ──
    if (this.tearingDown.has(userId)) {
      this.logger.warn(`[joinQueue] user ${userId} teardown in progress — waiting 200ms`);
      await new Promise((r) => setTimeout(r, 200));
      if (this.tearingDown.has(userId)) {
        this.logger.warn(`[joinQueue] teardown still stuck for ${userId} — force-clearing`);
        this.tearingDown.delete(userId);
      }
    }

    // ── GUARD: if user has a stale match reference, clean it up ──
    const existingMatchId = this.userToMatch.get(userId);
    if (existingMatchId) {
      if (this.activeMatches.has(existingMatchId)) {
        // Match is genuinely active — resend match_found instead of queueing
        this.logger.warn(`[joinQueue] user ${userId} has active match ${existingMatchId} — resending`);
        if (server) {
          await this.resendMatchIfExists(userId, server);
        }
        return { status: 'matched' };
      }
      // Stale match ref (match already ended but ref wasn't cleaned) — clean up
      this.logger.warn(`[joinQueue] cleaning stale match ref ${existingMatchId} for user ${userId}`);
      this.userToMatch.delete(userId);
      await redis.srem(MATCHED_SET, userId);
    }

    // ── Clean up any existing queue entry to prevent duplicates ──
    const alreadyInQueue = await redis.zscore(QUEUE_KEY, userId);
    if (alreadyInQueue !== null) {
      this.logger.log(`[joinQueue] removing existing queue entry for ${userId} before re-inserting`);
      await redis.zrem(QUEUE_KEY, userId);
    }

    // Clean up stale Redis state (belt & suspenders)
    await redis.srem(MATCHED_SET, userId);

    // Store user metadata in Redis for the sweep matcher
    const hasLocation = data.lat != null && data.lng != null;

    await Promise.all([
      redis.hset(`${USER_DATA_PREFIX}${userId}`, {
        lat: data.lat ?? 0,
        lng: data.lng ?? 0,
        hasLocation: hasLocation ? '1' : '0',
        preferredGender: data.preferences?.preferredGender || 'any',
        minAge: String(data.preferences?.minAge || 18),
        maxAge: String(data.preferences?.maxAge || 99),
      }),
      redis.expire(`${USER_DATA_PREFIX}${userId}`, 300),
    ]);

    // Try to instantly pop a waiting partner
    const partnerId = await this.popAvailablePartner(userId, redis);

    if (partnerId && server) {
      this.logger.log(`[joinQueue] instant match: ${userId} <-> ${partnerId}`);
      await this.createMatch(userId, partnerId, redis, server);
      return { status: 'matched' };
    }

    // No partner available — join the queue and wait for the sweep or the next joiner
    await redis.zadd(QUEUE_KEY, Date.now(), userId);
    this.logger.log(`[joinQueue] QUEUED userId=${userId}`);
    return { status: 'queued' };
  }

  // ─── leaveQueue ───────────────────────────────────────────────────────
  async leaveQueue(userId: string, redis: Redis) {
    await Promise.all([
      redis.zrem(QUEUE_KEY, userId),
      redis.del(`${USER_DATA_PREFIX}${userId}`),
    ]);
    this.logger.log(`[leaveQueue] userId=${userId}`);
    return { status: 'left' };
  }

  // ─── runMatchmaking (fallback sweep) ──────────────────────────────────
  async runMatchmaking(redis: Redis, server: any) {
    try {
      // Prune stale entries first
      await this.pruneStaleQueueEntries(redis, server);

      const queueSize = await redis.zcard(QUEUE_KEY);
      if (queueSize < 2) return;

      while (true) {
        const results = await redis.zpopmin(QUEUE_KEY, 2);
        if (results.length < 4) {
          if (results.length >= 2) {
            await redis.zadd(QUEUE_KEY, Number(results[1]), results[0]);
          }
          break;
        }

        const u1 = results[0];
        const u2 = results[2];

        // Validate both users still have live metadata
        const [exists1, exists2] = await Promise.all([
          redis.exists(`${USER_DATA_PREFIX}${u1}`),
          redis.exists(`${USER_DATA_PREFIX}${u2}`),
        ]);

        // Also validate neither is already matched or tearing down
        const u1Ok = exists1 && !this.userToMatch.has(u1) && !this.tearingDown.has(u1);
        const u2Ok = exists2 && !this.userToMatch.has(u2) && !this.tearingDown.has(u2);

        if (!u1Ok || !u2Ok) {
          if (u1Ok) await redis.zadd(QUEUE_KEY, Date.now(), u1);
          if (u2Ok) await redis.zadd(QUEUE_KEY, Date.now(), u2);
          // Clean up bad entries
          if (!u1Ok && exists1 && this.userToMatch.has(u1)) {
            this.logger.log(`[sweep] removing already-matched user ${u1} from queue`);
          }
          if (!u2Ok && exists2 && this.userToMatch.has(u2)) {
            this.logger.log(`[sweep] removing already-matched user ${u2} from queue`);
          }
          continue;
        }

        this.logger.log(`[sweep] matching ${u1} <-> ${u2}`);
        await this.createMatch(u1, u2, redis, server);
      }
    } catch (err) {
      this.logger.error('[sweep] error:', err);
    }
  }

  // ─── pruneStaleQueueEntries ───────────────────────────────────────────
  /** Remove queue entries for users who are already matched, tearing down, or have no metadata */
  private async pruneStaleQueueEntries(redis: Redis, server: any) {
    try {
      const allQueued = await redis.zrange(QUEUE_KEY, 0, -1);
      if (!allQueued.length) return;

      for (const userId of allQueued) {
        let shouldRemove = false;
        let reason = '';

        // Check if user is already matched in-memory
        if (this.userToMatch.has(userId)) {
          shouldRemove = true;
          reason = 'has active match in-memory';
        }

        // Check if user is mid-teardown
        if (!shouldRemove && this.tearingDown.has(userId)) {
          shouldRemove = true;
          reason = 'teardown in progress';
        }

        // Check if metadata has expired (user disappeared without proper cleanup)
        if (!shouldRemove) {
          const hasMetadata = await redis.exists(`${USER_DATA_PREFIX}${userId}`);
          if (!hasMetadata) {
            shouldRemove = true;
            reason = 'no queue metadata';
          }
        }

        // Check if user is still in MATCHED_SET (leftover from previous match)
        if (!shouldRemove) {
          const isMatched = await redis.sismember(MATCHED_SET, userId);
          if (isMatched) {
            shouldRemove = true;
            reason = 'still in MATCHED_SET';
          }
        }

        // Check if user has any live socket connection
        if (!shouldRemove && server) {
          const room = server.sockets?.adapter?.rooms?.get(`user:${userId}`);
          if (!room || room.size === 0) {
            shouldRemove = true;
            reason = 'no live socket connection';
          }
        }

        if (shouldRemove) {
          this.logger.log(`[prune] removing stale queue entry: userId=${userId} reason=${reason}`);
          await redis.zrem(QUEUE_KEY, userId);
          await redis.del(`${USER_DATA_PREFIX}${userId}`);
        }
      }
    } catch (err) {
      this.logger.error('[prune] error:', err);
    }
  }

  // ─── popAvailablePartner ──────────────────────────────────────────────
  private async popAvailablePartner(userId: string, redis: Redis): Promise<string | null> {
    const MAX_TRIES = 5;
    const pushedBack: string[] = [];

    for (let i = 0; i < MAX_TRIES; i++) {
      const results = await redis.zpopmin(QUEUE_KEY, 1);
      if (!results.length) break;

      const candidateId = results[0];

      if (candidateId === userId) {
        pushedBack.push(candidateId);
        continue;
      }

      const exists = await redis.exists(`${USER_DATA_PREFIX}${candidateId}`);
      if (!exists) {
        this.logger.log(`[pop] ghost candidate ${candidateId} — no metadata, skipping`);
        continue;
      }

      const alreadyMatched = await redis.sismember(MATCHED_SET, candidateId);
      if (alreadyMatched) {
        this.logger.log(`[pop] candidate ${candidateId} already in MATCHED_SET — skipping`);
        continue;
      }

      // Also check in-memory match state (catches races where Redis is behind)
      if (this.userToMatch.has(candidateId)) {
        this.logger.log(`[pop] candidate ${candidateId} has in-memory match ref — skipping`);
        continue;
      }

      // Reject candidates mid-teardown
      if (this.tearingDown.has(candidateId)) {
        this.logger.log(`[pop] candidate ${candidateId} is tearing down — skipping`);
        continue;
      }

      // Valid partner found — restore any we popped accidentally
      if (pushedBack.length) {
        const args: (string | number)[] = [];
        pushedBack.forEach((id) => args.push(Date.now(), id));
        await (redis.zadd as any)(QUEUE_KEY, ...args);
      }
      return candidateId;
    }

    // Restore popped users
    if (pushedBack.length) {
      const args: (string | number)[] = [];
      pushedBack.forEach((id) => args.push(Date.now(), id));
      await (redis.zadd as any)(QUEUE_KEY, ...args);
    }
    return null;
  }

  // ─── createMatch ──────────────────────────────────────────────────────
  async createMatch(user1Id: string, user2Id: string, redis: Redis, server: any) {
    const matchId = randomUUID();
    const roomName = `room-${matchId}`;

    this.logger.log(`[createMatch] ${user1Id} <-> ${user2Id} | matchId=${matchId}`);

    const [token1, token2] = await Promise.all([
      this.voiceService.createToken(roomName, user1Id),
      this.voiceService.createToken(roomName, user2Id),
    ]);

    // Update Redis state before emitting
    await Promise.all([
      redis.sadd(MATCHED_SET, user1Id, user2Id),
      redis.expire(MATCHED_SET, 3600),
      redis.zrem(QUEUE_KEY, user1Id, user2Id),
      redis.del(`${USER_DATA_PREFIX}${user1Id}`, `${USER_DATA_PREFIX}${user2Id}`),
    ]);

    // Track in memory
    const matchRecord: ActiveMatch = { user1Id, user2Id, roomName, startedAt: Date.now() };
    this.activeMatches.set(matchId, matchRecord);
    this.userToMatch.set(user1Id, matchId);
    this.userToMatch.set(user2Id, matchId);

    const livekitUrl = process.env.LIVEKIT_URL || 'wss://dating-app-46dvc6ij.livekit.cloud';
    this.logger.log(`[createMatch] livekitUrl=${livekitUrl}`);

    // Emit match_found to both users immediately
    server.to(`user:${user1Id}`).emit('match_found', {
      matchId, roomName, token: token1, livekitUrl, partnerId: user2Id,
    });
    server.to(`user:${user2Id}`).emit('match_found', {
      matchId, roomName, token: token2, livekitUrl, partnerId: user1Id,
    });

    this.logger.log(`[createMatch] emitted match_found to both users`);

    // Persist to DB in background
    this.persistMatch(matchId, user1Id, user2Id, roomName).catch((err) =>
      this.logger.error(`[createMatch] DB persist failed: ${err}`),
    );

  }

  // ─── persistMatch ─────────────────────────────────────────────────────
  private async persistMatch(matchId: string, user1Id: string, user2Id: string, roomName: string) {
    await this.prisma.match.create({
      data: { id: matchId, user1Id, user2Id, livekitRoomName: roomName },
    });
    await this.prisma.session.create({ data: { matchId } });
  }

  // ─── endMatch ─────────────────────────────────────────────────────────
  async endMatch(matchId: string, userId: string, reason: string, redis: Redis, server?: any) {
    this.logger.log(`[endMatch] START matchId=${matchId} userId=${userId} reason=${reason}`);

    const match = this.activeMatches.get(matchId);

    if (match) {
      const { user1Id, user2Id } = match;

      // Mark both users as tearing down to prevent re-queue race
      this.tearingDown.add(user1Id);
      this.tearingDown.add(user2Id);

      this.activeMatches.delete(matchId);
      this.userToMatch.delete(user1Id);
      this.userToMatch.delete(user2Id);
      await redis.srem(MATCHED_SET, user1Id, user2Id);
      // Also remove any stale queue entries for both users
      await redis.zrem(QUEUE_KEY, user1Id, user2Id);

      if (server) {
        const partnerId = user1Id === userId ? user2Id : user1Id;
        const endPayload = { matchId, reason, endedBy: userId };
        server.to(`user:${userId}`).to(`user:${partnerId}`).emit('match_ended', endPayload);
        server.to(`user:${partnerId}`).emit('partner_disconnected', { reason });
      }

      // Release teardown lock AFTER all state is cleaned
      this.tearingDown.delete(user1Id);
      this.tearingDown.delete(user2Id);
      this.logger.log(`[endMatch] users ${user1Id}, ${user2Id} are now queue-eligible`);
    } else {
      // No in-memory match — check DB
      const dbMatch = await this.prisma.match.findUnique({ where: { id: matchId } }).catch(() => null);
      if (dbMatch) {
        this.tearingDown.add(dbMatch.user1Id);
        this.tearingDown.add(dbMatch.user2Id);
        this.userToMatch.delete(dbMatch.user1Id);
        this.userToMatch.delete(dbMatch.user2Id);
        await redis.srem(MATCHED_SET, dbMatch.user1Id, dbMatch.user2Id);
        await redis.zrem(QUEUE_KEY, dbMatch.user1Id, dbMatch.user2Id);
        if (server) {
          const partnerId = dbMatch.user1Id === userId ? dbMatch.user2Id : dbMatch.user1Id;
          const endPayload = { matchId, reason, endedBy: userId };
          server.to(`user:${userId}`).to(`user:${partnerId}`).emit('match_ended', endPayload);
          server.to(`user:${partnerId}`).emit('partner_disconnected', { reason });
        }
        this.tearingDown.delete(dbMatch.user1Id);
        this.tearingDown.delete(dbMatch.user2Id);
      } else {
        // No match found anywhere — just clean up the requesting user
        this.logger.warn(`[endMatch] no match found for matchId=${matchId} — cleaning up userId=${userId}`);
        this.userToMatch.delete(userId);
        this.tearingDown.delete(userId);
        await redis.srem(MATCHED_SET, userId);
      }
    }

    // Persist to DB in background (non-blocking)
    this.prisma.match
      .update({ where: { id: matchId }, data: { status: 'ended', endedAt: new Date() } })
      .catch(() => {});
    this.prisma.session
      .updateMany({ where: { matchId }, data: { endedAt: new Date(), endReason: reason } })
      .catch(() => {});

    this.logger.log(`[endMatch] COMPLETE matchId=${matchId}`);
  }

  // ─── handleUserDisconnect ─────────────────────────────────────────────
  /**
   * Called when a socket disconnects. Instead of immediately destroying state,
   * waits DISCONNECT_GRACE_MS. If the user reconnects (mobile tab switch,
   * network blip), cancelDisconnect() cancels the cleanup and the user stays
   * in the queue seamlessly.
   */
  handleUserDisconnect(userId: string, redis: Redis, server: any) {
    // Cancel any existing timer for this user (in case of rapid disconnect/reconnect)
    this.cancelDisconnect(userId);

    this.logger.log(`[disconnect] userId=${userId} — starting ${DISCONNECT_GRACE_MS}ms grace period`);

    const timer = setTimeout(async () => {
      this.disconnectTimers.delete(userId);
      this.logger.log(`[disconnect] grace period expired for userId=${userId} — cleaning up`);

      await this.leaveQueue(userId, redis);

      const matchId = this.userToMatch.get(userId);
      if (matchId) {
        // Clean up all game states for this match
        const { cleanupMemoryGame } = require('./memory-game');
        const { cleanupTicTacToe } = require('./tictactoe-game');
        const { cleanupRopeGame } = require('./rope-game');
        const { cleanupPongGame } = require('./pong-game');
        cleanupMemoryGame(matchId);
        cleanupTicTacToe(matchId);
        cleanupRopeGame(matchId);
        cleanupPongGame(matchId);
        await this.endMatch(matchId, userId, 'partner_disconnected', redis, server);
      } else {
        // No match but clean up any stale Redis refs
        this.logger.log(`[disconnect] no active match for userId=${userId} — cleaning stale refs`);
      }

      // Belt & suspenders: clean all stale state for this user
      await this.forceCleanupUser(userId, redis);

      // Remove from active presence and broadcast updated count
      this.removeActiveUser(userId);
      this.broadcastPresence(server, redis);
    }, DISCONNECT_GRACE_MS);

    this.disconnectTimers.set(userId, timer);
  }

  /**
   * Called when a user reconnects. Cancels the pending disconnect cleanup
   * so queue/match state is preserved across mobile network blips.
   */
  cancelDisconnect(userId: string) {
    const timer = this.disconnectTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(userId);
      this.logger.log(`[reconnect] cancelled disconnect cleanup for userId=${userId} — kept active user alive`);
    }
  }

  /**
   * If the user already has an active match (e.g. matched during a brief disconnect),
   * resend the match_found event so the client can navigate to the call page.
   * Returns true if a match was resent.
   */
  async resendMatchIfExists(userId: string, server: any): Promise<boolean> {
    const matchId = this.userToMatch.get(userId);
    if (!matchId) return false;

    const match = this.activeMatches.get(matchId);
    if (!match) return false;

    const token = await this.voiceService.createToken(match.roomName, userId);
    const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;

    server.to(`user:${userId}`).emit('match_found', {
      matchId,
      roomName: match.roomName,
      token,
      livekitUrl: process.env.LIVEKIT_URL || 'wss://dating-app-46dvc6ij.livekit.cloud',
      partnerId,
    });

    this.logger.log(`[resendMatch] resent match_found to userId=${userId} matchId=${matchId}`);
    return true;
  }

  getMatchIdForUser(userId: string): string | undefined {
    return this.userToMatch.get(userId);
  }

  // ─── resetQueue ───────────────────────────────────────────────────────
  /** 
   * Forcefully reset a user's queue state: clean all stale refs, remove from queue,
   * then re-insert as a fresh entry. Used for the 20-second no-match timeout.
   */
  async resetQueue(
    userId: string,
    data: { lat?: number; lng?: number; preferences?: any },
    redis: Redis,
    server?: any,
  ): Promise<{ status: string }> {
    this.logger.log(`[resetQueue] userId=${userId} — force-cleaning all state`);

    // Cancel any pending disconnect timer
    this.cancelDisconnect(userId);

    // Force-clean all user state
    await this.forceCleanupUser(userId, redis);

    // Now join queue fresh
    const result = await this.joinQueue(userId, data, redis, server);
    this.logger.log(`[resetQueue] complete for userId=${userId} result=${result.status}`);
    return result;
  }
}
