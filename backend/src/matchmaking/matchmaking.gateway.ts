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
        callback(new Error(`CORS: ${origin} not allowed`));
      }
    },
    credentials: true,
  },
})
export class MatchmakingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  /**
   * Fallback sweep interval — catches the rare race condition where two users
   * joined simultaneously and both ended up waiting in the queue without
   * matching each other. The hot path is purely event-driven via joinQueue.
   * Kept at 200ms so the worst-case wait from a race condition is imperceptible.
   */
  constructor(
    private matchmakingService: MatchmakingService,
    private jwtService: JwtService,
  ) {
    // Store ref so Node.js doesn't GC the interval
    setInterval(() => {
      this.matchmakingService.runMatchmaking(this.redis, this.server);
    }, 200);
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
    if (!client.data.userId) return;
    // Handles both queue cleanup and in-call partner notification
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

    // Pass server so joinQueue can emit match_found immediately if a partner is found
    const result = await this.matchmakingService.joinQueue(userId, data, this.redis, this.server);

    // Only emit queue_status when actually queued — if matched, match_found was already sent
    if (result.status === 'queued') {
      client.emit('queue_status', { status: 'queued' });
    }
  }

  @SubscribeMessage('leave_queue')
  async leaveQueue(@ConnectedSocket() client: Socket) {
    if (!client.data.userId) return;
    await this.matchmakingService.leaveQueue(client.data.userId, this.redis);
    client.emit('queue_status', { status: 'left' });
  }

  @SubscribeMessage('end_match')
  async endMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; reason: string },
  ) {
    if (!client.data.userId) return;
    cleanupGame(data.matchId);
    await this.matchmakingService.endMatch(
      data.matchId,
      client.data.userId,
      data.reason || 'user_left',
      this.redis,
      this.server,
    );
  }

  /**
   * "Next" — user ends current call and immediately re-enters the queue.
   * Designed to feel instant: the client navigates to the queue page at the same
   * time this event fires, so by the time the new page loads, a match may already
   * be waiting.
   */
  @SubscribeMessage('next_match')
  async nextMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; lat?: number; lng?: number; preferences?: any },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    // End current match and notify the partner before re-queuing.
    // Must be awaited so that the old match's MATCHED_SET entries are cleared in Redis
    // before joinQueue does sadd for the new match — otherwise endMatch's srem could
    // race and remove the user from their new match's MATCHED_SET entry.
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

    // Fix 3: pass the full join data (lat, lng, preferences) — previously only
    // data.preferences was forwarded, which meant joinQueue received the preferences
    // object as its `data` parameter instead of { lat, lng, preferences }.
    const result = await this.matchmakingService.joinQueue(
      userId,
      { lat: data.lat, lng: data.lng, preferences: data.preferences || {} },
      this.redis,
      this.server,
    );

    if (result.status === 'queued') {
      client.emit('queue_status', { status: 'queued' });
    }
    // If 'matched', match_found was already emitted by joinQueue
  }

  @SubscribeMessage('game_jump')
  handleGameJump(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    handleJump(data.matchId, client.data.userId, this.server);
  }
}
