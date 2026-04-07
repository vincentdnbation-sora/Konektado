import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MatchmakingService } from './matchmaking.service';
export declare class MatchmakingGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private matchmakingService;
    private jwtService;
    server: Server;
    private readonly logger;
    private redis;
    constructor(matchmakingService: MatchmakingService, jwtService: JwtService);
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): Promise<void>;
    joinQueue(client: Socket, data: any): Promise<void>;
    leaveQueue(client: Socket): Promise<void>;
    endMatch(client: Socket, data: {
        matchId: string;
        reason: string;
    }): Promise<void>;
    nextMatch(client: Socket, data: {
        matchId: string;
        lat?: number;
        lng?: number;
        preferences?: any;
    }): Promise<void>;
    resetQueue(client: Socket, data: {
        lat?: number;
        lng?: number;
        preferences?: any;
    }): Promise<void>;
    handleMemoryStart(client: Socket, data: {
        matchId: string;
        partnerId: string;
    }): void;
    handleMemoryFlip(client: Socket, data: {
        matchId: string;
        cardIndex: number;
    }): void;
    handleTttStart(client: Socket, data: {
        matchId: string;
        partnerId: string;
    }): void;
    handleTttMove(client: Socket, data: {
        matchId: string;
        cellIndex: number;
    }): void;
    handleRopeStart(client: Socket, data: {
        matchId: string;
        partnerId: string;
    }): void;
    onRopePull(client: Socket, data: {
        matchId: string;
    }): void;
    handlePongStart(client: Socket, data: {
        matchId: string;
        partnerId: string;
    }): void;
    onPongInput(client: Socket, data: {
        matchId: string;
        direction?: 'up' | 'down' | 'stop';
        y?: number;
    }): void;
    handleGameInvite(client: Socket, data: {
        matchId: string;
        partnerId: string;
        gameId: string;
        gameTitle: string;
    }): void;
    handleGameAccept(client: Socket, data: {
        matchId: string;
        partnerId: string;
        gameId: string;
        gameTitle: string;
    }): void;
    handleLogout(client: Socket): Promise<void>;
    handleGameDecline(client: Socket, data: {
        matchId: string;
        partnerId: string;
        gameId: string;
    }): void;
}
