import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingGateway } from './matchmaking.gateway';
import { VoiceModule } from '../voice/voice.module';

@Module({
  imports: [
    VoiceModule,
    JwtModule.register({ secret: process.env.JWT_SECRET || 'secret' }),
  ],
  providers: [MatchmakingService, MatchmakingGateway],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
