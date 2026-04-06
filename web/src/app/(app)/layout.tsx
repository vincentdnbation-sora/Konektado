'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import FeedbackButton from '@/components/FeedbackButton';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { token, user, fetchMe, logout } = useAuthStore();

  useEffect(() => {
    if (!token) {
      router.push('/auth/login');
      return;
    }
    if (!user) fetchMe();
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background/80 backdrop-blur-sm z-10">
        <Link href="/home" className="flex items-center gap-2">
          <Image src="/logo.jpg" alt="Konektado" width={32} height={32} className="rounded-full object-cover" />
          <span className="font-semibold text-lg tracking-tight">Konektado</span>
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
