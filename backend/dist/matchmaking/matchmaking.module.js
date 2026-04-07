"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchmakingModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const matchmaking_service_1 = require("./matchmaking.service");
const matchmaking_gateway_1 = require("./matchmaking.gateway");
const voice_module_1 = require("../voice/voice.module");
let MatchmakingModule = class MatchmakingModule {
};
exports.MatchmakingModule = MatchmakingModule;
exports.MatchmakingModule = MatchmakingModule = __decorate([
    (0, common_1.Module)({
        imports: [
            voice_module_1.VoiceModule,
            jwt_1.JwtModule.register({ secret: process.env.JWT_SECRET || 'secret' }),
        ],
        providers: [matchmaking_service_1.MatchmakingService, matchmaking_gateway_1.MatchmakingGateway],
        exports: [matchmaking_service_1.MatchmakingService],
    })
], MatchmakingModule);
//# sourceMappingURL=matchmaking.module.js.map