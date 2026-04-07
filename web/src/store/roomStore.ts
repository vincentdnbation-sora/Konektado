import { create } from 'zustand';

export interface RoomUser {
  userId: string;
  displayName: string;
  avatar: string;
}

interface RoomState {
  roomId: string | null;
  token: string | null;
  livekitUrl: string | null;
  /** userId → profile — populated from room:update broadcasts */
  userProfiles: Record<string, RoomUser>;
  setRoom: (data: { roomId: string; token: string; livekitUrl?: string }) => void;
  setUserProfiles: (users: RoomUser[]) => void;
  clearRoom: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  roomId: null,
  token: null,
  livekitUrl: null,
  userProfiles: {},

  setRoom: (data) => set({
    roomId: data.roomId,
    token: data.token,
    livekitUrl: data.livekitUrl || process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://dating-app-46dvc6ij.livekit.cloud',
  }),

  setUserProfiles: (users) => set((state) => {
    const merged = { ...state.userProfiles };
    for (const u of users) {
      merged[u.userId] = u;
    }
    return { userProfiles: merged };
  }),

  clearRoom: () => set({ roomId: null, token: null, livekitUrl: null, userProfiles: {} }),
}));
