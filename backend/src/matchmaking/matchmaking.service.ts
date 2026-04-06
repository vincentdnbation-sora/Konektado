import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';
import { startSyncGame } from './sync-game';

const QUEUE_KEY = 'matchmaking:queue';
const USER_DATA_PREFIX = 'matchmaking:user:';
const MATCHED_SET = 'matched:users';

// In-memory registry of active matches for O(1) partner lookups without DB round-trips.
// This survives server restarts poorly but is intentional: on restart all sockets disconnect
// and matches are effectively ended anyway.
export interface ActiveMatch {
  user1Id: string;
  user2Id: string;
  roomName: string;
  startedAt: number;
}

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  // matchId → ActiveMatch
  readonly activeMatches = new Map<string, ActiveMatch>();
  // userId → matchId  (reverse index for O(1) partner lookup on disconnect)
  private readonly userToMatch = new Map<string, string>();

  constructor(
    private prisma: PrismaService,
    private voiceService: VoiceService,
  ) {}

  /**
   * Join the matchmaking queue.
   * If another user is already waiting, match immediately and return 'matched'.
   * Otherwise add self to queue and return 'queued'.
   */
  async joinQueue(
    userId: string,
    data: { lat?: number; lng?: number; preferences?: any },
    redis: Redis,
    server?: any,
  ): Promise<{ status: string }> {
    // Remove stale state — user may be rejoining after ending a call
    await Promise.all([
      redis.srem(MATCHED_SET, userId),
      redis.zrem(QUEUE_KEY, userId),
    ]);

    const hasLocation = data.lat != null && data.lng != null;

    // Store user metadata (used for future filter expansion; fast Redis hash write)
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

    // Try to instantly pop a waiting partner — O(1) atomic operation
    const partnerId = await this.popAvailablePartner(userId, redis);

    if (partnerId && server) {
      // Match found — fire immediately, no waiting
      await this.createMatch(userId, partnerId, redis, server);
      return { status: 'matched' };
    }

    // No partner available — join the queue and wait
    await redis.zadd(QUEUE_KEY, Date.now(), userId);
    return { status: 'queued' };
  }

  async leaveQueue(userId: string, redis: Redis) {
    await Promise.all([
      redis.zrem(QUEUE_KEY, userId),
      redis.del(`${USER_DATA_PREFIX}${userId}`),
    ]);
    return { status: 'left' };
  }

  /**
   * Fallback sweep for edge cases where two users joined simultaneously
   * and both ended up in the queue without matching each other.
   * Runs at a low interval — the hot path is event-driven via joinQueue.
   */
  async runMatchmaking(redis: Redis, server: any) {
    try {
      const queueSize = await redis.zcard(QUEUE_KEY);
      if (queueSize < 2) return;

      // Pair up everyone currently in the queue
      while (true) {
        const results = await redis.zpopmin(QUEUE_KEY, 2);
        // zpopmin returns [member1, score1, member2, score2, ...]
        if (results.length < 4) {
          // Fewer than 2 members — push back the lone one if any
          if (results.length >= 2) {
            await redis.zadd(QUEUE_KEY, Number(results[1]), results[0]);
          }
          break;
        }

        const u1 = results[0];
        const u2 = results[2];

        // Validate both users still have live metadata
        const [data1, data2] = await Promise.all([
          redis.exists(`${USER_DATA_PREFIX}${u1}`),
          redis.exists(`${USER_DATA_PREFIX}${u2}`),
        ]);

        if (!data1 || !data2) {
          // At least one is stale — push back the valid one and continue
          if (data1) await redis.zadd(QUEUE_KEY, Date.now(), u1);
          if (data2) await redis.zadd(QUEUE_KEY, Date.now(), u2);
          continue;
        }

        // Both valid — match them
        await this.createMatch(u1, u2, redis, server);
      }
    } catch (err) {
      this.logger.error('Matchmaking fallback sweep error:', err);
    }
  }

  /**
   * Atomically pop the first available (non-stale, non-self) user from the queue.
   * Retries up to MAX_POP_TRIES times to skip over ghost users that lost connection
   * without emitting leave_queue.
   */
  private async popAvailablePartner(userId: string, redis: Redis): Promise<string | null> {
    const MAX_TRIES = 5;
    const pushed_back: string[] = [];

    for (let i = 0; i < MAX_TRIES; i++) {
      const results = await redis.zpopmin(QUEUE_KEY, 1);
      if (!results.length) break;

      const candidateId = results[0];
      // const score = results[1]; // timestamp, unused for now

      if (candidateId === userId) {
        pushed_back.push(candidateId);
        continue;
      }

      // Check for ghost: user data TTL'd out means they disconnected without cleanup
      const exists = await redis.exists(`${USER_DATA_PREFIX}${candidateId}`);
      if (!exists) continue; // Ghost — discard silently

      // Also skip if already in a match (shouldn't happen often, but be safe)
      const alreadyMatched = await redis.sismember(MATCHED_SET, candidateId);
      if (alreadyMatched) continue;

      // Re-add any users we accidentally popped (e.g. self)
      if (pushed_back.length) {
        const args: (string | number)[] = [];
        pushed_back.forEach((id) => args.push(Date.now(), id));
        await (redis.zadd as any)(QUEUE_KEY, ...args);
      }

      return candidateId;
    }

    // Couldn't find a valid partner — restore any users we popped
    if (pushed_back.length) {
      const args: (string | number)[] = [];
      pushed_back.forEach((id) => args.push(Date.now(), id));
      await (redis.zadd as any)(QUEUE_KEY, ...args);
    }

    return null;
  }

  async createMatch(user1Id: string, user2Id: string, redis: Redis, server: any) {
    const matchId = randomUUID();
    const roomName = `room-${matchId}`;

    // Generate LiveKit tokens synchronously — these are local JWT ops, ~0ms
    const [token1, token2] = await Promise.all([
      this.voiceService.createToken(roomName, user1Id),
      this.voiceService.createToken(roomName, user2Id),
    ]);

    // Update Redis state atomically before emitting
    await Promise.all([
      redis.sadd(MATCHED_SET, user1Id, user2Id),
      redis.expire(MATCHED_SET, 3600),
      redis.zrem(QUEUE_KEY, user1Id, user2Id),
      redis.del(`${USER_DATA_PREFIX}${user1Id}`, `${USER_DATA_PREFIX}${user2Id}`),
    ]);

    // Track in memory for O(1) partner lookup and fast endMatch
    const matchRecord: ActiveMatch = { user1Id, user2Id, roomName, startedAt: Date.now() };
    this.activeMatches.set(matchId, matchRecord);
    this.userToMatch.set(user1Id, matchId);
    this.userToMatch.set(user2Id, matchId);

    const livekitUrl = process.env.LIVEKIT_URL;

    // Emit match_found IMMEDIATELY — clients start connecting to LiveKit right now.
    // Include partnerId so the frontend can identify who to report.
    server.to(`user:${user1Id}`).emit('match_found', { matchId, roomName, token: token1, livekitUrl, partnerId: user2Id });
    server.to(`user:${user2Id}`).emit('match_found', { matchId, roomName, token: token2, livekitUrl, partnerId: user1Id });

    this.logger.log(`Matched: ${user1Id} <-> ${user2Id} → ${roomName}`);

    // Persist to DB in the background — does not block the match notification
    this.persistMatch(matchId, user1Id, user2Id, roomName).catch((err) =>
      this.logger.error(`DB persistence failed for match ${matchId}:`, err),
    );

    startSyncGame(matchId, user1Id, user2Id, server);
  }

  private async persistMatch(matchId: string, user1Id: string, user2Id: string, roomName: string) {
    await this.prisma.match.create({
      data: { id: matchId, user1Id, user2Id, livekitRoomName: roomName },
    });
    await this.prisma.session.create({ data: { matchId } });
  }

  async endMatch(matchId: string, userId: string, reason: string, redis: Redis, server?: any) {
    const match = this.activeMatches.get(matchId);

    if (match) {
      // Fast path: in-memory data available immediately
      this.activeMatches.delete(matchId);
      this.userToMatch.delete(match.user1Id);
      this.userToMatch.delete(match.user2Id);

      await redis.srem(MATCHED_SET, match.user1Id, match.user2Id);

      // Notify the partner that this user left
      if (server) {
        const partnerId = match.user1Id === userId ? match.user2Id : match.user1Id;
        server.to(`user:${partnerId}`).emit('partner_disconnected', { reason });
      }
    } else {
      // Fallback: match may have been created before a server restart — hit DB
      const dbMatch = await this.prisma.match.findUnique({ where: { id: matchId } });
      if (dbMatch) {
        await redis.srem(MATCHED_SET, dbMatch.user1Id, dbMatch.user2Id);
        if (server) {
          const partnerId = dbMatch.user1Id === userId ? dbMatch.user2Id : dbMatch.user1Id;
          server.to(`user:${partnerId}`).emit('partner_disconnected', { reason });
        }
      }
    }

    // DB update in background
    this.prisma.match
      .update({ where: { id: matchId }, data: { status: 'ended', endedAt: new Date() } })
      .catch(() => {});
    this.prisma.session
      .updateMany({ where: { matchId }, data: { endedAt: new Date(), endReason: reason } })
      .catch(() => {});
  }

  /**
   * Called on socket disconnect. If the user was in an active match,
   * notifies their partner and cleans up both sides.
   */
  async handleUserDisconnect(userId: string, redis: Redis, server: any) {
    // Clean up queue presence
    await this.leaveQueue(userId, redis);

    // If they were in a match, clean that up too
    const matchId = this.userToMatch.get(userId);
    if (matchId) {
      await this.endMatch(matchId, userId, 'partner_disconnected', redis, server);
    }

    await redis.srem(MATCHED_SET, userId);
  }

  /**
   * Get the matchId for a given userId (for disconnect handling).
   */
  getMatchIdForUser(userId: string): string | undefined {
    return this.userToMatch.get(userId);
  }
}
