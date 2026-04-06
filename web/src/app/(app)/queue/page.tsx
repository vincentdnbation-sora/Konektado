'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMatchStore } from '@/store/matchStore';
import { connectSocket } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function QueuePage() {
  const router = useRouter();
  const { setMatch, setQueueStatus } = useMatchStore();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    const socket = connectSocket();

    socket.on('match_found', (data: any) => {
      setMatch(data);
      toast.success('Match found!');
      router.push(`/app/call/${data.matchId}`);
    });

    return () => {
      clearInterval(timer);
      socket.off('match_found');
    };
  }, []);

  function handleCancel() {
    const socket = connectSocket();
    socket.emit('leave_queue');
    setQueueStatus('idle');
    router.push('/home');
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center min-h-[80vh]">
      {/* Animated pulse rings */}
      <div className="relative w-40 h-40 flex items-center justify-center mb-10">
        <div className="absolute inset-0 rounded-full bg-pink-500/10 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute inset-4 rounded-full bg-violet-500/10 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
        <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center shadow-xl shadow-pink-500/30">
          <svg className="w-10 h-10 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        </div>
      </div>

      <h2 className="text-3xl font-bold mb-3">Finding your match...</h2>
      <p className="text-muted-foreground text-lg mb-2">Looking for someone nearby who&apos;s ready to talk</p>
      <p className="text-2xl font-mono text-muted-foreground mb-10">
        {String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </p>

      <div className="flex flex-col gap-3 items-center text-sm text-muted-foreground mb-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Searching your area
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0.3s' }} />
          Checking preferences
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" style={{ animationDelay: '0.6s' }} />
          Preparing voice connection
        </div>
      </div>

      <Button variant="outline" onClick={handleCancel} className="rounded-full px-8">
        Cancel
      </Button>
    </div>
  );
}
