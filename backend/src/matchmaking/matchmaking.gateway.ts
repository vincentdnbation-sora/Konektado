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
import { RoomService } from '../rooms/room.service';
import { FriendService } from '../friends/friend.service';
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
    private roomService: RoomService,
    private friendService: FriendService,
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

      // Track active user presence by userId+socketId
      this.matchmakingService.addActiveUser(payload.sub, client.id);
      this.matchmakingService.broadcastPresence(this.server, this.redis);

      // Send current presence to the newly connected client
      const active = this.matchmakingService.getActiveUserCount();
      this.redis.zcard('matchmaking:queue').then((searching) => {
        client.emit('presence:update', { active, searching });
      }).catch(() => {
        client.emit('presence:update', { active, searching: 0 });
      });

      await this.matchmakingService.resendMatchIfExists(payload.sub, this.server);

      this.logger.log(`[ws] connect userId=${payload.sub} socket=${client.id}`);
    } catch (err: any) {
      this.logger.warn(`[connect] auth failed: ${err.message} — disconnecting ${client.id}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    if (!client.data.userId) return;
    const userId = client.data.userId;
    // Remove this specific socket from presence tracking
    this.matchmakingService.removeActiveSocket(userId, client.id);
    this.logger.debug(`[ws] disconnect userId=${userId} socket=${client.id}`);
    await this.matchmakingService.handleUserDisconnect(
      userId,
      this.redis,
      this.server,
    );
    this.roomService.handleDisconnect(userId);
    this.friendService.handleDisconnect(userId);
  }

  @SubscribeMessage('join_queue')
  async joinQueue(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    const userId = client.data.userId;
    if (!userId) return;

    this.logger.debug(`[join_queue] userId=${userId}`);

    try {
      const result = await this.matchmakingService.joinQueue(userId, data, this.redis, this.server);

      if (result.status === 'queued') {
        client.emit('queue_status', { status: 'queued' });
      }
      this.matchmakingService.broadcastPresence(this.server, this.redis);
    } catch (err: any) {
      this.logger.error(`[join_queue] error for userId=${userId}: ${err.message}`);
      client.emit('queue_status', { status: 'error', message: err.message });
    }
  }

  @SubscribeMessage('leave_queue')
  async leaveQueue(@ConnectedSocket() client: Socket) {
    if (!client.data.userId) return;
    this.logger.debug(`[leave_queue] userId=${client.data.userId}`);
    await this.matchmakingService.leaveQueue(client.data.userId, this.redis);
    client.emit('queue_status', { status: 'left' });
    this.matchmakingService.broadcastPresence(this.server, this.redis);
  }

  @SubscribeMessage('end_match')
  async endMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; reason: string },
  ) {
    if (!client.data.userId) return;
    this.logger.debug(`[end_match] userId=${client.data.userId} matchId=${data.matchId}`);
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

    this.logger.debug(`[next_match] userId=${userId} matchId=${data.matchId}`);

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

    // Step 2: Force-clean any remaining stale state for this user
    await this.matchmakingService.forceCleanupUser(userId, this.redis);

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

  @SubscribeMessage('reset_queue')
  async resetQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lat?: number; lng?: number; preferences?: any },
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    this.logger.log(`[reset_queue] userId=${userId}`);

    try {
      const result = await this.matchmakingService.resetQueue(
        userId,
        { lat: data?.lat, lng: data?.lng, preferences: data?.preferences || {} },
        this.redis,
        this.server,
      );

      if (result.status === 'queued') {
        client.emit('queue_status', { status: 'queued' });
      }
    } catch (err: any) {
      this.logger.error(`[reset_queue] error for userId=${userId}: ${err.message}`);
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
    this.logger.debug(`[memory:start] userId=${userId} matchId=${data.matchId}`);
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
    this.logger.debug(`[ttt:start] userId=${userId} matchId=${data.matchId}`);
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
    this.logger.debug(`[rope:start] userId=${userId} matchId=${data.matchId}`);
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
    this.logger.debug(`[pong:start] userId=${userId} matchId=${data.matchId}`);
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
    this.logger.debug(`[game:invite] ${userId} → ${data.partnerId} game=${data.gameId}`);
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
    this.logger.debug(`[game:accept] ${userId} accepted ${data.gameId}`);
    // Notify both players
    this.server.to(`user:${userId}`).to(`user:${data.partnerId}`).emit('game:accepted', {
      matchId: data.matchId,
      gameId: data.gameId,
      gameTitle: data.gameTitle,
      acceptedBy: userId,
    });
    // Set states to in_game
    this.matchmakingService.setUserState(userId, 'in_game');
    this.matchmakingService.setUserState(data.partnerId, 'in_game');
  }

  @SubscribeMessage('logout')
  async handleLogout(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;
    this.logger.log(`[logout] userId=${userId}`);
    // Immediate teardown — no grace period
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
    // Clean up room and friend call
    this.roomService.handleDisconnect(userId);
    this.friendService.handleDisconnect(userId);
    // Remove from presence immediately and broadcast
    this.matchmakingService.removeActiveUser(userId);
    this.matchmakingService.broadcastPresence(this.server, this.redis);
    // Prevent handleDisconnect from re-adding a grace timer for this socket
    client.data.userId = null;
    client.disconnect();
  }

  @SubscribeMessage('game:decline')
  handleGameDecline(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; partnerId: string; gameId: string },
  ) {
    const userId = client.data.userId;
    if (!userId || !data.matchId || !data.partnerId) return;
    this.logger.debug(`[game:decline] ${userId} declined ${data.gameId}`);
    this.server.to(`user:${data.partnerId}`).emit('game:declined', {
      matchId: data.matchId,
      gameId: data.gameId,
      declinedBy: userId,
    });
  }

  // ─── Room Events ──────────────────────────────────────────────────────

  @SubscribeMessage('room:list')
  handleRoomList(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;
    const rooms = this.roomService.getRooms();
    client.emit('room:list', { rooms });
  }

  @SubscribeMessage('room:create')
  async handleRoomCreate(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;
    const result = await this.roomService.createRoom(userId);
    if (result) {
      client.emit('room:created', result);
      // Broadcast updated room list
      this.server.emit('room:update', { rooms: this.roomService.getRooms() });
    } else {
      client.emit('room:error', { message: 'Cannot create room' });
    }
  }

  @SubscribeMessage('room:join')
  async handleRoomJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { roomId: string }) {
    const userId = client.data.userId;
    if (!userId || !data.roomId) return;
    const result = await this.roomService.joinRoom(userId, data.roomId);
    if (result) {
      client.emit('room:joined', { ...result, roomId: data.roomId });
      // Broadcast updated room list
      this.server.emit('room:update', { rooms: this.roomService.getRooms() });
    } else {
      client.emit('room:error', { message: 'Cannot join room' });
    }
  }

  @SubscribeMessage('room:leave')
  handleRoomLeave(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;
    this.roomService.leaveRoom(userId);
    client.emit('room:left');
    // Broadcast updated room list
    this.server.emit('room:update', { rooms: this.roomService.getRooms() });
  }

  // ─── Friend Events ────────────────────────────────────────────────────

  @SubscribeMessage('friend:add')
  async handleFriendAdd(@ConnectedSocket() client: Socket, @MessageBody() data: { friendId: string }) {
    const userId = client.data.userId;
    if (!userId || !data.friendId) return;
    const success = await this.friendService.addFriend(userId, data.friendId);
    client.emit('friend:add', { success, friendId: data.friendId });
  }

  @SubscribeMessage('friend:remove')
  async handleFriendRemove(@ConnectedSocket() client: Socket, @MessageBody() data: { friendId: string }) {
    const userId = client.data.userId;
    if (!userId || !data.friendId) return;
    const success = await this.friendService.removeFriend(userId, data.friendId);
    client.emit('friend:remove', { success, friendId: data.friendId });
  }

  @SubscribeMessage('friend:list')
  async handleFriendList(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;
    const friends = await this.friendService.getFriends(userId);
    client.emit('friend:list', { friends });
  }

  @SubscribeMessage('friend:call')
  async handleFriendCall(@ConnectedSocket() client: Socket, @MessageBody() data: { friendId: string }) {
    const userId = client.data.userId;
    if (!userId || !data.friendId) return;
    const result = await this.friendService.callFriend(userId, data.friendId);
    if (result) {
      client.emit('friend:calling', result);
      // Fetch caller profile to include in the incoming notification
      const callerProfile = await this.friendService.getCallerProfile(userId);
      this.server.to(`user:${data.friendId}`).emit('friend:incoming', {
        callerId: userId,
        callerName: callerProfile.displayName,
        callerAvatar: callerProfile.avatar,
        roomName: result.roomName,
      });
    } else {
      client.emit('friend:error', { message: 'Cannot call friend' });
    }
  }

  @SubscribeMessage('friend:accept')
  async handleFriendAccept(@ConnectedSocket() client: Socket, @MessageBody() data: { roomName: string }) {
    const userId = client.data.userId;
    if (!userId || !data.roomName) return;
    const result = await this.friendService.acceptCall(userId, data.roomName);
    if (result) {
      client.emit('friend:accepted', { ...result, roomName: data.roomName });
    } else {
      client.emit('friend:error', { message: 'Cannot accept call' });
    }
  }

  @SubscribeMessage('friend:reject')
  handleFriendReject(@ConnectedSocket() client: Socket, @MessageBody() data: { roomName: string }) {
    const userId = client.data.userId;
    if (!userId || !data.roomName) return;
    const { success, callerId } = this.friendService.rejectCall(userId, data.roomName);
    client.emit('friend:rejected', { success });
    // Notify the caller that their call was rejected
    if (success && callerId) {
      this.server.to(`user:${callerId}`).emit('friend:rejected', { roomName: data.roomName });
    }
  }

  @SubscribeMessage('friend:end')
  handleFriendEnd(@ConnectedSocket() client: Socket, @MessageBody() data: { roomName: string }) {
    const userId = client.data.userId;
    if (!userId || !data.roomName) return;
    const otherId = this.friendService.endCall(userId, data.roomName);
    client.emit('friend:ended');
    // Notify the other party
    if (otherId) {
      this.server.to(`user:${otherId}`).emit('friend:ended');
    }
  }
}
