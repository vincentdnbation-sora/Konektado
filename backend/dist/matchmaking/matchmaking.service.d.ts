import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';
export interface ActiveMatch {
    user1Id: string;
    user2Id: string;
    roomName: string;
    startedAt: number;
}
export declare class MatchmakingService {
    private prisma;
    private voiceService;
    private readonly logger;
    readonly activeMatches: Map<string, ActiveMatch>;
    private readonly userToMatch;
    private readonly disconnectTimers;
    constructor(prisma: PrismaService, voiceService: VoiceService);
    joinQueue(userId: string, data: {
        lat?: number;
        lng?: number;
        preferences?: any;
    }, redis: Redis, server?: any): Promise<{
        status: string;
    }>;
    leaveQueue(userId: string, redis: Redis): Promise<{
        status: string;
    }>;
    runMatchmaking(redis: Redis, server: any): Promise<void>;
    private popAvailablePartner;
    createMatch(user1Id: string, user2Id: string, redis: Redis, server: any): Promise<void>;
    private persistMatch;
    endMatch(matchId: string, userId: string, reason: string, redis: Redis, server?: any): Promise<void>;
    handleUserDisconnect(userId: string, redis: Redis, server: any): void;
    cancelDisconnect(userId: string): void;
    resendMatchIfExists(userId: string, server: any): Promise<boolean>;
    getMatchIdForUser(userId: string): string | undefined;
}
