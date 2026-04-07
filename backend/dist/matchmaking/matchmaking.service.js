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
    tearingDown = new Set();
    disconnectTimers = new Map();
    activeUsers = new Map();
    constructor(prisma, voiceService) {
        this.prisma = prisma;
        this.voiceService = voiceService;
    }
    addActiveUser(userId, socketId) {
        let sockets = this.activeUsers.get(userId);
        if (!sockets) {
            sockets = new Set();
            this.activeUsers.set(userId, sockets);
            sockets.add(socketId);
            this.logger.log(`[presence] user online: userId=${userId} total=${this.activeUsers.size}`);
            return true;
        }
        sockets.add(socketId);
        this.logger.debug(`[presence] socket added for userId=${userId} sockets=${sockets.size}`);
        return false;
    }
    removeActiveSocket(userId, socketId) {
        const sockets = this.activeUsers.get(userId);
        if (!sockets)
            return;
        sockets.delete(socketId);
        this.logger.debug(`[presence] socket removed for userId=${userId} remaining=${sockets.size}`);
    }
    removeActiveUser(userId) {
        if (!this.activeUsers.has(userId))
            return false;
        this.activeUsers.delete(userId);
        this.logger.log(`[presence] user offline: userId=${userId} total=${this.activeUsers.size}`);
        return true;
    }
    getActiveUserCount() {
        return this.activeUsers.size;
    }
    hasActiveSockets(userId) {
        const sockets = this.activeUsers.get(userId);
        return !!sockets && sockets.size > 0;
    }
    async getSearchingCount(redis) {
        return redis.zcard(QUEUE_KEY);
    }
    broadcastPresence(server, redis) {
        const count = this.getActiveUserCount();
        const payload = { active: count };
        if (redis) {
            redis.zcard(QUEUE_KEY).then((searching) => {
                server.emit('presence:update', { active: count, searching });
            }).catch(() => {
                server.emit('presence:update', payload);
            });
        }
        else {
            server.emit('presence:update', payload);
        }
        this.logger.debug(`[presence] broadcast active=${count}`);
    }
    async forceCleanupUser(userId, redis) {
        this.logger.debug(`[forceCleanup] userId=${userId}`);
        const staleMatchId = this.userToMatch.get(userId);
        if (staleMatchId) {
            this.activeMatches.delete(staleMatchId);
            this.userToMatch.delete(userId);
            this.logger.debug(`[forceCleanup] removed stale matchId=${staleMatchId} for userId=${userId}`);
        }
        this.tearingDown.delete(userId);
        await Promise.all([
            redis.zrem(QUEUE_KEY, userId),
            redis.srem(MATCHED_SET, userId),
            redis.del(`${USER_DATA_PREFIX}${userId}`),
        ]);
    }
    async joinQueue(userId, data, redis, server) {
        this.logger.debug(`[joinQueue] userId=${userId}`);
        if (this.tearingDown.has(userId)) {
            this.logger.debug(`[joinQueue] user ${userId} teardown in progress — waiting 200ms`);
            await new Promise((r) => setTimeout(r, 200));
            if (this.tearingDown.has(userId)) {
                this.logger.debug(`[joinQueue] teardown still stuck for ${userId} — force-clearing`);
                this.tearingDown.delete(userId);
            }
        }
        const existingMatchId = this.userToMatch.get(userId);
        if (existingMatchId) {
            if (this.activeMatches.has(existingMatchId)) {
                this.logger.debug(`[joinQueue] user ${userId} has active match ${existingMatchId} — resending`);
                if (server) {
                    await this.resendMatchIfExists(userId, server);
                }
                return { status: 'matched' };
            }
            this.logger.debug(`[joinQueue] cleaning stale match ref ${existingMatchId} for user ${userId}`);
            this.userToMatch.delete(userId);
            await redis.srem(MATCHED_SET, userId);
        }
        const alreadyInQueue = await redis.zscore(QUEUE_KEY, userId);
        if (alreadyInQueue !== null) {
            this.logger.debug(`[joinQueue] removing existing queue entry for ${userId}`);
            await redis.zrem(QUEUE_KEY, userId);
        }
        await redis.srem(MATCHED_SET, userId);
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
            this.logger.debug(`[joinQueue] instant match: ${userId} <-> ${partnerId}`);
            await this.createMatch(userId, partnerId, redis, server);
            return { status: 'matched' };
        }
        await redis.zadd(QUEUE_KEY, Date.now(), userId);
        this.logger.debug(`[joinQueue] queued userId=${userId}`);
        return { status: 'queued' };
    }
    async leaveQueue(userId, redis) {
        await Promise.all([
            redis.zrem(QUEUE_KEY, userId),
            redis.del(`${USER_DATA_PREFIX}${userId}`),
        ]);
        this.logger.debug(`[leaveQueue] userId=${userId}`);
        return { status: 'left' };
    }
    async runMatchmaking(redis, server) {
        try {
            await this.pruneStaleQueueEntries(redis, server);
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
                const u1Ok = exists1 && !this.userToMatch.has(u1) && !this.tearingDown.has(u1);
                const u2Ok = exists2 && !this.userToMatch.has(u2) && !this.tearingDown.has(u2);
                if (!u1Ok || !u2Ok) {
                    if (u1Ok)
                        await redis.zadd(QUEUE_KEY, Date.now(), u1);
                    if (u2Ok)
                        await redis.zadd(QUEUE_KEY, Date.now(), u2);
                    if (!u1Ok && exists1 && this.userToMatch.has(u1)) {
                        this.logger.debug(`[sweep] removing already-matched user ${u1}`);
                    }
                    if (!u2Ok && exists2 && this.userToMatch.has(u2)) {
                        this.logger.debug(`[sweep] removing already-matched user ${u2}`);
                    }
                    continue;
                }
                this.logger.debug(`[sweep] matching ${u1} <-> ${u2}`);
                await this.createMatch(u1, u2, redis, server);
            }
        }
        catch (err) {
            this.logger.error('[sweep] error:', err);
        }
    }
    async pruneStaleQueueEntries(redis, server) {
        try {
            const allQueued = await redis.zrange(QUEUE_KEY, 0, -1);
            if (!allQueued.length)
                return;
            for (const userId of allQueued) {
                let shouldRemove = false;
                let reason = '';
                if (this.userToMatch.has(userId)) {
                    shouldRemove = true;
                    reason = 'has active match in-memory';
                }
                if (!shouldRemove && this.tearingDown.has(userId)) {
                    shouldRemove = true;
                    reason = 'teardown in progress';
                }
                if (!shouldRemove) {
                    const hasMetadata = await redis.exists(`${USER_DATA_PREFIX}${userId}`);
                    if (!hasMetadata) {
                        shouldRemove = true;
                        reason = 'no queue metadata';
                    }
                }
                if (!shouldRemove) {
                    const isMatched = await redis.sismember(MATCHED_SET, userId);
                    if (isMatched) {
                        shouldRemove = true;
                        reason = 'still in MATCHED_SET';
                    }
                }
                if (!shouldRemove && server) {
                    const room = server.sockets?.adapter?.rooms?.get(`user:${userId}`);
                    if (!room || room.size === 0) {
                        shouldRemove = true;
                        reason = 'no live socket connection';
                    }
                }
                if (shouldRemove) {
                    this.logger.debug(`[prune] removing stale: userId=${userId} reason=${reason}`);
                    await redis.zrem(QUEUE_KEY, userId);
                    await redis.del(`${USER_DATA_PREFIX}${userId}`);
                }
            }
        }
        catch (err) {
            this.logger.error('[prune] error:', err);
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
                this.logger.debug(`[pop] ghost candidate ${candidateId}`);
                continue;
            }
            const alreadyMatched = await redis.sismember(MATCHED_SET, candidateId);
            if (alreadyMatched) {
                this.logger.debug(`[pop] candidate ${candidateId} already matched`);
                continue;
            }
            if (this.userToMatch.has(candidateId)) {
                this.logger.debug(`[pop] candidate ${candidateId} has in-memory match`);
                continue;
            }
            if (this.tearingDown.has(candidateId)) {
                this.logger.debug(`[pop] candidate ${candidateId} tearing down`);
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
        this.logger.log(`[match] created ${matchId}: ${user1Id} <-> ${user2Id}`);
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
        server.to(`user:${user1Id}`).emit('match_found', {
            matchId, roomName, token: token1, livekitUrl, partnerId: user2Id,
        });
        server.to(`user:${user2Id}`).emit('match_found', {
            matchId, roomName, token: token2, livekitUrl, partnerId: user1Id,
        });
        this.persistMatch(matchId, user1Id, user2Id, roomName).catch((err) => this.logger.error(`[createMatch] DB persist failed: ${err}`));
    }
    async persistMatch(matchId, user1Id, user2Id, roomName) {
        await this.prisma.match.create({
            data: { id: matchId, user1Id, user2Id, livekitRoomName: roomName },
        });
        await this.prisma.session.create({ data: { matchId } });
    }
    async endMatch(matchId, userId, reason, redis, server) {
        this.logger.log(`[match] ended ${matchId} by=${userId} reason=${reason}`);
        const match = this.activeMatches.get(matchId);
        if (match) {
            const { user1Id, user2Id } = match;
            this.tearingDown.add(user1Id);
            this.tearingDown.add(user2Id);
            this.activeMatches.delete(matchId);
            this.userToMatch.delete(user1Id);
            this.userToMatch.delete(user2Id);
            await redis.srem(MATCHED_SET, user1Id, user2Id);
            await redis.zrem(QUEUE_KEY, user1Id, user2Id);
            if (server) {
                const partnerId = user1Id === userId ? user2Id : user1Id;
                const endPayload = { matchId, reason, endedBy: userId };
                server.to(`user:${userId}`).to(`user:${partnerId}`).emit('match_ended', endPayload);
                server.to(`user:${partnerId}`).emit('partner_disconnected', { reason });
            }
            this.tearingDown.delete(user1Id);
            this.tearingDown.delete(user2Id);
            this.logger.debug(`[endMatch] ${user1Id}, ${user2Id} queue-eligible`);
        }
        else {
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
            }
            else {
                this.logger.warn(`[endMatch] no match found for matchId=${matchId} — cleaning up userId=${userId}`);
                this.userToMatch.delete(userId);
                this.tearingDown.delete(userId);
                await redis.srem(MATCHED_SET, userId);
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
        this.logger.debug(`[disconnect] userId=${userId} grace=${DISCONNECT_GRACE_MS}ms`);
        const timer = setTimeout(async () => {
            this.disconnectTimers.delete(userId);
            if (this.hasActiveSockets(userId)) {
                this.logger.debug(`[disconnect] userId=${userId} still has live sockets — skipping cleanup`);
                return;
            }
            this.logger.log(`[disconnect] grace expired for userId=${userId} — cleaning up`);
            await this.leaveQueue(userId, redis);
            const matchId = this.userToMatch.get(userId);
            if (matchId) {
                const { cleanupMemoryGame } = require('./memory-game');
                const { cleanupTicTacToe } = require('./tictactoe-game');
                const { cleanupRopeGame } = require('./rope-game');
                const { cleanupPongGame } = require('./pong-game');
                cleanupMemoryGame(matchId);
                cleanupTicTacToe(matchId);
                cleanupRopeGame(matchId);
                cleanupPongGame(matchId);
                await this.endMatch(matchId, userId, 'partner_disconnected', redis, server);
            }
            else {
                this.logger.debug(`[disconnect] no active match for userId=${userId}`);
            }
            await this.forceCleanupUser(userId, redis);
            this.removeActiveUser(userId);
            this.broadcastPresence(server, redis);
        }, DISCONNECT_GRACE_MS);
        this.disconnectTimers.set(userId, timer);
    }
    cancelDisconnect(userId) {
        const timer = this.disconnectTimers.get(userId);
        if (timer) {
            clearTimeout(timer);
            this.disconnectTimers.delete(userId);
            this.logger.debug(`[reconnect] cancelled cleanup for userId=${userId}`);
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
        this.logger.debug(`[resendMatch] userId=${userId} matchId=${matchId}`);
        return true;
    }
    getMatchIdForUser(userId) {
        return this.userToMatch.get(userId);
    }
    async resetQueue(userId, data, redis, server) {
        this.logger.log(`[resetQueue] userId=${userId}`);
        this.cancelDisconnect(userId);
        await this.forceCleanupUser(userId, redis);
        const result = await this.joinQueue(userId, data, redis, server);
        this.logger.debug(`[resetQueue] complete for userId=${userId} result=${result.status}`);
        return result;
    }
};
exports.MatchmakingService = MatchmakingService;
exports.MatchmakingService = MatchmakingService = MatchmakingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        voice_service_1.VoiceService])
], MatchmakingService);
//# sourceMappingURL=matchmaking.service.js.map