import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preferences: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async updateProfile(userId: string, data: { displayName?: string; bio?: string; photoUrl?: string; avatar?: string }) {
    return this.prisma.profile.update({
      where: { userId },
      data,
    });
  }

  async updatePreferences(userId: string, data: { preferredGender?: string; minAge?: number; maxAge?: number; maxDistanceKm?: number }) {
    return this.prisma.preferences.update({
      where: { userId },
      data,
    });
  }
}
