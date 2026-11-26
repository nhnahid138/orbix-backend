import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditLog, Review } from '../database/entities.js';
import { AdminAuditService } from '../common/admin-audit.service.js';
import {
  AdminReviewsController,
  ProductReviewsController,
} from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AdminAuditLog, Review])],
  controllers: [ProductReviewsController, AdminReviewsController],
  providers: [ReviewsService, AdminAuditService],
})
export class ReviewsModule {}
