import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminAuditService } from '../common/admin-audit.service.js';
import { CurrentUser, Public, Roles } from '../common/security.decorators.js';
import type { AuthenticatedUser } from '../common/security.decorators.js';
import { CreateReviewDto, ModerateReviewDto } from './reviews.dto.js';
import { ReviewsService } from './reviews.service.js';

@Controller('products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}
  @Public() @Get() list(
    @Param('productId', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviews.listPublished(
      id,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }
  @Post() create(
    @Param('productId', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(user.id, id, dto);
  }
}

@Roles('admin')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly audit: AdminAuditService,
  ) {}
  @Get() list(@Query('status') status?: string) {
    return this.reviews.listAdmin(status);
  }
  @Patch(':id')
  async moderate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModerateReviewDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const review = await this.reviews.moderate(id, dto.status);
    await this.audit.record({
      actorId: user.id,
      action: 'review.moderate',
      entityType: 'review',
      entityId: id,
      ip: request.ip,
      metadata: { status: dto.status },
    });
    return review;
  }
}
