import { PrismaService } from '../prisma/prisma.service';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    getProfile(userId: string): Promise<{
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
        role: string;
        isBanned: boolean;
        isDeleted: boolean;
        deletedAt: Date | null;
        createdAt: Date;
        lastActive: Date | null;
    }>;
    updateProfile(userId: string, data: {
        displayName?: string;
        bio?: string;
        photoUrl?: string;
    }): Promise<{
        displayName: string;
        age: number;
        gender: string;
        userId: string;
        id: string;
        bio: string | null;
        photoUrl: string | null;
    }>;
    updatePreferences(userId: string, data: {
        preferredGender?: string;
        minAge?: number;
        maxAge?: number;
        maxDistanceKm?: number;
    }): Promise<{
        userId: string;
        id: string;
        preferredGender: string;
        minAge: number;
        maxAge: number;
        maxDistanceKm: number;
    }>;
}
