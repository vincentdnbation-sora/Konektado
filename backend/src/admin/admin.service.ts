import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { cleanupMemoryGame } from '../matchmaking/memory-game';
import { cleanupTicTacToe } from '../matchmaking/tictactoe-game';
import { cleanupRopeGame } from '../matchmaking/rope-game';
import { cleanupPongGame } from '../matchmaking/pong-game';
import Redis from 'ioredis';

const QUEUE_KEY = 'matchmaking:queue';
const USER_DATA_PREFIX = 'matchmaking:user:';
const MATCHED_SET = 'matched:users';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  constructor(
    private prisma: PrismaService,
    private matchmakingService: MatchmakingService,
  ) {}

  // ─── Delete (soft) a single user ──────────────────────────────────────
  async deleteUser(userId: string, adminId: string, options?: { ban?: boolean }) {
    // 1. Verify user exists and isn't already deleted
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    if (user.isDeleted) {
      this.logger.warn(`[deleteUser] user ${userId} already deleted — skipping`);
      return { status: 'already_deleted', userId };
    }

    // 2. Disconnect from active match / games
    await this.disconnectUserFromActiveSessions(userId);

    // 3. Remove from matchmaking queue
    await this.removeFromQueue(userId);

    // 4. Soft-delete + optionally ban
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        isBanned: options?.ban ?? user.isBanned,
      },
    });

    this.logger.log(
      `[deleteUser] userId=${userId} displayName="${user.profile?.displayName}" deletedBy=${adminId} banned=${updatedUser.isBanned} at=${updatedUser.deletedAt?.toISOString()}`,
    );

    return {
      status: 'deleted',
      userId: updatedUser.id,
      email: updatedUser.email,
      displayName: user.profile?.displayName,
      banned: updatedUser.isBanned,
      deletedAt: updatedUser.deletedAt,
      deletedBy: adminId,
    };
  }

  // ─── Delete ALL users (admin reset) ───────────────────────────────────
  async deleteAllUsers(adminId: string, options?: { hardDelete?: boolean }) {
    // 1. Get count for logging
    const userCount = await this.prisma.user.count({
      where: { isDeleted: false },
    });

    this.logger.warn(
      `[deleteAllUsers] admin=${adminId} initiating deletion of ${userCount} users (hard=${options?.hardDelete ?? false})`,
    );

    // 2. Terminate ALL active matches and game sessions
    for (const [matchId, match] of this.matchmakingService.activeMatches) {
      cleanupMemoryGame(matchId);
      cleanupTicTacToe(matchId);
      cleanupRopeGame(matchId);
      cleanupPongGame(matchId);
    }
    this.matchmakingService.activeMatches.clear();

    // 3. Flush matchmaking queue in Redis
    await Promise.all([
      this.redis.del(QUEUE_KEY),
      this.redis.del(MATCHED_SET),
    ]);
    // Clean user data keys (pattern scan)
    await this.deleteRedisKeysByPattern(`${USER_DATA_PREFIX}*`);

    if (options?.hardDelete) {
      // Hard delete — remove all data. Order matters for FK constraints.
      await this.prisma.$transaction([
        this.prisma.gameSession.deleteMany(),
        this.prisma.session.deleteMany(),
        this.prisma.report.deleteMany(),
        this.prisma.block.deleteMany(),
        this.prisma.match.deleteMany(),
        this.prisma.preferences.deleteMany(),
        this.prisma.profile.deleteMany(),
        this.prisma.user.deleteMany(),
      ]);

      this.logger.warn(
        `[deleteAllUsers] HARD DELETE complete — ${userCount} users removed by admin=${adminId}`,
      );

      return { status: 'hard_deleted', count: userCount, deletedBy: adminId };
    }

    // Soft delete — mark all active users as deleted
    const result = await this.prisma.user.updateMany({
      where: { isDeleted: false },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    this.logger.warn(
      `[deleteAllUsers] SOFT DELETE complete — ${result.count} users marked deleted by admin=${adminId}`,
    );

    return { status: 'soft_deleted', count: result.count, deletedBy: adminId };
  }

  // ─── Restore a soft-deleted user ──────────────────────────────────────
  async restoreUser(userId: string, adminId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) throw new NotFoundException(`User ${userId} not found`);
    if (!user.isDeleted) {
      return { status: 'not_deleted', userId };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isDeleted: false, deletedAt: null, isBanned: false },
    });

    this.logger.log(`[restoreUser] userId=${userId} restoredBy=${adminId}`);

    return { status: 'restored', userId, restoredBy: adminId };
  }

  // ─── List users (with filtering) ─────────────────────────────────────
  async listUsers(filters?: { deleted?: boolean; banned?: boolean; search?: string }) {
    const where: any = {};

    if (filters?.deleted !== undefined) where.isDeleted = filters.deleted;
    if (filters?.banned !== undefined) where.isBanned = filters.banned;
    if (filters?.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { profile: { displayName: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      include: { profile: true },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.profile?.displayName,
      age: u.profile?.age,
      gender: u.profile?.gender,
      role: u.role,
      isBanned: u.isBanned,
      isDeleted: u.isDeleted,
      deletedAt: u.deletedAt,
      createdAt: u.createdAt,
      lastActive: u.lastActive,
    }));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async disconnectUserFromActiveSessions(userId: string) {
    const matchId = this.matchmakingService.getMatchIdForUser(userId);
    if (!matchId) return;

    // Clean up any game state for this match
    cleanupMemoryGame(matchId);
    cleanupTicTacToe(matchId);
    cleanupRopeGame(matchId);
    cleanupPongGame(matchId);

    // End the match itself
    await this.matchmakingService.endMatch(
      matchId,
      userId,
      'user_deleted',
      this.redis,
    );

    this.logger.log(`[disconnectUser] terminated matchId=${matchId} for userId=${userId}`);
  }

  private async removeFromQueue(userId: string) {
    await Promise.all([
      this.redis.zrem(QUEUE_KEY, userId),
      this.redis.del(`${USER_DATA_PREFIX}${userId}`),
      this.redis.srem(MATCHED_SET, userId),
    ]);
    this.logger.log(`[removeFromQueue] userId=${userId} removed from queue + matched set`);
  }

  private async deleteRedisKeysByPattern(pattern: string) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }
}
