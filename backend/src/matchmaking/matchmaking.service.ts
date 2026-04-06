import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';
import { startSyncGame } from './sync-game';

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

  /** Pending disconnect timers — cancelled if user reconnects within grace period */
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private prisma: PrismaService,
    private voiceService: VoiceService,
  ) {}

  // ─── joinQueue ────────────────────────────────────────────────────────
  async joinQueue(
    userId: string,
    data: { lat?: number; lng?: number; preferences?: any },
    redis: Redis,
    server?: any,
  ): Promise<{ status: string }> {
    this.logger.log(`[joinQueue] userId=${userId}`);

    // If user already has an active match (e.g. matched during brief disconnect), resend it
    const existingMatchId = this.userToMatch.get(userId);
    if (existingMatchId && this.activeMatches.has(existingMatchId) && server) {
      this.logger.log(`[joinQueue] user ${userId} already matched (${existingMatchId}) — resending`);
      await this.resendMatchIfExists(userId, server);
      return { status: 'matched' };
    }

    // Remove stale state — user may be rejoining after ending a call
    await Promise.all([
      redis.srem(MATCHED_SET, userId),
      redis.zrem(QUEUE_KEY, userId),
    ]);

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
    this.logger.log(`[joinQueue] queued userId=${userId}`);
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

        if (!exists1 || !exists2) {
          if (exists1) await redis.zadd(QUEUE_KEY, Date.now(), u1);
          if (exists2) await redis.zadd(QUEUE_KEY, Date.now(), u2);
          continue;
        }

        this.logger.log(`[sweep] matching ${u1} <-> ${u2}`);
        await this.createMatch(u1, u2, redis, server);
      }
    } catch (err) {
      this.logger.error('[sweep] error:', err);
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
        this.logger.log(`[pop] ghost candidate ${candidateId} — skipping`);
        continue;
      }

      const alreadyMatched = await redis.sismember(MATCHED_SET, candidateId);
      if (alreadyMatched) {
        this.logger.log(`[pop] candidate ${candidateId} already matched — skipping`);
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

    startSyncGame(matchId, user1Id, user2Id, server);
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
    this.logger.log(`[endMatch] matchId=${matchId} userId=${userId} reason=${reason}`);

    const match = this.activeMatches.get(matchId);

    if (match) {
      this.activeMatches.delete(matchId);
      this.userToMatch.delete(match.user1Id);
      this.userToMatch.delete(match.user2Id);
      await redis.srem(MATCHED_SET, match.user1Id, match.user2Id);

      if (server) {
        const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
        server.to(`user:${partnerId}`).emit('partner_disconnected', { reason });
      }
    } else {
      const dbMatch = await this.prisma.match.findUnique({ where: { id: matchId } });
      if (dbMatch) {
        await redis.srem(MATCHED_SET, dbMatch.user1Id, dbMatch.user2Id);
        if (server) {
          const partnerId = dbMatch.user1Id === userId ? dbMatch.user2Id : dbMatch.user1Id;
          server.to(`user:${partnerId}`).emit('partner_disconnected', { reason });
        }
      }
    }

    this.prisma.match
      .update({ where: { id: matchId }, data: { status: 'ended', endedAt: new Date() } })
      .catch(() => {});
    this.prisma.session
      .updateMany({ where: { matchId }, data: { endedAt: new Date(), endReason: reason } })
      .catch(() => {});
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
        await this.endMatch(matchId, userId, 'partner_disconnected', redis, server);
      }

      await redis.srem(MATCHED_SET, userId);
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
      this.logger.log(`[reconnect] cancelled disconnect cleanup for userId=${userId}`);
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
}
