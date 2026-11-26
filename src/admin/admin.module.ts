import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditLog, Order, ProductVariant } from '../database/entities.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLog, Order, ProductVariant])],
  controllers: [AdminController],
})
export class AdminModule {}
