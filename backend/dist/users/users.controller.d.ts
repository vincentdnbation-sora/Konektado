import { UsersService } from './users.service';
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
    getProfile(req: any): Promise<{
        profile: {
            displayName: string;
            age: number;
            gender: string;
            userId: string;
            id: string;
            bio: string | null;
            photoUrl: string | null;
        } | null;
        preferences: {
            userId: string;
            id: string;
            preferredGender: string;
            minAge: number;
            maxAge: number;
            maxDistanceKm: number;
        } | null;
        email: string;
        id: string;
        fcmToken: string | null;
        isBanned: boolean;
        createdAt: Date;
        lastActive: Date | null;
    }>;
    updateProfile(req: any, body: any): Promise<{
        displayName: string;
        age: number;
        gender: string;
        userId: string;
        id: string;
        bio: string | null;
        photoUrl: string | null;
    }>;
    updatePreferences(req: any, body: any): Promise<{
        userId: string;
        id: string;
        preferredGender: string;
        minAge: number;
        maxAge: number;
        maxDistanceKm: number;
    }>;
}
