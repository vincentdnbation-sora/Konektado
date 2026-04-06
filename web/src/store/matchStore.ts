import { create } from 'zustand';

// Fallback to the env var if the backend didn't send the URL
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://dating-app-46dvc6ij.livekit.cloud';

interface MatchState {
  matchId: string | null;
  roomName: string | null;
  partnerId: string | null;
  livekitToken: string | null;
  livekitUrl: string | null;
  queueStatus: 'idle' | 'queued' | 'matched';
  /** Last known geolocation — persisted so re-queue from call page includes location */
  lastLocation: { lat: number; lng: number } | null;
  setMatch: (data: { matchId: string; roomName: string; token: string; livekitUrl?: string; partnerId?: string }) => void;
  setQueueStatus: (status: 'idle' | 'queued' | 'matched') => void;
  setLastLocation: (loc: { lat: number; lng: number } | null) => void;
  clearMatch: () => void;
}

export const useMatchStore = create<MatchState>((set) => ({
  matchId: null,
  roomName: null,
  partnerId: null,
  livekitToken: null,
  livekitUrl: null,
  queueStatus: 'idle',
  lastLocation: null,

  setMatch: (data) => set({
    matchId: data.matchId,
    roomName: data.roomName,
    partnerId: data.partnerId ?? null,
    livekitToken: data.token,
    livekitUrl: data.livekitUrl || LIVEKIT_URL,
    queueStatus: 'matched',
  }),

  setQueueStatus: (status) => set({ queueStatus: status }),

  setLastLocation: (loc) => set({ lastLocation: loc }),

  clearMatch: () => set({
    matchId: null,
    roomName: null,
    partnerId: null,
    livekitToken: null,
    livekitUrl: null,
    queueStatus: 'idle',
  }),
}));
