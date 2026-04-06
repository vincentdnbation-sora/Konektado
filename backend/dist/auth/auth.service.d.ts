import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AnonymousDto } from './dto/anonymous.dto';
export declare class AuthService {
    private prisma;
    private jwt;
    constructor(prisma: PrismaService, jwt: JwtService);
    anonymous(dto: AnonymousDto): Promise<{
        token: string;
        user: any;
    }>;
    register(dto: RegisterDto): Promise<{
        token: string;
        user: any;
    }>;
    login(dto: LoginDto): Promise<{
        token: string;
        user: any;
    }>;
    private signToken;
    private sanitize;
}
