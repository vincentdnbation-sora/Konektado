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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const jwt_1 = require("@nestjs/jwt");
const matchmaking_service_1 = require("./matchmaking.service");
const sync_game_1 = require("./sync-game");
const ioredis_1 = __importDefault(require("ioredis"));
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'https://konektado-beta.vercel.app',
    process.env.FRONTEND_URL,
].filter(Boolean);
let MatchmakingGateway = class MatchmakingGateway {
    matchmakingService;
    jwtService;
    server;
    redis = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379');
    matchInterval;
    constructor(matchmakingService, jwtService) {
        this.matchmakingService = matchmakingService;
        this.jwtService = jwtService;
    }
    async handleConnection(client) {
        try {
            const token = client.handshake.auth?.token;
            const payload = this.jwtService.verify(token, {
                secret: process.env.JWT_SECRET || 'secret',
            });
            client.data.userId = payload.sub;
            client.join(`user:${payload.sub}`);
        }
        catch {
            client.disconnect();
        }
    }
    async handleDisconnect(client) {
        if (client.data.userId) {
            await this.matchmakingService.handleUserDisconnect(client.data.userId, this.redis, this.server);
        }
    }
    async joinQueue(client, data) {
        const result = await this.matchmakingService.joinQueue(client.data.userId, data, this.redis);
        client.emit('queue_status', result);
        this.matchmakingService.runMatchmaking(this.redis, this.server);
    }
    async leaveQueue(client) {
        await this.matchmakingService.leaveQueue(client.data.userId, this.redis);
        client.emit('queue_status', { status: 'left' });
    }
    async endMatch(client, data) {
        await this.matchmakingService.endMatch(data.matchId, client.data.userId, data.reason, this.redis);
        (0, sync_game_1.cleanupGame)(data.matchId);
    }
    handleGameJump(client, data) {
        (0, sync_game_1.handleJump)(data.matchId, client.data.userId, this.server);
    }
    startGameForMatch(matchId, user1Id, user2Id) {
        (0, sync_game_1.startSyncGame)(matchId, user1Id, user2Id, this.server);
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
    (0, websockets_1.SubscribeMessage)('game_jump'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], MatchmakingGateway.prototype, "handleGameJump", null);
exports.MatchmakingGateway = MatchmakingGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: (origin, callback) => {
                if (!origin || ALLOWED_ORIGINS.includes(origin)) {
                    callback(null, true);
                }
                else {
                    callback(new Error(`CORS: ${origin} not allowed`));
                }
            },
            credentials: true,
        },
    }),
    __metadata("design:paramtypes", [matchmaking_service_1.MatchmakingService,
        jwt_1.JwtService])
], MatchmakingGateway);
//# sourceMappingURL=matchmaking.gateway.js.map