'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useMatchStore } from '@/store/matchStore';
import { Button } from '@/components/ui/button';
import { connectSocket } from '@/lib/socket';
import { toast } from 'sonner';

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { queueStatus, setQueueStatus, setMatch, setLastLocation } = useMatchStore();

  // Active user presence
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [searchingCount, setSearchingCount] = useState<number | null>(null);

  // Preload geolocation in the background the moment the page mounts.
  // By the time the user clicks the button, the position is usually ready.
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'granted' | 'denied'>('loading');

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        locationRef.current = loc;
        setLastLocation(loc); // persist in store so re-queue pages can use it
        setLocationStatus('granted');
      },
      () => setLocationStatus('denied'),
      { timeout: 5000, maximumAge: 60_000 },
    );
  }, [setLastLocation]);

  useEffect(() => {
    const socket = connectSocket();

    const onPresenceUpdate = (data: { active: number; searching?: number }) => {
      setActiveCount(data.active);
      if (data.searching !== undefined) setSearchingCount(data.searching);
    };

    // Named reference so socket.off removes exactly this handler, not all listeners
    const onMatchFound = (data: any) => {
      setMatch(data);
      toast.success('Match found! Starting voice call...');
      router.push(`/call/${data.matchId}`);
    };

    socket.on('presence:update', onPresenceUpdate);
    socket.on('match_found', onMatchFound);

    return () => {
      socket.off('presence:update', onPresenceUpdate);
      socket.off('match_found', onMatchFound);
    };
  }, [setMatch, router]);

  function handleJoinQueue() {
    // Just connect the socket and navigate — the queue page will emit join_queue
    connectSocket();
    setQueueStatus('queued');
    router.push('/queue');
  }

  function handleLeaveQueue() {
    const socket = connectSocket();
    socket.emit('leave_queue');
    setQueueStatus('idle');
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center max-w-lg mx-auto w-full">
      <div className="mb-8">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#E63946] to-[#FFD166] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-[#E63946]/20">
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

        {/* Active users indicator */}
        {activeCount !== null && activeCount > 0 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-green-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <span className="font-medium">{activeCount} {activeCount === 1 ? 'person' : 'people'} online</span>
            </div>
            {searchingCount !== null && searchingCount > 0 && (
              <span className="text-muted-foreground">
                · {searchingCount} searching
              </span>
            )}
          </div>
        )}

        {locationStatus === 'denied' && (
          <p className="text-xs text-muted-foreground mt-3 bg-muted rounded-lg px-3 py-2 inline-block">
            📍 Location denied — matching globally instead
          </p>
        )}
      </div>

      {queueStatus === 'idle' ? (
        <div className="w-full space-y-4">
          <Button
            onClick={handleJoinQueue}
            size="lg"
            className="h-16 px-12 text-lg rounded-full bg-gradient-to-r from-[#E63946] to-[#FFD166] hover:from-[#CF2F3D] hover:to-[#E6B800] text-white border-0 shadow-lg shadow-[#E63946]/30 transition-all hover:scale-105 active:scale-95 w-full"
          >
            Find Someone to Talk To
          </Button>
          <Button
            onClick={() => router.push('/rooms')}
            size="lg"
            variant="outline"
            className="h-16 px-12 text-lg rounded-full w-full"
          >
            Join Walkie Room
          </Button>
          <Button
            onClick={() => router.push('/friends')}
            size="lg"
            variant="outline"
            className="h-16 px-12 text-lg rounded-full w-full"
          >
            Call a Friend
          </Button>
        </div>
      ) : (
        <Button
          onClick={handleLeaveQueue}
          size="lg"
          variant="outline"
          className="h-16 px-12 text-lg rounded-full"
        >
          Cancel Search
        </Button>
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
