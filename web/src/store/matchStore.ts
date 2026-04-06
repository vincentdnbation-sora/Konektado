import { create } from 'zustand';

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://dating-app-46dvc6ij.livekit.cloud';

/** Restore match state from sessionStorage on refresh */
function loadSessionState() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem('kk_match');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSessionState(partial: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    const current = JSON.parse(sessionStorage.getItem('kk_match') || '{}');
    sessionStorage.setItem('kk_match', JSON.stringify({ ...current, ...partial }));
  } catch {}
}

function clearSessionState() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('kk_match');
}

interface MatchState {
  matchId: string | null;
  roomName: string | null;
  partnerId: string | null;
  livekitToken: string | null;
  livekitUrl: string | null;
  queueStatus: 'idle' | 'queued' | 'matched';
  lastLocation: { lat: number; lng: number } | null;
  setMatch: (data: { matchId: string; roomName: string; token: string; livekitUrl?: string; partnerId?: string }) => void;
  setQueueStatus: (status: 'idle' | 'queued' | 'matched') => void;
  setLastLocation: (loc: { lat: number; lng: number } | null) => void;
  clearMatch: () => void;
}

const saved = loadSessionState();

export const useMatchStore = create<MatchState>((set) => ({
  matchId: saved.matchId ?? null,
  roomName: saved.roomName ?? null,
  partnerId: saved.partnerId ?? null,
  livekitToken: saved.livekitToken ?? null,
  livekitUrl: saved.livekitUrl ?? null,
  queueStatus: saved.queueStatus ?? 'idle',
  lastLocation: saved.lastLocation ?? null,

  setMatch: (data) => {
    const state = {
      matchId: data.matchId,
      roomName: data.roomName,
      partnerId: data.partnerId ?? null,
      livekitToken: data.token,
      livekitUrl: LIVEKIT_URL,
      queueStatus: 'matched' as const,
    };
    saveSessionState(state);
    set(state);
  },

  setQueueStatus: (status) => {
    saveSessionState({ queueStatus: status });
    set({ queueStatus: status });
  },

  setLastLocation: (loc) => {
    saveSessionState({ lastLocation: loc });
    set({ lastLocation: loc });
  },

  clearMatch: () => {
    clearSessionState();
    set({
      matchId: null,
      roomName: null,
      partnerId: null,
      livekitToken: null,
      livekitUrl: null,
      queueStatus: 'idle',
    });
  },
}));
