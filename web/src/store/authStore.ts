import { create } from 'zustand';
import { demoGetCurrentUser, demoLogout, type DemoUser } from '@/lib/demoAuth';

interface AuthState {
  user: DemoUser | null;
  token: string | null;
  isLoading: boolean;
  setUser: (user: DemoUser | null) => void;
  setToken: (token: string) => void;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const session = JSON.parse(localStorage.getItem('voicematch_session') || 'null');
    return session?.token || null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: getStoredToken(),
  isLoading: false,

  setUser: (user) => set({ user }),

  setToken: (token) => set({ token }),

  logout: () => {
    demoLogout();
    set({ user: null, token: null });
    window.location.href = '/';
  },

  fetchMe: async () => {
    set({ isLoading: true });
    try {
      const user = demoGetCurrentUser();
      if (user) {
        set({ user });
      } else {
        set({ user: null, token: null });
      }
    } finally {
      set({ isLoading: false });
    }
  },
}));
