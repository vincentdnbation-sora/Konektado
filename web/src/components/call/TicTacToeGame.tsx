'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { connectSocket } from '@/lib/socket';

interface Props {
  matchId: string;
  userId: string;
  partnerId: string;
  autoStart?: boolean;
}

type Phase = 'idle' | 'playing' | 'ended';

interface GameState {
  board: (string | null)[];
  currentTurn: string;
  playerX: string;
  playerO: string;
  status: 'active' | 'won' | 'draw';
  winner: string | null;
  winLine: number[] | null;
  moveCount: number;
}

export default function TicTacToeGame({ matchId, userId, partnerId, autoStart }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [game, setGame] = useState<GameState | null>(null);
  const [endResult, setEndResult] = useState<{
    status: 'won' | 'draw';
    winner: string | null;
    winnerSymbol: string | null;
  } | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    const socket = connectSocket();

    const onStart = (data: any) => {
      console.log('[TicTacToe] start', data);
      setPhase('playing');
      setEndResult(null);
      setGame({
        board: data.board,
        currentTurn: data.currentTurn,
        playerX: data.playerX,
        playerO: data.playerO,
        status: 'active',
        winner: null,
        winLine: null,
        moveCount: 0,
      });
    };

    const onMove = (data: any) => {
      setGame((prev) => {
        if (!prev) return null;
        const board = [...prev.board];
        board[data.cellIndex] = data.symbol;
        return { ...prev, board, moveCount: data.moveCount };
      });
    };

    const onState = (data: any) => {
      setGame((prev) => prev ? { ...prev, ...data } : null);
    };

    const onEnd = (data: any) => {
      console.log('[TicTacToe] end', data);
      setGame((prev) => prev ? {
        ...prev,
        status: data.status,
        winner: data.winner,
        winLine: data.winLine,
      } : null);
      setEndResult({
        status: data.status,
        winner: data.winner,
        winnerSymbol: data.winnerSymbol,
      });
      setPhase('ended');
    };

    socket.on('ttt:start', onStart);
    socket.on('ttt:move', onMove);
    socket.on('ttt:state', onState);
    socket.on('ttt:end', onEnd);

    return () => {
      socket.off('ttt:start', onStart);
      socket.off('ttt:move', onMove);
      socket.off('ttt:state', onState);
      socket.off('ttt:end', onEnd);
    };
  }, []);

  const handleStartGame = useCallback(() => {
    console.log('[TicTacToe] requesting start');
    connectSocket().emit('ttt:start', { matchId, partnerId });
  }, [matchId, partnerId]);

  useEffect(() => {
    if (autoStart && !autoStarted.current && phase === 'idle') {
      autoStarted.current = true;
      handleStartGame();
    }
  }, [autoStart, phase, handleStartGame]);

  const handleCellClick = useCallback(
    (cellIndex: number) => {
      if (!game || game.status !== 'active') return;
      if (game.currentTurn !== userId) return;
      if (game.board[cellIndex] !== null) return;
      connectSocket().emit('ttt:move', { matchId, cellIndex });
    },
    [game, matchId, userId],
  );

  const mySymbol = game?.playerX === userId ? 'X' : 'O';
  const isMyTurn = game?.currentTurn === userId;

  if (phase === 'idle') {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-3">
        <div className="text-3xl">❌⭕</div>
        <p className="font-semibold text-sm">Tic Tac Toe</p>
        <p className="text-xs text-muted-foreground">Classic 3×3 — take turns, get three in a row!</p>
        <button
          onClick={handleStartGame}
          className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-pink-500 to-violet-600 text-white shadow-lg shadow-pink-500/20 active:scale-95 transition-transform"
        >
          Start Game
        </button>
      </div>
    );
  }

  if (phase === 'ended' && endResult) {
    const iWon = endResult.winner === userId;
    const isDraw = endResult.status === 'draw';
    return (
      <div className={`rounded-2xl border p-5 text-center space-y-3 ${
        isDraw ? 'border-yellow-500/30 bg-yellow-500/5' : iWon ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'
      }`}>
        <div className="text-4xl">{isDraw ? '🤝' : iWon ? '🏆' : '😔'}</div>
        <p className="font-bold text-lg">
          {isDraw ? 'It\'s a draw!' : iWon ? 'You win!' : 'You lose!'}
        </p>
        <button
          onClick={() => { setPhase('idle'); setGame(null); setEndResult(null); autoStarted.current = false; }}
          className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-pink-500 to-violet-600 text-white shadow-lg shadow-pink-500/20 active:scale-95 transition-transform"
        >
          Play Again
        </button>
      </div>
    );
  }

  if (!game) return null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs font-medium">
          You: <span className="font-bold text-violet-400">{mySymbol}</span>
        </span>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
          isMyTurn
            ? 'bg-green-500/15 text-green-400 border border-green-500/30'
            : 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
        }`}>
          {isMyTurn ? 'Your turn' : "Partner's turn"}
        </span>
        <span className="text-xs text-muted-foreground">Move {game.moveCount}</span>
      </div>

      {/* Board */}
      <div className="p-4 flex justify-center">
        <div className="grid grid-cols-3 gap-2 w-full max-w-[240px]">
          {game.board.map((cell, i) => {
            const isWinCell = game.winLine?.includes(i);
            const canClick = isMyTurn && cell === null && game.status === 'active';

            return (
              <button
                key={i}
                onClick={() => handleCellClick(i)}
                disabled={!canClick}
                className={`
                  aspect-square rounded-xl flex items-center justify-center text-3xl font-black transition-all active:scale-95
                  ${isWinCell
                    ? 'bg-green-500/20 border-2 border-green-500/50'
                    : cell
                      ? 'bg-muted/40 border-2 border-border'
                      : canClick
                        ? 'bg-muted/30 border-2 border-border hover:border-violet-500/50 hover:bg-violet-500/10 cursor-pointer'
                        : 'bg-muted/20 border-2 border-border/50 cursor-not-allowed'
                  }
                `}
              >
                {cell === 'X' && <span className="text-pink-400">✕</span>}
                {cell === 'O' && <span className="text-violet-400">○</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-2 border-t border-border text-center">
        <p className="text-[11px] text-muted-foreground">
          {isMyTurn ? 'Tap a cell to place your mark' : 'Waiting for partner...'}
        </p>
      </div>
    </div>
  );
}
