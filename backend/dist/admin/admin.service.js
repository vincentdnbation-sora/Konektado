"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AdminService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const matchmaking_service_1 = require("../matchmaking/matchmaking.service");
const memory_game_1 = require("../matchmaking/memory-game");
const tictactoe_game_1 = require("../matchmaking/tictactoe-game");
const rope_game_1 = require("../matchmaking/rope-game");
const pong_game_1 = require("../matchmaking/pong-game");
const ioredis_1 = __importDefault(require("ioredis"));
const QUEUE_KEY = 'matchmaking:queue';
const USER_DATA_PREFIX = 'matchmaking:user:';
const MATCHED_SET = 'matched:users';
let AdminService = AdminService_1 = class AdminService {
    prisma;
    matchmakingService;
    logger = new common_1.Logger(AdminService_1.name);
    redis = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379');
    constructor(prisma, matchmakingService) {
        this.prisma = prisma;
        this.matchmakingService = matchmakingService;
    }
    async deleteUser(userId, adminId, options) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: { profile: true },
        });
        if (!user) {
            throw new common_1.NotFoundException(`User ${userId} not found`);
        }
        if (user.isDeleted) {
            this.logger.warn(`[deleteUser] user ${userId} already deleted — skipping`);
            return { status: 'already_deleted', userId };
        }
        await this.disconnectUserFromActiveSessions(userId);
        await this.removeFromQueue(userId);
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
                isBanned: options?.ban ?? user.isBanned,
            },
        });
        this.logger.log(`[deleteUser] userId=${userId} displayName="${user.profile?.displayName}" deletedBy=${adminId} banned=${updatedUser.isBanned} at=${updatedUser.deletedAt?.toISOString()}`);
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
    async deleteAllUsers(adminId, options) {
        const userCount = await this.prisma.user.count({
            where: { isDeleted: false },
        });
        this.logger.warn(`[deleteAllUsers] admin=${adminId} initiating deletion of ${userCount} users (hard=${options?.hardDelete ?? false})`);
        for (const [matchId, match] of this.matchmakingService.activeMatches) {
            (0, memory_game_1.cleanupMemoryGame)(matchId);
            (0, tictactoe_game_1.cleanupTicTacToe)(matchId);
            (0, rope_game_1.cleanupRopeGame)(matchId);
            (0, pong_game_1.cleanupPongGame)(matchId);
        }
        this.matchmakingService.activeMatches.clear();
        await Promise.all([
            this.redis.del(QUEUE_KEY),
            this.redis.del(MATCHED_SET),
        ]);
        await this.deleteRedisKeysByPattern(`${USER_DATA_PREFIX}*`);
        if (options?.hardDelete) {
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
            this.logger.warn(`[deleteAllUsers] HARD DELETE complete — ${userCount} users removed by admin=${adminId}`);
            return { status: 'hard_deleted', count: userCount, deletedBy: adminId };
        }
        const result = await this.prisma.user.updateMany({
            where: { isDeleted: false },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
            },
        });
        this.logger.warn(`[deleteAllUsers] SOFT DELETE complete — ${result.count} users marked deleted by admin=${adminId}`);
        return { status: 'soft_deleted', count: result.count, deletedBy: adminId };
    }
    async restoreUser(userId, adminId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException(`User ${userId} not found`);
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
    async listUsers(filters) {
        const where = {};
        if (filters?.deleted !== undefined)
            where.isDeleted = filters.deleted;
        if (filters?.banned !== undefined)
            where.isBanned = filters.banned;
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
    async disconnectUserFromActiveSessions(userId) {
        const matchId = this.matchmakingService.getMatchIdForUser(userId);
        if (!matchId)
            return;
        (0, memory_game_1.cleanupMemoryGame)(matchId);
        (0, tictactoe_game_1.cleanupTicTacToe)(matchId);
        (0, rope_game_1.cleanupRopeGame)(matchId);
        (0, pong_game_1.cleanupPongGame)(matchId);
        await this.matchmakingService.endMatch(matchId, userId, 'user_deleted', this.redis);
        this.logger.log(`[disconnectUser] terminated matchId=${matchId} for userId=${userId}`);
    }
    async removeFromQueue(userId) {
        await Promise.all([
            this.redis.zrem(QUEUE_KEY, userId),
            this.redis.del(`${USER_DATA_PREFIX}${userId}`),
            this.redis.srem(MATCHED_SET, userId),
        ]);
        this.logger.log(`[removeFromQueue] userId=${userId} removed from queue + matched set`);
    }
    async deleteRedisKeysByPattern(pattern) {
        let cursor = '0';
        do {
            const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        } while (cursor !== '0');
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = AdminService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        matchmaking_service_1.MatchmakingService])
], AdminService);
//# sourceMappingURL=admin.service.js.map