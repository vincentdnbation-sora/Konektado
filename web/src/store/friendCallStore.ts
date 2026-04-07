import { create } from 'zustand';

interface FriendCallState {
  roomName: string | null;
  token: string | null;
  livekitUrl: string | null;
  setCall: (data: { roomName: string; token: string; livekitUrl?: string }) => void;
  clearCall: () => void;
}

export const useFriendCallStore = create<FriendCallState>((set) => ({
  roomName: null,
  token: null,
  livekitUrl: null,

  setCall: (data) => set({
    roomName: data.roomName,
    token: data.token,
    livekitUrl: data.livekitUrl || process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://dating-app-46dvc6ij.livekit.cloud',
  }),

  clearCall: () => set({ roomName: null, token: null, livekitUrl: null }),
}));
