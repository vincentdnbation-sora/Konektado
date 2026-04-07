import { UsersService } from './users.service';
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
    getProfile(req: any): Promise<{
        profile: {
            id: string;
            displayName: string;
            bio: string | null;
            age: number;
            gender: string;
            photoUrl: string | null;
            userId: string;
        } | null;
        preferences: {
            id: string;
            preferredGender: string;
            minAge: number;
            maxAge: number;
            maxDistanceKm: number;
            userId: string;
        } | null;
        id: string;
        email: string;
        fcmToken: string | null;
        role: string;
        isBanned: boolean;
        isDeleted: boolean;
        deletedAt: Date | null;
        createdAt: Date;
        lastActive: Date | null;
    }>;
    updateProfile(req: any, body: any): Promise<{
        id: string;
        displayName: string;
        bio: string | null;
        age: number;
        gender: string;
        photoUrl: string | null;
        userId: string;
    }>;
    updatePreferences(req: any, body: any): Promise<{
        id: string;
        preferredGender: string;
        minAge: number;
        maxAge: number;
        maxDistanceKm: number;
        userId: string;
    }>;
}
