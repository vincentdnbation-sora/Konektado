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
    // Get all users in queue
    const queueUsers = await redis.zrange(QUEUE_KEY, 0, -1);
    if (queueUsers.length < 2) return;

    // Simple instant matching: pair first two available users
    const user1Id = queueUsers[0];
    const user2Id = queueUsers[1];

    // Quick checks only (skip complex filters for speed)
    const isUser1Matched = await redis.sismember(MATCHED_SET, user1Id);
    const isUser2Matched = await redis.sismember(MATCHED_SET, user2Id);

    if (isUser1Matched || isUser2Matched) {
      // Remove matched users from queue and retry
      await redis.zrem(QUEUE_KEY, isUser1Matched ? user1Id : user2Id);
      return this._runMatchmaking(redis, server);
    }

    try {
      await this.createMatch(user1Id, user2Id, redis, server);
    } catch (err) {
      this.logger.error(`createMatch failed for ${user1Id} <-> ${user2Id}:`, err);
    }
  }

  private async createMatch(user1Id: string, user2Id: string, redis: Redis, server: any) {
    // Create room name instantly
    const roomName = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Start async database operations but don't wait for them
    const dbPromise = Promise.all([
      this.prisma.match.create({
        data: { user1Id, user2Id, livekitRoomName: roomName },
      }),
      this.prisma.session.create({ data: { matchId: 'temp' } }), // Will update with real matchId
      this.voiceService.createToken(roomName, user1Id),
      this.voiceService.createToken(roomName, user2Id),
    ]).catch(err => this.logger.error('Async DB operations failed:', err));

    // Immediately mark as matched and remove from queue
    await redis.sadd(MATCHED_SET, user1Id, user2Id);
    await redis.zrem(QUEUE_KEY, user1Id, user2Id);
    await redis.expire(MATCHED_SET, 3600);

    // Send match notification immediately with basic info
    // Tokens will be generated async and can be used when ready
    const basicMatchData = {
      matchId: `temp-${roomName}`,
      roomName,
      livekitUrl: process.env.LIVEKIT_URL,
      // Tokens will be sent in a follow-up event once ready
    };

    server.to(`user:${user1Id}`).emit('match_found', basicMatchData);
    server.to(`user:${user2Id}`).emit('match_found', basicMatchData);

    // Complete the async operations
    dbPromise.then(async (results) => {
      if (!results) return;
      const [match, session, token1, token2] = results;

      // Update session with real matchId
      await this.prisma.session.update({
        where: { id: session.id },
        data: { matchId: match.id },
      });

      // Send tokens once ready
      server.to(`user:${user1Id}`).emit('match_ready', {
        matchId: match.id,
        token: token1,
      });
      server.to(`user:${user2Id}`).emit('match_ready', {
        matchId: match.id,
        token: token2,
      });
    });

    this.logger.log(`Instant match: ${user1Id} <-> ${user2Id} in room ${roomName}`);
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

  async handleUserDisconnect(userId: string, redis: Redis, server: any) {
    // Check if user was in a match
    const wasMatched = await redis.sismember(MATCHED_SET, userId);
    if (wasMatched) {
      // Find the match and notify the other user
      const match = await this.prisma.match.findFirst({
        where: {
          OR: [
            { user1Id: userId },
            { user2Id: userId },
          ],
          status: 'active',
        },
      });

      if (match) {
        const otherUserId = match.user1Id === userId ? match.user2Id : match.user1Id;

        // End the match
        await this.endMatch(match.id, userId, 'disconnected', redis);

        // Notify the other user and re-queue them instantly
        server.to(`user:${otherUserId}`).emit('partner_disconnected', {
          matchId: match.id,
          reason: 'partner_left',
        });

        // Automatically re-queue the remaining user
        await this.joinQueue(otherUserId, { preferences: {} }, redis);
        // Trigger matchmaking immediately
        this.runMatchmaking(redis, server);
      }
    }

    // Clean up queue
    await this.leaveQueue(userId, redis);
  }
}
