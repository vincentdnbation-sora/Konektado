import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';

@Module({
  imports: [MatchmakingModule],
  providers: [AdminService],
  controllers: [AdminController],
})
export class AdminModule {}
