import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MatchmakingService } from './matchmaking.service';
import { handleJump, cleanupGame } from './sync-game';
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
        console.error(`[WS-CORS] rejected origin: ${origin}`);
        callback(new Error(`CORS: ${origin} not allowed`));
      }
    },
    credentials: true,
  },
  // Allow both websocket and polling for mobile browser compatibility
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 15000,
})
export class MatchmakingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MatchmakingGateway.name);

  private redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  constructor(
    private matchmakingService: MatchmakingService,
    private jwtService: JwtService,
  ) {
    // Fallback sweep — catches race condition where two users join simultaneously
    setInterval(() => {
      this.matchmakingService.runMatchmaking(this.redis, this.server);
    }, 200);
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) {
        this.logger.warn(`[connect] no token — disconnecting ${client.id}`);
        client.disconnect();
        return;
      }
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'secret',
      });
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
      this.logger.log(`[connect] userId=${payload.sub} socketId=${client.id} transport=${client.conn.transport.name}`);
    } catch (err: any) {
      this.logger.warn(`[connect] auth failed: ${err.message} — disconnecting ${client.id}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    if (!client.data.userId) return;
    this.logger.log(`[disconnect] userId=${client.data.userId} socketId=${client.id}`);
    await this.matchmakingService.handleUserDisconnect(
      client.data.userId,
      this.redis,
      this.server,
    );
  }

  @SubscribeMessage('join_queue')
  async joinQueue(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const userId = client.data.userId;
    if (!userId) return;

    this.logger.log(`[join_queue] userId=${userId}`);

    try {
      const result = await this.matchmakingService.joinQueue(userId, data, this.redis, this.server);

      if (result.status === 'queued') {
        client.emit('queue_status', { status: 'queued' });
      }
    } catch (err: any) {
      this.logger.error(`[join_queue] error for userId=${userId}: ${err.message}`);
      client.emit('queue_status', { status: 'error', message: err.message });
    }
  }

  @SubscribeMessage('leave_queue')
  async leaveQueue(@ConnectedSocket() client: Socket) {
    if (!client.data.userId) return;
    this.logger.log(`[leave_queue] userId=${client.data.userId}`);
    await this.matchmakingService.leaveQueue(client.data.userId, this.redis);
    client.emit('queue_status', { status: 'left' });
  }

  @SubscribeMessage('end_match')
  async endMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; reason: string },
  ) {
    if (!client.data.userId) return;
    this.logger.log(`[end_match] userId=${client.data.userId} matchId=${data.matchId}`);
    cleanupGame(data.matchId);
    await this.matchmakingService.endMatch(
      data.matchId,
      client.data.userId,
      data.reason || 'user_left',
      this.redis,
      this.server,
    );
  }

  @SubscribeMessage('next_match')
  async nextMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; lat?: number; lng?: number; preferences?: any },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    this.logger.log(`[next_match] userId=${userId} matchId=${data.matchId}`);

    if (data.matchId) {
      cleanupGame(data.matchId);
      await this.matchmakingService.endMatch(
        data.matchId,
        userId,
        'user_skipped',
        this.redis,
        this.server,
      );
    }

    try {
      const result = await this.matchmakingService.joinQueue(
        userId,
        { lat: data.lat, lng: data.lng, preferences: data.preferences || {} },
        this.redis,
        this.server,
      );

      if (result.status === 'queued') {
        client.emit('queue_status', { status: 'queued' });
      }
    } catch (err: any) {
      this.logger.error(`[next_match] error for userId=${userId}: ${err.message}`);
      client.emit('queue_status', { status: 'error', message: err.message });
    }
  }

  @SubscribeMessage('game_jump')
  handleGameJump(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    handleJump(data.matchId, client.data.userId, this.server);
  }
}
