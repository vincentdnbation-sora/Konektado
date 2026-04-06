import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const WOULD_YOU_RATHER = [
  { id: 1, optionA: 'Travel the world for a year', optionB: 'Stay home with unlimited money' },
  { id: 2, optionA: 'Always be late', optionB: 'Always be early' },
  { id: 3, optionA: 'Lose all your money', optionB: 'Lose all your memories' },
  { id: 4, optionA: 'Be able to fly', optionB: 'Be able to read minds' },
  { id: 5, optionA: 'Live in the city', optionB: 'Live in the countryside' },
  { id: 6, optionA: 'Only eat sweet food', optionB: 'Only eat savory food' },
  { id: 7, optionA: 'Know when you will die', optionB: 'Know how you will die' },
  { id: 8, optionA: 'Have more time', optionB: 'Have more money' },
];

@Injectable()
export class GameService {
  constructor(private prisma: PrismaService) {}

  async startGame(matchId: string) {
    const questions = this.shuffle(WOULD_YOU_RATHER).slice(0, 5);

    const game = await this.prisma.gameSession.create({
      data: { matchId, questions, answers: {}, scores: {} },
    });

    return game;
  }

  async submitAnswer(matchId: string, userId: string, questionId: number, answer: string) {
    const game = await this.prisma.gameSession.findUnique({ where: { matchId } });
    if (!game || game.completed) return null;

    const answers = game.answers as Record<string, any>;
    if (!answers[userId]) answers[userId] = {};
    answers[userId][questionId] = answer;

    const questions = game.questions as any[];
    const allAnswered = questions.every(q =>
      Object.keys(answers).length === 2 &&
      Object.values(answers).every((ua: any) => ua[q.id] !== undefined),
    );

    const updated = await this.prisma.gameSession.update({
      where: { matchId },
      data: { answers, completed: allAnswered },
    });

    return { game: updated, allAnswered };
  }

  async getGame(matchId: string) {
    return this.prisma.gameSession.findUnique({ where: { matchId } });
  }

  private shuffle<T>(arr: T[]): T[] {
    return [...arr].sort(() => Math.random() - 0.5);
  }
}
