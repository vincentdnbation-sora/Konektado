import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Return the singleton socket. Creates it lazily.
 * IMPORTANT: The token is read fresh from localStorage on every new connection
 * attempt (via auth callback), NOT baked in at creation time. This ensures that
 * logging in/out or token rotation is always picked up.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001', {
      // Auth function is called on EVERY connect/reconnect — always sends fresh token
      auth: (cb) => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('kk_token') : null;
        cb({ token });
      },
      autoConnect: false,
      // polling first for better mobile compatibility (Safari, corporate proxies)
      // socket.io upgrades to websocket automatically after handshake
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: false,
    });

    // Connection lifecycle logging — always on so production voice issues are diagnosable
    socket.on('connect', () => console.log('[socket] connected id=' + socket?.id));
    socket.on('disconnect', (reason) => console.warn('[socket] disconnected:', reason));
    socket.on('connect_error', (err) => console.error('[socket] connect_error:', err.message));
    socket.on('reconnect_attempt', (n) => console.log('[socket] reconnect_attempt #' + n));
    socket.on('reconnect', () => console.log('[socket] reconnected id=' + socket?.id));
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    if (socket.connected) socket.disconnect();
    socket = null;
  }
}
