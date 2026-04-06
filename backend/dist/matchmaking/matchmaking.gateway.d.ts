import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { MatchmakingService } from './matchmaking.service';
export declare class MatchmakingGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private matchmakingService;
    private jwtService;
    server: Server;
    private redis;
    private matchInterval;
    constructor(matchmakingService: MatchmakingService, jwtService: JwtService);
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): Promise<void>;
    joinQueue(client: Socket, data: any): Promise<void>;
    leaveQueue(client: Socket): Promise<void>;
    endMatch(client: Socket, data: {
        matchId: string;
        reason: string;
    }): Promise<void>;
    handleGameJump(client: Socket, data: {
        matchId: string;
    }): void;
    startGameForMatch(matchId: string, user1Id: string, user2Id: string): void;
}
