'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useMatchStore } from '@/store/matchStore';
import { Button } from '@/components/ui/button';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { toast } from 'sonner';

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { queueStatus, setQueueStatus, setMatch } = useMatchStore();

  useEffect(() => {
    const socket = connectSocket();

    socket.on('queue_status', ({ status }: { status: string }) => {
      if (status === 'queued') setQueueStatus('queued');
      if (status === 'left') setQueueStatus('idle');
    });

    socket.on('match_found', (data: any) => {
      setMatch(data);
      toast.success('Match found! Starting voice call...');
      router.push(`/app/call/${data.matchId}`);
    });

    return () => {
      socket.off('queue_status');
      socket.off('match_found');
    };
  }, []);

  function handleJoinQueue() {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported by your browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const socket = connectSocket();
        socket.emit('join_queue', {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          preferences: user?.preferences || {},
        });
        setQueueStatus('queued');
        router.push('/queue');
      },
      () => toast.error('Please allow location access to match with nearby people'),
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
          Hey, {user?.displayName || 'there'} 👋
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Ready to meet someone new? Press the button and we&apos;ll find someone nearby to talk to.
        </p>
      </div>

      {queueStatus === 'idle' ? (
        <Button
          onClick={handleJoinQueue}
          size="lg"
          className="h-16 px-12 text-lg rounded-full bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white border-0 shadow-lg shadow-pink-500/30 transition-all hover:scale-105"
        >
          Find Someone to Talk To
        </Button>
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
          { label: 'Nearby people', icon: '📍' },
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
