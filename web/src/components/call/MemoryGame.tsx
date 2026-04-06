'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { connectSocket } from '@/lib/socket';

interface Props {
  matchId: string;
  userId: string;
  partnerId: string;
  autoStart?: boolean;
}

interface CardState {
  coord: string;
  index: number;
  symbol: string | null;
  revealed: boolean;
  matched: boolean;
}

type Phase = 'idle' | 'playing' | 'completed';

interface GameState {
  board: CardState[];
  activePlayer: string;
  matchesFound: number;
  totalPairs: number;
  turns: number;
  status: 'active' | 'completed';
  firstFlip: number | null;
  secondFlip: number | null;
}

export default function MemoryGame({ matchId, userId, partnerId, autoStart }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [game, setGame] = useState<GameState | null>(null);
  const [lastMatch, setLastMatch] = useState<{ coord1: string; coord2: string; symbol: string } | null>(null);
  const [lastMismatch, setLastMismatch] = useState<{ coord1: string; coord2: string } | null>(null);
  const [endResult, setEndResult] = useState<{ turns: number; elapsedSeconds: number } | null>(null);
  const autoStarted = useRef(false);

  // Clear flash effects after a short delay
  useEffect(() => {
    if (lastMatch) {
      const t = setTimeout(() => setLastMatch(null), 1200);
      return () => clearTimeout(t);
    }
  }, [lastMatch]);

  useEffect(() => {
    if (lastMismatch) {
      const t = setTimeout(() => setLastMismatch(null), 1500);
      return () => clearTimeout(t);
    }
  }, [lastMismatch]);

  useEffect(() => {
    const socket = connectSocket();

    const onStart = (data: any) => {
      console.log('[MemoryGame] start', data);
      setPhase('playing');
      setEndResult(null);
      setGame({
        board: data.board,
        activePlayer: data.activePlayer,
        matchesFound: 0,
        totalPairs: data.totalPairs,
        turns: 0,
        status: 'active',
        firstFlip: null,
        secondFlip: null,
      });
    };

    const onState = (data: any) => {
      setGame((prev) => prev ? {
        ...prev,
        board: data.board,
        activePlayer: data.activePlayer,
        matchesFound: data.matchesFound,
        totalPairs: data.totalPairs,
        turns: data.turns,
        status: data.status,
        firstFlip: data.firstFlip,
        secondFlip: data.secondFlip,
      } : null);
    };

    const onFlip = (data: any) => {
      setGame((prev) => {
        if (!prev) return null;
        const board = prev.board.map((c) =>
          c.index === data.cardIndex
            ? { ...c, revealed: true, symbol: data.symbol }
            : c,
        );
        return {
          ...prev,
          board,
          firstFlip: data.flipNumber === 1 ? data.cardIndex : prev.firstFlip,
          secondFlip: data.flipNumber === 2 ? data.cardIndex : prev.secondFlip,
        };
      });
    };

    const onMatch = (data: any) => {
      setLastMatch({ coord1: data.coord1, coord2: data.coord2, symbol: data.symbol });
      setGame((prev) => {
        if (!prev) return null;
        const board = prev.board.map((c) =>
          c.index === data.card1 || c.index === data.card2
            ? { ...c, matched: true, revealed: true, symbol: data.symbol }
            : c,
        );
        return {
          ...prev,
          board,
          matchesFound: data.matchesFound,
          firstFlip: null,
          secondFlip: null,
        };
      });
    };

    const onMismatch = (data: any) => {
      setLastMismatch({ coord1: data.coord1, coord2: data.coord2 });
    };

    const onEnd = (data: any) => {
      console.log('[MemoryGame] end', data);
      setPhase('completed');
      setEndResult({ turns: data.turns, elapsedSeconds: data.elapsedSeconds });
    };

    socket.on('memory:start', onStart);
    socket.on('memory:state', onState);
    socket.on('memory:flip', onFlip);
    socket.on('memory:match', onMatch);
    socket.on('memory:mismatch', onMismatch);
    socket.on('memory:end', onEnd);

    return () => {
      socket.off('memory:start', onStart);
      socket.off('memory:state', onState);
      socket.off('memory:flip', onFlip);
      socket.off('memory:match', onMatch);
      socket.off('memory:mismatch', onMismatch);
      socket.off('memory:end', onEnd);
    };
  }, []);

  const handleStartGame = useCallback(() => {
    console.log('[MemoryGame] requesting start', { matchId, partnerId });
    connectSocket().emit('memory:start', { matchId, partnerId });
  }, [matchId, partnerId]);

  // Auto-start when launched via game invitation system
  useEffect(() => {
    if (autoStart && !autoStarted.current && phase === 'idle') {
      autoStarted.current = true;
      handleStartGame();
    }
  }, [autoStart, phase, handleStartGame]);

  const handleFlip = useCallback(
    (cardIndex: number) => {
      if (!game || game.status !== 'active') return;
      if (game.activePlayer !== userId) return;
      const card = game.board[cardIndex];
      if (card.matched || card.revealed) return;
      connectSocket().emit('memory:flip', { matchId, cardIndex });
    },
    [game, matchId, userId],
  );

  const isMyTurn = game?.activePlayer === userId;

  // Idle — show start button
  if (phase === 'idle') {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-3">
        <div className="text-3xl">🃏</div>
        <p className="font-semibold text-sm">Memory Card Game</p>
        <p className="text-xs text-muted-foreground">
          Find all matching pairs together! Use voice to coordinate — cards are labeled A1–D4.
        </p>
        <button
          onClick={handleStartGame}
          className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-pink-500 to-violet-600 text-white shadow-lg shadow-pink-500/20 active:scale-95 transition-transform"
        >
          Start Memory Game
        </button>
      </div>
    );
  }

  // Completed
  if (phase === 'completed' && endResult) {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-5 text-center space-y-3">
        <div className="text-4xl">🎉</div>
        <p className="font-bold text-lg">All pairs found!</p>
        <p className="text-sm text-muted-foreground">
          {endResult.turns} turns · {endResult.elapsedSeconds}s
        </p>
        <button
          onClick={() => {
            setPhase('idle');
            setGame(null);
            setEndResult(null);
          }}
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
        <span className="text-xs font-medium text-muted-foreground">
          {game.matchesFound}/{game.totalPairs} pairs
        </span>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
          isMyTurn
            ? 'bg-green-500/15 text-green-400 border border-green-500/30'
            : 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
        }`}>
          {isMyTurn ? 'Your turn' : "Partner's turn"}
        </span>
        <span className="text-xs text-muted-foreground">
          Turn {game.turns}
        </span>
      </div>

      {/* Match / mismatch flash */}
      {lastMatch && (
        <div className="px-4 py-1.5 bg-green-500/10 text-green-400 text-xs text-center font-medium animate-pulse">
          ✓ Match! {lastMatch.coord1} &amp; {lastMatch.coord2} = {lastMatch.symbol}
        </div>
      )}
      {lastMismatch && (
        <div className="px-4 py-1.5 bg-red-500/10 text-red-400 text-xs text-center font-medium">
          ✗ No match — {lastMismatch.coord1} &amp; {lastMismatch.coord2}
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-gradient-to-r from-pink-500 to-violet-500 transition-all duration-500"
          style={{ width: `${(game.matchesFound / game.totalPairs) * 100}%` }}
        />
      </div>

      {/* 4×4 card grid */}
      <div className="p-3">
        <div className="grid grid-cols-4 gap-2">
          {game.board.map((card) => {
            const isFlipped = card.revealed || card.matched;
            const isMatchedCard = card.matched;
            const canFlip = isMyTurn && !isFlipped && game.status === 'active';

            return (
              <button
                key={card.index}
                onClick={() => handleFlip(card.index)}
                disabled={!canFlip}
                className={`
                  relative aspect-square rounded-xl text-center flex flex-col items-center justify-center
                  transition-all duration-300 active:scale-95
                  ${isMatchedCard
                    ? 'bg-green-500/15 border-2 border-green-500/40'
                    : isFlipped
                      ? 'bg-violet-500/15 border-2 border-violet-500/40'
                      : canFlip
                        ? 'bg-muted/60 border-2 border-border hover:border-violet-500/50 hover:bg-violet-500/10 cursor-pointer'
                        : 'bg-muted/40 border-2 border-border/50 cursor-not-allowed opacity-70'
                  }
                `}
              >
                {/* Coordinate label */}
                <span className={`text-[10px] font-mono leading-none ${
                  isFlipped ? 'text-muted-foreground/60' : 'text-muted-foreground'
                }`}>
                  {card.coord}
                </span>

                {/* Card content */}
                {isFlipped ? (
                  <span className="text-2xl leading-none mt-0.5">{card.symbol}</span>
                ) : (
                  <span className="text-lg leading-none mt-0.5 text-muted-foreground/40">?</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-border text-center">
        <p className="text-[11px] text-muted-foreground">
          {isMyTurn
            ? 'Tap a card to flip it — tell your partner what you see!'
            : 'Wait for your partner — ask them what they flipped!'}
        </p>
      </div>
    </div>
  );
}
