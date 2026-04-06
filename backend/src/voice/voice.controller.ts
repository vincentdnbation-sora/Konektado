import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('voice')
@UseGuards(JwtAuthGuard)
export class VoiceController {
  constructor(private voiceService: VoiceService) {}

  @Post('token')
  async getToken(@Body() body: { roomName: string }, @Request() req: any) {
    const token = await this.voiceService.createToken(body.roomName, req.user.id);
    return { token, url: process.env.LIVEKIT_URL };
  }
}
