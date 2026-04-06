import { PrismaService } from '../prisma/prisma.service';
export declare class GameService {
    private prisma;
    constructor(prisma: PrismaService);
    startGame(matchId: string): Promise<{
        id: string;
        matchId: string;
        gameType: string;
        questions: import("@prisma/client/runtime/library").JsonValue;
        answers: import("@prisma/client/runtime/library").JsonValue;
        scores: import("@prisma/client/runtime/library").JsonValue;
        completed: boolean;
    }>;
    submitAnswer(matchId: string, userId: string, questionId: number, answer: string): Promise<{
        game: {
            id: string;
            matchId: string;
            gameType: string;
            questions: import("@prisma/client/runtime/library").JsonValue;
            answers: import("@prisma/client/runtime/library").JsonValue;
            scores: import("@prisma/client/runtime/library").JsonValue;
            completed: boolean;
        };
        allAnswered: boolean;
    } | null>;
    getGame(matchId: string): Promise<{
        id: string;
        matchId: string;
        gameType: string;
        questions: import("@prisma/client/runtime/library").JsonValue;
        answers: import("@prisma/client/runtime/library").JsonValue;
        scores: import("@prisma/client/runtime/library").JsonValue;
        completed: boolean;
    } | null>;
    private shuffle;
}
