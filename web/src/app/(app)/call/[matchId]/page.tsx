'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useMatchStore } from '@/store/matchStore';
import { connectSocket } from '@/lib/socket';
import { LiveKitRoom, useLocalParticipant, useRemoteParticipants } from '@livekit/components-react';
import '@livekit/components-styles';
import CallControls from '@/components/call/CallControls';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function CallRoom({ isMuted, onMuteChange }: { isMuted: boolean; onMuteChange: (v: boolean) => void }) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const partnerConnected = remoteParticipants.length > 0;
  const micEnabled = useRef(false);

  // Enable mic as soon as localParticipant is available — no tap required
  useEffect(() => {
    if (!localParticipant || micEnabled.current) return;
    micEnabled.current = true;

    // Unlock AudioContext first (needed on iOS Safari)
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctx.resume();
    } catch {}

    localParticipant.setMicrophoneEnabled(true).catch(() => {});
  }, [localParticipant]);

  // Sync mute state
  useEffect(() => {
    if (!localParticipant || !micEnabled.current) return;
    localParticipant.setMicrophoneEnabled(!isMuted).catch(() => {});
  }, [isMuted, localParticipant]);

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {!partnerConnected && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-full px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          Connecting partner...
        </div>
      )}
      {partnerConnected && (
        <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Partner connected — just talk!
        </div>
      )}
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

  useEffect(() => {
    const socket = connectSocket();
    socket.on('partner_disconnected', (data: any) => {
      toast.error('Your partner disconnected');
      clearMatch();
      router.push('/home');
    });
    return () => {
      socket.off('partner_disconnected');
    };
  }, [clearMatch, router]);

  const handleNextMatch = useCallback(() => {
    // End current match and immediately join queue
    connectSocket().emit('end_match', { matchId, reason: 'next_match' });
    clearMatch();
    // Immediately join queue again - no navigation to home
    const socket = connectSocket();
    socket.emit('join_queue', {
      lat: undefined, // Will fallback to global
      lng: undefined,
      preferences: user?.preferences || {},
    });
    // Navigate to home to show searching state
    router.push('/home');
  }, [matchId, clearMatch, user?.preferences, router]);

  const handleEndCall = useCallback((reason: string) => {
    connectSocket().emit('end_match', { matchId, reason });
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
        <p className="text-muted-foreground mb-8">You talked for {mins}m {secs}s</p>
        <div className="flex flex-col gap-3 w-full">
          <Button
            onClick={() => { clearMatch(); router.push('/home'); }}
            className="bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white border-0"
          >
            Find Another Match
          </Button>
          <Button variant="outline" onClick={() => router.push('/home')}>Go Home</Button>
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
      options={{
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      }}
      onDisconnected={() => handleEndCall('disconnected')}
    >
      <div className="flex-1 flex flex-col items-center px-4 py-8 max-w-md mx-auto w-full gap-8">
        {/* Live indicator */}
        <div className="text-center w-full">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-full px-4 py-1.5 mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>

          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-500 to-pink-600 flex items-center justify-center mx-auto mb-4 text-4xl shadow-xl shadow-violet-500/20">
            ?
          </div>
          <h2 className="font-semibold text-xl">Someone nearby</h2>
        </div>

        {/* Partner status */}
        <CallRoom isMuted={isMuted} onMuteChange={setIsMuted} />

        {/* Sound wave */}
        <div className="flex items-end justify-center gap-1 h-16 w-full">
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 rounded-full ${isMuted ? 'bg-muted/40' : 'bg-gradient-to-t from-pink-500 to-violet-500'}`}
              style={{
                height: `${15 + Math.random() * 85}%`,
                animation: isMuted ? 'none' : `pulse ${0.4 + Math.random() * 0.5}s ease-in-out ${i * 0.03}s infinite alternate`,
                minHeight: 4,
              }}
            />
          ))}
        </div>

        {isMuted && (
          <button
            onClick={() => setIsMuted(false)}
            className="bg-red-500/10 border border-red-500/30 rounded-xl px-5 py-3 text-sm text-red-400 w-full text-center"
          >
            🔇 You are muted — tap to unmute
          </button>
        )}

        <div className="w-full mt-auto">
          <CallControls
            matchId={matchId}
            reportedId=""
            isMuted={isMuted}
            onMuteToggle={() => setIsMuted((m) => !m)}
            onEndCall={handleEndCall}
            onNextMatch={handleNextMatch}
          />
        </div>
      </div>
    </LiveKitRoom>
  );
}
