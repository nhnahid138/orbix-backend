import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OrdersService } from './orders.service.js';

@Injectable()
export class PaymentExpiryService {
  private readonly logger = new Logger(PaymentExpiryService.name);
  private running = false;

  constructor(private readonly orders: OrdersService) {}

  @Interval(60_000)
  async releaseExpiredOrders(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.orders.expirePendingPayments();
    } catch {
      this.logger.error('Failed to release expired payment reservations');
    } finally {
      this.running = false;
    }
  }
}
