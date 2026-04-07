import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';

export interface RoomUser {
  userId: string;
  displayName: string;
  avatar: string;
}

export interface Room {
  roomId: string;
  users: Set<string>;
  maxUsers: number;
  createdAt: number;
}

export interface RoomDto {
  roomId: string;
  users: RoomUser[];
  maxUsers: number;
  createdAt: number;
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  private rooms = new Map<string, Room>();
  private userRoomMap = new Map<string, string>();
  /** Cache userId → profile to avoid repeated DB lookups */
  private profileCache = new Map<string, { displayName: string; avatar: string }>();

  constructor(
    private prisma: PrismaService,
    private voiceService: VoiceService,
    private matchmakingService: MatchmakingService,
  ) {}

  private async cacheProfile(userId: string): Promise<void> {
    if (this.profileCache.has(userId)) return;
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { displayName: true, avatar: true },
    });
    this.profileCache.set(userId, {
      displayName: profile?.displayName || 'Unknown',
      avatar: (profile as any)?.avatar || '',
    });
  }

  private toDto(room: Room): RoomDto {
    return {
      roomId: room.roomId,
      maxUsers: room.maxUsers,
      createdAt: room.createdAt,
      users: Array.from(room.users).map(uid => ({
        userId: uid,
        ...(this.profileCache.get(uid) || { displayName: 'Unknown', avatar: '' }),
      })),
    };
  }

  getRooms(): RoomDto[] {
    return Array.from(this.rooms.values()).map(r => this.toDto(r));
  }

  async createRoom(userId: string): Promise<{ roomId: string; token: string } | null> {
    if (!this.matchmakingService.canTransitionTo(userId, 'in_room')) {
      this.logger.warn(`[createRoom] user ${userId} cannot create room: ${this.matchmakingService.getUserState(userId)}`);
      return null;
    }

    await this.cacheProfile(userId);

    const roomId = `room-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const room: Room = {
      roomId,
      users: new Set([userId]),
      maxUsers: 5,
      createdAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    this.userRoomMap.set(userId, roomId);
    this.matchmakingService.setUserState(userId, 'in_room');

    const token = await this.voiceService.createToken(roomId, userId);

    this.logger.log(`[room] created ${roomId} by ${userId}`);
    return { roomId, token };
  }

  async joinRoom(userId: string, roomId: string): Promise<{ token: string } | null> {
    const room = this.rooms.get(roomId);
    if (!room) {
      this.logger.warn(`[joinRoom] room ${roomId} not found`);
      return null;
    }

    if (room.users.size >= room.maxUsers) {
      this.logger.warn(`[joinRoom] room ${roomId} full`);
      return null;
    }

    if (!this.matchmakingService.canTransitionTo(userId, 'in_room')) {
      this.logger.warn(`[joinRoom] user ${userId} cannot join room: ${this.matchmakingService.getUserState(userId)}`);
      return null;
    }

    await this.cacheProfile(userId);

    room.users.add(userId);
    this.userRoomMap.set(userId, roomId);
    this.matchmakingService.setUserState(userId, 'in_room');

    const token = await this.voiceService.createToken(roomId, userId);

    this.logger.log(`[room] ${userId} joined ${roomId}`);
    return { token };
  }

  leaveRoom(userId: string): void {
    const roomId = this.userRoomMap.get(userId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (room) {
      room.users.delete(userId);
      this.logger.log(`[room] ${userId} left ${roomId}`);

      if (room.users.size === 0) {
        this.rooms.delete(roomId);
        this.logger.log(`[room] deleted empty ${roomId}`);
      }
    }

    this.userRoomMap.delete(userId);
    this.matchmakingService.setUserState(userId, 'idle');
  }

  getRoomForUser(userId: string): Room | null {
    const roomId = this.userRoomMap.get(userId);
    return roomId ? this.rooms.get(roomId) || null : null;
  }

  handleDisconnect(userId: string): void {
    this.leaveRoom(userId);
  }
}
