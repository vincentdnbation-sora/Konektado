import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async report(reporterId: string, data: { reportedId: string; matchId?: string; reason: string; description?: string }) {
    return this.prisma.report.create({
      data: { reporterId, ...data },
    });
  }

  async block(blockerId: string, blockedId: string) {
    return this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
  }
}
