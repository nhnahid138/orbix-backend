import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuditLog, Order, ProductVariant } from '../database/entities.js';
import { Roles } from '../common/security.decorators.js';

@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(ProductVariant)
    private readonly variants: Repository<ProductVariant>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogs: Repository<AdminAuditLog>,
  ) {}

  @Get('dashboard')
  async dashboard() {
    const orders = await this.orders
      .createQueryBuilder('o')
      .select('COUNT(*)::int', 'totalOrders')
      .addSelect(
        "COUNT(*) FILTER (WHERE o.order_status = 'pending_payment')::int",
        'pendingPayment',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE o.order_status IN ('confirmed','processing','shipped'))::int",
        'openOrders',
      )
      .addSelect(
        "COALESCE(SUM(o.total_minor) FILTER (WHERE o.payment_status = 'paid'), 0)::bigint",
        'paidRevenueMinor',
      )
      .getRawOne();
    const lowStockVariants = await this.variants
      .createQueryBuilder('variant')
      .where('variant.is_active = true AND variant.stock_quantity <= 5')
      .getCount();
    return { ...orders, lowStockAtFive: lowStockVariants, currency: 'BDT' };
  }

  @Get('audit-logs')
  listAuditLogs(@Query('page') page?: string, @Query('limit') limit?: string) {
    const p = Number(page) > 0 ? Math.floor(Number(page)) : 1;
    const l = Number(limit) > 0 ? Math.min(100, Math.floor(Number(limit))) : 50;
    return this.auditLogs
      .findAndCount({
        relations: { actor: true },
        select: { actor: { id: true, name: true, email: true } },
        order: { createdAt: 'DESC' },
        skip: (p - 1) * l,
        take: l,
      })
      .then(([items, total]) => ({ items, page: p, limit: l, total }));
  }
}
