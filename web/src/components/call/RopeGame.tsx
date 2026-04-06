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

export default function RopeGame({ matchId, userId, partnerId, autoStart }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [ropePosition, setRopePosition] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [myTaps, setMyTaps] = useState(0);
  const [partnerTaps, setPartnerTaps] = useState(0);
  const [player1, setPlayer1] = useState('');
  const [player2, setPlayer2] = useState('');
  const [endResult, setEndResult] = useState<{
    winner: string | null;
    myTaps: number;
    partnerTaps: number;
    reason: string;
  } | null>(null);
  const autoStarted = useRef(false);
  const tapCount = useRef(0);

  const amPlayer1 = player1 === userId;

  useEffect(() => {
    const socket = connectSocket();

    const onStart = (data: any) => {
      console.log('[RopeGame] start', data);
      setPhase('playing');
      setEndResult(null);
      setRopePosition(0);
      setTimeLeft(data.duration);
      setMyTaps(0);
      setPartnerTaps(0);
      setPlayer1(data.player1);
      setPlayer2(data.player2);
      tapCount.current = 0;
    };

    const onTick = (data: any) => {
      setRopePosition(data.ropePosition);
      setTimeLeft(data.timeLeft);
      const isP1 = player1 === userId || data.player1Taps > 0; // deduce from data
      if (userId === player1) {
        setMyTaps(data.player1Taps);
        setPartnerTaps(data.player2Taps);
      } else {
        setMyTaps(data.player2Taps);
        setPartnerTaps(data.player1Taps);
      }
    };

    const onEnd = (data: any) => {
      console.log('[RopeGame] end', data);
      setRopePosition(data.ropePosition);
      setPhase('ended');
      const iWon = data.winner === userId;
      const isDraw = data.winner === null;
      setEndResult({
        winner: data.winner,
        myTaps: userId === player1 ? data.player1Taps : data.player2Taps,
        partnerTaps: userId === player1 ? data.player2Taps : data.player1Taps,
        reason: data.reason,
      });
    };

    socket.on('rope:start', onStart);
    socket.on('rope:tick', onTick);
    socket.on('rope:end', onEnd);

    return () => {
      socket.off('rope:start', onStart);
      socket.off('rope:tick', onTick);
      socket.off('rope:end', onEnd);
    };
  }, [userId, player1]);

  const handleStartGame = useCallback(() => {
    console.log('[RopeGame] requesting start');
    connectSocket().emit('rope:start', { matchId, partnerId });
  }, [matchId, partnerId]);

  useEffect(() => {
    if (autoStart && !autoStarted.current && phase === 'idle') {
      autoStarted.current = true;
      handleStartGame();
    }
  }, [autoStart, phase, handleStartGame]);

  const handlePull = useCallback(() => {
    if (phase !== 'playing') return;
    tapCount.current += 1;
    connectSocket().emit('rope:pull', { matchId });
  }, [matchId, phase]);

  // Visual: ropePosition goes from -100 (p1 wins) to +100 (p2 wins)
  // For the meter, normalize to 0-100 where 50 = center
  // p1 pulls left (negative), p2 pulls right (positive)
  // If I'm p1: I want it to go left (my side), my progress = -(ropePosition)
  // If I'm p2: I want it to go right (my side), my progress = ropePosition
  const meterPercent = 50 + (ropePosition / 2); // 0 = full left, 100 = full right
  const timeLeftSec = (timeLeft / 1000).toFixed(1);
  const iWinning = amPlayer1 ? ropePosition < 0 : ropePosition > 0;

  if (phase === 'idle') {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-3">
        <div className="text-3xl">🪢</div>
        <p className="font-semibold text-sm">Grab the Rope</p>
        <p className="text-xs text-muted-foreground">Tap as fast as you can to pull the rope to your side!</p>
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
    const isDraw = endResult.winner === null;
    return (
      <div className={`rounded-2xl border p-5 text-center space-y-3 ${
        isDraw ? 'border-yellow-500/30 bg-yellow-500/5' : iWon ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'
      }`}>
        <div className="text-4xl">{isDraw ? '🤝' : iWon ? '💪' : '😤'}</div>
        <p className="font-bold text-lg">
          {isDraw ? 'It\'s a tie!' : iWon ? 'You pulled it!' : 'They got it!'}
        </p>
        <p className="text-sm text-muted-foreground">
          You: {endResult.myTaps} taps · Partner: {endResult.partnerTaps} taps
        </p>
        <button
          onClick={() => { setPhase('idle'); setEndResult(null); autoStarted.current = false; }}
          className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-pink-500 to-violet-600 text-white shadow-lg shadow-pink-500/20 active:scale-95 transition-transform"
        >
          Play Again
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">
          {myTaps} taps
        </span>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
          iWinning ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                   : 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
        }`}>
          {iWinning ? 'Winning!' : 'Pull harder!'}
        </span>
        <span className={`text-xs font-mono ${Number(timeLeftSec) < 5 ? 'text-red-400 font-bold' : 'text-muted-foreground'}`}>
          {timeLeftSec}s
        </span>
      </div>

      {/* Rope meter */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold text-pink-400">You</span>
          <div className="flex-1" />
          <span className="text-xs font-bold text-violet-400">Them</span>
        </div>
        <div className="relative h-5 bg-muted/40 rounded-full overflow-hidden border border-border">
          {/* Center line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border z-10" />
          {/* Fill from left (p1 side) */}
          <div
            className="absolute top-0 bottom-0 left-0 transition-all duration-75"
            style={{
              width: `${meterPercent}%`,
              background: meterPercent < 50
                ? 'linear-gradient(90deg, rgb(236 72 153 / 0.6), rgb(236 72 153 / 0.2))'
                : 'linear-gradient(90deg, rgb(139 92 246 / 0.2), rgb(139 92 246 / 0.6))',
            }}
          />
          {/* Indicator knot */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg border-2 border-pink-500 transition-all duration-75 z-20"
            style={{ left: `calc(${meterPercent}% - 8px)` }}
          />
        </div>
        {/* Rope visual */}
        <div className="mt-1 text-center text-xs text-muted-foreground/60 tracking-widest">
          ────🪢────
        </div>
      </div>

      {/* Tap button */}
      <div className="p-3">
        <button
          onPointerDown={handlePull}
          className="w-full py-8 rounded-xl text-2xl font-black bg-gradient-to-r from-pink-500 to-violet-600 text-white shadow-lg shadow-pink-500/30 active:scale-95 active:shadow-none transition-all duration-75 select-none"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          💪 PULL!
        </button>
      </div>

      <div className="px-4 py-2 border-t border-border text-center">
        <p className="text-[11px] text-muted-foreground">
          Tap as fast as you can! First to pull all the way wins.
        </p>
      </div>
    </div>
  );
}
