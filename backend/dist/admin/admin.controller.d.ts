import { AdminService } from './admin.service';
export declare class AdminController {
    private adminService;
    constructor(adminService: AdminService);
    listUsers(deleted?: string, banned?: string, search?: string): Promise<{
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
    deleteUser(userId: string, body: {
        ban?: boolean;
    }, req: any): Promise<{
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
    deleteAllUsers(body: {
        confirm: string;
        hardDelete?: boolean;
    }, req: any): Promise<{
        status: string;
        count: number;
        deletedBy: string;
    }> | {
        status: string;
        message: string;
    };
    restoreUser(userId: string, req: any): Promise<{
        status: string;
        userId: string;
        restoredBy?: undefined;
    } | {
        status: string;
        userId: string;
        restoredBy: string;
    }>;
    banUser(userId: string, req: any): Promise<{
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
}
