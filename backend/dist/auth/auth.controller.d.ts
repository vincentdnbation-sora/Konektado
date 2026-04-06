import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AnonymousDto } from './dto/anonymous.dto';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
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
    me(req: any): any;
}
