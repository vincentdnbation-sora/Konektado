"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPongGame = startPongGame;
exports.handlePongInput = handlePongInput;
exports.cleanupPongGame = cleanupPongGame;
const common_1 = require("@nestjs/common");
const logger = new common_1.Logger('PongGame');
const FIELD_W = 400;
const FIELD_H = 300;
const PADDLE_H = 60;
const PADDLE_W = 10;
const PADDLE_MARGIN = 15;
const BALL_RADIUS = 6;
const BALL_SPEED = 3.5;
const PADDLE_SPEED = 5;
const WINNING_SCORE = 5;
const TICK_MS = 33;
const games = new Map();
function emitToPlayers(state, server, event, data) {
    server.to(`user:${state.player1}`).to(`user:${state.player2}`).emit(event, data);
}
function resetBall(state, direction) {
    state.ballX = FIELD_W / 2;
    state.ballY = FIELD_H / 2;
    const angle = (Math.random() * 0.8 - 0.4);
    state.velX = BALL_SPEED * direction;
    state.velY = BALL_SPEED * Math.sin(angle);
}
function serializeState(state) {
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
function gameTick(state, server) {
    if (state.status !== 'active')
        return;
    const now = Date.now();
    if (now < state.pauseUntil) {
        emitToPlayers(state, server, 'pong:tick', serializeState(state));
        return;
    }
    if (state.p1Input !== 0) {
        state.paddle1Y += state.p1Input * PADDLE_SPEED;
        state.paddle1Y = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, state.paddle1Y));
    }
    if (state.p2Input !== 0) {
        state.paddle2Y += state.p2Input * PADDLE_SPEED;
        state.paddle2Y = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, state.paddle2Y));
    }
    state.ballX += state.velX;
    state.ballY += state.velY;
    if (state.ballY - BALL_RADIUS <= 0) {
        state.ballY = BALL_RADIUS;
        state.velY = Math.abs(state.velY);
    }
    if (state.ballY + BALL_RADIUS >= FIELD_H) {
        state.ballY = FIELD_H - BALL_RADIUS;
        state.velY = -Math.abs(state.velY);
    }
    if (state.ballX - BALL_RADIUS <= PADDLE_MARGIN + PADDLE_W &&
        state.ballX - BALL_RADIUS >= PADDLE_MARGIN &&
        state.ballY >= state.paddle1Y - PADDLE_H / 2 &&
        state.ballY <= state.paddle1Y + PADDLE_H / 2) {
        state.ballX = PADDLE_MARGIN + PADDLE_W + BALL_RADIUS;
        state.velX = Math.abs(state.velX) * 1.05;
        const relativeY = (state.ballY - state.paddle1Y) / (PADDLE_H / 2);
        state.velY = relativeY * BALL_SPEED * 1.2;
    }
    if (state.ballX + BALL_RADIUS >= FIELD_W - PADDLE_MARGIN - PADDLE_W &&
        state.ballX + BALL_RADIUS <= FIELD_W - PADDLE_MARGIN &&
        state.ballY >= state.paddle2Y - PADDLE_H / 2 &&
        state.ballY <= state.paddle2Y + PADDLE_H / 2) {
        state.ballX = FIELD_W - PADDLE_MARGIN - PADDLE_W - BALL_RADIUS;
        state.velX = -Math.abs(state.velX) * 1.05;
        const relativeY = (state.ballY - state.paddle2Y) / (PADDLE_H / 2);
        state.velY = relativeY * BALL_SPEED * 1.2;
    }
    const speed = Math.sqrt(state.velX ** 2 + state.velY ** 2);
    const maxSpeed = BALL_SPEED * 2.5;
    if (speed > maxSpeed) {
        state.velX = (state.velX / speed) * maxSpeed;
        state.velY = (state.velY / speed) * maxSpeed;
    }
    if (state.ballX < 0) {
        state.score2 += 1;
        logger.log(`[score] p2 scores! ${state.score1}-${state.score2}`);
        if (state.score2 >= WINNING_SCORE) {
            finishGame(state, server);
            return;
        }
        resetBall(state, -1);
        state.pauseUntil = now + 1000;
        emitToPlayers(state, server, 'pong:scored', {
            scorer: state.player2,
            score1: state.score1,
            score2: state.score2,
        });
    }
    else if (state.ballX > FIELD_W) {
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
function finishGame(state, server) {
    if (state.tickTimer)
        clearInterval(state.tickTimer);
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
function startPongGame(matchId, player1, player2, server) {
    const existing = games.get(matchId);
    if (existing && existing.status === 'active') {
        logger.warn(`[start] DUPLICATE start ignored for matchId=${matchId} (already active)`);
        return;
    }
    cleanupPongGame(matchId);
    const state = {
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
        pauseUntil: Date.now() + 1500,
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
function handlePongInput(matchId, userId, direction, server) {
    const state = games.get(matchId);
    if (!state || state.status !== 'active')
        return;
    if (typeof direction === 'number') {
        const y = Math.max(PADDLE_H / 2, Math.min(FIELD_H - PADDLE_H / 2, direction));
        if (userId === state.player1) {
            state.paddle1Y = y;
            state.p1Input = 0;
        }
        else if (userId === state.player2) {
            state.paddle2Y = y;
            state.p2Input = 0;
        }
        return;
    }
    const dirMap = { up: -1, stop: 0, down: 1 };
    const clamped = dirMap[direction] ?? 0;
    if (userId === state.player1) {
        state.p1Input = clamped;
    }
    else if (userId === state.player2) {
        state.p2Input = clamped;
    }
}
function cleanupPongGame(matchId) {
    const state = games.get(matchId);
    if (state?.tickTimer)
        clearInterval(state.tickTimer);
    games.delete(matchId);
}
//# sourceMappingURL=pong-game.js.map