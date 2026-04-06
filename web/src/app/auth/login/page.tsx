'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { setToken, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email || !form.password) { toast.error('Please fill in all fields'); return; }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', form);
      setToken(data.token);
      setUser(data.user);
      toast.success(`Welcome back, ${data.user.profile?.displayName}!`);
      router.push('/home');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <Image src="/logo.jpg" alt="Konektado" width={32} height={32} className="rounded-full object-cover" />
            <span className="font-semibold text-lg">Konektado</span>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Log in to start matching with people nearby</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@email.com" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="Your password" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <Button type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white border-0">
                {loading ? 'Logging in...' : 'Log in'}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-4">
              No account?{' '}
              <Link href="/auth/register" className="text-foreground underline underline-offset-4 hover:text-pink-400">Sign up free</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
