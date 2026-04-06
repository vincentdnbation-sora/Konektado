import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

const logger = new Logger('RopeGame');

const ROPE_LENGTH = 100;       // total meter range (-100 to 100, center = 0)
const WIN_THRESHOLD = 100;     // pull to your side to win
const TAP_FORCE = 2.5;         // base force per tap
const DECAY_RATE = 0.3;        // decay per tick toward center
const TICK_MS = 50;            // game loop interval
const GAME_DURATION_MS = 15000; // 15 second rounds

export interface RopeGameState {
  matchId: string;
  player1: string;   // pulls left (negative)
  player2: string;   // pulls right (positive)
  ropePosition: number;  // -100 to 100; negative = p1 winning, positive = p2 winning
  player1Taps: number;
  player2Taps: number;
  status: 'active' | 'ended';
  winner: string | null;
  tickTimer?: NodeJS.Timeout;
  startedAt: number;
  endsAt: number;
}

const games = new Map<string, RopeGameState>();

function emitToPlayers(state: RopeGameState, server: Server, event: string, data: any) {
  server.to(`user:${state.player1}`).to(`user:${state.player2}`).emit(event, data);
}

function endGame(state: RopeGameState, server: Server, reason: 'threshold' | 'timeout') {
  if (state.tickTimer) clearInterval(state.tickTimer);
  state.status = 'ended';

  if (reason === 'threshold') {
    state.winner = state.ropePosition <= -WIN_THRESHOLD ? state.player1 : state.player2;
  } else {
    // Timeout — whoever pulled more wins
    if (state.ropePosition < 0) state.winner = state.player1;
    else if (state.ropePosition > 0) state.winner = state.player2;
    else state.winner = null; // tie
  }

  const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
  logger.log(`[end] matchId=${state.matchId} winner=${state.winner} pos=${state.ropePosition.toFixed(1)} reason=${reason} ${elapsed}s`);

  emitToPlayers(state, server, 'rope:end', {
    winner: state.winner,
    ropePosition: state.ropePosition,
    player1Taps: state.player1Taps,
    player2Taps: state.player2Taps,
    reason,
    elapsedSeconds: elapsed,
  });

  games.delete(state.matchId);
}

function gameTick(state: RopeGameState, server: Server) {
  if (state.status !== 'active') return;

  // Natural decay toward center
  if (Math.abs(state.ropePosition) > 0.5) {
    if (state.ropePosition > 0) {
      state.ropePosition = Math.max(0, state.ropePosition - DECAY_RATE);
    } else {
      state.ropePosition = Math.min(0, state.ropePosition + DECAY_RATE);
    }
  }

  // Check timeout
  if (Date.now() >= state.endsAt) {
    endGame(state, server, 'timeout');
    return;
  }

  // Check threshold win
  if (Math.abs(state.ropePosition) >= WIN_THRESHOLD) {
    endGame(state, server, 'threshold');
    return;
  }

  // Emit position update
  emitToPlayers(state, server, 'rope:tick', {
    ropePosition: state.ropePosition,
    timeLeft: Math.max(0, state.endsAt - Date.now()),
    player1Taps: state.player1Taps,
    player2Taps: state.player2Taps,
  });
}

export function startRopeGame(matchId: string, player1: string, player2: string, server: Server) {
  cleanupRopeGame(matchId);

  const now = Date.now();
  const state: RopeGameState = {
    matchId,
    player1,
    player2,
    ropePosition: 0,
    player1Taps: 0,
    player2Taps: 0,
    status: 'active',
    winner: null,
    startedAt: now,
    endsAt: now + GAME_DURATION_MS,
  };

  games.set(matchId, state);

  logger.log(`[start] matchId=${matchId} p1=${player1} p2=${player2}`);

  emitToPlayers(state, server, 'rope:start', {
    matchId,
    player1,
    player2,
    duration: GAME_DURATION_MS,
    threshold: WIN_THRESHOLD,
  });

  // Start game loop
  state.tickTimer = setInterval(() => gameTick(state, server), TICK_MS);
}

export function handleRopePull(matchId: string, userId: string, server: Server) {
  const state = games.get(matchId);
  if (!state || state.status !== 'active') return;

  if (userId === state.player1) {
    state.player1Taps += 1;
    state.ropePosition -= TAP_FORCE; // pull left
  } else if (userId === state.player2) {
    state.player2Taps += 1;
    state.ropePosition += TAP_FORCE; // pull right
  } else {
    return;
  }

  // Clamp
  state.ropePosition = Math.max(-WIN_THRESHOLD, Math.min(WIN_THRESHOLD, state.ropePosition));
}

export function cleanupRopeGame(matchId: string) {
  const state = games.get(matchId);
  if (state?.tickTimer) clearInterval(state.tickTimer);
  games.delete(matchId);
}
