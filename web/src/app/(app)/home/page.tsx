'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useMatchStore } from '@/store/matchStore';
import { Button } from '@/components/ui/button';
import { connectSocket } from '@/lib/socket';
import { toast } from 'sonner';

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { queueStatus, setQueueStatus, setMatch } = useMatchStore();
  const [locationStatus, setLocationStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');

  useEffect(() => {
    const socket = connectSocket();

    socket.on('queue_status', ({ status }: { status: string }) => {
      if (status === 'queued') setQueueStatus('queued');
      if (status === 'left') setQueueStatus('idle');
    });

    socket.on('partner_disconnected', (data: any) => {
      toast.error('Your partner disconnected. Finding someone new...');
      // Automatically re-queue
      joinWithLocation();
    });

    socket.on('match_ready', (data: any) => {
      // Update match with real tokens
      setMatch({
        matchId: data.matchId,
        token: data.token,
      });
    });

    return () => {
      socket.off('queue_status');
      socket.off('match_found');
    };
  }, []);

  function joinWithLocation(lat?: number, lng?: number) {
    const socket = connectSocket();
    socket.emit('join_queue', {
      lat,
      lng,
      preferences: user?.preferences || {},
    });
    // Don't navigate immediately - stay on home page with searching state
    // Navigation will happen when match_found event is received
  }

  function handleJoinQueue() {
    // Immediately set searching state - no navigation delay
    setQueueStatus('queued');

    if (!navigator.geolocation) {
      joinWithLocation();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationStatus('granted');
        joinWithLocation(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocationStatus('denied');
        joinWithLocation();
      },
      { timeout: 1000 }, // Faster timeout for instant feel
    );
  }

  function handleLeaveQueue() {
    const socket = connectSocket();
    socket.emit('leave_queue');
    setQueueStatus('idle');
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center max-w-lg mx-auto w-full">
      <div className="mb-8">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-pink-500/20">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold mb-3">
          Hey, {user?.profile?.displayName || 'there'} 👋
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Ready to meet someone new? Press the button and we'll find someone to talk to.
        </p>
        {locationStatus === 'denied' && (
          <p className="text-xs text-muted-foreground mt-3 bg-muted rounded-lg px-3 py-2 inline-block">
            📍 Location denied — matching globally instead
          </p>
        )}
      </div>

      {queueStatus === 'idle' ? (
        <Button
          onClick={handleJoinQueue}
          size="lg"
          className="h-16 px-12 text-lg rounded-full bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white border-0 shadow-lg shadow-pink-500/30 transition-all hover:scale-105 active:scale-95"
        >
          Find Someone to Talk To
        </Button>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-20 h-20 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-pink-500/10 animate-ping" style={{ animationDuration: '1s' }} />
            <div className="absolute inset-2 rounded-full bg-violet-500/10 animate-ping" style={{ animationDuration: '1s', animationDelay: '0.3s' }} />
            <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center shadow-xl shadow-pink-500/30">
              <svg className="w-6 h-6 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-2">Finding your match...</h3>
            <p className="text-muted-foreground text-sm">Looking for someone ready to talk</p>
          </div>
          <Button
            onClick={handleLeaveQueue}
            size="lg"
            variant="outline"
            className="rounded-full px-8"
          >
            Cancel
          </Button>
        </div>
      )}

      <div className="mt-12 grid grid-cols-3 gap-4 w-full text-sm text-muted-foreground">
        {[
          { label: 'Voice first', icon: '🎙️' },
          { label: locationStatus === 'denied' ? 'Global match' : 'Nearby people', icon: '📍' },
          { label: 'Safe & private', icon: '🔒' },
        ].map(({ label, icon }) => (
          <div key={label} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4">
            <span className="text-2xl">{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
