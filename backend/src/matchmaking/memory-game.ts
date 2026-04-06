import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

const logger = new Logger('MemoryGame');

const ROWS = ['A', 'B', 'C', 'D'];
const COLS = [1, 2, 3, 4];
const GRID_SIZE = ROWS.length * COLS.length; // 16
const PAIR_COUNT = GRID_SIZE / 2; // 8
const FLIP_BACK_DELAY_MS = 1500;

// Card symbols — 8 pairs
const SYMBOLS = ['🐶', '🐱', '🦊', '🐼', '🐸', '🦋', '🌺', '🌟'];

export interface MemoryCard {
  coord: string;   // e.g. "A1"
  index: number;    // 0-15
  symbol: string;   // emoji
  revealed: boolean;
  matched: boolean;
}

export interface MemoryGameState {
  matchId: string;
  player1: string;
  player2: string;
  board: MemoryCard[];
  activePlayer: string;
  firstFlip: number | null;   // index of first flipped card this turn
  secondFlip: number | null;  // index of second flipped card this turn
  matchesFound: number;
  turns: number;
  status: 'active' | 'completed';
  flipBackTimer?: NodeJS.Timeout;
  startedAt: number;
}

const games = new Map<string, MemoryGameState>();

/** Seeded PRNG — deterministic shuffle using matchId as seed */
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h = (h * 1664525 + 1013904223) | 0;
    return ((h >>> 0) / 4294967296);
  };
}

function generateBoard(matchId: string): MemoryCard[] {
  const rng = seededRandom(matchId);

  // Create pairs
  const symbols = SYMBOLS.slice(0, PAIR_COUNT);
  const allSymbols = [...symbols, ...symbols]; // 16 items

  // Fisher-Yates shuffle with seeded RNG
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

function emitToPlayers(state: MemoryGameState, server: Server, event: string, data: any) {
  server.to(`user:${state.player1}`).to(`user:${state.player2}`).emit(event, data);
}

function serializeBoard(board: MemoryCard[], includeHidden: boolean = false) {
  return board.map((c) => ({
    coord: c.coord,
    index: c.index,
    revealed: c.revealed,
    matched: c.matched,
    symbol: (c.revealed || c.matched || includeHidden) ? c.symbol : null,
  }));
}

function emitGameState(state: MemoryGameState, server: Server) {
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

export function startMemoryGame(matchId: string, player1: string, player2: string, server: Server) {
  // Clean up any existing game for this match
  cleanupMemoryGame(matchId);

  const board = generateBoard(matchId + '-' + Date.now());

  const state: MemoryGameState = {
    matchId,
    player1,
    player2,
    board,
    activePlayer: player1, // player who requested the game goes first
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

export function handleMemoryFlip(matchId: string, userId: string, cardIndex: number, server: Server) {
  const state = games.get(matchId);
  if (!state || state.status !== 'active') return;

  // Only active player can flip
  if (state.activePlayer !== userId) {
    logger.log(`[flip] rejected — not ${userId}'s turn (active: ${state.activePlayer})`);
    return;
  }

  // Validate index
  if (cardIndex < 0 || cardIndex >= GRID_SIZE) return;

  const card = state.board[cardIndex];

  // Can't flip already matched or currently revealed cards
  if (card.matched || card.revealed) return;

  // If we're waiting for flip-back, ignore
  if (state.flipBackTimer) return;

  if (state.firstFlip === null) {
    // First card of the turn
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
  } else if (state.secondFlip === null && cardIndex !== state.firstFlip) {
    // Second card of the turn
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
      // Match found!
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

      // Reset selection — same player continues
      state.firstFlip = null;
      state.secondFlip = null;

      // Check if game is complete
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
      } else {
        // Send updated state
        emitGameState(state, server);
      }
    } else {
      // Mismatch — flip back after delay, switch turns
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

        // Switch turn
        state.activePlayer = state.activePlayer === state.player1
          ? state.player2
          : state.player1;

        logger.log(`[turn] now ${state.activePlayer}'s turn`);

        emitGameState(state, server);
      }, FLIP_BACK_DELAY_MS);
    }
  }
}

export function cleanupMemoryGame(matchId: string) {
  const state = games.get(matchId);
  if (state?.flipBackTimer) clearTimeout(state.flipBackTimer);
  games.delete(matchId);
}

export function getMemoryGame(matchId: string): MemoryGameState | undefined {
  return games.get(matchId);
}
