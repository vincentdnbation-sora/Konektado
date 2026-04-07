'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useRoomStore } from '@/store/roomStore';
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

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const { user } = useAuthStore();
  const { roomId: storeRoomId, token, livekitUrl, clearRoom } = useRoomStore();

  useEffect(() => {
    if (storeRoomId !== roomId) {
      router.push('/rooms');
      return;
    }

    const socket = connectSocket();

    const handleRoomLeft = () => {
      toast.info('Left room');
      clearRoom();
      router.push('/rooms');
    };

    socket.on('room:left', handleRoomLeft);

    return () => {
      socket.off('room:left', handleRoomLeft);
    };
  }, [roomId, storeRoomId, router, clearRoom]);

  const handleLeaveRoom = () => {
    const socket = connectSocket();
    socket.emit('room:leave');
    clearRoom();
    router.push('/rooms');
  };

  if (!token || !livekitUrl) {
    return <div className="h-screen flex items-center justify-center">Loading room...</div>;
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1">
        <LiveKitRoom
          token={token}
          serverUrl={livekitUrl}
          connect={true}
          audio={true}
          video={false}
        >
          <RoomContent roomId={roomId} onLeave={handleLeaveRoom} myUserId={user?.id || ''} />
        </LiveKitRoom>
      </div>
    </div>
  );
}

function RoomContent({ roomId, onLeave, myUserId }: { roomId: string; onLeave: () => void; myUserId: string }) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const connectionState = useConnectionState();
  const { userProfiles, setUserProfiles } = useRoomStore();
  const { user } = useAuthStore();

  // Listen for room:update to refresh profiles
  useEffect(() => {
    const socket = connectSocket();
    const handleRoomUpdate = (data: { rooms: Array<{ roomId: string; users: Array<{ userId: string; displayName: string; avatar: string }> }> }) => {
      const thisRoom = data.rooms.find(r => r.roomId === roomId);
      if (thisRoom) setUserProfiles(thisRoom.users);
    };
    socket.on('room:update', handleRoomUpdate);
    return () => { socket.off('room:update', handleRoomUpdate); };
  }, [roomId, setUserProfiles]);

  const allParticipants = [localParticipant, ...remoteParticipants];

  function getAvatar(identity: string): string {
    if (identity === myUserId) return user?.profile?.avatar || '👤';
    return userProfiles[identity]?.avatar || '👤';
  }

  function getDisplayName(identity: string): string {
    if (identity === myUserId) return user?.profile?.displayName || 'You';
    return userProfiles[identity]?.displayName || identity.slice(0, 8);
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">📻</span>
          <span className="font-semibold">Room {roomId.slice(-6)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full ${
            connectionState === ConnectionState.Connected ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
          }`}>
            {connectionState === ConnectionState.Connected ? 'Live' : 'Connecting...'}
          </span>
          <Button onClick={onLeave} variant="destructive" size="sm" className="rounded-full">
            Leave
          </Button>
        </div>
      </div>

      {/* Participant grid */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 max-w-md w-full">
          {allParticipants.slice(0, 5).map((participant) => (
            <div key={participant.identity} className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center text-4xl shadow-lg">
                {getAvatar(participant.identity)}
              </div>
              <p className="text-sm text-gray-300 text-center truncate w-full">
                {getDisplayName(participant.identity)}
                {participant.identity === myUserId && (
                  <span className="ml-1 text-xs text-gray-500">(you)</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer with leave button */}
      <div className="p-6 flex justify-center border-t border-gray-700">
        <Button
          onClick={onLeave}
          variant="destructive"
          size="lg"
          className="rounded-full px-12"
        >
          Leave Room
        </Button>
      </div>

      <RoomAudioRenderer />
    </div>
  );
}
