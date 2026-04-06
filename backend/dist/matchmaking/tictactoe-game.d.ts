import { Server } from 'socket.io';
export interface TicTacToeState {
    matchId: string;
    playerX: string;
    playerO: string;
    board: (string | null)[];
    currentTurn: string;
    status: 'active' | 'won' | 'draw';
    winner: string | null;
    winLine: number[] | null;
    moveCount: number;
    startedAt: number;
}
export declare function startTicTacToe(matchId: string, player1: string, player2: string, server: Server): void;
export declare function handleTicTacToeMove(matchId: string, userId: string, cellIndex: number, server: Server): void;
export declare function cleanupTicTacToe(matchId: string): void;
