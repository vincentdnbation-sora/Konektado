import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MatchmakingService } from './matchmaking.service';
import Redis from 'ioredis';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://konektado-beta.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

@WebSocketGateway({
  cors: {
    origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: ${origin} not allowed`));
      }
    },
    credentials: true,
  },
})
export class MatchmakingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  private matchInterval: NodeJS.Timeout;

  constructor(
    private matchmakingService: MatchmakingService,
    private jwtService: JwtService,
  ) {
    this.matchInterval = setInterval(() => {
      this.matchmakingService.runMatchmaking(this.redis, this.server);
    }, 2000);
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'secret',
      });
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    if (client.data.userId) {
      await this.matchmakingService.leaveQueue(client.data.userId, this.redis);
    }
  }

  @SubscribeMessage('join_queue')
  async joinQueue(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const result = await this.matchmakingService.joinQueue(
      client.data.userId,
      data,
      this.redis,
    );
    client.emit('queue_status', result);
  }

  @SubscribeMessage('leave_queue')
  async leaveQueue(@ConnectedSocket() client: Socket) {
    await this.matchmakingService.leaveQueue(client.data.userId, this.redis);
    client.emit('queue_status', { status: 'left' });
  }

  @SubscribeMessage('end_match')
  async endMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; reason: string },
  ) {
    await this.matchmakingService.endMatch(
      data.matchId,
      client.data.userId,
      data.reason,
      this.redis,
    );
  }
}
