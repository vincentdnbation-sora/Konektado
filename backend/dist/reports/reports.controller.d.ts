import { ReportsService } from './reports.service';
export declare class ReportsController {
    private reportsService;
    constructor(reportsService: ReportsService);
    report(req: any, body: any): Promise<{
        id: string;
        createdAt: Date;
        description: string | null;
        matchId: string | null;
        reason: string;
        reviewed: boolean;
        reporterId: string;
        reportedId: string;
    }>;
    block(req: any, body: {
        blockedId: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        blockerId: string;
        blockedId: string;
    }>;
}
