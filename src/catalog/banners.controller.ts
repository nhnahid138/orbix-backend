import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { AdminAuditService } from '../common/admin-audit.service.js';
import { CurrentUser, Public, Roles } from '../common/security.decorators.js';
import type { AuthenticatedUser } from '../common/security.decorators.js';
import { HomeBannerService } from './banners.service.js';

export class HomeBannerDto {
  @IsString() @MinLength(1) @MaxLength(100) eyebrow: string;
  @IsString() @MinLength(1) @MaxLength(180) title: string;
  @IsOptional() @IsString() @MaxLength(3000) subtitle?: string;
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) @MaxLength(2048) imageUrl: string;
  @IsString() @MinLength(1) @MaxLength(80) ctaLabel: string;
  @IsString()
  @MaxLength(255)
  @Matches(/^(\/(?!\/)[^\s]*)|(https:\/\/[^\s]+)$/)
  ctaHref: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-100000) @Max(100000) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}

export class UpdateHomeBannerDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) eyebrow?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(180) title?: string;
  @IsOptional() @IsString() @MaxLength(3000) subtitle?: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false }) @MaxLength(2048) imageUrl?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) ctaLabel?: string;
  @IsOptional() @MaxLength(255) @Matches(/^(\/(?!\/)[^\s]*)|(https:\/\/[^\s]+)$/) ctaHref?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(-100000) @Max(100000) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() endsAt?: string | null;
}

@Controller('banners')
export class HomeBannersController {
  constructor(private readonly banners: HomeBannerService) {}

  @Public()
  @Get()
  list() {
    return this.banners.listLive();
  }
}

@Roles('admin')
@Controller('admin/banners')
export class AdminHomeBannersController {
  constructor(
    private readonly banners: HomeBannerService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  list() {
    return this.banners.listAll();
  }

  @Post()
  async create(
    @Body() dto: HomeBannerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const banner = await this.banners.create(dto);
    await this.audit.record({
      actorId: user.id,
      action: 'banner.create',
      entityType: 'home_banner',
      entityId: banner.id,
      ip: request.ip,
    });
    return banner;
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHomeBannerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const banner = await this.banners.update(id, dto);
    await this.audit.record({
      actorId: user.id,
      action: 'banner.update',
      entityType: 'home_banner',
      entityId: id,
      ip: request.ip,
    });
    return banner;
  }

  @Delete(':id')
  async archive(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const banner = await this.banners.archive(id);
    await this.audit.record({
      actorId: user.id,
      action: 'banner.archive',
      entityType: 'home_banner',
      entityId: id,
      ip: request.ip,
    });
    return banner;
  }
}
