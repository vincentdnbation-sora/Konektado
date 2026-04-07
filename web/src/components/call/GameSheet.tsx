'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { connectSocket } from '@/lib/socket';
import { toast } from 'sonner';

// ── Beta override — set NEXT_PUBLIC_BETA_PREMIUM=true to unlock premium games ──
const BETA_PREMIUM = process.env.NEXT_PUBLIC_BETA_PREMIUM === 'true';

// ── Game catalog ──

export interface GameDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  premium: boolean;
}

export const GAME_CATALOG: GameDef[] = [
  { id: 'memory',     title: 'Memory Cards',     description: 'Find matching pairs together using voice hints',        icon: '🃏', premium: false },
  { id: 'tictactoe', title: 'Tic Tac Toe',      description: 'Classic X & O — outsmart your match!',                 icon: '❌', premium: false },
  { id: 'rope',      title: 'Grab the Rope',    description: 'Tap fast to pull the rope to your side',               icon: '🪢', premium: false },
  { id: 'pong',      title: 'Pong',             description: 'Retro paddle battle — first to 5 wins',               icon: '🏓', premium: false },
  { id: 'chess',     title: 'Chess',            description: 'The ultimate strategy game — think ahead!',            icon: '♟️', premium: true },
  { id: 'billiards', title: 'Billiards',        description: 'Pocket all your balls before your opponent',           icon: '🎱', premium: true },
];

/** Returns true if the game is effectively locked (premium + beta mode off) */
export function isGameLocked(game: GameDef): boolean {
  return game.premium && !BETA_PREMIUM;
}

// ── Invite status types ──

export type InviteStatus =
  | { type: 'idle' }
  | { type: 'sent'; gameId: string; gameTitle: string }
  | { type: 'received'; gameId: string; gameTitle: string; fromUserId: string }
  | { type: 'accepted'; gameId: string; gameTitle: string }
  | { type: 'declined'; gameId: string };

// ── Bottom Sheet ──

interface GameSheetProps {
  open: boolean;
  onClose: () => void;
  matchId: string;
  userId: string;
  partnerId: string;
  inviteStatus: InviteStatus;
  onInviteSent: (gameId: string, gameTitle: string) => void;
}

export function GameSheet({
  open,
  onClose,
  matchId,
  userId,
  partnerId,
  inviteStatus,
  onInviteSent,
}: GameSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  // In beta mode, premium games appear in the free section as playable
  const freeGames = BETA_PREMIUM
    ? GAME_CATALOG  // all games are playable in beta
    : GAME_CATALOG.filter((g) => !g.premium);
  const premiumGames = BETA_PREMIUM
    ? []            // no locked section in beta
    : GAME_CATALOG.filter((g) => g.premium);

  // Close on backdrop tap
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  // Touch drag-to-dismiss
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY;
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStart.current == null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    setDragY(Math.max(0, dy));
  }, []);
  const handleTouchEnd = useCallback(() => {
    if (dragY > 120) {
      onClose();
    }
    setDragY(0);
    dragStart.current = null;
  }, [dragY, onClose]);

  function handleSelectGame(game: GameDef) {
    if (isGameLocked(game)) {
      toast('Upgrade required', { description: `"${game.title}" is a premium game. Coming soon!` });
      return;
    }
    if (inviteStatus.type === 'sent') return; // already waiting
    const socket = connectSocket();
    socket.emit('game:invite', {
      matchId,
      partnerId,
      gameId: game.id,
      gameTitle: game.title,
    });
    onInviteSent(game.id, game.title);
    toast.success(`Invited partner to play ${game.title}`);
  }

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center"
      style={{ touchAction: 'none' }}
    >
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full max-w-md bg-card border-t border-border rounded-t-3xl shadow-2xl transition-transform duration-200"
        style={{
          transform: `translateY(${dragY}px)`,
          maxHeight: '80vh',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">Play a Game</h3>
            <p className="text-xs text-muted-foreground">Pick a game to play with your match</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground text-sm"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-6 space-y-5" style={{ maxHeight: 'calc(80vh - 80px)' }}>
          {/* Pending invite banner */}
          {inviteStatus.type === 'sent' && (
            <div className="flex items-center gap-3 bg-[#FFD166]/10 border border-[#FFD166]/20 rounded-xl px-4 py-3">
              <span className="text-xl animate-bounce">📩</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#FFD166]">Invite sent!</p>
                <p className="text-xs text-muted-foreground">
                  Waiting for partner to accept {inviteStatus.gameTitle}...
                </p>
              </div>
            </div>
          )}

          {/* Free games */}
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Free Games</h4>
            <div className="space-y-2">
              {freeGames.map((game) => (
                <button
                  key={game.id}
                  onClick={() => handleSelectGame(game)}
                  disabled={inviteStatus.type === 'sent'}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left active:scale-[.98]
                    ${inviteStatus.type === 'sent' && (inviteStatus as any).gameId === game.id
                      ? 'bg-[#FFD166]/10 border-[#FFD166]/30'
                      : 'bg-muted/30 border-border hover:border-[#FFD166]/40 hover:bg-[#FFD166]/5'
                    }
                    ${inviteStatus.type === 'sent' ? 'opacity-70 cursor-not-allowed' : ''}
                  `}
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#E63946]/20 to-[#FFD166]/20 flex items-center justify-center text-2xl shrink-0">
                    {game.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{game.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{game.description}</p>
                  </div>
                  <div className="shrink-0 text-muted-foreground/40 text-lg">›</div>
                </button>
              ))}
            </div>
          </div>

          {/* Premium games */}
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Premium Games
              <span className="ml-1.5 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 align-middle">
                PRO
              </span>
            </h4>
            <div className="space-y-2">
              {premiumGames.map((game) => (
                <button
                  key={game.id}
                  onClick={() => handleSelectGame(game)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20 transition-all text-left active:scale-[.98] relative overflow-hidden"
                >
                  <div className="w-11 h-11 rounded-xl bg-muted/40 flex items-center justify-center text-2xl shrink-0 opacity-60">
                    {game.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-muted-foreground">{game.title}</p>
                    <p className="text-[11px] text-muted-foreground/60 leading-snug">{game.description}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1 text-amber-400">
                    <span className="text-sm">🔒</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Incoming Invite Overlay ──

interface GameInviteOverlayProps {
  invite: Extract<InviteStatus, { type: 'received' }>;
  matchId: string;
  partnerId: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function GameInviteOverlay({ invite, matchId, partnerId, onAccept, onDecline }: GameInviteOverlayProps) {
  const game = GAME_CATALOG.find((g) => g.id === invite.gameId);

  function handleAccept() {
    connectSocket().emit('game:accept', {
      matchId,
      partnerId: invite.fromUserId,
      gameId: invite.gameId,
      gameTitle: invite.gameTitle,
    });
    onAccept();
  }

  function handleDecline() {
    connectSocket().emit('game:decline', {
      matchId,
      partnerId: invite.fromUserId,
      gameId: invite.gameId,
    });
    onDecline();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#E63946]/20 to-[#FFD166]/20 flex items-center justify-center text-4xl">
          {game?.icon ?? '🎮'}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Your partner wants to play</p>
          <p className="text-xl font-bold mt-1">{invite.gameTitle}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDecline}
            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-muted/60 border border-border text-muted-foreground hover:text-foreground transition-colors active:scale-95"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-[#E63946] to-[#FFD166] text-white shadow-lg shadow-[#E63946]/20 active:scale-95 transition-transform"
          >
            Let&apos;s Play!
          </button>
        </div>
      </div>
    </div>
  );
}
