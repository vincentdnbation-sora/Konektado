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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var MatchmakingGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const socket_io_1 = require("socket.io");
const jwt_1 = require("@nestjs/jwt");
const matchmaking_service_1 = require("./matchmaking.service");
const memory_game_1 = require("./memory-game");
const tictactoe_game_1 = require("./tictactoe-game");
const rope_game_1 = require("./rope-game");
const pong_game_1 = require("./pong-game");
const ioredis_1 = __importDefault(require("ioredis"));
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'https://konektado-beta.vercel.app',
    process.env.FRONTEND_URL,
].filter(Boolean);
let MatchmakingGateway = MatchmakingGateway_1 = class MatchmakingGateway {
    matchmakingService;
    jwtService;
    server;
    logger = new common_1.Logger(MatchmakingGateway_1.name);
    redis = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379');
    constructor(matchmakingService, jwtService) {
        this.matchmakingService = matchmakingService;
        this.jwtService = jwtService;
        setInterval(() => {
            this.matchmakingService.runMatchmaking(this.redis, this.server);
        }, 200);
    }
    async handleConnection(client) {
        try {
            const token = client.handshake.auth?.token;
            if (!token) {
                this.logger.warn(`[connect] no token — disconnecting ${client.id}`);
                client.disconnect();
                return;
            }
            const payload = this.jwtService.verify(token, {
                secret: process.env.JWT_SECRET || 'secret',
            });
            client.data.userId = payload.sub;
            client.join(`user:${payload.sub}`);
            this.matchmakingService.cancelDisconnect(payload.sub);
            await this.matchmakingService.resendMatchIfExists(payload.sub, this.server);
            this.logger.log(`[connect] userId=${payload.sub} socketId=${client.id} transport=${client.conn.transport.name}`);
        }
        catch (err) {
            this.logger.warn(`[connect] auth failed: ${err.message} — disconnecting ${client.id}`);
            client.disconnect();
        }
    }
    async handleDisconnect(client) {
        if (!client.data.userId)
            return;
        this.logger.log(`[disconnect] userId=${client.data.userId} socketId=${client.id}`);
        await this.matchmakingService.handleUserDisconnect(client.data.userId, this.redis, this.server);
    }
    async joinQueue(client, data) {
        const userId = client.data.userId;
        if (!userId)
            return;
        this.logger.log(`[join_queue] userId=${userId}`);
        try {
            const result = await this.matchmakingService.joinQueue(userId, data, this.redis, this.server);
            if (result.status === 'queued') {
                client.emit('queue_status', { status: 'queued' });
            }
        }
        catch (err) {
            this.logger.error(`[join_queue] error for userId=${userId}: ${err.message}`);
            client.emit('queue_status', { status: 'error', message: err.message });
        }
    }
    async leaveQueue(client) {
        if (!client.data.userId)
            return;
        this.logger.log(`[leave_queue] userId=${client.data.userId}`);
        await this.matchmakingService.leaveQueue(client.data.userId, this.redis);
        client.emit('queue_status', { status: 'left' });
    }
    async endMatch(client, data) {
        if (!client.data.userId)
            return;
        this.logger.log(`[end_match] userId=${client.data.userId} matchId=${data.matchId}`);
        (0, memory_game_1.cleanupMemoryGame)(data.matchId);
        (0, tictactoe_game_1.cleanupTicTacToe)(data.matchId);
        (0, rope_game_1.cleanupRopeGame)(data.matchId);
        (0, pong_game_1.cleanupPongGame)(data.matchId);
        await this.matchmakingService.endMatch(data.matchId, client.data.userId, data.reason || 'user_left', this.redis, this.server);
    }
    async nextMatch(client, data) {
        const userId = client.data.userId;
        if (!userId)
            return;
        this.logger.log(`[next_match] userId=${userId} matchId=${data.matchId}`);
        if (data.matchId) {
            (0, memory_game_1.cleanupMemoryGame)(data.matchId);
            (0, tictactoe_game_1.cleanupTicTacToe)(data.matchId);
            (0, rope_game_1.cleanupRopeGame)(data.matchId);
            (0, pong_game_1.cleanupPongGame)(data.matchId);
            await this.matchmakingService.endMatch(data.matchId, userId, 'user_skipped', this.redis, this.server);
        }
        await this.matchmakingService.forceCleanupUser(userId, this.redis);
        try {
            const result = await this.matchmakingService.joinQueue(userId, { lat: data.lat, lng: data.lng, preferences: data.preferences || {} }, this.redis, this.server);
            if (result.status === 'queued') {
                client.emit('queue_status', { status: 'queued' });
            }
            else if (result.status === 'error') {
                client.emit('queue_status', { status: 'error', message: 'Teardown in progress, try again' });
            }
        }
        catch (err) {
            this.logger.error(`[next_match] error for userId=${userId}: ${err.message}`);
            client.emit('queue_status', { status: 'error', message: err.message });
        }
    }
    async resetQueue(client, data) {
        const userId = client.data.userId;
        if (!userId)
            return;
        this.logger.log(`[reset_queue] userId=${userId}`);
        try {
            const result = await this.matchmakingService.resetQueue(userId, { lat: data?.lat, lng: data?.lng, preferences: data?.preferences || {} }, this.redis, this.server);
            if (result.status === 'queued') {
                client.emit('queue_status', { status: 'queued' });
                this.logger.log(`[reset_queue] userId=${userId} re-queued successfully`);
            }
            else if (result.status === 'matched') {
                this.logger.log(`[reset_queue] userId=${userId} got instant match on reset`);
            }
        }
        catch (err) {
            this.logger.error(`[reset_queue] error for userId=${userId}: ${err.message}`);
            client.emit('queue_status', { status: 'error', message: err.message });
        }
    }
    handleMemoryStart(client, data) {
        const userId = client.data.userId;
        if (!userId || !data.matchId || !data.partnerId)
            return;
        this.logger.log(`[memory:start] userId=${userId} matchId=${data.matchId}`);
        (0, memory_game_1.startMemoryGame)(data.matchId, userId, data.partnerId, this.server);
    }
    handleMemoryFlip(client, data) {
        const userId = client.data.userId;
        if (!userId || !data.matchId || data.cardIndex == null)
            return;
        (0, memory_game_1.handleMemoryFlip)(data.matchId, userId, data.cardIndex, this.server);
    }
    handleTttStart(client, data) {
        const userId = client.data.userId;
        if (!userId || !data.matchId || !data.partnerId)
            return;
        this.logger.log(`[ttt:start] userId=${userId} matchId=${data.matchId}`);
        (0, tictactoe_game_1.startTicTacToe)(data.matchId, userId, data.partnerId, this.server);
    }
    handleTttMove(client, data) {
        const userId = client.data.userId;
        if (!userId || !data.matchId || data.cellIndex == null)
            return;
        (0, tictactoe_game_1.handleTicTacToeMove)(data.matchId, userId, data.cellIndex, this.server);
    }
    handleRopeStart(client, data) {
        const userId = client.data.userId;
        if (!userId || !data.matchId || !data.partnerId)
            return;
        this.logger.log(`[rope:start] userId=${userId} matchId=${data.matchId}`);
        (0, rope_game_1.startRopeGame)(data.matchId, userId, data.partnerId, this.server);
    }
    onRopePull(client, data) {
        const userId = client.data.userId;
        if (!userId || !data.matchId)
            return;
        (0, rope_game_1.handleRopePull)(data.matchId, userId, this.server);
    }
    handlePongStart(client, data) {
        const userId = client.data.userId;
        if (!userId || !data.matchId || !data.partnerId)
            return;
        this.logger.log(`[pong:start] userId=${userId} matchId=${data.matchId}`);
        (0, pong_game_1.startPongGame)(data.matchId, userId, data.partnerId, this.server);
    }
    onPongInput(client, data) {
        const userId = client.data.userId;
        if (!userId || !data.matchId)
            return;
        const input = data.y !== undefined ? data.y : (data.direction ?? 'stop');
        (0, pong_game_1.handlePongInput)(data.matchId, userId, input, this.server);
    }
    handleGameInvite(client, data) {
        const userId = client.data.userId;
        if (!userId || !data.matchId || !data.partnerId || !data.gameId)
            return;
        this.logger.log(`[game:invite] ${userId} → ${data.partnerId} game=${data.gameId} match=${data.matchId}`);
        this.server.to(`user:${data.partnerId}`).emit('game:invite', {
            matchId: data.matchId,
            fromUserId: userId,
            gameId: data.gameId,
            gameTitle: data.gameTitle,
        });
    }
    handleGameAccept(client, data) {
        const userId = client.data.userId;
        if (!userId || !data.matchId || !data.partnerId || !data.gameId)
            return;
        this.logger.log(`[game:accept] ${userId} accepted ${data.gameId} match=${data.matchId}`);
        this.server.to(`user:${userId}`).to(`user:${data.partnerId}`).emit('game:accepted', {
            matchId: data.matchId,
            gameId: data.gameId,
            gameTitle: data.gameTitle,
            acceptedBy: userId,
        });
    }
    async handleLogout(client) {
        const userId = client.data.userId;
        if (!userId)
            return;
        this.logger.log(`[logout] userId=${userId}`);
        this.matchmakingService.cancelDisconnect(userId);
        const matchId = this.matchmakingService.getMatchIdForUser(userId);
        if (matchId) {
            (0, memory_game_1.cleanupMemoryGame)(matchId);
            (0, tictactoe_game_1.cleanupTicTacToe)(matchId);
            (0, rope_game_1.cleanupRopeGame)(matchId);
            (0, pong_game_1.cleanupPongGame)(matchId);
            await this.matchmakingService.endMatch(matchId, userId, 'user_logged_out', this.redis, this.server);
        }
        await this.matchmakingService.leaveQueue(userId, this.redis);
        client.disconnect();
    }
    handleGameDecline(client, data) {
        const userId = client.data.userId;
        if (!userId || !data.matchId || !data.partnerId)
            return;
        this.logger.log(`[game:decline] ${userId} declined ${data.gameId} match=${data.matchId}`);
        this.server.to(`user:${data.partnerId}`).emit('game:declined', {
            matchId: data.matchId,
            gameId: data.gameId,
            declinedBy: userId,
        });
    }
};
exports.MatchmakingGateway = MatchmakingGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], MatchmakingGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join_queue'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], MatchmakingGateway.prototype, "joinQueue", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leave_queue'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], MatchmakingGateway.prototype, "leaveQueue", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('end_match'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], MatchmakingGateway.prototype, "endMatch", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('next_match'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], MatchmakingGateway.prototype, "nextMatch", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('reset_queue'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], MatchmakingGateway.prototype, "resetQueue", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('memory:start'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], MatchmakingGateway.prototype, "handleMemoryStart", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('memory:flip'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], MatchmakingGateway.prototype, "handleMemoryFlip", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('ttt:start'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], MatchmakingGateway.prototype, "handleTttStart", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('ttt:move'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], MatchmakingGateway.prototype, "handleTttMove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('rope:start'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], MatchmakingGateway.prototype, "handleRopeStart", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('rope:pull'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], MatchmakingGateway.prototype, "onRopePull", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('pong:start'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], MatchmakingGateway.prototype, "handlePongStart", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('pong:input'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], MatchmakingGateway.prototype, "onPongInput", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('game:invite'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], MatchmakingGateway.prototype, "handleGameInvite", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('game:accept'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], MatchmakingGateway.prototype, "handleGameAccept", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('logout'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], MatchmakingGateway.prototype, "handleLogout", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('game:decline'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], MatchmakingGateway.prototype, "handleGameDecline", null);
exports.MatchmakingGateway = MatchmakingGateway = MatchmakingGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: (origin, callback) => {
                if (!origin || ALLOWED_ORIGINS.includes(origin)) {
                    callback(null, true);
                }
                else {
                    console.error(`[WS-CORS] rejected origin: ${origin}`);
                    callback(new Error(`CORS: ${origin} not allowed`));
                }
            },
            credentials: true,
        },
        transports: ['polling', 'websocket'],
        pingInterval: 10000,
        pingTimeout: 15000,
    }),
    __metadata("design:paramtypes", [matchmaking_service_1.MatchmakingService,
        jwt_1.JwtService])
], MatchmakingGateway);
//# sourceMappingURL=matchmaking.gateway.js.map