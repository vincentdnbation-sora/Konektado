import { create } from 'zustand';

interface MatchState {
  matchId: string | null;
  roomName: string | null;
  livekitToken: string | null;
  livekitUrl: string | null;
  queueStatus: 'idle' | 'queued' | 'matched';
  setMatch: (data: { matchId: string; roomName: string; token: string; livekitUrl: string }) => void;
  setQueueStatus: (status: 'idle' | 'queued' | 'matched') => void;
  clearMatch: () => void;
}

export const useMatchStore = create<MatchState>((set) => ({
  matchId: null,
  roomName: null,
  livekitToken: null,
  livekitUrl: null,
  queueStatus: 'idle',

  setMatch: (data) => set({
    matchId: data.matchId,
    roomName: data.roomName,
    livekitToken: data.token,
    livekitUrl: data.livekitUrl,
    queueStatus: 'matched',
  }),

  setQueueStatus: (status) => set({ queueStatus: status }),

  clearMatch: () => set({
    matchId: null,
    roomName: null,
    livekitToken: null,
    livekitUrl: null,
    queueStatus: 'idle',
  }),
}));
