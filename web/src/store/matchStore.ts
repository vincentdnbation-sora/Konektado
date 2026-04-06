import { create } from 'zustand';

// Fallback to the env var if the backend didn't send the URL
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://dating-app-46dvc6ij.livekit.cloud';

interface MatchState {
  matchId: string | null;
  roomName: string | null;
  livekitToken: string | null;
  livekitUrl: string | null;
  queueStatus: 'idle' | 'queued' | 'matched';
  setMatch: (data: Partial<{ matchId: string; roomName: string; token: string; livekitUrl: string }>) => void;
  setQueueStatus: (status: 'idle' | 'queued' | 'matched') => void;
  clearMatch: () => void;
}

export const useMatchStore = create<MatchState>((set) => ({
  matchId: null,
  roomName: null,
  livekitToken: null,
  livekitUrl: null,
  queueStatus: 'idle',

  setMatch: (data) => set((state) => ({
    ...state,
    matchId: data.matchId ?? state.matchId,
    roomName: data.roomName ?? state.roomName,
    livekitToken: data.token ?? state.livekitToken,
    livekitUrl: data.livekitUrl ?? state.livekitUrl,
    queueStatus: data.matchId ? 'matched' : state.queueStatus,
  })),

  setQueueStatus: (status) => set({ queueStatus: status }),

  clearMatch: () => set({
    matchId: null,
    roomName: null,
    livekitToken: null,
    livekitUrl: null,
    queueStatus: 'idle',
  }),
}));
