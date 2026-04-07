import {
  Controller,
  Get,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  /** GET /admin/users?deleted=false&banned=false&search=... */
  @Get('users')
  listUsers(
    @Query('deleted') deleted?: string,
    @Query('banned') banned?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listUsers({
      deleted: deleted !== undefined ? deleted === 'true' : undefined,
      banned: banned !== undefined ? banned === 'true' : undefined,
      search: search || undefined,
    });
  }

  /** DELETE /admin/users/:userId — soft-delete a single user */
  @Delete('users/:userId')
  @HttpCode(HttpStatus.OK)
  deleteUser(
    @Param('userId') userId: string,
    @Body() body: { ban?: boolean },
    @Request() req: any,
  ) {
    return this.adminService.deleteUser(userId, req.user.id, { ban: body?.ban });
  }

  /** DELETE /admin/users — soft-delete ALL users (requires confirmation body) */
  @Delete('users')
  @HttpCode(HttpStatus.OK)
  deleteAllUsers(
    @Body() body: { confirm: string; hardDelete?: boolean },
    @Request() req: any,
  ) {
    // Safety: require explicit confirmation string
    if (body.confirm !== 'DELETE_ALL_USERS') {
      return {
        status: 'rejected',
        message: 'Must include { "confirm": "DELETE_ALL_USERS" } in request body',
      };
    }
    return this.adminService.deleteAllUsers(req.user.id, {
      hardDelete: body.hardDelete ?? false,
    });
  }

  /** PATCH /admin/users/:userId/restore — restore a soft-deleted user */
  @Patch('users/:userId/restore')
  restoreUser(@Param('userId') userId: string, @Request() req: any) {
    return this.adminService.restoreUser(userId, req.user.id);
  }

  /** PATCH /admin/users/:userId/ban — ban a user without deleting */
  @Patch('users/:userId/ban')
  async banUser(@Param('userId') userId: string, @Request() req: any) {
    return this.adminService.deleteUser(userId, req.user.id, { ban: true });
  }
}
