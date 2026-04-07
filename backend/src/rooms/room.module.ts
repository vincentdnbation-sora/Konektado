import { Module } from '@nestjs/common';
import { RoomService } from './room.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from '../voice/voice.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';

@Module({
  providers: [RoomService, PrismaService, VoiceService, MatchmakingService],
  exports: [RoomService],
})
export class RoomModule {}
