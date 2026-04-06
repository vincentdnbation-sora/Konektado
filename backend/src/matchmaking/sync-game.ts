import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

const TOTAL_ROUNDS = 5;
const JUMP_WINDOW_MS = 2500;
const RESULT_PAUSE_MS = 2000;
const INITIAL_DELAY_MS = 4000;
const INITIAL_LIVES = 3;

export interface SyncGameState {
  matchId: string;
  user1Id: string;
  user2Id: string;
  round: number;
  lives: number;
  score: number;
  phase: 'starting' | 'jumping' | 'result' | 'complete';
  roundJumps: Set<string>;
  timer?: NodeJS.Timeout;
}

const games = new Map<string, SyncGameState>();
const logger = new Logger('SyncGame');

export function startSyncGame(
  matchId: string,
  user1Id: string,
  user2Id: string,
  server: Server,
) {
  const state: SyncGameState = {
    matchId,
    user1Id,
    user2Id,
    round: 0,
    lives: INITIAL_LIVES,
    score: 0,
    phase: 'starting',
    roundJumps: new Set(),
  };

  games.set(matchId, state);

  // Brief delay so the call connects before game starts
  state.timer = setTimeout(() => {
    server.to(`user:${user1Id}`).to(`user:${user2Id}`).emit('jump_game_start', {
      totalRounds: TOTAL_ROUNDS,
      lives: INITIAL_LIVES,
      windowMs: JUMP_WINDOW_MS,
    });
    setTimeout(() => startRound(matchId, server), 1000);
  }, INITIAL_DELAY_MS);
}

function startRound(matchId: string, server: Server) {
  const state = games.get(matchId);
  if (!state || state.phase === 'complete') return;

  state.round += 1;
  state.roundJumps = new Set();
  state.phase = 'jumping';

  server.to(`user:${state.user1Id}`).to(`user:${state.user2Id}`).emit('jump_game_round', {
    round: state.round,
    totalRounds: TOTAL_ROUNDS,
    windowMs: JUMP_WINDOW_MS,
  });

  state.timer = setTimeout(() => evaluateRound(matchId, server), JUMP_WINDOW_MS);
}

function evaluateRound(matchId: string, server: Server) {
  const state = games.get(matchId);
  if (!state || state.phase !== 'jumping') return;

  state.phase = 'result';

  const user1Jumped = state.roundJumps.has(state.user1Id);
  const user2Jumped = state.roundJumps.has(state.user2Id);
  const success = user1Jumped && user2Jumped;

  if (success) {
    state.score += 1;
  } else {
    state.lives -= 1;
  }

  server.to(`user:${state.user1Id}`).to(`user:${state.user2Id}`).emit('jump_game_result', {
    success,
    user1Jumped,
    user2Jumped,
    lives: state.lives,
    score: state.score,
    round: state.round,
  });

  logger.log(`Match ${matchId} round ${state.round}: ${success ? 'SUCCESS' : 'FAIL'} (lives=${state.lives})`);

  const gameOver = state.lives <= 0 || state.round >= TOTAL_ROUNDS;

  state.timer = setTimeout(() => {
    if (gameOver) {
      const won = state.score >= TOTAL_ROUNDS - 1; // win if 4+ successes
      state.phase = 'complete';
      server.to(`user:${state.user1Id}`).to(`user:${state.user2Id}`).emit('jump_game_over', {
        won,
        score: state.score,
        totalRounds: TOTAL_ROUNDS,
      });
      games.delete(matchId);
    } else {
      startRound(matchId, server);
    }
  }, RESULT_PAUSE_MS);
}

export function handleJump(matchId: string, userId: string, server: Server) {
  const state = games.get(matchId);
  if (!state || state.phase !== 'jumping') return;

  state.roundJumps.add(userId);

  // Notify both players that this player jumped
  server.to(`user:${state.user1Id}`).to(`user:${state.user2Id}`).emit('jump_game_player_jumped', {
    userId,
  });

  // If both jumped, evaluate immediately
  if (state.roundJumps.has(state.user1Id) && state.roundJumps.has(state.user2Id)) {
    if (state.timer) clearTimeout(state.timer);
    evaluateRound(matchId, server);
  }
}

export function cleanupGame(matchId: string) {
  const state = games.get(matchId);
  if (state?.timer) clearTimeout(state.timer);
  games.delete(matchId);
}
