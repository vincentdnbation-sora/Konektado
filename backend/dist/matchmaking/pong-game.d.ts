import { Server } from 'socket.io';
export interface PongState {
    matchId: string;
    player1: string;
    player2: string;
    paddle1Y: number;
    paddle2Y: number;
    ballX: number;
    ballY: number;
    velX: number;
    velY: number;
    score1: number;
    score2: number;
    status: 'active' | 'scored' | 'ended';
    winner: string | null;
    tickTimer?: NodeJS.Timeout;
    p1Input: number;
    p2Input: number;
    startedAt: number;
    pauseUntil: number;
}
export declare function startPongGame(matchId: string, player1: string, player2: string, server: Server): void;
export declare function handlePongInput(matchId: string, userId: string, direction: 'up' | 'down' | 'stop' | number, server: Server): void;
export declare function cleanupPongGame(matchId: string): void;
