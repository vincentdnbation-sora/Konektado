// Demo auth — works 100% offline using localStorage
// No backend, no email, no verification needed
// Replace with real API calls once backend is deployed

const USERS_KEY = 'voicematch_users';
const SESSION_KEY = 'voicematch_session';

export interface DemoUser {
  id: string;
  username: string;
  displayName: string;
  age: number;
  gender: string;
  bio: string;
  createdAt: string;
  preferences: {
    preferredGender: string;
    minAge: number;
    maxAge: number;
    maxDistanceKm: number;
  };
}

function getUsers(): Record<string, { user: DemoUser; passwordHash: string }> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveUsers(users: Record<string, { user: DemoUser; passwordHash: string }>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// Simple hash — NOT for production, demo only
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function demoRegister(data: {
  username: string;
  password: string;
  displayName: string;
  age: number;
  gender: string;
}): { token: string; user: DemoUser } {
  const users = getUsers();
  const key = data.username.toLowerCase().trim();

  if (users[key]) {
    throw new Error('Username already taken — try a different one');
  }

  const user: DemoUser = {
    id: generateId(),
    username: key,
    displayName: data.displayName,
    age: data.age,
    gender: data.gender,
    bio: '',
    createdAt: new Date().toISOString(),
    preferences: {
      preferredGender: 'any',
      minAge: 18,
      maxAge: 99,
      maxDistanceKm: 50,
    },
  };

  users[key] = { user, passwordHash: simpleHash(data.password) };
  saveUsers(users);

  const token = btoa(JSON.stringify({ id: user.id, username: key, exp: Date.now() + 7 * 86400000 }));
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, userId: user.id, username: key }));

  return { token, user };
}

export function demoLogin(username: string, password: string): { token: string; user: DemoUser } {
  const users = getUsers();
  const key = username.toLowerCase().trim();
  const record = users[key];

  if (!record) throw new Error('Username not found — check spelling or register first');
  if (record.passwordHash !== simpleHash(password)) throw new Error('Wrong password');

  const token = btoa(JSON.stringify({ id: record.user.id, username: key, exp: Date.now() + 7 * 86400000 }));
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, userId: record.user.id, username: key }));

  return { token, user: record.user };
}

export function demoGetCurrentUser(): DemoUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!session) return null;
    const users = getUsers();
    return users[session.username]?.user || null;
  } catch {
    return null;
  }
}

export function demoUpdateProfile(userId: string, updates: Partial<Pick<DemoUser, 'displayName' | 'bio'>>) {
  const users = getUsers();
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  if (!session) return;
  const record = users[session.username];
  if (!record || record.user.id !== userId) return;
  record.user = { ...record.user, ...updates };
  saveUsers(users);
  return record.user;
}

export function demoUpdatePreferences(userId: string, prefs: Partial<DemoUser['preferences']>) {
  const users = getUsers();
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  if (!session) return;
  const record = users[session.username];
  if (!record || record.user.id !== userId) return;
  record.user.preferences = { ...record.user.preferences, ...prefs };
  saveUsers(users);
  return record.user;
}

export function demoLogout() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}
