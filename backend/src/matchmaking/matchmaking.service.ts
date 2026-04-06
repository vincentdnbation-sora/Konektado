import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';
import { startSyncGame } from './sync-game';

const QUEUE_KEY = 'matchmaking:queue';
const USER_DATA_PREFIX = 'matchmaking:user:';
const MATCHED_SET = 'matched:users';

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(
    private prisma: PrismaService,
    private voiceService: VoiceService,
  ) {}

  async joinQueue(
    userId: string,
    data: { lat?: number; lng?: number; preferences: any },
    redis: Redis,
  ) {
    const isMatched = await redis.sismember(MATCHED_SET, userId);
    if (isMatched) return { status: 'already_matched' };

    const hasLocation = data.lat != null && data.lng != null;

    await redis.hset(`${USER_DATA_PREFIX}${userId}`, {
      lat: data.lat ?? 0,
      lng: data.lng ?? 0,
      hasLocation: hasLocation ? '1' : '0',
      preferredGender: data.preferences?.preferredGender || 'any',
      minAge: data.preferences?.minAge || 18,
      maxAge: data.preferences?.maxAge || 99,
      maxDistanceKm: data.preferences?.maxDistanceKm || 50,
    });
    await redis.zadd(QUEUE_KEY, Date.now(), userId);
    await redis.expire(`${USER_DATA_PREFIX}${userId}`, 300);

    return { status: 'queued' };
  }

  async leaveQueue(userId: string, redis: Redis) {
    await redis.zrem(QUEUE_KEY, userId);
    await redis.del(`${USER_DATA_PREFIX}${userId}`);
    return { status: 'left' };
  }

  async runMatchmaking(redis: Redis, server: any) {
    try {
      await this._runMatchmaking(redis, server);
    } catch (err) {
      this.logger.error('Matchmaking error:', err);
    }
  }

  private async _runMatchmaking(redis: Redis, server: any) {
    const queueSize = await redis.zcard(QUEUE_KEY);
    if (queueSize < 2) return;

    const candidates = await redis.zrange(QUEUE_KEY, 0, -1);

    // Fetch all candidate data and filter out already-matched users
    const activeUsers: Array<{ userId: string; data: Record<string, string> }> = [];
    for (const userId of candidates) {
      const isMatched = await redis.sismember(MATCHED_SET, userId);
      if (isMatched) continue;
      const userData = await redis.hgetall(`${USER_DATA_PREFIX}${userId}`);
      if (!userData || !Object.keys(userData).length) continue;
      activeUsers.push({ userId, data: userData });
    }

    if (activeUsers.length < 2) return;

    // Build all valid candidate pairs with distance scores (nearest first)
    type Pair = { i: number; j: number; distKm: number };
    const pairs: Pair[] = [];

    for (let i = 0; i < activeUsers.length; i++) {
      for (let j = i + 1; j < activeUsers.length; j++) {
        const u = activeUsers[i];
        const v = activeUsers[j];

        const bothHaveLocation =
          u.data.hasLocation === '1' && v.data.hasLocation === '1';

        const distKm = bothHaveLocation
          ? this.getDistanceKm(+u.data.lat, +u.data.lng, +v.data.lat, +v.data.lng)
          : Infinity; // no location → lowest priority but still matchable

        pairs.push({ i, j, distKm });
      }
    }

    // Sort pairs: nearest first, no-location pairs last
    pairs.sort((a, b) => a.distKm - b.distKm);

    // Greedily match pairs, skipping already-matched users
    const matchedInRun = new Set<number>();
    for (const { i, j } of pairs) {
      if (matchedInRun.has(i) || matchedInRun.has(j)) continue;

      const u = activeUsers[i];
      const v = activeUsers[j];

      const recentMatch = await this.hasRecentMatch(u.userId, v.userId);
      if (recentMatch) continue;

      const blocked = await this.isBlocked(u.userId, v.userId);
      if (blocked) continue;

      try {
        await this.createMatch(u.userId, v.userId, redis, server);
        matchedInRun.add(i);
        matchedInRun.add(j);
      } catch (err) {
        this.logger.error(`createMatch failed for ${u.userId} <-> ${v.userId}:`, err);
      }
    }
  }

  private async createMatch(user1Id: string, user2Id: string, redis: Redis, server: any) {
    const roomName = `room-${Date.now()}`;

    const match = await this.prisma.match.create({
      data: { user1Id, user2Id, livekitRoomName: roomName },
    });

    await this.prisma.session.create({ data: { matchId: match.id } });

    const [token1, token2] = await Promise.all([
      this.voiceService.createToken(roomName, user1Id),
      this.voiceService.createToken(roomName, user2Id),
    ]);

    await redis.sadd(MATCHED_SET, user1Id, user2Id);
    await redis.zrem(QUEUE_KEY, user1Id, user2Id);
    await redis.expire(MATCHED_SET, 3600);

    server.to(`user:${user1Id}`).emit('match_found', {
      matchId: match.id,
      roomName,
      token: token1,
      livekitUrl: process.env.LIVEKIT_URL,
    });
    server.to(`user:${user2Id}`).emit('match_found', {
      matchId: match.id,
      roomName,
      token: token2,
      livekitUrl: process.env.LIVEKIT_URL,
    });

    this.logger.log(`Matched: ${user1Id} <-> ${user2Id} in room ${roomName}`);
    startSyncGame(match.id, user1Id, user2Id, server);
  }

  async endMatch(matchId: string, userId: string, reason: string, redis: Redis) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) return;

    await this.prisma.match.update({
      where: { id: matchId },
      data: { status: 'ended', endedAt: new Date() },
    });
    await this.prisma.session.updateMany({
      where: { matchId },
      data: { endedAt: new Date(), endReason: reason },
    });

    await redis.srem(MATCHED_SET, match.user1Id, match.user2Id);
  }

  private getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private deg2rad(deg: number) {
    return deg * (Math.PI / 180);
  }

  private async hasRecentMatch(u1: string, u2: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await this.prisma.match.count({
      where: {
        createdAt: { gte: since },
        OR: [
          { user1Id: u1, user2Id: u2 },
          { user1Id: u2, user2Id: u1 },
        ],
      },
    });
    return count > 0;
  }

  private async isBlocked(u1: string, u2: string) {
    const count = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: u1, blockedId: u2 },
          { blockerId: u2, blockedId: u1 },
        ],
      },
    });
    return count > 0;
  }
}
