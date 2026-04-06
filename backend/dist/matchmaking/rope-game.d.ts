import { Server } from 'socket.io';
export interface RopeGameState {
    matchId: string;
    player1: string;
    player2: string;
    ropePosition: number;
    player1Taps: number;
    player2Taps: number;
    status: 'active' | 'ended';
    winner: string | null;
    tickTimer?: NodeJS.Timeout;
    startedAt: number;
    endsAt: number;
}
export declare function startRopeGame(matchId: string, player1: string, player2: string, server: Server): void;
export declare function handleRopePull(matchId: string, userId: string, server: Server): void;
export declare function cleanupRopeGame(matchId: string): void;
