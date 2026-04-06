'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useMatchStore } from '@/store/matchStore';
import { connectSocket } from '@/lib/socket';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useRemoteParticipants,
  useConnectionState,
  useTracks,
  useRoomContext,
} from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import '@livekit/components-styles';
import CallControls from '@/components/call/CallControls';
import MiniGame from '@/components/call/MiniGame';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/**
 * Inner component — must be rendered inside <LiveKitRoom>.
 * Handles mic capture, remote audio playback, and connection status display.
 */
function CallRoom({ isMuted }: { isMuted: boolean }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const connectionState = useConnectionState();
  const partnerConnected = remoteParticipants.length > 0;

  // Track published audio tracks (local + remote) for debugging
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });

  const micEnabled = useRef(false);
  const audioStarted = useRef(false);

  // Log connection state changes
  useEffect(() => {
    console.log('[CallRoom] connectionState:', connectionState);
    console.log('[CallRoom] room state:', room?.state);
  }, [connectionState, room?.state]);

  // Log remote participants
  useEffect(() => {
    console.log('[CallRoom] remoteParticipants:', remoteParticipants.length);
    remoteParticipants.forEach((p) => {
      console.log(`[CallRoom] remote: ${p.identity} audioTracks=${p.audioTrackPublications.size}`);
    });
  }, [remoteParticipants]);

  // Log audio tracks
  useEffect(() => {
    console.log('[CallRoom] audioTracks:', audioTracks.length);
    audioTracks.forEach((t) => {
      console.log(`[CallRoom] track: participant=${t.participant.identity} source=${t.source} subscribed=${t.publication?.isSubscribed}`);
    });
  }, [audioTracks]);

  // CRITICAL: Call room.startAudio() after room is connected.
  // This is LiveKit's built-in method to handle browser autoplay restrictions.
  // It resumes AudioContext, creates audio elements, and calls play() on them.
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected || !room || audioStarted.current) return;
    audioStarted.current = true;

    console.log('[CallRoom] calling room.startAudio()...');
    room.startAudio().then(() => {
      console.log('[CallRoom] room.startAudio() success — audio playback unlocked');
    }).catch((err) => {
      console.warn('[CallRoom] room.startAudio() failed:', err);
    });
  }, [connectionState, room]);

  // Enable microphone AFTER room is connected (not during connect handshake)
  useEffect(() => {
    if (!localParticipant || micEnabled.current) return;
    if (connectionState !== ConnectionState.Connected) return;

    micEnabled.current = true;
    console.log('[CallRoom] enabling microphone...');

    localParticipant
      .setMicrophoneEnabled(true)
      .then(() => {
        console.log('[CallRoom] microphone enabled successfully');
        toast.success('Microphone active');
      })
      .catch((err) => {
        console.error('[CallRoom] mic enable failed:', err);
        toast.error('Microphone access denied — check browser permissions');
      });
  }, [localParticipant, connectionState]);

  // Handle mute/unmute
  useEffect(() => {
    if (!localParticipant || !micEnabled.current) return;
    localParticipant.setMicrophoneEnabled(!isMuted).catch(() => {});
  }, [isMuted, localParticipant]);

  const isConnecting = connectionState === ConnectionState.Connecting;
  const isConnected = connectionState === ConnectionState.Connected;
  const isDisconnected = connectionState === ConnectionState.Disconnected;

  // Handler for the "enable audio" button — calls room.startAudio() on user gesture
  const handleEnableAudio = useCallback(() => {
    if (room) {
      room.startAudio().then(() => {
        console.log('[CallRoom] manual startAudio() success');
        toast.success('Audio enabled!');
      }).catch(() => {});
    }
    // Also force-play any audio elements directly
    document.querySelectorAll('audio').forEach((el) => {
      const audio = el as HTMLAudioElement;
      if (audio.paused && audio.srcObject) {
        audio.play().catch(() => {});
      }
    });
  }, [room]);

  return (
    <div className="w-full flex flex-col items-center gap-2">
      {/* CRITICAL: RoomAudioRenderer creates <audio> elements for every remote audio track */}
      <RoomAudioRenderer />

      {/* Connection state indicator */}
      {isConnecting && (
        <div className="flex items-center gap-2 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          Connecting to voice server...
        </div>
      )}

      {isDisconnected && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          Voice disconnected
        </div>
      )}

      {isConnected && !partnerConnected && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-full px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          Waiting for partner to connect...
        </div>
      )}

      {isConnected && partnerConnected && (
        <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Partner connected — talk!
        </div>
      )}

      {/* Tap prompt — calls room.startAudio() on user gesture to bypass autoplay */}
      <button
        onClick={handleEnableAudio}
        className="bg-violet-500/10 border border-violet-500/30 rounded-xl px-5 py-3 text-sm text-violet-400 w-full text-center"
      >
        🔊 Tap here if you can&apos;t hear audio
      </button>
    </div>
  );
}

type Phase = 'call' | 'post';
type PostReason = 'user_left' | 'partner_left' | 'disconnected' | 'reported';

export default function CallPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.matchId as string;
  const { user } = useAuthStore();
  const { livekitToken, livekitUrl, partnerId, lastLocation, clearMatch, setQueueStatus } = useMatchStore();
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [phase, setPhase] = useState<Phase>('call');
  const [postReason, setPostReason] = useState<PostReason>('user_left');

  // Fix 5: guard against handleEndCall being called more than once.
  // Both 'partner_disconnected' and LiveKit's own onDisconnected can fire for the
  // same event, causing the postReason to be overwritten with the wrong value.
  const endCallCalled = useRef(false);

  // Fix 4: isMounted prevents state updates after the component navigates away.
  // handleNext clears the match token which unmounts LiveKitRoom, which fires
  // onDisconnected — without this guard it would switch to the post-call screen
  // while the router is already navigating to /queue.
  const isMounted = useRef(true);
  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  // LiveKit connection state for debugging
  const [lkConnected, setLkConnected] = useState(false);

  // Stable bar heights so the sound wave doesn't flicker on re-render
  const barHeights = useRef<number[]>(
    Array.from({ length: 28 }, () => 15 + Math.random() * 85),
  );

  useEffect(() => {
    const timer = setInterval(() => setCallDuration((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const socket = connectSocket();

    const onPartnerDisconnected = () => {
      if (!isMounted.current || endCallCalled.current) return;
      endCallCalled.current = true;
      toast('Your partner left the call', { description: 'Find someone new?' });
      clearMatch();
      setPostReason('partner_left');
      setPhase('post');
    };

    socket.on('partner_disconnected', onPartnerDisconnected);

    return () => {
      socket.off('partner_disconnected', onPartnerDisconnected);
    };
  }, [clearMatch]);

  // Fix 5: endCallCalled ref ensures this runs at most once per call session.
  const handleEndCall = useCallback(
    (reason: string) => {
      if (!isMounted.current || endCallCalled.current) return;
      endCallCalled.current = true;
      connectSocket().emit('end_match', { matchId, reason });
      clearMatch();
      setPostReason(reason as PostReason);
      setPhase('post');
    },
    [matchId, clearMatch],
  );

  /** End call + immediately re-enter queue (Omegle-style "Next").
   *  Fix 4: set isMounted = false BEFORE clearMatch so that the LiveKitRoom
   *  unmount cycle (token → null → LiveKitRoom unmounts → onDisconnected fires)
   *  doesn't switch to the post-call screen while we're navigating away. */
  const handleNext = useCallback(() => {
    // Prevent any callbacks from firing state updates after we navigate
    isMounted.current = false;
    endCallCalled.current = true;

    const socket = connectSocket();
    socket.emit('next_match', {
      matchId,
      // Fix 3 (frontend side): include lat/lng so the server's joinQueue
      // can store accurate location data for this user.
      lat: lastLocation?.lat,
      lng: lastLocation?.lng,
      preferences: user?.preferences || {},
    });
    clearMatch();
    setQueueStatus('queued');
    router.push('/queue');
  }, [matchId, clearMatch, setQueueStatus, router, user, lastLocation]);

  /** "Find Another Match" from post-call screen — goes straight to queue. */
  const handleFindAnother = useCallback(() => {
    const socket = connectSocket();
    socket.emit('join_queue', {
      lat: lastLocation?.lat,
      lng: lastLocation?.lng,
      preferences: user?.preferences || {},
    });
    clearMatch();
    setQueueStatus('queued');
    router.push('/queue');
  }, [clearMatch, setQueueStatus, router, user, lastLocation]);

  const mins = Math.floor(callDuration / 60);
  const secs = callDuration % 60;

  if (phase === 'post') {
    const partnerLeft = postReason === 'partner_left';
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center min-h-[80vh] max-w-sm mx-auto">
        <div className="text-6xl mb-6">{partnerLeft ? '👋' : '✌️'}</div>
        <h2 className="text-2xl font-bold mb-2">
          {partnerLeft ? 'Partner left' : 'Call ended'}
        </h2>
        <p className="text-muted-foreground mb-8">
          You talked for {mins}m {secs}s
        </p>
        <div className="flex flex-col gap-3 w-full">
          <Button
            onClick={handleFindAnother}
            className="bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white border-0"
          >
            Find Another Match
          </Button>
          <Button variant="outline" onClick={() => { clearMatch(); router.push('/home'); }}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (!livekitToken || !livekitUrl) {
    console.warn('[CallPage] no livekitToken or livekitUrl', { livekitToken: !!livekitToken, livekitUrl });
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No active call.</p>
          <Button onClick={() => router.push('/home')} variant="outline">Go home</Button>
        </div>
      </div>
    );
  }

  console.log('[CallPage] rendering LiveKitRoom', {
    serverUrl: livekitUrl,
    tokenLength: livekitToken?.length,
    tokenPrefix: livekitToken?.substring(0, 20),
  });

  return (
    <LiveKitRoom
      token={livekitToken}
      serverUrl={livekitUrl}
      connect={true}
      audio={false}
      video={false}
      options={{
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      }}
      onConnected={() => {
        setLkConnected(true);
        console.log('[LiveKit] connected to room successfully');
        toast.success('Voice connected!');
      }}
      onError={(err) => {
        console.error('[LiveKit] room error:', err);
        toast.error(`Voice error: ${err?.message || 'unknown'}`);
      }}
      onDisconnected={() => {
        console.log('[LiveKit] disconnected from room');
        handleEndCall('disconnected');
      }}
    >
      <div className="flex-1 flex flex-col items-center px-4 py-8 max-w-md mx-auto w-full gap-6">
        {/* Live timer */}
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

        {/* Partner status + audio renderer */}
        <CallRoom isMuted={isMuted} />

        {/* Fix 1: Mini-game — was never rendered, game events from server went unhandled */}
        <div className="w-full">
          <MiniGame matchId={matchId} userId={user?.id ?? ''} />
        </div>

        {/* Sound wave visualizer */}
        <div className="flex items-end justify-center gap-1 h-12 w-full">
          {barHeights.current.map((h, i) => (
            <div
              key={i}
              className={`w-1.5 rounded-full ${isMuted ? 'bg-muted/40' : 'bg-gradient-to-t from-pink-500 to-violet-500'}`}
              style={{
                height: `${h}%`,
                animation: isMuted ? 'none' : `pulse ${0.4 + (i % 5) * 0.1}s ease-in-out ${i * 0.03}s infinite alternate`,
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
            reportedId={partnerId ?? ''}
            isMuted={isMuted}
            onMuteToggle={() => setIsMuted((m) => !m)}
            onEndCall={handleEndCall}
            onNext={handleNext}
          />
        </div>

        {/* Debug panel — visible to help diagnose voice issues */}
        <div className="w-full mt-4 p-3 bg-card/50 border border-border rounded-lg text-xs text-muted-foreground space-y-1 font-mono">
          <p>LK URL: {livekitUrl}</p>
          <p>Token: {livekitToken ? `${livekitToken.substring(0, 20)}... (${livekitToken.length} chars)` : 'MISSING'}</p>
          <p>LK Connected: {lkConnected ? 'YES' : 'NO'}</p>
          <p>Match: {matchId?.substring(0, 8)}</p>
        </div>
      </div>
    </LiveKitRoom>
  );
}
