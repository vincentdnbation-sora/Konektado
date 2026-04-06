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

interface PongData {
  paddle1Y: number;
  paddle2Y: number;
  ballX: number;
  ballY: number;
  score1: number;
  score2: number;
  fieldW: number;
  fieldH: number;
  paddleH: number;
  paddleW: number;
  ballRadius: number;
}

export default function PongGame({ matchId, userId, partnerId, autoStart }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [player1, setPlayer1] = useState('');
  const [player2, setPlayer2] = useState('');
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [winningScore, setWinningScore] = useState(5);
  const [endResult, setEndResult] = useState<{ winner: string | null } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<PongData | null>(null);
  const autoStarted = useRef(false);
  const inputRef = useRef(0);
  const animRef = useRef<number>(0);

  const amPlayer1 = player1 === userId;

  useEffect(() => {
    const socket = connectSocket();

    const onStart = (data: any) => {
      console.log('[Pong] start', data);
      setPhase('playing');
      setEndResult(null);
      setPlayer1(data.player1);
      setPlayer2(data.player2);
      setScore1(0);
      setScore2(0);
      setWinningScore(data.winningScore || 5);
      gameRef.current = {
        paddle1Y: data.paddle1Y,
        paddle2Y: data.paddle2Y,
        ballX: data.ballX,
        ballY: data.ballY,
        score1: 0,
        score2: 0,
        fieldW: data.fieldW,
        fieldH: data.fieldH,
        paddleH: data.paddleH,
        paddleW: data.paddleW,
        ballRadius: data.ballRadius,
      };
    };

    const onTick = (data: any) => {
      if (!gameRef.current) return;
      gameRef.current.paddle1Y = data.paddle1Y;
      gameRef.current.paddle2Y = data.paddle2Y;
      gameRef.current.ballX = data.ballX;
      gameRef.current.ballY = data.ballY;
      if (data.score1 !== undefined) {
        gameRef.current.score1 = data.score1;
        gameRef.current.score2 = data.score2;
        setScore1(data.score1);
        setScore2(data.score2);
      }
    };

    const onScored = (data: any) => {
      setScore1(data.score1);
      setScore2(data.score2);
      if (gameRef.current) {
        gameRef.current.score1 = data.score1;
        gameRef.current.score2 = data.score2;
      }
    };

    const onEnd = (data: any) => {
      console.log('[Pong] end', data);
      setPhase('ended');
      setScore1(data.score1);
      setScore2(data.score2);
      setEndResult({ winner: data.winner });
      gameRef.current = null;
    };

    socket.on('pong:start', onStart);
    socket.on('pong:tick', onTick);
    socket.on('pong:scored', onScored);
    socket.on('pong:end', onEnd);

    return () => {
      socket.off('pong:start', onStart);
      socket.off('pong:tick', onTick);
      socket.off('pong:scored', onScored);
      socket.off('pong:end', onEnd);
    };
  }, []);

  // Canvas render loop
  useEffect(() => {
    if (phase !== 'playing') return;

    const render = () => {
      const canvas = canvasRef.current;
      const g = gameRef.current;
      if (!canvas || !g) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const scaleX = canvas.width / g.fieldW;
      const scaleY = canvas.height / g.fieldH;

      // Clear
      ctx.fillStyle = '#0f0a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Center line
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Paddles
      const paddleW = g.paddleW * scaleX;
      const paddleH = g.paddleH * scaleY;
      const margin = 15 * scaleX;

      // Player 1 (left) - pink
      const p1Gradient = ctx.createLinearGradient(margin, 0, margin + paddleW, 0);
      p1Gradient.addColorStop(0, '#ec4899');
      p1Gradient.addColorStop(1, '#db2777');
      ctx.fillStyle = p1Gradient;
      ctx.beginPath();
      ctx.roundRect(margin, (g.paddle1Y - g.paddleH / 2) * scaleY, paddleW, paddleH, 3);
      ctx.fill();

      // Player 2 (right) - violet
      const p2x = canvas.width - margin - paddleW;
      const p2Gradient = ctx.createLinearGradient(p2x, 0, p2x + paddleW, 0);
      p2Gradient.addColorStop(0, '#8b5cf6');
      p2Gradient.addColorStop(1, '#7c3aed');
      ctx.fillStyle = p2Gradient;
      ctx.beginPath();
      ctx.roundRect(p2x, (g.paddle2Y - g.paddleH / 2) * scaleY, paddleW, paddleH, 3);
      ctx.fill();

      // Ball with glow
      const bx = g.ballX * scaleX;
      const by = g.ballY * scaleY;
      const br = g.ballRadius * Math.min(scaleX, scaleY);

      ctx.shadowColor = '#ec4899';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const w = rect.width;
      const h = Math.round(w * 0.75); // 4:3 aspect
      canvas.width = w * window.devicePixelRatio;
      canvas.height = h * window.devicePixelRatio;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      // Redraw dimensions
      canvas.width = w;
      canvas.height = h;
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [phase]);

  const handleStartGame = useCallback(() => {
    console.log('[Pong] requesting start');
    connectSocket().emit('pong:start', { matchId, partnerId });
  }, [matchId, partnerId]);

  useEffect(() => {
    if (autoStart && !autoStarted.current && phase === 'idle') {
      autoStarted.current = true;
      handleStartGame();
    }
  }, [autoStart, phase, handleStartGame]);

  // Send paddle input
  const sendInput = useCallback((dir: number) => {
    if (phase !== 'playing') return;
    if (inputRef.current === dir) return; // no change
    inputRef.current = dir;
    connectSocket().emit('pong:input', { matchId, direction: dir });
  }, [matchId, phase]);

  // Touch controls
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 5) sendInput(1);       // move down
    else if (dy < -5) sendInput(-1); // move up
    touchStartY.current = e.touches[0].clientY;
  }, [sendInput]);

  const handleTouchEnd = useCallback(() => {
    touchStartY.current = null;
    sendInput(0);
  }, [sendInput]);

  if (phase === 'idle') {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-3">
        <div className="text-3xl">🏓</div>
        <p className="font-semibold text-sm">Pong</p>
        <p className="text-xs text-muted-foreground">Classic 2-player pong — drag to move your paddle!</p>
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
    return (
      <div className={`rounded-2xl border p-5 text-center space-y-3 ${
        iWon ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'
      }`}>
        <div className="text-4xl">{iWon ? '🏆' : '😔'}</div>
        <p className="font-bold text-lg">{iWon ? 'You win!' : 'You lose!'}</p>
        <p className="text-sm text-muted-foreground">
          {amPlayer1 ? `${score1} - ${score2}` : `${score2} - ${score1}`}
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
      {/* Scoreboard */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-sm font-bold text-pink-400">{amPlayer1 ? score1 : score2}</span>
        <span className="text-xs text-muted-foreground">First to {winningScore}</span>
        <span className="text-sm font-bold text-violet-400">{amPlayer1 ? score2 : score1}</span>
      </div>

      {/* Game canvas */}
      <div
        className="relative touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas ref={canvasRef} className="w-full block" />
        {/* Labels overlay */}
        <div className="absolute bottom-2 left-3 text-[10px] font-bold text-pink-400/60">
          {amPlayer1 ? 'YOU' : 'THEM'}
        </div>
        <div className="absolute bottom-2 right-3 text-[10px] font-bold text-violet-400/60">
          {amPlayer1 ? 'THEM' : 'YOU'}
        </div>
      </div>

      {/* Controls */}
      <div className="p-2 border-t border-border">
        <div className="flex gap-2">
          <button
            onPointerDown={() => sendInput(-1)}
            onPointerUp={() => sendInput(0)}
            onPointerLeave={() => sendInput(0)}
            className="flex-1 py-4 rounded-xl text-lg font-bold bg-muted/40 border border-border active:bg-violet-500/20 active:border-violet-500/30 transition-colors select-none"
          >
            ▲
          </button>
          <button
            onPointerDown={() => sendInput(1)}
            onPointerUp={() => sendInput(0)}
            onPointerLeave={() => sendInput(0)}
            className="flex-1 py-4 rounded-xl text-lg font-bold bg-muted/40 border border-border active:bg-violet-500/20 active:border-violet-500/30 transition-colors select-none"
          >
            ▼
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-1.5">
          Use buttons or drag on the field to move your paddle
        </p>
      </div>
    </div>
  );
}
