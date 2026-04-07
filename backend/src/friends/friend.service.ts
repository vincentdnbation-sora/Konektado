import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';

const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://dating-app-46dvc6ij.livekit.cloud';

@Injectable()
export class FriendService {
  private readonly logger = new Logger(FriendService.name);

  private activeFriendCalls = new Map<string, { caller: string; callee: string; roomName: string }>();

  constructor(
    private prisma: PrismaService,
    private voiceService: VoiceService,
    private matchmakingService: MatchmakingService,
  ) {}

  async addFriend(userId: string, friendId: string): Promise<boolean> {
    if (userId === friendId) return false;

    // Check if already friends (either direction)
    const existing = await this.prisma.friend.findFirst({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      },
    });
    if (existing) return false;

    await this.prisma.friend.create({
      data: { userId, friendId },
    });

    this.logger.log(`[friend] ${userId} added ${friendId}`);
    return true;
  }

  async removeFriend(userId: string, friendId: string): Promise<boolean> {
    const deleted = await this.prisma.friend.deleteMany({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      },
    });
    if (deleted.count > 0) {
      this.logger.log(`[friend] ${userId} removed ${friendId}`);
      return true;
    }
    return false;
  }

  async getFriends(userId: string): Promise<any[]> {
    const rows = await this.prisma.friend.findMany({
      where: {
        OR: [{ userId }, { friendId: userId }],
      },
      include: {
        friend: { include: { profile: true } },
        user: { include: { profile: true } },
      },
    });

    return rows.map(row => {
      // Return the "other" person in the relationship
      const other = row.userId === userId ? row.friend : row.user;
      return {
        id: other.id,
        displayName: other.profile?.displayName || 'Unknown',
        avatar: other.profile?.avatar || '',
      };
    });
  }

  async getCallerProfile(callerId: string): Promise<{ displayName: string; avatar: string }> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId: callerId },
      select: { displayName: true, avatar: true },
    });
    return {
      displayName: profile?.displayName || 'Someone',
      avatar: (profile as any)?.avatar || '',
    };
  }

  getCallInfo(roomName: string): { caller: string; callee: string; roomName: string } | null {
    return this.activeFriendCalls.get(roomName) || null;
  }

  async callFriend(callerId: string, friendId: string): Promise<{ roomName: string; token: string; livekitUrl: string } | null> {
    if (!this.matchmakingService.canTransitionTo(callerId, 'in_friend_call') ||
        !this.matchmakingService.canTransitionTo(friendId, 'in_friend_call')) {
      this.logger.warn(`[callFriend] cannot call: caller=${this.matchmakingService.getUserState(callerId)}, callee=${this.matchmakingService.getUserState(friendId)}`);
      return null;
    }

    // Verify friendship
    const isFriend = await this.prisma.friend.findFirst({
      where: {
        OR: [
          { userId: callerId, friendId },
          { userId: friendId, friendId: callerId },
        ],
      },
    });
    if (!isFriend) return null;

    const roomName = `friend-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const token = await this.voiceService.createToken(roomName, callerId);

    this.activeFriendCalls.set(roomName, { caller: callerId, callee: friendId, roomName });
    this.matchmakingService.setUserState(callerId, 'in_friend_call');

    this.logger.log(`[friend] ${callerId} calling ${friendId} in ${roomName}`);
    return { roomName, token, livekitUrl: LIVEKIT_URL };
  }

  async acceptCall(calleeId: string, roomName: string): Promise<{ token: string; livekitUrl: string } | null> {
    const call = this.activeFriendCalls.get(roomName);
    if (!call || call.callee !== calleeId) return null;

    if (!this.matchmakingService.canTransitionTo(calleeId, 'in_friend_call')) {
      return null;
    }

    const token = await this.voiceService.createToken(roomName, calleeId);
    this.matchmakingService.setUserState(calleeId, 'in_friend_call');

    this.logger.log(`[friend] ${calleeId} accepted call in ${roomName}`);
    return { token, livekitUrl: LIVEKIT_URL };
  }

  rejectCall(calleeId: string, roomName: string): { success: boolean; callerId: string | null } {
    const call = this.activeFriendCalls.get(roomName);
    if (!call || call.callee !== calleeId) return { success: false, callerId: null };

    this.activeFriendCalls.delete(roomName);
    this.matchmakingService.setUserState(call.caller, 'idle');

    this.logger.log(`[friend] ${calleeId} rejected call in ${roomName}`);
    return { success: true, callerId: call.caller };
  }

  endCall(userId: string, roomName: string): string | null {
    const call = this.activeFriendCalls.get(roomName);
    if (!call) return null;

    if (call.caller === userId || call.callee === userId) {
      this.activeFriendCalls.delete(roomName);
      this.matchmakingService.setUserState(call.caller, 'idle');
      this.matchmakingService.setUserState(call.callee, 'idle');
      this.logger.log(`[friend] call ended in ${roomName} by ${userId}`);
      // Return the other party's userId so the gateway can notify them
      return call.caller === userId ? call.callee : call.caller;
    }
    return null;
  }

  handleDisconnect(userId: string): void {
    for (const [roomName, call] of this.activeFriendCalls.entries()) {
      if (call.caller === userId || call.callee === userId) {
        this.endCall(userId, roomName);
        break;
      }
    }
  }
}
