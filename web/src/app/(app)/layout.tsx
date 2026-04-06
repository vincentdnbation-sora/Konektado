'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import FeedbackButton from '@/components/FeedbackButton';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, user, fetchMe, logout } = useAuthStore();

  useEffect(() => {
    const stored = localStorage.getItem('voicematch_session');
    if (!stored) {
      router.push('/auth/login');
      return;
    }
    if (!user) fetchMe();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background/80 backdrop-blur-sm z-10">
        <Link href="/home" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">V</div>
          <span className="font-semibold text-lg tracking-tight">VoiceMatch</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/profile">
            <Button variant="ghost" size="sm">Profile</Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground">
            Log out
          </Button>
        </div>
      </nav>
      <main className="flex-1">{children}</main>
      <FeedbackButton />
    </div>
  );
}
