'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/api';
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user, fetchMe } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({
    displayName: user?.profile?.displayName || '',
    bio: user?.profile?.bio || '',
  });
  const [prefs, setPrefs] = useState({
    preferredGender: user?.preferences?.preferredGender || 'any',
    minAge: user?.preferences?.minAge || 18,
    maxAge: user?.preferences?.maxAge || 99,
    maxDistanceKm: user?.preferences?.maxDistanceKm || 50,
  });

  async function saveProfile() {
    setLoading(true);
    try {
      await api.patch('/users/profile', profile);
      await api.patch('/users/preferences', prefs);
      await fetchMe();
      toast.success('Profile updated!');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
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
            <Input value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Bio</Label>
            <Input value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} placeholder="Tell people a little about yourself..." />
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
                <button key={g} type="button" onClick={() => setPrefs({ ...prefs, preferredGender: g })}
                  className={`rounded-lg border px-4 py-2 text-sm capitalize transition-colors ${prefs.preferredGender === g ? 'border-pink-500 bg-pink-500/10 text-pink-400' : 'border-border hover:border-muted-foreground'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Min age</Label>
              <Input type="number" min={18} max={99} value={prefs.minAge} onChange={(e) => setPrefs({ ...prefs, minAge: +e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Max age</Label>
              <Input type="number" min={18} max={99} value={prefs.maxAge} onChange={(e) => setPrefs({ ...prefs, maxAge: +e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Max distance: {prefs.maxDistanceKm} km</Label>
            <input type="range" min={5} max={200} step={5} value={prefs.maxDistanceKm}
              onChange={(e) => setPrefs({ ...prefs, maxDistanceKm: +e.target.value })}
              className="w-full accent-pink-500" />
          </div>
        </CardContent>
      </Card>

      <Button onClick={saveProfile} disabled={loading}
        className="w-full bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white border-0">
        {loading ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  );
}
