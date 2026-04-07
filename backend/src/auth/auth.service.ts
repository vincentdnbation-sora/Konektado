import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AnonymousDto } from './dto/anonymous.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async anonymous(dto: AnonymousDto) {
    const anonEmail = `${dto.userId}@anon.konektado`;

    let user = await this.prisma.user.findUnique({
      where: { email: anonEmail },
      include: { profile: true },
    });

    if (user?.isDeleted) throw new UnauthorizedException('Account has been deleted');
    if (user?.isBanned) throw new UnauthorizedException('Account suspended');

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          id: dto.userId,
          email: anonEmail,
          passwordHash: 'anon',
          profile: {
            create: {
              displayName: dto.username,
              age: dto.age,
              gender: dto.gender,
              avatar: dto.avatar || null,
            },
          },
          preferences: { create: {} },
        },
        include: { profile: true },
      });
    }

    const token = this.signToken(user.id, user.email);
    return { token, user: this.sanitize(user) };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        profile: {
          create: {
            displayName: dto.displayName,
            age: dto.age,
            gender: dto.gender,
          },
        },
        preferences: {
          create: {},
        },
      },
      include: { profile: true },
    });

    const token = this.signToken(user.id, user.email);
    return { token, user: this.sanitize(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { profile: true },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.isBanned) throw new UnauthorizedException('Account suspended');
    if (user.isDeleted) throw new UnauthorizedException('Account has been deleted');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.signToken(user.id, user.email);
    return { token, user: this.sanitize(user) };
  }

  private signToken(userId: string, email: string) {
    return this.jwt.sign({ sub: userId, email });
  }

  private sanitize(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
