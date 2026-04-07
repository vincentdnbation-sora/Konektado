'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMatchStore } from '@/store/matchStore';
import { useAuthStore } from '@/store/authStore';
import { connectSocket } from '@/lib/socket';
import { Button } from '@/components/ui/button';

const RESET_TIMEOUT_SECONDS = 20;

export default function QueuePage() {
  const router = useRouter();
  const { setMatch, setQueueStatus, queueStatus, clearMatch } = useMatchStore();
  const { user } = useAuthStore();
  const [seconds, setSeconds] = useState(0);
  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const joinedRef = useRef(false);
  const matchFoundRef = useRef(false);

  // Show reset button after 20 seconds
  useEffect(() => {
    if (seconds >= RESET_TIMEOUT_SECONDS && !showReset && !matchFoundRef.current) {
      setShowReset(true);
    }
  }, [seconds, showReset]);

  const handleResetQueue = useCallback(() => {
    console.log('[QueuePage] reset_queue requested');
    setResetting(true);
    setShowReset(false);

    const socket = connectSocket();
    socket.emit('reset_queue', {
      lat: useMatchStore.getState().lastLocation?.lat,
      lng: useMatchStore.getState().lastLocation?.lng,
      preferences: user?.preferences || {},
    });

    // Reset timer
    setSeconds(0);
    setTimeout(() => setResetting(false), 1000);
  }, [user]);

  // On mount: always (re-)emit join_queue to ensure server-side queue state
  useEffect(() => {
    const socket = connectSocket();

    // Clear any stale match state from a previous session
    const { matchId: staleMatchId } = useMatchStore.getState();
    if (staleMatchId) {
      console.log('[QueuePage] clearing stale matchId from previous session:', staleMatchId);
      clearMatch();
    }

    function emitJoin() {
      if (joinedRef.current || matchFoundRef.current) return;
      joinedRef.current = true;
      socket.emit('join_queue', {
        lat: useMatchStore.getState().lastLocation?.lat,
        lng: useMatchStore.getState().lastLocation?.lng,
        preferences: user?.preferences || {},
      });
      setQueueStatus('queued');
    }

    const onConnect = () => {
      joinedRef.current = false;
      emitJoin();
    };

    const onMatchFound = (data: any) => {
      if (matchFoundRef.current) return;
      matchFoundRef.current = true;
      console.log('[QueuePage] match_found received', {
        matchId: data.matchId,
        roomName: data.roomName,
        tokenLen: data.token?.length,
        livekitUrl: data.livekitUrl,
        partnerId: data.partnerId,
      });
      setMatch(data);
      router.push(`/call/${data.matchId}`);
    };

    const onQueueStatus = ({ status, message }: { status: string; message?: string }) => {
      console.log('[QueuePage] queue_status:', status, message);
      if (status === 'left') {
        setQueueStatus('idle');
        router.push('/home');
      } else if (status === 'error') {
        console.error('[QueuePage] queue error:', message);
        // Don't immediately redirect on error — let user retry
      } else if (status === 'queued') {
        setQueueStatus('queued');
      }
    };

    socket.on('connect', onConnect);
    socket.on('match_found', onMatchFound);
    socket.on('queue_status', onQueueStatus);

    if (socket.connected) {
      emitJoin();
    }

    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);

    return () => {
      clearInterval(timer);
      socket.off('connect', onConnect);
      socket.off('match_found', onMatchFound);
      socket.off('queue_status', onQueueStatus);
    };
  }, [setMatch, setQueueStatus, clearMatch, router, user]);

  function handleCancel() {
    const socket = connectSocket();
    socket.emit('leave_queue');
    clearMatch();
    setQueueStatus('idle');
    router.push('/home');
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center min-h-[80vh]">
      {/* Pulsing animation */}
      <div className="relative w-40 h-40 flex items-center justify-center mb-10">
        <div className="absolute inset-0 rounded-full bg-[#E63946]/10 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute inset-4 rounded-full bg-[#FFD166]/10 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-[#E63946] to-[#FFD166] flex items-center justify-center shadow-xl shadow-[#E63946]/30">
          <svg className="w-10 h-10 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        </div>
      </div>

      <h2 className="text-3xl font-bold mb-3">Finding your match...</h2>
      <p className="text-muted-foreground text-lg mb-2">Looking for someone ready to talk</p>
      <p className="text-2xl font-mono text-muted-foreground mb-10">
        {String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </p>

      <div className="flex flex-col gap-3 items-center text-sm text-muted-foreground mb-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Searching for matches
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0.3s' }} />
          Checking preferences
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#FFD166] animate-pulse" style={{ animationDelay: '0.6s' }} />
          Preparing voice connection
        </div>
      </div>

      {/* 20-second no-match reset */}
      {showReset && !resetting && (
        <div className="mb-6 w-full max-w-xs space-y-3">
          <p className="text-sm text-muted-foreground">No match yet. Refresh your place in queue?</p>
          <div className="flex gap-2">
            <Button
              onClick={handleResetQueue}
              className="flex-1 bg-gradient-to-r from-[#E63946] to-[#FFD166] hover:from-[#CF2F3D] hover:to-[#E6B800] text-white border-0"
            >
              Reset Queue
            </Button>
            <Button variant="outline" onClick={() => setShowReset(false)} className="flex-1">
              Continue Waiting
            </Button>
          </div>
        </div>
      )}

      {resetting && (
        <div className="mb-6 flex items-center gap-2 text-sm text-[#E63946]">
          <div className="w-2 h-2 rounded-full bg-[#E63946] animate-pulse" />
          Refreshing your place in queue...
        </div>
      )}

      <Button variant="outline" onClick={handleCancel} className="rounded-full px-8">
        Cancel
      </Button>
    </div>
  );
}
