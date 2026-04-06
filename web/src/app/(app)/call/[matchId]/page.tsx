'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useMatchStore } from '@/store/matchStore';
import { connectSocket } from '@/lib/socket';
import { LiveKitRoom, useLocalParticipant } from '@livekit/components-react';
import '@livekit/components-styles';
import MiniGame from '@/components/call/MiniGame';
import CallControls from '@/components/call/CallControls';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function AudioSetup({ isMuted }: { isMuted: boolean }) {
  const { localParticipant } = useLocalParticipant();
  const [needsUnlock, setNeedsUnlock] = useState(false);

  useEffect(() => {
    if (!localParticipant) return;
    localParticipant.setMicrophoneEnabled(!isMuted).catch(() => {
      setNeedsUnlock(true);
    });
  }, [isMuted, localParticipant]);

  function unlockAudio() {
    // Create and immediately suspend/resume an AudioContext to unlock iOS
    const ctx = new AudioContext();
    ctx.resume().then(() => {
      setNeedsUnlock(false);
      if (localParticipant) {
        localParticipant.setMicrophoneEnabled(!isMuted).catch(() => {});
      }
    });
  }

  if (!needsUnlock) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="text-center space-y-4 px-8">
        <div className="text-4xl">🎙️</div>
        <p className="font-semibold">Tap to enable audio</p>
        <p className="text-sm text-muted-foreground">Your browser requires a tap to start the voice call</p>
        <Button onClick={unlockAudio} className="bg-gradient-to-r from-pink-500 to-violet-600 text-white border-0 px-8">
          Enable Audio
        </Button>
      </div>
    </div>
  );
}

export default function CallPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.matchId as string;
  const { user } = useAuthStore();
  const { livekitToken, livekitUrl, clearMatch } = useMatchStore();
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [phase, setPhase] = useState<'call' | 'post'>('call');

  useEffect(() => {
    const timer = setInterval(() => setCallDuration((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleEndCall = useCallback((reason: string) => {
    const socket = connectSocket();
    socket.emit('end_match', { matchId, reason });
    clearMatch();
    setPhase('post');
  }, [matchId, clearMatch]);

  const mins = Math.floor(callDuration / 60);
  const secs = callDuration % 60;

  if (phase === 'post') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center min-h-[80vh] max-w-sm mx-auto">
        <div className="text-6xl mb-6">👋</div>
        <h2 className="text-2xl font-bold mb-2">Call ended</h2>
        <p className="text-muted-foreground mb-8">
          You talked for {mins}m {secs}s
        </p>
        <div className="flex flex-col gap-3 w-full">
          <Button
            onClick={() => { clearMatch(); router.push('/home'); }}
            className="bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white border-0"
          >
            Find Another Match
          </Button>
          <Button variant="outline" onClick={() => router.push('/home')}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (!livekitToken || !livekitUrl) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No active call.</p>
          <Button onClick={() => router.push('/home')} variant="outline">Go home</Button>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={livekitToken}
      serverUrl={livekitUrl}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={() => handleEndCall('disconnected')}
    >
      <AudioSetup isMuted={isMuted} />

      <div className="flex-1 flex flex-col items-center px-4 py-6 max-w-md mx-auto w-full gap-5">
        {/* Call header */}
        <div className="text-center w-full">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-full px-4 py-1.5 mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live · {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-pink-600 flex items-center justify-center mx-auto mb-2 text-2xl shadow-lg">
            ?
          </div>
          <h2 className="font-semibold">Someone nearby</h2>
          <p className="text-xs text-muted-foreground">Voice match in progress</p>
        </div>

        {/* Sound wave */}
        <div className="flex items-end gap-0.5 h-10">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 rounded-full animate-pulse ${isMuted ? 'bg-muted' : 'bg-gradient-to-t from-pink-500 to-violet-500'}`}
              style={{
                height: `${20 + Math.random() * 80}%`,
                animationDelay: `${i * 0.04}s`,
                animationDuration: `${0.4 + Math.random() * 0.4}s`,
                minHeight: 3,
              }}
            />
          ))}
        </div>

        {/* Jump game */}
        <div className="w-full">
          <MiniGame matchId={matchId} userId={user?.id || ''} />
        </div>

        {/* Controls */}
        <div className="w-full mt-auto">
          <CallControls
            matchId={matchId}
            reportedId=""
            isMuted={isMuted}
            onMuteToggle={() => setIsMuted((m) => !m)}
            onEndCall={handleEndCall}
          />
        </div>
      </div>
    </LiveKitRoom>
  );
}
