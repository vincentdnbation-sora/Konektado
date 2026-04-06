import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import FeedbackButton from '@/components/FeedbackButton';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Image src="/logo.jpg" alt="Konektado" width={32} height={32} className="rounded-full object-cover" />
          <span className="font-semibold text-lg tracking-tight">Konektado</span>
          <span className="text-xs font-medium bg-pink-500/10 text-pink-400 border border-pink-500/20 rounded-full px-2 py-0.5">Beta v0.1</span>
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
          Beta v0.1 — Live matching available now
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 leading-tight">
          Meet someone through
          <span className="block bg-gradient-to-r from-pink-500 to-violet-600 bg-clip-text text-transparent">
            real conversation
          </span>
        </h1>

        <p className="text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
          Skip the swiping. Konektado matches you with someone nearby instantly —
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

        {/* Beta notice */}
        <div className="mt-12 rounded-2xl border border-pink-500/20 bg-pink-500/5 px-6 py-5 text-sm text-muted-foreground max-w-xl text-left">
          <span className="font-medium text-pink-400">Beta v0.1 — We need your feedback!</span> This is an early version of Konektado. Use the feedback button to tell us what works, what doesn&apos;t, and what you&apos;d love to see next.
        </div>

        {/* Safety note */}
        <div className="mt-4 rounded-2xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground max-w-xl text-left">
          <span className="font-medium text-foreground">Your safety matters.</span> Every session has a report button and instant call-end. Blocked users never match again.
        </div>
      </main>

      <footer className="text-center py-6 text-xs text-muted-foreground border-t border-border">
        © 2025 Konektado Beta v0.1 · Built for real human connection
      </footer>
      <FeedbackButton />
    </div>
  );
}
