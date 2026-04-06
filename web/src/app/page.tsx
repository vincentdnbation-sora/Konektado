import Link from 'next/link';
import { Button } from '@/components/ui/button';
import FeedbackButton from '@/components/FeedbackButton';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm">V</div>
          <span className="font-semibold text-lg tracking-tight">VoiceMatch</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/auth/login">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link href="/auth/register">
            <Button size="sm" className="bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white border-0">
              Get Started
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-1.5 text-sm text-muted-foreground mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Live matching available now
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 leading-tight">
          Meet someone through
          <span className="block bg-gradient-to-r from-pink-500 to-violet-600 bg-clip-text text-transparent">
            real conversation
          </span>
        </h1>

        <p className="text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
          Skip the swiping. VoiceMatch connects you with someone nearby instantly —
          you talk, play a mini-game together, and decide if you want to keep the connection.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/auth/register">
            <Button size="lg" className="bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-600 hover:to-violet-700 text-white border-0 px-8 h-12 text-base">
              Start Matching Free
            </Button>
          </Link>
          <Link href="/auth/login">
            <Button size="lg" variant="outline" className="px-8 h-12 text-base">
              I have an account
            </Button>
          </Link>
        </div>

        {/* How it works */}
        <div className="mt-24 grid grid-cols-1 sm:grid-cols-3 gap-8 text-left w-full">
          {[
            { step: '01', title: 'Enter the queue', desc: 'Allow location & microphone access, then tap to start. We find someone nearby who is ready to talk.' },
            { step: '02', title: 'Voice call starts', desc: 'Once matched, a voice call begins automatically. No setup, no awkward typing — just talk.' },
            { step: '03', title: 'Play & connect', desc: 'A fun "Would You Rather" mini-game runs during the call. Keep chatting or rematch after.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="rounded-2xl border border-border bg-card p-6">
              <div className="text-xs font-mono text-muted-foreground mb-3">{step}</div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Safety note */}
        <div className="mt-12 rounded-2xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground max-w-xl text-left">
          <span className="font-medium text-foreground">Your safety matters.</span> Every session has a report button and instant call-end. Blocked users never match again.
        </div>
      </main>

      <footer className="text-center py-6 text-xs text-muted-foreground border-t border-border">
        © 2025 VoiceMatch · Built for real human connection
      </footer>
      <FeedbackButton />
    </div>
  );
}
