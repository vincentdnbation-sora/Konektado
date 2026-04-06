'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import { demoLogin } from '@/lib/demoAuth';

export default function LoginPage() {
  const router = useRouter();
  const { setToken, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ username: '', password: '' });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.username.trim()) {
      toast.error('Please enter your username');
      return;
    }
    if (!form.password) {
      toast.error('Please enter your password');
      return;
    }

    setLoading(true);
    try {
      const { token, user } = demoLogin(form.username.trim(), form.password);
      setToken(token);
      setUser(user);
      toast.success(`Welcome back, ${user.displayName}!`);
      router.push('/home');
    } catch (err: any) {
      toast.error(err.message || 'Login failed — check your username and password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">V</div>
            <span className="font-semibold text-lg">VoiceMatch</span>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Welcome back</CardTitle>
            <CardDescription>Log in with your username — no email needed</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="Your username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, '') })}
                  autoComplete="username"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Your password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="current-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white border-0"
                disabled={loading}
              >
                {loading ? 'Logging in...' : 'Log in'}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-4">
              No account?{' '}
              <Link href="/auth/register" className="text-foreground underline underline-offset-4 hover:text-pink-400">
                Sign up free — no email
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
