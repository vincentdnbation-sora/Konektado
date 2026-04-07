import { PrismaService } from '../prisma/prisma.service';
export declare class ReportsService {
    private prisma;
    constructor(prisma: PrismaService);
    report(reporterId: string, data: {
        reportedId: string;
        matchId?: string;
        reason: string;
        description?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        matchId: string | null;
        description: string | null;
        reason: string;
        reviewed: boolean;
        reporterId: string;
        reportedId: string;
    }>;
    block(blockerId: string, blockedId: string): Promise<{
        id: string;
        createdAt: Date;
        blockerId: string;
        blockedId: string;
    }>;
}
