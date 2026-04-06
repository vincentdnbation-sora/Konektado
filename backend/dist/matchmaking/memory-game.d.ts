import { Server } from 'socket.io';
export interface MemoryCard {
    coord: string;
    index: number;
    symbol: string;
    revealed: boolean;
    matched: boolean;
}
export interface MemoryGameState {
    matchId: string;
    player1: string;
    player2: string;
    board: MemoryCard[];
    activePlayer: string;
    firstFlip: number | null;
    secondFlip: number | null;
    matchesFound: number;
    turns: number;
    status: 'active' | 'completed';
    flipBackTimer?: NodeJS.Timeout;
    startedAt: number;
}
export declare function startMemoryGame(matchId: string, player1: string, player2: string, server: Server): void;
export declare function handleMemoryFlip(matchId: string, userId: string, cardIndex: number, server: Server): void;
export declare function cleanupMemoryGame(matchId: string): void;
export declare function getMemoryGame(matchId: string): MemoryGameState | undefined;
