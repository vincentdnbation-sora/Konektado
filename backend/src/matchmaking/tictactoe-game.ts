import { Logger } from '@nestjs/common';
import { Server } from 'socket.io';

const logger = new Logger('TicTacToe');

export interface TicTacToeState {
  matchId: string;
  playerX: string;  // goes first
  playerO: string;
  board: (string | null)[];  // 9 cells, 'X'|'O'|null
  currentTurn: string;       // userId
  status: 'active' | 'won' | 'draw';
  winner: string | null;
  winLine: number[] | null;  // indices of winning cells
  moveCount: number;
  startedAt: number;
}

const games = new Map<string, TicTacToeState>();

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],  // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],  // cols
  [0, 4, 8], [2, 4, 6],              // diagonals
];

function emitToPlayers(state: TicTacToeState, server: Server, event: string, data: any) {
  server.to(`user:${state.playerX}`).to(`user:${state.playerO}`).emit(event, data);
}

function checkWinner(board: (string | null)[]): { winner: string; line: number[] } | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a]!, line };
    }
  }
  return null;
}

function serializeState(state: TicTacToeState) {
  return {
    board: state.board,
    currentTurn: state.currentTurn,
    playerX: state.playerX,
    playerO: state.playerO,
    status: state.status,
    winner: state.winner,
    winLine: state.winLine,
    moveCount: state.moveCount,
  };
}

export function startTicTacToe(matchId: string, player1: string, player2: string, server: Server) {
  cleanupTicTacToe(matchId);

  const state: TicTacToeState = {
    matchId,
    playerX: player1,
    playerO: player2,
    board: Array(9).fill(null),
    currentTurn: player1,
    status: 'active',
    winner: null,
    winLine: null,
    moveCount: 0,
    startedAt: Date.now(),
  };

  games.set(matchId, state);
  logger.log(`[start] matchId=${matchId} X=${player1} O=${player2}`);

  emitToPlayers(state, server, 'ttt:start', {
    matchId,
    ...serializeState(state),
  });
}

export function handleTicTacToeMove(matchId: string, userId: string, cellIndex: number, server: Server) {
  const state = games.get(matchId);
  if (!state || state.status !== 'active') return;

  if (state.currentTurn !== userId) {
    logger.log(`[move] rejected — not ${userId}'s turn`);
    return;
  }

  if (cellIndex < 0 || cellIndex > 8) return;
  if (state.board[cellIndex] !== null) {
    logger.log(`[move] rejected — cell ${cellIndex} already occupied`);
    return;
  }

  const symbol = userId === state.playerX ? 'X' : 'O';
  state.board[cellIndex] = symbol;
  state.moveCount += 1;

  logger.log(`[move] ${userId} plays ${symbol} at cell ${cellIndex} (move ${state.moveCount})`);

  emitToPlayers(state, server, 'ttt:move', {
    cellIndex,
    symbol,
    player: userId,
    moveCount: state.moveCount,
  });

  // Check win
  const result = checkWinner(state.board);
  if (result) {
    state.status = 'won';
    state.winner = userId;
    state.winLine = result.line;

    logger.log(`[win] ${userId} (${symbol}) wins! Line: ${result.line}`);

    emitToPlayers(state, server, 'ttt:end', {
      status: 'won',
      winner: userId,
      winnerSymbol: symbol,
      winLine: result.line,
      moveCount: state.moveCount,
      elapsedSeconds: Math.round((Date.now() - state.startedAt) / 1000),
    });
    games.delete(matchId);
    return;
  }

  // Check draw
  if (state.moveCount >= 9) {
    state.status = 'draw';
    logger.log(`[draw] matchId=${matchId} after ${state.moveCount} moves`);

    emitToPlayers(state, server, 'ttt:end', {
      status: 'draw',
      winner: null,
      winnerSymbol: null,
      winLine: null,
      moveCount: state.moveCount,
      elapsedSeconds: Math.round((Date.now() - state.startedAt) / 1000),
    });
    games.delete(matchId);
    return;
  }

  // Switch turn
  state.currentTurn = state.currentTurn === state.playerX ? state.playerO : state.playerX;

  emitToPlayers(state, server, 'ttt:state', serializeState(state));
}

export function cleanupTicTacToe(matchId: string) {
  games.delete(matchId);
}
