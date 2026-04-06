import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Post()
  report(@Request() req: any, @Body() body: any) {
    return this.reportsService.report(req.user.id, body);
  }

  @Post('block')
  block(@Request() req: any, @Body() body: { blockedId: string }) {
    return this.reportsService.block(req.user.id, body.blockedId);
  }
}
