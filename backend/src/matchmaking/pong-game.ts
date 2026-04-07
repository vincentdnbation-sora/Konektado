import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

const logger = new Logger('PongGame');

// Field dimensions (logical units)
const FIELD_W = 400;
const FIELD_H = 300;
const PADDLE_H = 60;
const PADDLE_W = 10;
const PADDLE_MARGIN = 15;  // distance from edge
const BALL_RADIUS = 6;
const BALL_SPEED = 3.5;
const PADDLE_SPEED = 5;
const WINNING_SCORE = 5;
const TICK_MS = 33;  // ~30fps

export interface PongState {
  matchId: string;
  player1: string;  // left paddle
  player2: string;  // right paddle
  paddle1Y: number; // center Y of paddle
  paddle2Y: number;
  ballX: number;
  ballY: number;
  velX: number;
  velY: number;
  score1: number;
  score2: number;
  status: 'active' | 'scored' | 'ended';
  winner: string | null;
  tickTimer?: NodeJS.Timeout;
  // Input queues - accumulated between ticks
  p1Input: number; // -1, 0, 1
  p2Input: number;
  startedAt: number;
  pauseUntil: number; // timestamp for score pause
}

const games = new Map<string, PongState>();

function emitToPlayers(state: PongState, server: Server, event: string, data: any) {
  server.to(`user:${state.player1}`).to(`user:${state.player2}`).emit(event, data);
}

function resetBall(state: PongState, direction: number) {
  state.ballX = FIELD_W / 2;
  state.ballY = FIELD_H / 2;
  const angle = (Math.random() * 0.8 - 0.4); // slight random angle
  state.velX = BALL_SPEED * direction;
  state.velY = BALL_SPEED * Math.sin(angle);
}

function serializeState(state: PongState) {
  return {
    paddle1Y: state.paddle1Y,
    paddle2Y: state.paddle2Y,
    ballX: state.ballX,
    ballY: state.ballY,
    score1: state.score1,
    score2: state.score2,
    fieldW: FIELD_W,
    fieldH: FIELD_H,
    paddleH: PADDLE_H,
    paddleW: PADDLE_W,
    ballRadius: BALL_RADIUS,
  };
}

function gameTick(state: PongState, server: Server) {
  if (state.status !== 'active') return;

  const now = Date.now();
  if (now < state.pauseUntil) {
    // Still in score pause - just emit current state
    emitToPlayers(state, server, 'pong:tick', serializeState(state));
    return;
  }

  // Apply paddle movement
  if (state.p1Input !== 0) {
    state.paddle1Y += state.p1Input * PADDLE_SPEED;
    state.paddle1Y = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, state.paddle1Y));
  }
  if (state.p2Input !== 0) {
    state.paddle2Y += state.p2Input * PADDLE_SPEED;
    state.paddle2Y = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, state.paddle2Y));
  }

  // Move ball
  state.ballX += state.velX;
  state.ballY += state.velY;

  // Top/bottom wall bounce
  if (state.ballY - BALL_RADIUS <= 0) {
    state.ballY = BALL_RADIUS;
    state.velY = Math.abs(state.velY);
  }
  if (state.ballY + BALL_RADIUS >= FIELD_H) {
    state.ballY = FIELD_H - BALL_RADIUS;
    state.velY = -Math.abs(state.velY);
  }

  // Left paddle collision
  if (
    state.ballX - BALL_RADIUS <= PADDLE_MARGIN + PADDLE_W &&
    state.ballX - BALL_RADIUS >= PADDLE_MARGIN &&
    state.ballY >= state.paddle1Y - PADDLE_H / 2 &&
    state.ballY <= state.paddle1Y + PADDLE_H / 2
  ) {
    state.ballX = PADDLE_MARGIN + PADDLE_W + BALL_RADIUS;
    state.velX = Math.abs(state.velX) * 1.05; // slight speed increase
    // Angle based on where ball hits paddle
    const relativeY = (state.ballY - state.paddle1Y) / (PADDLE_H / 2);
    state.velY = relativeY * BALL_SPEED * 1.2;
  }

  // Right paddle collision
  if (
    state.ballX + BALL_RADIUS >= FIELD_W - PADDLE_MARGIN - PADDLE_W &&
    state.ballX + BALL_RADIUS <= FIELD_W - PADDLE_MARGIN &&
    state.ballY >= state.paddle2Y - PADDLE_H / 2 &&
    state.ballY <= state.paddle2Y + PADDLE_H / 2
  ) {
    state.ballX = FIELD_W - PADDLE_MARGIN - PADDLE_W - BALL_RADIUS;
    state.velX = -Math.abs(state.velX) * 1.05;
    const relativeY = (state.ballY - state.paddle2Y) / (PADDLE_H / 2);
    state.velY = relativeY * BALL_SPEED * 1.2;
  }

  // Cap velocity
  const speed = Math.sqrt(state.velX ** 2 + state.velY ** 2);
  const maxSpeed = BALL_SPEED * 2.5;
  if (speed > maxSpeed) {
    state.velX = (state.velX / speed) * maxSpeed;
    state.velY = (state.velY / speed) * maxSpeed;
  }

  // Scoring
  if (state.ballX < 0) {
    state.score2 += 1;
    logger.log(`[score] p2 scores! ${state.score1}-${state.score2}`);
    if (state.score2 >= WINNING_SCORE) {
      finishGame(state, server);
      return;
    }
    resetBall(state, -1); // serve toward scorer
    state.pauseUntil = now + 1000;
    emitToPlayers(state, server, 'pong:scored', {
      scorer: state.player2,
      score1: state.score1,
      score2: state.score2,
    });
  } else if (state.ballX > FIELD_W) {
    state.score1 += 1;
    logger.log(`[score] p1 scores! ${state.score1}-${state.score2}`);
    if (state.score1 >= WINNING_SCORE) {
      finishGame(state, server);
      return;
    }
    resetBall(state, 1);
    state.pauseUntil = now + 1000;
    emitToPlayers(state, server, 'pong:scored', {
      scorer: state.player1,
      score1: state.score1,
      score2: state.score2,
    });
  }

  emitToPlayers(state, server, 'pong:tick', serializeState(state));
}

function finishGame(state: PongState, server: Server) {
  if (state.tickTimer) clearInterval(state.tickTimer);
  state.status = 'ended';
  state.winner = state.score1 >= WINNING_SCORE ? state.player1 : state.player2;

  const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
  logger.log(`[end] matchId=${state.matchId} winner=${state.winner} ${state.score1}-${state.score2} ${elapsed}s`);

  emitToPlayers(state, server, 'pong:end', {
    winner: state.winner,
    score1: state.score1,
    score2: state.score2,
    elapsedSeconds: elapsed,
  });

  games.delete(state.matchId);
}

export function startPongGame(matchId: string, player1: string, player2: string, server: Server) {
  // Guard: if a game is already active for this match, ignore duplicate starts
  const existing = games.get(matchId);
  if (existing && existing.status === 'active') {
    logger.warn(`[start] DUPLICATE start ignored for matchId=${matchId} (already active)`);
    return;
  }
  cleanupPongGame(matchId);

  const state: PongState = {
    matchId,
    player1,
    player2,
    paddle1Y: FIELD_H / 2,
    paddle2Y: FIELD_H / 2,
    ballX: FIELD_W / 2,
    ballY: FIELD_H / 2,
    velX: BALL_SPEED,
    velY: (Math.random() - 0.5) * BALL_SPEED,
    score1: 0,
    score2: 0,
    status: 'active',
    winner: null,
    p1Input: 0,
    p2Input: 0,
    startedAt: Date.now(),
    pauseUntil: Date.now() + 1500, // brief start delay
  };

  games.set(matchId, state);
  logger.log(`[start] matchId=${matchId} p1=${player1} p2=${player2}`);

  emitToPlayers(state, server, 'pong:start', {
    matchId,
    player1,
    player2,
    winningScore: WINNING_SCORE,
    ...serializeState(state),
  });

  state.tickTimer = setInterval(() => gameTick(state, server), TICK_MS);
}

export function handlePongInput(matchId: string, userId: string, direction: 'up' | 'down' | 'stop' | number, server: Server) {
  const state = games.get(matchId);
  if (!state || state.status !== 'active') return;

  // Support both legacy direction strings and absolute Y position (number)
  if (typeof direction === 'number') {
    // Absolute Y position from drag — clamp to valid range
    const y = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, direction));
    if (userId === state.player1) {
      state.paddle1Y = y;
      state.p1Input = 0; // clear directional input
    } else if (userId === state.player2) {
      state.paddle2Y = y;
      state.p2Input = 0;
    }
    return;
  }

  // Legacy directional input
  const dirMap: Record<string, number> = { up: -1, stop: 0, down: 1 };
  const clamped = dirMap[direction] ?? 0;

  if (userId === state.player1) {
    state.p1Input = clamped;
  } else if (userId === state.player2) {
    state.p2Input = clamped;
  }
}

export function cleanupPongGame(matchId: string) {
  const state = games.get(matchId);
  if (state?.tickTimer) clearInterval(state.tickTimer);
  games.delete(matchId);
}
