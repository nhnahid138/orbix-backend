import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AdminAuditService } from '../common/admin-audit.service.js';
import { CurrentUser, Roles } from '../common/security.decorators.js';
import type { AuthenticatedUser } from '../common/security.decorators.js';
import { CouponDto, UpdateCouponDto } from './coupon.dto.js';
import { CouponService } from './coupon.service.js';
import { OrdersService } from './orders.service.js';
import { CheckoutDto } from '../shopping/shopping.dto.js';

class UpdateOrderStatusDto {
  @IsIn(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
  status: 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
}
class ValidateCouponDto {
  @IsString() @MinLength(3) @MaxLength(40) code: string;
}

function pageValue(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

@Controller('coupons')
export class CouponsController {
  constructor(private readonly orders: OrdersService) {}
  @Post('validate') validate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ValidateCouponDto,
  ) {
    return this.orders.previewCoupon(user.id, body.code);
  }
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CheckoutDto,
    @Headers('idempotency-key') key?: string,
  ) {
    if (!key || key.length < 8 || key.length > 100)
      throw new BadRequestException(
        'Idempotency-Key header (8–100 chars) is required',
      );
    return this.orders.checkout(user.id, {
      addressId: body.addressId,
      couponCode: body.couponCode,
      paymentProvider: body.paymentProvider,
      idempotencyKey: key,
    });
  }

  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.orders.listMine(
      user.id,
      pageValue(page, 1),
      pageValue(limit, 20),
    );
  }

  @Get(':orderNumber') get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderNumber') orderNumber: string,
  ) {
    return this.orders.getMine(user.id, orderNumber);
  }

  @Post(':orderNumber/cancel') cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderNumber') orderNumber: string,
  ) {
    return this.orders.cancelMine(user.id, orderNumber);
  }
}

@Roles('admin')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get() list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.orders.listAdmin(
      pageValue(page, 1),
      pageValue(limit, 20),
      status,
    );
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const order = await this.orders.updateAdminStatus(id, body.status);
    await this.audit.record({
      actorId: user.id,
      action: 'order.status.update',
      entityType: 'order',
      entityId: id,
      ip: request.ip,
      metadata: { status: body.status },
    });
    return order;
  }
}

@Roles('admin')
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(
    private readonly coupons: CouponService,
    private readonly audit: AdminAuditService,
  ) {}
  @Get() list() {
    return this.coupons.list();
  }
  @Post() async create(
    @Body() body: CouponDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const coupon = await this.coupons.create(body);
    await this.audit.record({
      actorId: user.id,
      action: 'coupon.create',
      entityType: 'coupon',
      entityId: coupon.id,
      ip: request.ip,
    });
    return coupon;
  }
  @Patch(':id') async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCouponDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const coupon = await this.coupons.update(id, body);
    await this.audit.record({
      actorId: user.id,
      action: 'coupon.update',
      entityType: 'coupon',
      entityId: id,
      ip: request.ip,
    });
    return coupon;
  }
  @Post(':id/archive') async archive(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const coupon = await this.coupons.archive(id);
    await this.audit.record({
      actorId: user.id,
      action: 'coupon.archive',
      entityType: 'coupon',
      entityId: id,
      ip: request.ip,
    });
    return coupon;
  }
}
