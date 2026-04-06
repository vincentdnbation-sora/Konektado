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
var MatchmakingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const voice_service_1 = require("../voice/voice.service");
const QUEUE_KEY = 'matchmaking:queue';
const USER_DATA_PREFIX = 'matchmaking:user:';
const MATCHED_SET = 'matched:users';
let MatchmakingService = MatchmakingService_1 = class MatchmakingService {
    prisma;
    voiceService;
    logger = new common_1.Logger(MatchmakingService_1.name);
    constructor(prisma, voiceService) {
        this.prisma = prisma;
        this.voiceService = voiceService;
    }
    async joinQueue(userId, data, redis) {
        const isMatched = await redis.sismember(MATCHED_SET, userId);
        if (isMatched)
            return { status: 'already_matched' };
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
    async leaveQueue(userId, redis) {
        await redis.zrem(QUEUE_KEY, userId);
        await redis.del(`${USER_DATA_PREFIX}${userId}`);
        return { status: 'left' };
    }
    async runMatchmaking(redis, server) {
        try {
            await this._runMatchmaking(redis, server);
        }
        catch (err) {
            this.logger.error('Matchmaking error:', err);
        }
    }
    async _runMatchmaking(redis, server) {
        const queueUsers = await redis.zrange(QUEUE_KEY, 0, -1);
        if (queueUsers.length < 2)
            return;
        const user1Id = queueUsers[0];
        const user2Id = queueUsers[1];
        const isUser1Matched = await redis.sismember(MATCHED_SET, user1Id);
        const isUser2Matched = await redis.sismember(MATCHED_SET, user2Id);
        if (isUser1Matched || isUser2Matched) {
            await redis.zrem(QUEUE_KEY, isUser1Matched ? user1Id : user2Id);
            return this._runMatchmaking(redis, server);
        }
        try {
            await this.createMatch(user1Id, user2Id, redis, server);
        }
        catch (err) {
            this.logger.error(`createMatch failed for ${user1Id} <-> ${user2Id}:`, err);
        }
    }
    async createMatch(user1Id, user2Id, redis, server) {
        const roomName = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const dbPromise = Promise.all([
            this.prisma.match.create({
                data: { user1Id, user2Id, livekitRoomName: roomName },
            }),
            this.prisma.session.create({ data: { matchId: 'temp' } }),
            this.voiceService.createToken(roomName, user1Id),
            this.voiceService.createToken(roomName, user2Id),
        ]).catch(err => this.logger.error('Async DB operations failed:', err));
        await redis.sadd(MATCHED_SET, user1Id, user2Id);
        await redis.zrem(QUEUE_KEY, user1Id, user2Id);
        await redis.expire(MATCHED_SET, 3600);
        const basicMatchData = {
            matchId: `temp-${roomName}`,
            roomName,
            livekitUrl: process.env.LIVEKIT_URL,
        };
        server.to(`user:${user1Id}`).emit('match_found', basicMatchData);
        server.to(`user:${user2Id}`).emit('match_found', basicMatchData);
        dbPromise.then(async (results) => {
            if (!results)
                return;
            const [match, session, token1, token2] = results;
            await this.prisma.session.update({
                where: { id: session.id },
                data: { matchId: match.id },
            });
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
    async endMatch(matchId, userId, reason, redis) {
        const match = await this.prisma.match.findUnique({ where: { id: matchId } });
        if (!match)
            return;
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
    getDistanceKm(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(this.deg2rad(lat1)) *
                Math.cos(this.deg2rad(lat2)) *
                Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    deg2rad(deg) {
        return deg * (Math.PI / 180);
    }
    async hasRecentMatch(u1, u2) {
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
    async handleUserDisconnect(userId, redis, server) {
        const wasMatched = await redis.sismember(MATCHED_SET, userId);
        if (wasMatched) {
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
                await this.endMatch(match.id, userId, 'disconnected', redis);
                server.to(`user:${otherUserId}`).emit('partner_disconnected', {
                    matchId: match.id,
                    reason: 'partner_left',
                });
                await this.joinQueue(otherUserId, { preferences: {} }, redis);
                this.runMatchmaking(redis, server);
            }
        }
        await this.leaveQueue(userId, redis);
    }
};
exports.MatchmakingService = MatchmakingService;
exports.MatchmakingService = MatchmakingService = MatchmakingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        voice_service_1.VoiceService])
], MatchmakingService);
//# sourceMappingURL=matchmaking.service.js.map