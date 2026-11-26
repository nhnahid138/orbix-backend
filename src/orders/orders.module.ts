import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AdminAuditLog,
  Address,
  Cart,
  CartItem,
  Coupon,
  InventoryMovement,
  Order,
  OrderItem,
  Payment,
  ProductVariant,
} from '../database/entities.js';
import { AdminAuditService } from '../common/admin-audit.service.js';
import {
  AdminCouponsController,
  AdminOrdersController,
  CouponsController,
  OrdersController,
} from './orders.controller.js';
import { CouponService } from './coupon.service.js';
import { OrdersService } from './orders.service.js';
import { PaymentExpiryService } from './payment-expiry.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminAuditLog,
      Address,
      Cart,
      CartItem,
      Coupon,
      InventoryMovement,
      Order,
      OrderItem,
      Payment,
      ProductVariant,
    ]),
  ],
  controllers: [
    CouponsController,
    OrdersController,
    AdminOrdersController,
    AdminCouponsController,
  ],
  providers: [
    CouponService,
    OrdersService,
    AdminAuditService,
    PaymentExpiryService,
  ],
  exports: [CouponService, OrdersService],
})
export class OrdersModule {}
