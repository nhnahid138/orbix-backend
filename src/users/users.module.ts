import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditLog, RefreshToken, User } from '../database/entities.js';
import { AdminAuditService } from '../common/admin-audit.service.js';
import { AdminUsersController, UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLog, RefreshToken, User])],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, AdminAuditService],
})
export class UsersModule {}
