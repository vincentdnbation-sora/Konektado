import { PrismaService } from '../prisma/prisma.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
export declare class AdminService {
    private prisma;
    private matchmakingService;
    private readonly logger;
    private redis;
    constructor(prisma: PrismaService, matchmakingService: MatchmakingService);
    deleteUser(userId: string, adminId: string, options?: {
        ban?: boolean;
    }): Promise<{
        status: string;
        userId: string;
        email?: undefined;
        displayName?: undefined;
        banned?: undefined;
        deletedAt?: undefined;
        deletedBy?: undefined;
    } | {
        status: string;
        userId: string;
        email: string;
        displayName: string | undefined;
        banned: boolean;
        deletedAt: Date | null;
        deletedBy: string;
    }>;
    deleteAllUsers(adminId: string, options?: {
        hardDelete?: boolean;
    }): Promise<{
        status: string;
        count: number;
        deletedBy: string;
    }>;
    restoreUser(userId: string, adminId: string): Promise<{
        status: string;
        userId: string;
        restoredBy?: undefined;
    } | {
        status: string;
        userId: string;
        restoredBy: string;
    }>;
    listUsers(filters?: {
        deleted?: boolean;
        banned?: boolean;
        search?: string;
    }): Promise<{
        id: string;
        email: string;
        displayName: string | undefined;
        age: number | undefined;
        gender: string | undefined;
        role: string;
        isBanned: boolean;
        isDeleted: boolean;
        deletedAt: Date | null;
        createdAt: Date;
        lastActive: Date | null;
    }[]>;
    private disconnectUserFromActiveSessions;
    private removeFromQueue;
    private deleteRedisKeysByPattern;
}
