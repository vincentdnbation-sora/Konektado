import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';
export declare class MatchmakingService {
    private prisma;
    private voiceService;
    private readonly logger;
    constructor(prisma: PrismaService, voiceService: VoiceService);
    joinQueue(userId: string, data: {
        lat?: number;
        lng?: number;
        preferences: any;
    }, redis: Redis): Promise<{
        status: string;
    }>;
    leaveQueue(userId: string, redis: Redis): Promise<{
        status: string;
    }>;
    runMatchmaking(redis: Redis, server: any): Promise<void>;
    private _runMatchmaking;
    private createMatch;
    endMatch(matchId: string, userId: string, reason: string, redis: Redis): Promise<void>;
    private getDistanceKm;
    private deg2rad;
    private hasRecentMatch;
    handleUserDisconnect(userId: string, redis: Redis, server: any): Promise<void>;
}
