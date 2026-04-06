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
const crypto_1 = require("crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const voice_service_1 = require("../voice/voice.service");
const QUEUE_KEY = 'matchmaking:queue';
const USER_DATA_PREFIX = 'matchmaking:user:';
const MATCHED_SET = 'matched:users';
const DISCONNECT_GRACE_MS = 8000;
let MatchmakingService = MatchmakingService_1 = class MatchmakingService {
    prisma;
    voiceService;
    logger = new common_1.Logger(MatchmakingService_1.name);
    activeMatches = new Map();
    userToMatch = new Map();
    disconnectTimers = new Map();
    constructor(prisma, voiceService) {
        this.prisma = prisma;
        this.voiceService = voiceService;
    }
    async joinQueue(userId, data, redis, server) {
        this.logger.log(`[joinQueue] userId=${userId}`);
        const existingMatchId = this.userToMatch.get(userId);
        if (existingMatchId && this.activeMatches.has(existingMatchId) && server) {
            this.logger.log(`[joinQueue] user ${userId} already matched (${existingMatchId}) — resending`);
            await this.resendMatchIfExists(userId, server);
            return { status: 'matched' };
        }
        await Promise.all([
            redis.srem(MATCHED_SET, userId),
            redis.zrem(QUEUE_KEY, userId),
        ]);
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
        const partnerId = await this.popAvailablePartner(userId, redis);
        if (partnerId && server) {
            this.logger.log(`[joinQueue] instant match: ${userId} <-> ${partnerId}`);
            await this.createMatch(userId, partnerId, redis, server);
            return { status: 'matched' };
        }
        await redis.zadd(QUEUE_KEY, Date.now(), userId);
        this.logger.log(`[joinQueue] queued userId=${userId}`);
        return { status: 'queued' };
    }
    async leaveQueue(userId, redis) {
        await Promise.all([
            redis.zrem(QUEUE_KEY, userId),
            redis.del(`${USER_DATA_PREFIX}${userId}`),
        ]);
        this.logger.log(`[leaveQueue] userId=${userId}`);
        return { status: 'left' };
    }
    async runMatchmaking(redis, server) {
        try {
            const queueSize = await redis.zcard(QUEUE_KEY);
            if (queueSize < 2)
                return;
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
                const [exists1, exists2] = await Promise.all([
                    redis.exists(`${USER_DATA_PREFIX}${u1}`),
                    redis.exists(`${USER_DATA_PREFIX}${u2}`),
                ]);
                if (!exists1 || !exists2) {
                    if (exists1)
                        await redis.zadd(QUEUE_KEY, Date.now(), u1);
                    if (exists2)
                        await redis.zadd(QUEUE_KEY, Date.now(), u2);
                    continue;
                }
                this.logger.log(`[sweep] matching ${u1} <-> ${u2}`);
                await this.createMatch(u1, u2, redis, server);
            }
        }
        catch (err) {
            this.logger.error('[sweep] error:', err);
        }
    }
    async popAvailablePartner(userId, redis) {
        const MAX_TRIES = 5;
        const pushedBack = [];
        for (let i = 0; i < MAX_TRIES; i++) {
            const results = await redis.zpopmin(QUEUE_KEY, 1);
            if (!results.length)
                break;
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
            if (pushedBack.length) {
                const args = [];
                pushedBack.forEach((id) => args.push(Date.now(), id));
                await redis.zadd(QUEUE_KEY, ...args);
            }
            return candidateId;
        }
        if (pushedBack.length) {
            const args = [];
            pushedBack.forEach((id) => args.push(Date.now(), id));
            await redis.zadd(QUEUE_KEY, ...args);
        }
        return null;
    }
    async createMatch(user1Id, user2Id, redis, server) {
        const matchId = (0, crypto_1.randomUUID)();
        const roomName = `room-${matchId}`;
        this.logger.log(`[createMatch] ${user1Id} <-> ${user2Id} | matchId=${matchId}`);
        const [token1, token2] = await Promise.all([
            this.voiceService.createToken(roomName, user1Id),
            this.voiceService.createToken(roomName, user2Id),
        ]);
        await Promise.all([
            redis.sadd(MATCHED_SET, user1Id, user2Id),
            redis.expire(MATCHED_SET, 3600),
            redis.zrem(QUEUE_KEY, user1Id, user2Id),
            redis.del(`${USER_DATA_PREFIX}${user1Id}`, `${USER_DATA_PREFIX}${user2Id}`),
        ]);
        const matchRecord = { user1Id, user2Id, roomName, startedAt: Date.now() };
        this.activeMatches.set(matchId, matchRecord);
        this.userToMatch.set(user1Id, matchId);
        this.userToMatch.set(user2Id, matchId);
        const livekitUrl = process.env.LIVEKIT_URL || 'wss://dating-app-46dvc6ij.livekit.cloud';
        this.logger.log(`[createMatch] livekitUrl=${livekitUrl}`);
        server.to(`user:${user1Id}`).emit('match_found', {
            matchId, roomName, token: token1, livekitUrl, partnerId: user2Id,
        });
        server.to(`user:${user2Id}`).emit('match_found', {
            matchId, roomName, token: token2, livekitUrl, partnerId: user1Id,
        });
        this.logger.log(`[createMatch] emitted match_found to both users`);
        this.persistMatch(matchId, user1Id, user2Id, roomName).catch((err) => this.logger.error(`[createMatch] DB persist failed: ${err}`));
    }
    async persistMatch(matchId, user1Id, user2Id, roomName) {
        await this.prisma.match.create({
            data: { id: matchId, user1Id, user2Id, livekitRoomName: roomName },
        });
        await this.prisma.session.create({ data: { matchId } });
    }
    async endMatch(matchId, userId, reason, redis, server) {
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
        }
        else {
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
            .catch(() => { });
        this.prisma.session
            .updateMany({ where: { matchId }, data: { endedAt: new Date(), endReason: reason } })
            .catch(() => { });
    }
    handleUserDisconnect(userId, redis, server) {
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
    cancelDisconnect(userId) {
        const timer = this.disconnectTimers.get(userId);
        if (timer) {
            clearTimeout(timer);
            this.disconnectTimers.delete(userId);
            this.logger.log(`[reconnect] cancelled disconnect cleanup for userId=${userId}`);
        }
    }
    async resendMatchIfExists(userId, server) {
        const matchId = this.userToMatch.get(userId);
        if (!matchId)
            return false;
        const match = this.activeMatches.get(matchId);
        if (!match)
            return false;
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
    getMatchIdForUser(userId) {
        return this.userToMatch.get(userId);
    }
};
exports.MatchmakingService = MatchmakingService;
exports.MatchmakingService = MatchmakingService = MatchmakingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        voice_service_1.VoiceService])
], MatchmakingService);
//# sourceMappingURL=matchmaking.service.js.map