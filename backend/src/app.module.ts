import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { VoiceModule } from './voice/voice.module';
import { GameModule } from './game/game.module';
import { ReportsModule } from './reports/reports.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    MatchmakingModule,
    VoiceModule,
    GameModule,
    ReportsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
