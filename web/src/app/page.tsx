'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

const GENDERS = ['male', 'female', 'non-binary', 'other'] as const;

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function OnboardPage() {
  const router = useRouter();
  const { token, setSession } = useAuthStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ username: '', age: '', gender: '' });

  useEffect(() => {
    if (token) router.replace('/home');
  }, [token]);

  async function handleFinish() {
    if (!form.username.trim() || form.username.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    const age = parseInt(form.age);
    if (!age || age < 18 || age > 100) {
      toast.error('Age must be between 18 and 100');
      return;
    }
    if (!form.gender) {
      toast.error('Please select your gender');
      return;
    }

    setLoading(true);
    try {
      const userId = generateUUID();
      const { data } = await api.post('/auth/anonymous', {
        userId,
        username: form.username.trim(),
        age,
        gender: form.gender,
      });
      setSession(data.token, data.user);
      toast.success(`Welcome, ${data.user.profile?.displayName}!`);
      router.push('/home');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Image src="/logo.jpg" alt="Konektado" width={40} height={40} className="rounded-full object-cover" />
            <span className="font-bold text-xl">Konektado</span>
          </div>
          <p className="text-sm text-muted-foreground">Meet someone through real conversation</p>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                s <= step ? 'bg-gradient-to-r from-[#E63946] to-[#FFD166]' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Username */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-1">What should we call you?</h1>
              <p className="text-muted-foreground text-sm">This is what others will see during your call</p>
            </div>
            <Input
              placeholder="Your name or nickname"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && form.username.trim().length >= 2) setStep(2);
              }}
              autoFocus
              className="h-12 text-base"
            />
            <Button
              onClick={() => {
                if (form.username.trim().length < 2) {
                  toast.error('Name must be at least 2 characters');
                  return;
                }
                setStep(2);
              }}
              className="w-full h-12 bg-gradient-to-r from-[#E63946] to-[#FFD166] hover:from-[#CF2F3D] hover:to-[#E6B800] text-white border-0"
            >
              Continue →
            </Button>
          </div>
        )}

        {/* Step 2: Age */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-1">How old are you?</h1>
              <p className="text-muted-foreground text-sm">Must be 18 or older to use Konektado</p>
            </div>
            <Input
              type="number"
              placeholder="Your age"
              value={form.age}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const age = parseInt(form.age);
                  if (age >= 18 && age <= 100) setStep(3);
                }
              }}
              min={18}
              max={100}
              autoFocus
              className="h-12 text-base"
            />
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-12">
                ← Back
              </Button>
              <Button
                onClick={() => {
                  const age = parseInt(form.age);
                  if (!age || age < 18 || age > 100) {
                    toast.error('Age must be between 18 and 100');
                    return;
                  }
                  setStep(3);
                }}
                className="flex-1 h-12 bg-gradient-to-r from-[#E63946] to-[#FFD166] hover:from-[#CF2F3D] hover:to-[#E6B800] text-white border-0"
              >
                Continue →
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Gender */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold mb-1">I identify as...</h1>
              <p className="text-muted-foreground text-sm">Used to improve your matches</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {GENDERS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setForm({ ...form, gender: g })}
                  className={`rounded-xl border px-4 py-4 text-sm capitalize font-medium transition-all ${
                    form.gender === g
                      ? 'border-[#E63946] bg-[#E63946]/10 text-[#E63946]'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1 h-12">
                ← Back
              </Button>
              <Button
                onClick={handleFinish}
                disabled={!form.gender || loading}
                className="flex-1 h-12 bg-gradient-to-r from-[#E63946] to-[#FFD166] hover:from-[#CF2F3D] hover:to-[#E6B800] text-white border-0"
              >
                {loading ? 'Joining...' : 'Join Konektado'}
              </Button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          No account needed · Your session is stored locally
        </p>
      </div>
    </div>
  );
}
