import { Module } from '@nestjs/common';
import { FriendService } from './friend.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';

@Module({
  providers: [FriendService, PrismaService, VoiceService, MatchmakingService],
  exports: [FriendService],
})
export class FriendModule {}