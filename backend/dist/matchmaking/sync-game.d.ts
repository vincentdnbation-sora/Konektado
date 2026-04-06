import { Server } from 'socket.io';
export interface SyncGameState {
    matchId: string;
    user1Id: string;
    user2Id: string;
    round: number;
    lives: number;
    score: number;
    phase: 'starting' | 'jumping' | 'result' | 'complete';
    roundJumps: Set<string>;
    timer?: NodeJS.Timeout;
}
export declare function startSyncGame(matchId: string, user1Id: string, user2Id: string, server: Server): void;
export declare function handleJump(matchId: string, userId: string, server: Server): void;
export declare function cleanupGame(matchId: string): void;
