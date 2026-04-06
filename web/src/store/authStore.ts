import { create } from 'zustand';

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
  setUser: (user: User | null) => void;
  setToken: (token: string) => void;
  setSession: (token: string, user: User) => void;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

function loadFromStorage() {
  if (typeof window === 'undefined') return { user: null, token: null };
  try {
    return {
      token: localStorage.getItem('kk_token'),
      user: JSON.parse(localStorage.getItem('kk_user') || 'null'),
    };
  } catch {
    return { user: null, token: null };
  }
}

const initial = loadFromStorage();

export const useAuthStore = create<AuthState>((set) => ({
  user: initial.user,
  token: initial.token,

  setUser: (user) => {
    if (user) localStorage.setItem('kk_user', JSON.stringify(user));
    else localStorage.removeItem('kk_user');
    set({ user });
  },

  setToken: (token) => {
    localStorage.setItem('kk_token', token);
    set({ token });
  },

  setSession: (token, user) => {
    localStorage.setItem('kk_token', token);
    localStorage.setItem('kk_user', JSON.stringify(user));
    set({ token, user });
  },

  logout: () => {
    localStorage.removeItem('kk_token');
    localStorage.removeItem('kk_user');
    set({ user: null, token: null });
    window.location.href = '/';
  },

  fetchMe: async () => {
    // User data is stored locally — no remote fetch needed
  },
}));
