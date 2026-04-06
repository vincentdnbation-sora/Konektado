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
    this.logger.debug(`Queue size: ${queueSize}`);
    if (queueSize < 2) return;

    const candidates = await redis.zrange(QUEUE_KEY, 0, -1);
    this.logger.debug(`Candidates: ${candidates.join(', ')}`);

    for (let i = 0; i < candidates.length; i++) {
      const userId = candidates[i];
      const isMatched = await redis.sismember(MATCHED_SET, userId);
      if (isMatched) continue;

      const userData = await redis.hgetall(`${USER_DATA_PREFIX}${userId}`);
      if (!userData) continue;

      for (let j = i + 1; j < candidates.length; j++) {
        const candidateId = candidates[j];
        const isMatchedCandidate = await redis.sismember(MATCHED_SET, candidateId);
        if (isMatchedCandidate) continue;

        const candidateData = await redis.hgetall(`${USER_DATA_PREFIX}${candidateId}`);
        if (!candidateData) continue;

        // Only enforce distance if both users have location
        const bothHaveLocation =
          userData.hasLocation === '1' && candidateData.hasLocation === '1';
        if (bothHaveLocation) {
          const dist = this.getDistanceKm(
            +userData.lat, +userData.lng,
            +candidateData.lat, +candidateData.lng,
          );
          if (dist > +userData.maxDistanceKm) continue;
        }

        const recentMatch = await this.hasRecentMatch(userId, candidateId);
        if (recentMatch) continue;

        const blocked = await this.isBlocked(userId, candidateId);
        if (blocked) continue;

        try {
          await this.createMatch(userId, candidateId, redis, server);
        } catch (err) {
          this.logger.error(`createMatch failed for ${userId} <-> ${candidateId}:`, err);
        }
        break;
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
