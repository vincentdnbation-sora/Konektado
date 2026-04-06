'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface FeedbackEntry {
  rating: number;
  liked: string;
  improve: string;
  page: string;
  timestamp: string;
}

function saveFeedback(entry: FeedbackEntry) {
  const existing: FeedbackEntry[] = JSON.parse(localStorage.getItem('voicematch_feedback') || '[]');
  existing.push(entry);
  localStorage.setItem('voicematch_feedback', JSON.stringify(existing));
}

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [liked, setLiked] = useState('');
  const [improve, setImprove] = useState('');

  function handleSubmit() {
    if (rating === 0) {
      toast.error('Please give a star rating first');
      return;
    }
    saveFeedback({
      rating,
      liked,
      improve,
      page: window.location.pathname,
      timestamp: new Date().toISOString(),
    });
    setSubmitted(true);
  }

  function handleClose() {
    setOpen(false);
    setTimeout(() => {
      setSubmitted(false);
      setRating(0);
      setHovered(0);
      setLiked('');
      setImprove('');
    }, 300);
  }

  return (
    <>
      {/* Floating feedback button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-pink-500/30 hover:from-pink-600 hover:to-violet-700 transition-all hover:scale-105"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
        Feedback
      </button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-sm">
          {submitted ? (
            <div className="text-center py-6 space-y-3">
              <div className="text-5xl">🙌</div>
              <DialogTitle>Thank you!</DialogTitle>
              <DialogDescription>
                Your feedback helps us build a better VoiceMatch. We read every single response.
              </DialogDescription>
              <Button onClick={handleClose} className="mt-2 bg-gradient-to-r from-pink-500 to-violet-600 text-white border-0 w-full">
                Close
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Share your feedback</DialogTitle>
                <DialogDescription>Help us improve VoiceMatch — takes 30 seconds</DialogDescription>
              </DialogHeader>

              <div className="space-y-5 mt-2">
                {/* Star rating */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">How would you rate your experience?</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onMouseEnter={() => setHovered(star)}
                        onMouseLeave={() => setHovered(0)}
                        onClick={() => setRating(star)}
                        className="text-2xl transition-transform hover:scale-125"
                      >
                        {star <= (hovered || rating) ? '⭐' : '☆'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* What do you like */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">What do you like most? <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <textarea
                    value={liked}
                    onChange={(e) => setLiked(e.target.value)}
                    placeholder="e.g. The voice matching idea is great..."
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>

                {/* What needs improvement */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">What should we improve? <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <textarea
                    value={improve}
                    onChange={(e) => setImprove(e.target.value)}
                    placeholder="e.g. The queue wait is too long..."
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
                  <Button
                    onClick={handleSubmit}
                    className="flex-1 bg-gradient-to-r from-pink-500 to-violet-600 text-white border-0"
                  >
                    Send Feedback
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
