"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRopeGame = startRopeGame;
exports.handleRopePull = handleRopePull;
exports.cleanupRopeGame = cleanupRopeGame;
const common_1 = require("@nestjs/common");
const logger = new common_1.Logger('RopeGame');
const ROPE_LENGTH = 100;
const WIN_THRESHOLD = 100;
const TAP_FORCE = 2.5;
const DECAY_RATE = 0.3;
const TICK_MS = 50;
const GAME_DURATION_MS = 15000;
const games = new Map();
function emitToPlayers(state, server, event, data) {
    server.to(`user:${state.player1}`).to(`user:${state.player2}`).emit(event, data);
}
function endGame(state, server, reason) {
    if (state.tickTimer)
        clearInterval(state.tickTimer);
    state.status = 'ended';
    if (reason === 'threshold') {
        state.winner = state.ropePosition <= -WIN_THRESHOLD ? state.player1 : state.player2;
    }
    else {
        if (state.ropePosition < 0)
            state.winner = state.player1;
        else if (state.ropePosition > 0)
            state.winner = state.player2;
        else
            state.winner = null;
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
function gameTick(state, server) {
    if (state.status !== 'active')
        return;
    if (Math.abs(state.ropePosition) > 0.5) {
        if (state.ropePosition > 0) {
            state.ropePosition = Math.max(0, state.ropePosition - DECAY_RATE);
        }
        else {
            state.ropePosition = Math.min(0, state.ropePosition + DECAY_RATE);
        }
    }
    if (Date.now() >= state.endsAt) {
        endGame(state, server, 'timeout');
        return;
    }
    if (Math.abs(state.ropePosition) >= WIN_THRESHOLD) {
        endGame(state, server, 'threshold');
        return;
    }
    emitToPlayers(state, server, 'rope:tick', {
        ropePosition: state.ropePosition,
        timeLeft: Math.max(0, state.endsAt - Date.now()),
        player1Taps: state.player1Taps,
        player2Taps: state.player2Taps,
    });
}
function startRopeGame(matchId, player1, player2, server) {
    cleanupRopeGame(matchId);
    const now = Date.now();
    const state = {
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
    state.tickTimer = setInterval(() => gameTick(state, server), TICK_MS);
}
function handleRopePull(matchId, userId, server) {
    const state = games.get(matchId);
    if (!state || state.status !== 'active')
        return;
    if (userId === state.player1) {
        state.player1Taps += 1;
        state.ropePosition -= TAP_FORCE;
    }
    else if (userId === state.player2) {
        state.player2Taps += 1;
        state.ropePosition += TAP_FORCE;
    }
    else {
        return;
    }
    state.ropePosition = Math.max(-WIN_THRESHOLD, Math.min(WIN_THRESHOLD, state.ropePosition));
}
function cleanupRopeGame(matchId) {
    const state = games.get(matchId);
    if (state?.tickTimer)
        clearInterval(state.tickTimer);
    games.delete(matchId);
}
//# sourceMappingURL=rope-game.js.map