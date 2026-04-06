import { Injectable } from '@nestjs/common';

@Injectable()
export class VoiceService {
  async createToken(roomName: string, userId: string): Promise<string> {
    const { AccessToken } = await import('livekit-server-sdk');
    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity: userId, ttl: '2h' },
    );

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    return await token.toJwt();
  }
}
