import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuditService } from '../common/admin-audit.service.js';
import { CurrentUser, Roles } from '../common/security.decorators.js';
import type { AuthenticatedUser } from '../common/security.decorators.js';
import { UpdateProfileDto, UpdateUserStatusDto } from './users.dto.js';
import { UsersService } from './users.service.js';

function page(value: string | undefined, fallback: number) {
  const number = Number(value);
  return value && Number.isInteger(number) && number > 0 ? number : fallback;
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Patch('me') update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(user.id, dto);
  }
}

@Roles('admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AdminAuditService,
  ) {}
  @Get() list(
    @Query('page') p?: string,
    @Query('limit') l?: string,
    @Query('q') q?: string,
  ) {
    return this.users.list(page(p, 1), page(l, 20), q);
  }
  @Patch(':id/status')
  async status(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const result = await this.users.updateStatus(actor.id, id, dto.status);
    await this.audit.record({
      actorId: actor.id,
      action: 'user.status.update',
      entityType: 'user',
      entityId: id,
      ip: request.ip,
      metadata: { status: dto.status },
    });
    return result;
  }
}
