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
import { startMemoryGame, handleMemoryFlip, cleanupMemoryGame } from './memory-game';
import { startTicTacToe, handleTicTacToeMove, cleanupTicTacToe } from './tictactoe-game';
import { startRopeGame, handleRopePull, cleanupRopeGame } from './rope-game';
import { startPongGame, handlePongInput, cleanupPongGame } from './pong-game';
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
  // polling first for better mobile compatibility — matches client config
  transports: ['polling', 'websocket'],
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

      // Cancel any pending disconnect cleanup — user reconnected in time
      this.matchmakingService.cancelDisconnect(payload.sub);

      // If user was matched during a brief disconnect, resend the match_found event
      await this.matchmakingService.resendMatchIfExists(payload.sub, this.server);

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
    cleanupMemoryGame(data.matchId);
    cleanupTicTacToe(data.matchId);
    cleanupRopeGame(data.matchId);
    cleanupPongGame(data.matchId);
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

    // Step 1: Full teardown of current match BEFORE re-queuing
    if (data.matchId) {
      cleanupMemoryGame(data.matchId);
      cleanupTicTacToe(data.matchId);
      cleanupRopeGame(data.matchId);
      cleanupPongGame(data.matchId);
      await this.matchmakingService.endMatch(
        data.matchId,
        userId,
        'user_skipped',
        this.redis,
        this.server,
      );
    }

    // Step 2: Small delay to ensure teardown events are processed
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Step 3: Now re-queue
    try {
      const result = await this.matchmakingService.joinQueue(
        userId,
        { lat: data.lat, lng: data.lng, preferences: data.preferences || {} },
        this.redis,
        this.server,
      );

      if (result.status === 'queued') {
        client.emit('queue_status', { status: 'queued' });
      } else if (result.status === 'error') {
        client.emit('queue_status', { status: 'error', message: 'Teardown in progress, try again' });
      }
    } catch (err: any) {
      this.logger.error(`[next_match] error for userId=${userId}: ${err.message}`);
      client.emit('queue_status', { status: 'error', message: err.message });
    }
  }

  @SubscribeMessage('memory:start')
  handleMemoryStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; partnerId: string },
  ) {
    const userId = client.data.userId;
    if (!userId || !data.matchId || !data.partnerId) return;
    this.logger.log(`[memory:start] userId=${userId} matchId=${data.matchId}`);
    startMemoryGame(data.matchId, userId, data.partnerId, this.server);
  }

  @SubscribeMessage('memory:flip')
  handleMemoryFlip(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; cardIndex: number },
  ) {
    const userId = client.data.userId;
    if (!userId || !data.matchId || data.cardIndex == null) return;
    handleMemoryFlip(data.matchId, userId, data.cardIndex, this.server);
  }

  // ── Tic Tac Toe ──

  @SubscribeMessage('ttt:start')
  handleTttStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; partnerId: string },
  ) {
    const userId = client.data.userId;
    if (!userId || !data.matchId || !data.partnerId) return;
    this.logger.log(`[ttt:start] userId=${userId} matchId=${data.matchId}`);
    startTicTacToe(data.matchId, userId, data.partnerId, this.server);
  }

  @SubscribeMessage('ttt:move')
  handleTttMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; cellIndex: number },
  ) {
    const userId = client.data.userId;
    if (!userId || !data.matchId || data.cellIndex == null) return;
    handleTicTacToeMove(data.matchId, userId, data.cellIndex, this.server);
  }

  // ── Grab the Rope ──

  @SubscribeMessage('rope:start')
  handleRopeStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; partnerId: string },
  ) {
    const userId = client.data.userId;
    if (!userId || !data.matchId || !data.partnerId) return;
    this.logger.log(`[rope:start] userId=${userId} matchId=${data.matchId}`);
    startRopeGame(data.matchId, userId, data.partnerId, this.server);
  }

  @SubscribeMessage('rope:pull')
  onRopePull(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string },
  ) {
    const userId = client.data.userId;
    if (!userId || !data.matchId) return;
    handleRopePull(data.matchId, userId, this.server);
  }

  // ── Pong ──

  @SubscribeMessage('pong:start')
  handlePongStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; partnerId: string },
  ) {
    const userId = client.data.userId;
    if (!userId || !data.matchId || !data.partnerId) return;
    this.logger.log(`[pong:start] userId=${userId} matchId=${data.matchId}`);
    startPongGame(data.matchId, userId, data.partnerId, this.server);
  }

  @SubscribeMessage('pong:input')
  onPongInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; direction?: 'up' | 'down' | 'stop'; y?: number },
  ) {
    const userId = client.data.userId;
    if (!userId || !data.matchId) return;
    // Support absolute Y position (drag) or directional input (legacy)
    const input = data.y !== undefined ? data.y : (data.direction ?? 'stop');
    handlePongInput(data.matchId, userId, input as any, this.server);
  }

  // ── Game invitation system ──

  @SubscribeMessage('game:invite')
  handleGameInvite(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; partnerId: string; gameId: string; gameTitle: string },
  ) {
    const userId = client.data.userId;
    if (!userId || !data.matchId || !data.partnerId || !data.gameId) return;
    this.logger.log(`[game:invite] ${userId} → ${data.partnerId} game=${data.gameId} match=${data.matchId}`);
    this.server.to(`user:${data.partnerId}`).emit('game:invite', {
      matchId: data.matchId,
      fromUserId: userId,
      gameId: data.gameId,
      gameTitle: data.gameTitle,
    });
  }

  @SubscribeMessage('game:accept')
  handleGameAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; partnerId: string; gameId: string; gameTitle: string },
  ) {
    const userId = client.data.userId;
    if (!userId || !data.matchId || !data.partnerId || !data.gameId) return;
    this.logger.log(`[game:accept] ${userId} accepted ${data.gameId} match=${data.matchId}`);
    // Notify both players
    this.server.to(`user:${userId}`).to(`user:${data.partnerId}`).emit('game:accepted', {
      matchId: data.matchId,
      gameId: data.gameId,
      gameTitle: data.gameTitle,
      acceptedBy: userId,
    });
  }

  @SubscribeMessage('logout')
  async handleLogout(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;
    this.logger.log(`[logout] userId=${userId}`);
    // Immediate teardown — no grace period for intentional logout
    this.matchmakingService.cancelDisconnect(userId);
    const matchId = this.matchmakingService.getMatchIdForUser(userId);
    if (matchId) {
      cleanupMemoryGame(matchId);
      cleanupTicTacToe(matchId);
      cleanupRopeGame(matchId);
      cleanupPongGame(matchId);
      await this.matchmakingService.endMatch(matchId, userId, 'user_logged_out', this.redis, this.server);
    }
    await this.matchmakingService.leaveQueue(userId, this.redis);
    client.disconnect();
  }

  @SubscribeMessage('game:decline')
  handleGameDecline(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; partnerId: string; gameId: string },
  ) {
    const userId = client.data.userId;
    if (!userId || !data.matchId || !data.partnerId) return;
    this.logger.log(`[game:decline] ${userId} declined ${data.gameId} match=${data.matchId}`);
    this.server.to(`user:${data.partnerId}`).emit('game:declined', {
      matchId: data.matchId,
      gameId: data.gameId,
      declinedBy: userId,
    });
  }
}
