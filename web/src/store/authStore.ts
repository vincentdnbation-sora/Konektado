import { create } from 'zustand';
import Cookies from 'js-cookie';
import api from '@/lib/api';

interface User {
  id: string;
  email: string;
  profile?: {
    displayName: string;
    age: number;
    gender: string;
    photoUrl?: string;
    bio?: string;
  };
  preferences?: {
    preferredGender: string;
    minAge: number;
    maxAge: number;
    maxDistanceKm: number;
  };
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string) => void;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: Cookies.get('token') || null,
  isLoading: false,

  setUser: (user) => set({ user }),

  setToken: (token) => {
    Cookies.set('token', token, { expires: 7 });
    set({ token });
  },

  logout: () => {
    Cookies.remove('token');
    set({ user: null, token: null });
    window.location.href = '/';
  },

  fetchMe: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data });
    } catch {
      Cookies.remove('token');
      set({ user: null, token: null });
    } finally {
      set({ isLoading: false });
    }
  },
}));
