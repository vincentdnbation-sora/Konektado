'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useMatchStore } from '@/store/matchStore';
import { connectSocket } from '@/lib/socket';
import { LiveKitRoom, useLocalParticipant, useRemoteParticipants } from '@livekit/components-react';
import '@livekit/components-styles';
import CallControls from '@/components/call/CallControls';
import { Button } from '@/components/ui/button';

function AudioSetup({ isMuted }: { isMuted: boolean }) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [partnerConnected, setPartnerConnected] = useState(false);

  // Track partner connection
  useEffect(() => {
    setPartnerConnected(remoteParticipants.length > 0);
  }, [remoteParticipants]);

  // Enable mic whenever localParticipant is ready or mute changes
  useEffect(() => {
    if (!localParticipant) return;
    localParticipant.setMicrophoneEnabled(!isMuted).catch(() => {});
  }, [isMuted, localParticipant]);

  // iOS Safari audio unlock overlay
  if (!audioUnlocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
        <div className="text-center space-y-5 px-8 max-w-xs">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center mx-auto text-3xl shadow-lg shadow-pink-500/30">
            🎙️
          </div>
          <div>
            <p className="font-bold text-lg">Tap to start your call</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your browser needs a tap to activate the microphone
            </p>
          </div>
          <Button
            onClick={() => {
              // Unlock AudioContext (required on iOS Safari)
              try {
                const ctx = new AudioContext();
                ctx.resume();
              } catch {}
              setAudioUnlocked(true);
              if (localParticipant) {
                localParticipant.setMicrophoneEnabled(true).catch(() => {});
              }
            }}
            className="w-full h-14 text-lg bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white border-0"
          >
            Start Call
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Partner connection status */}
      <div className={`fixed top-20 left-0 right-0 flex justify-center z-10 transition-all duration-500 ${partnerConnected ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <div className="bg-card border border-border rounded-full px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          Waiting for partner to connect...
        </div>
      </div>
    </>
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

      <div className="flex-1 flex flex-col items-center px-4 py-8 max-w-md mx-auto w-full gap-8">
        {/* Call status */}
        <div className="text-center w-full pt-4">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-full px-4 py-1.5 mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live · {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>

          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-violet-500 to-pink-600 flex items-center justify-center mx-auto mb-4 text-4xl shadow-xl shadow-violet-500/20">
            ?
          </div>
          <h2 className="font-semibold text-xl">Someone nearby</h2>
          <p className="text-sm text-muted-foreground mt-1">Voice call in progress — just talk!</p>
        </div>

        {/* Animated sound wave */}
        <div className="flex items-end justify-center gap-1 h-16 w-full">
          {Array.from({ length: 28 }).map((_, i) => (
            <div
              key={i}
              className={`w-1.5 rounded-full ${isMuted ? 'bg-muted opacity-40' : 'bg-gradient-to-t from-pink-500 to-violet-500'}`}
              style={{
                height: `${15 + Math.random() * 85}%`,
                animation: isMuted ? 'none' : `pulse ${0.4 + Math.random() * 0.5}s ease-in-out ${i * 0.03}s infinite alternate`,
                minHeight: 4,
              }}
            />
          ))}
        </div>

        {isMuted && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400 text-center w-full">
            🔇 You are muted — tap the mic button to unmute
          </div>
        )}

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
