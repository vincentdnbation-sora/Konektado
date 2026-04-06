import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  async createToken(roomName: string, userId: string): Promise<string> {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      this.logger.error('LIVEKIT_API_KEY or LIVEKIT_API_SECRET is not set in environment variables');
      throw new Error('LiveKit credentials not configured');
    }

    this.logger.log(`[createToken] room=${roomName} user=${userId} apiKey=${apiKey.substring(0, 6)}...`);

    const { AccessToken } = await import('livekit-server-sdk');
    const token = new AccessToken(apiKey, apiSecret, { identity: userId, ttl: '2h' });

    token.addGrant({
      roomJoin: true,
      roomCreate: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt = await token.toJwt();
    this.logger.log(`[createToken] success — jwt length=${jwt.length}`);
    return jwt;
  }
}
