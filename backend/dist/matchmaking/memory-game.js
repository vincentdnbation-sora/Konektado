"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMemoryGame = startMemoryGame;
exports.handleMemoryFlip = handleMemoryFlip;
exports.cleanupMemoryGame = cleanupMemoryGame;
exports.getMemoryGame = getMemoryGame;
const common_1 = require("@nestjs/common");
const logger = new common_1.Logger('MemoryGame');
const ROWS = ['A', 'B', 'C', 'D'];
const COLS = [1, 2, 3, 4];
const GRID_SIZE = ROWS.length * COLS.length;
const PAIR_COUNT = GRID_SIZE / 2;
const FLIP_BACK_DELAY_MS = 1500;
const SYMBOLS = ['🐶', '🐱', '🦊', '🐼', '🐸', '🦋', '🌺', '🌟'];
const games = new Map();
function seededRandom(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
    }
    return () => {
        h = (h * 1664525 + 1013904223) | 0;
        return ((h >>> 0) / 4294967296);
    };
}
function generateBoard(matchId) {
    const rng = seededRandom(matchId);
    const symbols = SYMBOLS.slice(0, PAIR_COUNT);
    const allSymbols = [...symbols, ...symbols];
    for (let i = allSymbols.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [allSymbols[i], allSymbols[j]] = [allSymbols[j], allSymbols[i]];
    }
    return allSymbols.map((symbol, index) => ({
        coord: ROWS[Math.floor(index / COLS.length)] + COLS[index % COLS.length],
        index,
        symbol,
        revealed: false,
        matched: false,
    }));
}
function emitToPlayers(state, server, event, data) {
    server.to(`user:${state.player1}`).to(`user:${state.player2}`).emit(event, data);
}
function serializeBoard(board, includeHidden = false) {
    return board.map((c) => ({
        coord: c.coord,
        index: c.index,
        revealed: c.revealed,
        matched: c.matched,
        symbol: (c.revealed || c.matched || includeHidden) ? c.symbol : null,
    }));
}
function emitGameState(state, server) {
    emitToPlayers(state, server, 'memory:state', {
        board: serializeBoard(state.board),
        activePlayer: state.activePlayer,
        matchesFound: state.matchesFound,
        totalPairs: PAIR_COUNT,
        turns: state.turns,
        status: state.status,
        firstFlip: state.firstFlip,
        secondFlip: state.secondFlip,
    });
}
function startMemoryGame(matchId, player1, player2, server) {
    cleanupMemoryGame(matchId);
    const board = generateBoard(matchId + '-' + Date.now());
    const state = {
        matchId,
        player1,
        player2,
        board,
        activePlayer: player1,
        firstFlip: null,
        secondFlip: null,
        matchesFound: 0,
        turns: 0,
        status: 'active',
        startedAt: Date.now(),
    };
    games.set(matchId, state);
    logger.log(`[start] matchId=${matchId} ${player1} vs ${player2} — board generated`);
    emitToPlayers(state, server, 'memory:start', {
        matchId,
        player1,
        player2,
        activePlayer: state.activePlayer,
        totalPairs: PAIR_COUNT,
        board: serializeBoard(state.board),
    });
}
function handleMemoryFlip(matchId, userId, cardIndex, server) {
    const state = games.get(matchId);
    if (!state || state.status !== 'active')
        return;
    if (state.activePlayer !== userId) {
        logger.log(`[flip] rejected — not ${userId}'s turn (active: ${state.activePlayer})`);
        return;
    }
    if (cardIndex < 0 || cardIndex >= GRID_SIZE)
        return;
    const card = state.board[cardIndex];
    if (card.matched || card.revealed)
        return;
    if (state.flipBackTimer)
        return;
    if (state.firstFlip === null) {
        state.firstFlip = cardIndex;
        card.revealed = true;
        logger.log(`[flip] ${userId} flipped first card: ${card.coord} (${card.symbol})`);
        emitToPlayers(state, server, 'memory:flip', {
            cardIndex,
            coord: card.coord,
            symbol: card.symbol,
            flipNumber: 1,
            player: userId,
        });
    }
    else if (state.secondFlip === null && cardIndex !== state.firstFlip) {
        state.secondFlip = cardIndex;
        card.revealed = true;
        state.turns += 1;
        const firstCard = state.board[state.firstFlip];
        logger.log(`[flip] ${userId} flipped second card: ${card.coord} (${card.symbol})`);
        emitToPlayers(state, server, 'memory:flip', {
            cardIndex,
            coord: card.coord,
            symbol: card.symbol,
            flipNumber: 2,
            player: userId,
        });
        if (firstCard.symbol === card.symbol) {
            firstCard.matched = true;
            card.matched = true;
            state.matchesFound += 1;
            logger.log(`[match] ${firstCard.coord} + ${card.coord} = ${card.symbol} (${state.matchesFound}/${PAIR_COUNT})`);
            emitToPlayers(state, server, 'memory:match', {
                card1: state.firstFlip,
                card2: cardIndex,
                coord1: firstCard.coord,
                coord2: card.coord,
                symbol: card.symbol,
                matchesFound: state.matchesFound,
                totalPairs: PAIR_COUNT,
            });
            state.firstFlip = null;
            state.secondFlip = null;
            if (state.matchesFound >= PAIR_COUNT) {
                state.status = 'completed';
                const elapsed = Math.round((Date.now() - state.startedAt) / 1000);
                logger.log(`[complete] matchId=${matchId} turns=${state.turns} time=${elapsed}s`);
                emitToPlayers(state, server, 'memory:end', {
                    matchesFound: state.matchesFound,
                    totalPairs: PAIR_COUNT,
                    turns: state.turns,
                    elapsedSeconds: elapsed,
                });
                games.delete(matchId);
            }
            else {
                emitGameState(state, server);
            }
        }
        else {
            logger.log(`[mismatch] ${firstCard.coord} (${firstCard.symbol}) != ${card.coord} (${card.symbol})`);
            emitToPlayers(state, server, 'memory:mismatch', {
                card1: state.firstFlip,
                card2: cardIndex,
                coord1: firstCard.coord,
                coord2: card.coord,
            });
            state.flipBackTimer = setTimeout(() => {
                state.flipBackTimer = undefined;
                firstCard.revealed = false;
                card.revealed = false;
                state.firstFlip = null;
                state.secondFlip = null;
                state.activePlayer = state.activePlayer === state.player1
                    ? state.player2
                    : state.player1;
                logger.log(`[turn] now ${state.activePlayer}'s turn`);
                emitGameState(state, server);
            }, FLIP_BACK_DELAY_MS);
        }
    }
}
function cleanupMemoryGame(matchId) {
    const state = games.get(matchId);
    if (state?.flipBackTimer)
        clearTimeout(state.flipBackTimer);
    games.delete(matchId);
}
function getMemoryGame(matchId) {
    return games.get(matchId);
}
//# sourceMappingURL=memory-game.js.map