"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var VoiceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceService = void 0;
const common_1 = require("@nestjs/common");
let VoiceService = VoiceService_1 = class VoiceService {
    logger = new common_1.Logger(VoiceService_1.name);
    async createToken(roomName, userId) {
        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        if (!apiKey || !apiSecret) {
            this.logger.error('LIVEKIT_API_KEY or LIVEKIT_API_SECRET is not set in environment variables');
            throw new Error('LiveKit credentials not configured');
        }
        this.logger.log(`[createToken] room=${roomName} user=${userId} apiKey=${apiKey.substring(0, 6)}...`);
        const { AccessToken } = await import('livekit-server-sdk');
        const token = new AccessToken(apiKey, apiSecret, { identity: userId, ttl: '2h' });
        token.addGrant({
            roomJoin: true,
            roomCreate: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
        });
        const jwt = await token.toJwt();
        this.logger.log(`[createToken] success — jwt length=${jwt.length}`);
        return jwt;
    }
};
exports.VoiceService = VoiceService;
exports.VoiceService = VoiceService = VoiceService_1 = __decorate([
    (0, common_1.Injectable)()
], VoiceService);
//# sourceMappingURL=voice.service.js.map