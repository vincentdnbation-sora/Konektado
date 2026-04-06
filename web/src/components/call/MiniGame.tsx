'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { connectSocket } from '@/lib/socket';

interface Props {
  matchId: string;
  userId: string;
}

type Phase = 'waiting' | 'ready' | 'jumping' | 'result' | 'complete';

interface GameState {
  phase: Phase;
  round: number;
  totalRounds: number;
  lives: number;
  score: number;
  windowMs: number;
  timeLeft: number;
  myJumped: boolean;
  partnerJumped: boolean;
  lastSuccess?: boolean;
  won?: boolean;
}

export default function MiniGame({ matchId, userId }: Props) {
  const [game, setGame] = useState<GameState>({
    phase: 'waiting',
    round: 0,
    totalRounds: 5,
    lives: 3,
    score: 0,
    windowMs: 2500,
    timeLeft: 2500,
    myJumped: false,
    partnerJumped: false,
  });

  const [myChar, setMyChar] = useState<'idle' | 'jump' | 'fall'>('idle');
  const [partnerChar, setPartnerChar] = useState<'idle' | 'jump' | 'fall'>('idle');
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const startCountdown = useCallback((windowMs: number) => {
    let left = windowMs;
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      left -= 100;
      setGame((g) => ({ ...g, timeLeft: Math.max(0, left) }));
      if (left <= 0 && countdownRef.current) clearInterval(countdownRef.current);
    }, 100);
  }, []);

  useEffect(() => {
    const socket = connectSocket();

    // Fix 2: use named handler references so socket.off removes exactly these
    // listeners and not every listener registered for these events globally.
    const onGameStart = (data: { totalRounds: number; lives: number; windowMs: number }) => {
      setGame((g) => ({ ...g, phase: 'ready', totalRounds: data.totalRounds, lives: data.lives, windowMs: data.windowMs }));
    };

    const onGameRound = (data: { round: number; totalRounds: number; windowMs: number }) => {
      setMyChar('idle');
      setPartnerChar('idle');
      setGame((g) => ({
        ...g,
        phase: 'jumping',
        round: data.round,
        totalRounds: data.totalRounds,
        windowMs: data.windowMs,
        timeLeft: data.windowMs,
        myJumped: false,
        partnerJumped: false,
        lastSuccess: undefined,
      }));
      startCountdown(data.windowMs);
    };

    const onPlayerJumped = (data: { userId: string }) => {
      if (data.userId === userId) {
        setMyChar('jump');
        setGame((g) => ({ ...g, myJumped: true }));
        setTimeout(() => setMyChar('idle'), 600);
      } else {
        setPartnerChar('jump');
        setGame((g) => ({ ...g, partnerJumped: true }));
        setTimeout(() => setPartnerChar('idle'), 600);
      }
    };

    const onGameResult = (data: { success: boolean; lives: number; score: number; round: number }) => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (!data.success) { setMyChar('fall'); setPartnerChar('fall'); }
      setGame((g) => ({ ...g, phase: 'result', lives: data.lives, score: data.score, lastSuccess: data.success }));
    };

    const onGameOver = (data: { won: boolean; score: number; totalRounds: number }) => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      setMyChar('idle');
      setPartnerChar('idle');
      setGame((g) => ({ ...g, phase: 'complete', score: data.score, won: data.won }));
    };

    socket.on('jump_game_start', onGameStart);
    socket.on('jump_game_round', onGameRound);
    socket.on('jump_game_player_jumped', onPlayerJumped);
    socket.on('jump_game_result', onGameResult);
    socket.on('jump_game_over', onGameOver);

    return () => {
      socket.off('jump_game_start', onGameStart);
      socket.off('jump_game_round', onGameRound);
      socket.off('jump_game_player_jumped', onPlayerJumped);
      socket.off('jump_game_result', onGameResult);
      socket.off('jump_game_over', onGameOver);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [userId, startCountdown]);

  function handleJump() {
    if (game.phase !== 'jumping' || game.myJumped) return;
    connectSocket().emit('game_jump', { matchId });
  }

  const pct = game.windowMs > 0 ? (game.timeLeft / game.windowMs) * 100 : 0;
  const timeLeftSec = (game.timeLeft / 1000).toFixed(1);

  if (game.phase === 'waiting') {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground animate-pulse">🎮 Jump game starting soon...</p>
      </div>
    );
  }

  if (game.phase === 'complete') {
    return (
      <div className={`rounded-2xl border p-5 text-center space-y-2 ${game.won ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
        <div className="text-4xl">{game.won ? '🏆' : '💀'}</div>
        <p className="font-bold text-lg">{game.won ? 'You both made it!' : 'Better luck next time!'}</p>
        <p className="text-sm text-muted-foreground">{game.score}/{game.totalRounds} jumps synced</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">
          Round {game.round || '—'}/{game.totalRounds}
        </span>
        <div className="flex gap-1">
          {Array.from({ length: game.totalRounds }).map((_, i) => (
            <div key={i} className={`w-3 h-3 rounded-full ${i < game.score ? 'bg-green-500' : 'bg-muted'}`} />
          ))}
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className={`text-sm ${i < game.lives ? '' : 'opacity-20'}`}>❤️</span>
          ))}
        </div>
      </div>

      {/* Game scene */}
      <div className="relative bg-gradient-to-b from-slate-900 to-slate-800 overflow-hidden" style={{ height: 96 }}>
        {[12, 28, 55, 72, 88].map((x) => (
          <div key={x} className="absolute w-1 h-1 rounded-full bg-white/40" style={{ left: `${x}%`, top: '12%' }} />
        ))}
        <div className="absolute bottom-0 left-0 bg-violet-700" style={{ width: '40%', height: 10, borderRadius: '0 4px 0 0' }} />
        <div className="absolute bottom-1 flex justify-around items-center" style={{ left: '40%', width: '20%' }}>
          {[0,1,2].map(i => <div key={i} className="w-1 h-px bg-pink-500/50" />)}
        </div>
        <div className="absolute bottom-0 right-0 bg-violet-700" style={{ width: '40%', height: 10, borderRadius: '4px 0 0 0' }} />
        <div className="absolute bottom-2.5 right-2 text-base leading-none">🚩</div>

        <CharSprite state={myChar} side="left" />
        <CharSprite state={partnerChar} side="right" />

        {game.phase === 'result' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-4xl font-black ${game.lastSuccess ? 'text-green-400' : 'text-red-400'}`}>
              {game.lastSuccess ? '✓' : '✗'}
            </span>
          </div>
        )}
      </div>

      {/* Timer bar */}
      {game.phase === 'jumping' && (
        <div className="h-1 bg-muted">
          <div
            className={`h-full ${pct < 25 ? 'bg-red-500' : 'bg-gradient-to-r from-pink-500 to-violet-500'}`}
            style={{ width: `${pct}%`, transition: 'width 0.1s linear' }}
          />
        </div>
      )}

      {/* Action */}
      <div className="p-3">
        {game.phase === 'ready' && (
          <div className="text-center py-1.5">
            <p className="text-sm font-semibold">Jump together over the gap!</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tap JUMP at the same time as your partner</p>
          </div>
        )}

        {game.phase === 'jumping' && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs px-1">
              <span className={game.myJumped ? 'text-green-400 font-medium' : 'text-muted-foreground'}>
                {game.myJumped ? '✓ You jumped' : 'You'}
              </span>
              <span className={pct < 25 ? 'text-red-400 font-bold' : 'text-muted-foreground'}>
                {timeLeftSec}s
              </span>
              <span className={game.partnerJumped ? 'text-green-400 font-medium' : 'text-muted-foreground'}>
                {game.partnerJumped ? '✓ They jumped' : 'Partner'}
              </span>
            </div>
            <button
              onPointerDown={handleJump}
              disabled={game.myJumped}
              className={`w-full py-5 rounded-xl text-xl font-black transition-all duration-75 active:scale-95 ${
                game.myJumped
                  ? 'bg-green-500/15 text-green-400 border border-green-500/40 cursor-not-allowed'
                  : 'bg-gradient-to-r from-pink-500 to-violet-600 text-white shadow-lg shadow-pink-500/30 active:shadow-none'
              }`}
            >
              {game.myJumped ? '✓ JUMPED' : '⬆ JUMP'}
            </button>
          </div>
        )}

        {game.phase === 'result' && (
          <div className={`text-center py-2 rounded-xl ${game.lastSuccess ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            <p className={`font-bold text-sm ${game.lastSuccess ? 'text-green-400' : 'text-red-400'}`}>
              {game.lastSuccess ? '🎉 Perfect sync!' : '💥 Out of sync!'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Next round starting...</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CharSprite({ state, side }: { state: 'idle' | 'jump' | 'fall'; side: 'left' | 'right' }) {
  const bottomOffset = state === 'jump' ? 48 : state === 'fall' ? -8 : 10;
  return (
    <div
      className="absolute text-xl leading-none transition-all duration-300"
      style={{
        bottom: bottomOffset,
        [side === 'left' ? 'left' : 'right']: '14%',
        transform: side === 'right' ? 'scaleX(-1)' : undefined,
        opacity: state === 'fall' ? 0.3 : 1,
        filter: state === 'jump' ? 'drop-shadow(0 6px 10px rgba(236,72,153,0.7))' : undefined,
      }}
    >
      🏃
    </div>
  );
}
