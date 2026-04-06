'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Question { id: number; optionA: string; optionB: string; }
interface GameState {
  questions: Question[];
  answers: Record<string, Record<number, string>>;
  scores: Record<string, number>;
  completed: boolean;
}

interface Props {
  matchId: string;
  userId: string;
  gameState: GameState | null;
  onAnswer: (questionId: number, answer: string) => void;
}

export default function MiniGame({ matchId, userId, gameState, onAnswer }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  if (!gameState) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-muted-foreground text-sm animate-pulse">
        Loading game...
      </div>
    );
  }

  const { questions, answers, completed } = gameState;
  const myAnswers = answers[userId] || {};
  const question = questions[currentIndex];
  const myAnswer = question ? myAnswers[question.id] : null;
  const otherUserId = Object.keys(answers).find((id) => id !== userId);
  const otherAnswer = otherUserId && question ? answers[otherUserId]?.[question.id] : null;

  function handleSelect(option: string) {
    if (myAnswer) return;
    setSelected(option);
    onAnswer(question.id, option);
  }

  if (completed) {
    const myScore = gameState.scores[userId] || 0;
    const otherScore = otherUserId ? gameState.scores[otherUserId] || 0 : 0;
    return (
      <Card className="border-violet-500/30 bg-gradient-to-br from-violet-500/5 to-pink-500/5">
        <CardContent className="pt-6 text-center space-y-3">
          <div className="text-3xl">🎉</div>
          <h3 className="font-semibold text-lg">Game over!</h3>
          <p className="text-sm text-muted-foreground">
            You answered {myScore}/{questions.length} the same way
          </p>
          <div className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-violet-600 bg-clip-text text-transparent">
            {myScore === questions.length ? 'Perfect match!' : myScore >= 3 ? 'Great chemistry!' : 'Different but interesting!'}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!question) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Would You Rather</span>
        <span>{currentIndex + 1}/{questions.length}</span>
      </div>

      <div className="w-full bg-muted rounded-full h-1">
        <div
          className="bg-gradient-to-r from-pink-500 to-violet-600 h-1 rounded-full transition-all"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(['A', 'B'] as const).map((letter) => {
          const option = letter === 'A' ? question.optionA : question.optionB;
          const isSelected = myAnswer === option || selected === option;
          const otherPicked = otherAnswer === option;
          return (
            <button
              key={letter}
              onClick={() => handleSelect(option)}
              disabled={!!myAnswer}
              className={`rounded-xl border p-4 text-sm text-left transition-all leading-snug ${
                isSelected
                  ? 'border-pink-500 bg-pink-500/10 text-pink-300'
                  : 'border-border hover:border-muted-foreground bg-card'
              } ${myAnswer ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <span className="block text-xs font-mono text-muted-foreground mb-1">Option {letter}</span>
              {option}
              {otherPicked && myAnswer && (
                <span className="block mt-2 text-xs text-violet-400">← They chose this</span>
              )}
            </button>
          );
        })}
      </div>

      {myAnswer && currentIndex < questions.length - 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => { setCurrentIndex((i) => i + 1); setSelected(null); }}
        >
          Next question →
        </Button>
      )}

      {!myAnswer && (
        <p className="text-center text-xs text-muted-foreground">Pick one to continue</p>
      )}
    </div>
  );
}
