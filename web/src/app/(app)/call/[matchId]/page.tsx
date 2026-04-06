'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useMatchStore } from '@/store/matchStore';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { LiveKitRoom, useLocalParticipant } from '@livekit/components-react';
import '@livekit/components-styles';
import MiniGame from '@/components/call/MiniGame';
import CallControls from '@/components/call/CallControls';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import api from '@/lib/api';

function AudioCall({ onMuteToggle, isMuted }: { onMuteToggle: () => void; isMuted: boolean }) {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    localParticipant?.setMicrophoneEnabled(!isMuted);
  }, [isMuted, localParticipant]);

  return null;
}

export default function CallPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.matchId as string;
  const { user } = useAuthStore();
  const { livekitToken, livekitUrl, clearMatch } = useMatchStore();
  const [isMuted, setIsMuted] = useState(false);
  const [gameState, setGameState] = useState<any>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [phase, setPhase] = useState<'call' | 'post'>('call');
  const [matchedUser, setMatchedUser] = useState<any>(null);

  useEffect(() => {
    const socket = connectSocket();
    const timer = setInterval(() => setCallDuration((s) => s + 1), 1000);

    socket.on('game_state', (data: any) => setGameState(data));
    socket.on('game_update', (data: any) => setGameState(data.game));

    api.get(`/game/${matchId}`).then(({ data }) => {
      if (data) setGameState(data);
    }).catch(() => {});

    return () => {
      clearInterval(timer);
      socket.off('game_state');
      socket.off('game_update');
    };
  }, [matchId]);

  const handleAnswer = useCallback((questionId: number, answer: string) => {
    const socket = connectSocket();
    socket.emit('game_answer', { matchId, questionId, answer });
  }, [matchId]);

  const handleEndCall = useCallback((reason: string) => {
    const socket = connectSocket();
    socket.emit('end_match', { matchId, reason });
    clearMatch();
    setPhase('post');
  }, [matchId]);

  const handleRematch = () => {
    clearMatch();
    router.push('/home');
  };

  const mins = Math.floor(callDuration / 60);
  const secs = callDuration % 60;

  if (phase === 'post') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center min-h-[80vh] max-w-sm mx-auto">
        <div className="text-6xl mb-6">👋</div>
        <h2 className="text-2xl font-bold mb-2">Call ended</h2>
        <p className="text-muted-foreground mb-2">
          You talked for {mins}m {secs}s
        </p>
        {gameState?.completed && (
          <p className="text-sm text-violet-400 mb-8">
            You matched {gameState.scores[user?.id || ''] || 0}/{gameState.questions?.length} answers
          </p>
        )}
        <div className="flex flex-col gap-3 w-full">
          <Button
            onClick={handleRematch}
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
        <p className="text-muted-foreground">No active call. <button onClick={() => router.push('/home')} className="underline">Go home</button></p>
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
      <AudioCall onMuteToggle={() => setIsMuted((m) => !m)} isMuted={isMuted} />

      <div className="flex-1 flex flex-col items-center px-4 py-8 max-w-md mx-auto w-full gap-6">
        {/* Call header */}
        <div className="text-center w-full">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground bg-card border border-border rounded-full px-4 py-1.5 mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Live call · {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-pink-600 flex items-center justify-center mx-auto mb-3 text-2xl font-bold text-white shadow-lg">
            ?
          </div>
          <h2 className="font-semibold text-lg">Someone nearby</h2>
          <p className="text-sm text-muted-foreground">Voice match in progress</p>
        </div>

        {/* Sound wave visual */}
        <div className="flex items-end gap-1 h-12">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 bg-gradient-to-t from-pink-500 to-violet-500 rounded-full animate-pulse"
              style={{
                height: `${Math.random() * 100}%`,
                animationDelay: `${i * 0.05}s`,
                animationDuration: `${0.5 + Math.random() * 0.5}s`,
                minHeight: '4px',
              }}
            />
          ))}
        </div>

        {/* Mini game */}
        <div className="w-full">
          <MiniGame
            matchId={matchId}
            userId={user?.id || ''}
            gameState={gameState}
            onAnswer={handleAnswer}
          />
        </div>

        {/* Controls */}
        <div className="w-full mt-auto">
          <CallControls
            matchId={matchId}
            reportedId={matchedUser?.id || ''}
            isMuted={isMuted}
            onMuteToggle={() => setIsMuted((m) => !m)}
            onEndCall={handleEndCall}
          />
        </div>
      </div>
    </LiveKitRoom>
  );
}
