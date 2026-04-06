'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function QueuePage() {
  // Redirect to home - queue is now handled on home page
  const router = useRouter();
  useEffect(() => {
    router.replace('/home');
  }, [router]);
  return null;
}
