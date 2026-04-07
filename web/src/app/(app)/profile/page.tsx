'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import api from '@/lib/api';

const GENDERS = ['male', 'female', 'non-binary', 'other'];

export default function ProfilePage() {
  const { user, setUser, logout } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.profile?.displayName || '');
  const [gender, setGender] = useState(user?.profile?.gender || '');
  const [avatar, setAvatar] = useState(user?.profile?.avatar || '');
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState({
    preferredGender: user?.preferences?.preferredGender || 'any',
    minAge: user?.preferences?.minAge || 18,
    maxAge: user?.preferences?.maxAge || 99,
    maxDistanceKm: user?.preferences?.maxDistanceKm || 50,
  });

  async function save() {
    if (!displayName.trim() || displayName.trim().length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    if (!gender) {
      toast.error('Please select a gender');
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        api.patch('/users/profile', { displayName: displayName.trim(), avatar }),
        api.patch('/users/preferences', prefs),
      ]);
      const updated = {
        ...user!,
        profile: { ...user!.profile!, displayName: displayName.trim(), gender, avatar },
        preferences: prefs,
      };
      setUser(updated);
      toast.success('Profile saved!');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-12 space-y-6">
      <h1 className="text-2xl font-bold">Your Profile</h1>

      <Card>
        <CardHeader><CardTitle className="text-lg">Basic Info</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Display name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label>Avatar</Label>
            <div className="grid grid-cols-6 gap-2">
              {['😀', '😊', '😎', '🤓', '😍', '🥳', '🤠', '👽', '🤖', '🐱', '🐶', '🦊'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  className={`text-2xl p-2 rounded-lg border transition-colors ${
                    avatar === emoji
                      ? 'border-[#E63946] bg-[#E63946]/10'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Match Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Preferred gender</Label>
            <div className="flex gap-2 flex-wrap">
              {['any', 'male', 'female', 'non-binary', 'other'].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setPrefs({ ...prefs, preferredGender: g })}
                  className={`rounded-lg border px-4 py-2 text-sm capitalize transition-colors ${
                    prefs.preferredGender === g
                      ? 'border-[#E63946] bg-[#E63946]/10 text-[#E63946]'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Min age</Label>
              <Input
                type="number"
                min={18}
                max={99}
                value={prefs.minAge}
                onChange={(e) => setPrefs({ ...prefs, minAge: +e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max age</Label>
              <Input
                type="number"
                min={18}
                max={99}
                value={prefs.maxAge}
                onChange={(e) => setPrefs({ ...prefs, maxAge: +e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Max distance: {prefs.maxDistanceKm} km</Label>
            <input
              type="range"
              min={5}
              max={200}
              step={5}
              value={prefs.maxDistanceKm}
              onChange={(e) => setPrefs({ ...prefs, maxDistanceKm: +e.target.value })}
              className="w-full accent-[#E63946]"
            />
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={save}
        disabled={saving}
        className="w-full bg-gradient-to-r from-[#E63946] to-[#FFD166] hover:from-[#CF2F3D] hover:to-[#E6B800] text-white border-0"
      >
        {saving ? 'Saving...' : 'Save Changes'}
      </Button>

      <Button variant="ghost" onClick={logout} className="w-full text-muted-foreground">
        Clear session & start over
      </Button>
    </div>
  );
}
