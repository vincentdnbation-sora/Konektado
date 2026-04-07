'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFriendCallStore } from '@/store/friendCallStore';
import { Button } from '@/components/ui/button';
import { connectSocket } from '@/lib/socket';
import { toast } from 'sonner';

interface Friend {
  id: string;
  displayName: string;
  avatar: string;
}

interface IncomingCall {
  callerId: string;
  callerName: string;
  callerAvatar: string;
  roomName: string;
}

export default function FriendsPage() {
  const router = useRouter();
  const { setCall } = useFriendCallStore();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [calling, setCalling] = useState<string | null>(null);

  useEffect(() => {
    const socket = connectSocket();

    const handleFriendList = (data: { friends: Friend[] }) => {
      setFriends(data.friends);
      setLoading(false);
    };

    const handleFriendAdd = (data: { success: boolean }) => {
      if (data.success) {
        toast.success('Friend added!');
        socket.emit('friend:list');
      } else {
        toast.error('Failed to add friend');
      }
    };

    const handleFriendRemove = (data: { success: boolean }) => {
      if (data.success) {
        toast.success('Friend removed!');
        socket.emit('friend:list');
      } else {
        toast.error('Failed to remove friend');
      }
    };

    // Caller: server confirmed the call started, navigate to the call page
    const handleFriendCalling = (data: { roomName: string; token: string; livekitUrl?: string }) => {
      setCall(data);
      setCalling(null);
      router.push(`/friend-call/${data.roomName}`);
    };

    // Callee: incoming call notification — show accept/reject UI
    const handleFriendIncoming = (data: IncomingCall) => {
      setIncomingCall(data);
    };

    // Callee: call was accepted, join the room
    const handleFriendAccepted = (data: { roomName: string; token: string; livekitUrl?: string }) => {
      setIncomingCall(null);
      setCall(data);
      router.push(`/friend-call/${data.roomName}`);
    };

    // Caller: callee rejected — show toast
    const handleFriendRejected = () => {
      setCalling(null);
      toast.error('Friend declined the call');
    };

    // Either party: call ended
    const handleFriendEnded = () => {
      setIncomingCall(null);
      setCalling(null);
    };

    const handleFriendError = (data: { message: string }) => {
      toast.error(data.message);
      setCalling(null);
    };

    socket.emit('friend:list');
    socket.on('friend:list', handleFriendList);
    socket.on('friend:add', handleFriendAdd);
    socket.on('friend:remove', handleFriendRemove);
    socket.on('friend:calling', handleFriendCalling);
    socket.on('friend:incoming', handleFriendIncoming);
    socket.on('friend:accepted', handleFriendAccepted);
    socket.on('friend:rejected', handleFriendRejected);
    socket.on('friend:ended', handleFriendEnded);
    socket.on('friend:error', handleFriendError);

    return () => {
      socket.off('friend:list', handleFriendList);
      socket.off('friend:add', handleFriendAdd);
      socket.off('friend:remove', handleFriendRemove);
      socket.off('friend:calling', handleFriendCalling);
      socket.off('friend:incoming', handleFriendIncoming);
      socket.off('friend:accepted', handleFriendAccepted);
      socket.off('friend:rejected', handleFriendRejected);
      socket.off('friend:ended', handleFriendEnded);
      socket.off('friend:error', handleFriendError);
    };
  }, [router, setCall]);

  const handleCallFriend = (friendId: string) => {
    const socket = connectSocket();
    setCalling(friendId);
    socket.emit('friend:call', { friendId });
  };

  const handleAcceptCall = () => {
    if (!incomingCall) return;
    const socket = connectSocket();
    socket.emit('friend:accept', { roomName: incomingCall.roomName });
  };

  const handleRejectCall = () => {
    if (!incomingCall) return;
    const socket = connectSocket();
    socket.emit('friend:reject', { roomName: incomingCall.roomName });
    setIncomingCall(null);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center max-w-lg mx-auto w-full">
      {/* Incoming call overlay */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
          <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-sm text-center space-y-6 shadow-2xl">
            <div className="text-6xl">{incomingCall.callerAvatar || '👤'}</div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Incoming call from</p>
              <p className="text-xl font-bold">{incomingCall.callerName}</p>
            </div>
            <div className="flex gap-4">
              <Button
                onClick={handleRejectCall}
                variant="destructive"
                className="flex-1 rounded-full"
                size="lg"
              >
                Decline
              </Button>
              <Button
                onClick={handleAcceptCall}
                className="flex-1 rounded-full bg-green-500 hover:bg-green-600 text-white border-0"
                size="lg"
              >
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#2A9D8F] to-[#E9C46A] flex items-center justify-center mx-auto mb-6 shadow-lg">
          <span className="text-4xl">👥</span>
        </div>
        <h1 className="text-3xl font-bold mb-3">Friends</h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Call your friends for private voice chats.
        </p>
      </div>

      <div className="w-full">
        {loading ? (
          <p>Loading friends...</p>
        ) : friends.length === 0 ? (
          <div className="space-y-3">
            <p className="text-muted-foreground">No friends yet.</p>
            <p className="text-sm text-muted-foreground">
              You can add friends from the call screen after matching with someone.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {friends.map((friend) => (
              <div key={friend.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{friend.avatar || '👤'}</span>
                  <p className="font-medium">{friend.displayName}</p>
                </div>
                <Button
                  onClick={() => handleCallFriend(friend.id)}
                  disabled={calling !== null}
                  variant={calling === friend.id ? 'secondary' : 'outline'}
                  size="sm"
                >
                  {calling === friend.id ? 'Calling...' : '📞 Call'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
