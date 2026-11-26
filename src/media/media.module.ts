import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditLog } from '../database/entities.js';
import { AdminAuditService } from '../common/admin-audit.service.js';
import { AdminMediaController } from './media.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLog])],
  controllers: [AdminMediaController],
  providers: [AdminAuditService],
})
export class MediaModule {}
