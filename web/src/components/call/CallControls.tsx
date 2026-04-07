'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from 'sonner';

interface Props {
  matchId: string;
  reportedId: string;
  isMuted: boolean;
  onMuteToggle: () => void;
  onEndCall: (reason: string) => void;
  /** Skip to next match instantly without going to post-call screen */
  onNext: () => void;
}

export default function CallControls({ matchId, reportedId, isMuted, onMuteToggle, onEndCall, onNext }: Props) {
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reasons = ['Inappropriate language', 'Harassment', 'Spam', 'Fake profile', 'Underage', 'Other'];

  async function submitReport() {
    if (!reportReason) return;
    setSubmitting(true);
    try {
      await api.post('/reports', { reportedId, matchId, reason: reportReason });
      toast.success('Report submitted. Thank you for keeping VoiceMatch safe.');
      setShowReport(false);
      onEndCall('reported');
    } catch {
      toast.error('Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-center gap-4">
        {/* Mute */}
        <button
          onClick={onMuteToggle}
          className={`w-14 h-14 rounded-full border flex items-center justify-center transition-colors ${
            isMuted ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-card border-border hover:border-muted-foreground'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 19L5 5M9 9a3 3 0 005.12 2.12M15 9.34V4.5a3 3 0 00-5.94-.6m-.56 5.1A3 3 0 0012 15.75v.75m0 0v3.75m-3.75 0h7.5" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>

        {/* End call */}
        <button
          onClick={() => onEndCall('user_left')}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
          title="End call"
        >
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 8.25l-4.5 4.5-4.5-4.5M3 16.5a16.458 16.458 0 0018 0" />
          </svg>
        </button>

        {/* Next — skip to new match instantly */}
        <button
          onClick={onNext}
          className="w-14 h-14 rounded-full border border-border bg-card hover:border-[#FFD166] hover:text-[#FFD166] flex items-center justify-center transition-colors"
          title="Next match"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M13 6l6 6-6 6" />
          </svg>
        </button>

        {/* Report */}
        <button
          onClick={() => setShowReport(true)}
          className="w-14 h-14 rounded-full border border-border bg-card hover:border-orange-500 hover:text-orange-400 flex items-center justify-center transition-colors"
          title="Report"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </button>
      </div>

      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this user</DialogTitle>
            <DialogDescription>Select a reason. This will end the call and our team will review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {reasons.map((r) => (
              <button
                key={r}
                onClick={() => setReportReason(r)}
                className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors ${
                  reportReason === r ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-border hover:border-muted-foreground'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setShowReport(false)}>Cancel</Button>
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white border-0"
              disabled={!reportReason || submitting}
              onClick={submitReport}
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
