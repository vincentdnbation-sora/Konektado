'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRoomStore, RoomUser } from '@/store/roomStore';
import { Button } from '@/components/ui/button';
import { connectSocket } from '@/lib/socket';
import { toast } from 'sonner';

interface Room {
  roomId: string;
  users: RoomUser[];
  maxUsers: number;
  createdAt: number;
}

export default function RoomsPage() {
  const router = useRouter();
  const { setRoom, setUserProfiles } = useRoomStore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const socket = connectSocket();

    const handleRoomList = (data: { rooms: Room[] }) => {
      setRooms(data.rooms);
      setLoading(false);
      // Cache all user profiles from existing rooms
      const allUsers = data.rooms.flatMap(r => r.users);
      if (allUsers.length > 0) setUserProfiles(allUsers);
    };

    const handleRoomUpdate = (data: { rooms: Room[] }) => {
      setRooms(data.rooms);
      const allUsers = data.rooms.flatMap(r => r.users);
      if (allUsers.length > 0) setUserProfiles(allUsers);
    };

    const handleRoomCreated = (data: { roomId: string; token: string }) => {
      toast.success('Room created!');
      setRoom(data);
      router.push(`/room/${data.roomId}`);
    };

    const handleRoomJoined = (data: { roomId: string; token: string }) => {
      toast.success('Joined room!');
      setRoom(data);
      router.push(`/room/${data.roomId}`);
    };

    const handleRoomError = (data: { message: string }) => {
      toast.error(data.message);
    };

    socket.emit('room:list');
    socket.on('room:list', handleRoomList);
    socket.on('room:update', handleRoomUpdate);
    socket.on('room:created', handleRoomCreated);
    socket.on('room:joined', handleRoomJoined);
    socket.on('room:error', handleRoomError);

    return () => {
      socket.off('room:list', handleRoomList);
      socket.off('room:update', handleRoomUpdate);
      socket.off('room:created', handleRoomCreated);
      socket.off('room:joined', handleRoomJoined);
      socket.off('room:error', handleRoomError);
    };
  }, [router, setRoom, setUserProfiles]);

  const handleCreateRoom = () => {
    const socket = connectSocket();
    socket.emit('room:create');
  };

  const handleJoinRoom = (roomId: string) => {
    const socket = connectSocket();
    socket.emit('room:join', { roomId });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center max-w-lg mx-auto w-full">
      <div className="mb-8">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#457B9D] to-[#A8DADC] flex items-center justify-center mx-auto mb-6 shadow-lg">
          <span className="text-4xl">📻</span>
        </div>
        <h1 className="text-3xl font-bold mb-3">Walkie Rooms</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Join a group voice room with up to 5 people.
        </p>
      </div>

      <Button
        onClick={handleCreateRoom}
        size="lg"
        className="h-16 px-12 text-lg rounded-full bg-gradient-to-r from-[#457B9D] to-[#A8DADC] hover:from-[#3A6B8C] hover:to-[#8FC1D4] text-white border-0 shadow-lg mb-8 w-full"
      >
        Create New Room
      </Button>

      <div className="w-full">
        <h2 className="text-xl font-semibold mb-4">Available Rooms</h2>
        {loading ? (
          <p>Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <p className="text-muted-foreground">No rooms available. Create one!</p>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => (
              <div key={room.roomId} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Room {room.roomId.slice(-6)}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {room.users.slice(0, 5).map(u => (
                      <span key={u.userId} className="text-lg" title={u.displayName}>
                        {u.avatar || '👤'}
                      </span>
                    ))}
                    <span className="text-sm text-muted-foreground ml-1">
                      {room.users.length}/{room.maxUsers}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={() => handleJoinRoom(room.roomId)}
                  disabled={room.users.length >= room.maxUsers}
                  variant="outline"
                >
                  Join
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
