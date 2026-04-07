'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFriendCallStore } from '@/store/friendCallStore';
import { connectSocket } from '@/lib/socket';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useRemoteParticipants,
  useConnectionState,
} from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import '@livekit/components-styles';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function FriendCallPage() {
  const params = useParams();
  const router = useRouter();
  const roomName = params.roomName as string;
  const { roomName: storeRoomName, token, livekitUrl, clearCall } = useFriendCallStore();

  useEffect(() => {
    if (storeRoomName !== roomName) {
      router.push('/friends');
      return;
    }

    const socket = connectSocket();

    const handleFriendEnded = () => {
      toast.info('Call ended');
      clearCall();
      router.push('/friends');
    };

    socket.on('friend:ended', handleFriendEnded);

    return () => {
      socket.off('friend:ended', handleFriendEnded);
    };
  }, [roomName, storeRoomName, router, clearCall]);

  const handleEndCall = () => {
    const socket = connectSocket();
    socket.emit('friend:end', { roomName });
    clearCall();
    router.push('/friends');
  };

  if (!token || !livekitUrl) {
    return <div className="h-screen flex items-center justify-center">Connecting to call...</div>;
  }

  return (
    <div className="h-screen flex flex-col">
      <LiveKitRoom
        token={token}
        serverUrl={livekitUrl}
        connect={true}
        audio={true}
        video={false}
        className="flex-1"
      >
        <FriendCallContent onEnd={handleEndCall} />
      </LiveKitRoom>
    </div>
  );
}

function FriendCallContent({ onEnd }: { onEnd: () => void }) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const connectionState = useConnectionState();

  const allParticipants = [localParticipant, ...remoteParticipants];

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">📞</span>
          <span className="font-semibold">Friend Call</span>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${
          connectionState === ConnectionState.Connected ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
        }`}>
          {connectionState === ConnectionState.Connected ? 'Connected' : 'Connecting...'}
        </span>
      </div>

      {/* Participants */}
      <div className="flex-1 flex items-center justify-center gap-12">
        {allParticipants.slice(0, 2).map((participant, i) => (
          <div key={participant.identity} className="flex flex-col items-center gap-3">
            <div className="w-28 h-28 rounded-full bg-gray-700 flex items-center justify-center text-5xl shadow-lg">
              👤
            </div>
            <p className="text-gray-300 text-sm">
              {i === 0 ? 'You' : participant.identity.slice(0, 10)}
            </p>
          </div>
        ))}

        {remoteParticipants.length === 0 && (
          <div className="absolute text-gray-500 text-sm">Waiting for friend to join...</div>
        )}
      </div>

      {/* End call button */}
      <div className="p-6 flex justify-center border-t border-gray-700">
        <Button
          onClick={onEnd}
          variant="destructive"
          size="lg"
          className="rounded-full px-12"
        >
          End Call
        </Button>
      </div>

      <RoomAudioRenderer />
    </div>
  );
}
