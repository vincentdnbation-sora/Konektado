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
import { demoRegister } from '@/lib/demoAuth';

const GENDERS = ['male', 'female', 'non-binary', 'other'];

export default function RegisterPage() {
  const router = useRouter();
  const { setToken, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    username: '',
    password: '',
    displayName: '',
    age: '',
    gender: '',
  });

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function validateStep1() {
    if (form.username.trim().length < 3) {
      toast.error('Username must be at least 3 characters');
      return false;
    }
    if (form.password.length < 4) {
      toast.error('Password must be at least 4 characters');
      return false;
    }
    return true;
  }

  function validateStep2() {
    if (form.displayName.trim().length < 2) {
      toast.error('Display name must be at least 2 characters');
      return false;
    }
    const age = parseInt(form.age);
    if (!age || age < 18 || age > 100) {
      toast.error('You must be 18 or older to use VoiceMatch');
      return false;
    }
    if (!form.gender) {
      toast.error('Please select your gender');
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (step === 1) {
      if (validateStep1()) setStep(2);
      return;
    }

    if (!validateStep2()) return;

    setLoading(true);
    try {
      const { token, user } = demoRegister({
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim(),
        age: parseInt(form.age),
        gender: form.gender,
      });
      setToken(token);
      setUser(user);
      toast.success(`Welcome to VoiceMatch, ${user.displayName}!`);
      router.push('/home');
    } catch (err: any) {
      toast.error(err.message || 'Registration failed — please try again');
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
            <div className="flex gap-2 mb-2">
              <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 1 ? 'bg-pink-500' : 'bg-muted'}`} />
              <div className={`h-1 flex-1 rounded-full transition-colors ${step >= 2 ? 'bg-violet-500' : 'bg-muted'}`} />
            </div>
            <CardTitle className="text-2xl">
              {step === 1 ? 'Create account' : 'Your profile'}
            </CardTitle>
            <CardDescription>
              {step === 1
                ? 'Step 1 of 2 — No email needed, just pick a username'
                : 'Step 2 of 2 — Tell us about yourself'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {step === 1 ? (
                <>
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input
                      placeholder="e.g. coolcat99"
                      value={form.username}
                      onChange={(e) => update('username', e.target.value.replace(/\s/g, ''))}
                      autoComplete="username"
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">No email required. Letters, numbers, underscores.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      placeholder="At least 4 characters"
                      value={form.password}
                      onChange={(e) => update('password', e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Display name</Label>
                    <Input
                      placeholder="What should people call you?"
                      value={form.displayName}
                      onChange={(e) => update('displayName', e.target.value)}
                      autoFocus
                    />
                    <p className="text-xs text-muted-foreground">This is what your match will see.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Age</Label>
                    <Input
                      type="number"
                      placeholder="Must be 18+"
                      value={form.age}
                      onChange={(e) => update('age', e.target.value)}
                      min={18}
                      max={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {GENDERS.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => update('gender', g)}
                          className={`rounded-lg border px-4 py-2.5 text-sm capitalize transition-colors ${
                            form.gender === g
                              ? 'border-pink-500 bg-pink-500/10 text-pink-400'
                              : 'border-border hover:border-muted-foreground'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white border-0"
                disabled={loading}
              >
                {loading ? 'Creating account...' : step === 1 ? 'Continue →' : 'Join VoiceMatch'}
              </Button>

              {step === 2 && (
                <Button type="button" variant="ghost" className="w-full" onClick={() => setStep(1)}>
                  ← Back
                </Button>
              )}
            </form>

            <p className="text-center text-sm text-muted-foreground mt-4">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-foreground underline underline-offset-4 hover:text-pink-400">
                Log in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
