import { PrismaService } from '../prisma/prisma.service';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    getProfile(userId: string): Promise<{
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
    updateProfile(userId: string, data: {
        displayName?: string;
        bio?: string;
        photoUrl?: string;
    }): Promise<{
        id: string;
        displayName: string;
        bio: string | null;
        age: number;
        gender: string;
        photoUrl: string | null;
        userId: string;
    }>;
    updatePreferences(userId: string, data: {
        preferredGender?: string;
        minAge?: number;
        maxAge?: number;
        maxDistanceKm?: number;
    }): Promise<{
        id: string;
        preferredGender: string;
        minAge: number;
        maxAge: number;
        maxDistanceKm: number;
        userId: string;
    }>;
}
