import { randomInt } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Address,
  Cart,
  CartItem,
  Coupon,
  InventoryMovement,
  Order,
  OrderItem,
  Payment,
  ProductVariant,
  User,
} from '../database/entities.js';
import { CouponService } from './coupon.service.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly coupons: CouponService,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async previewCoupon(userId: number, code: string) {
    const cart = await this.dataSource.getRepository(Cart).findOne({
      where: { user: { id: userId } },
      relations: { items: { variant: true } },
    });
    if (!cart || !cart.items.length)
      throw new UnprocessableEntityException('Cart is empty');
    const subtotalMinor = cart.items.reduce(
      (total, item) => total + item.variant.priceMinor * item.quantity,
      0,
    );
    const result = await this.coupons.calculate(code, subtotalMinor);
    return {
      code: result.coupon?.code,
      subtotalMinor,
      discountMinor: result.discountMinor,
      totalMinor: subtotalMinor - result.discountMinor,
    };
  }

  async checkout(
    userId: number,
    input: {
      addressId: number;
      couponCode?: string;
      paymentProvider: 'eps' | 'cod';
      idempotencyKey: string;
    },
  ) {
    const epsKeys = [
      'EPS_USERNAME',
      'EPS_PASSWORD',
      'EPS_HASH_KEY',
      'EPS_MERCHANT_ID',
      'EPS_STORE_ID',
      'API_PUBLIC_URL',
    ];
    if (
      input.paymentProvider === 'eps' &&
      (this.config.get('EPS_ENABLED') !== 'true' ||
        epsKeys.some((key) => !this.config.get<string>(key)))
    ) {
      throw new ServiceUnavailableException(
        'Online payments are not configured yet; choose cash on delivery',
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(Order, {
        where: { user: { id: userId }, idempotencyKey: input.idempotencyKey },
        relations: { items: true, payments: true },
      });
      if (existing) return existing;

      const cart = await manager.findOne(Cart, {
        where: { user: { id: userId } },
        lock: { mode: 'pessimistic_write' },
      });
      if (!cart) throw new NotFoundException('Cart not found');
      const cartItems = await manager.find(CartItem, {
        where: { cart: { id: cart.id } },
        relations: { variant: true },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write', tables: ['cart_items'] },
      });
      if (!cartItems.length)
        throw new UnprocessableEntityException('Cart is empty');

      const address = await manager.findOne(Address, {
        where: { id: input.addressId, user: { id: userId } },
      });
      if (!address) throw new NotFoundException('Shipping address not found');
      const checkoutLines: Array<{
        item: CartItem;
        variant: ProductVariant;
        productName: string;
        lineTotal: number;
      }> = [];
      for (const item of cartItems) {
        const variant = await manager.findOne(ProductVariant, {
          where: { id: item.variant.id, isActive: true },
          relations: { product: true },
          lock: { mode: 'pessimistic_write', tables: ['product_variants'] },
        });
        if (!variant || variant.product.status !== 'active')
          throw new UnprocessableEntityException(
            'A cart item is no longer available',
          );
        if (variant.stockQuantity < item.quantity)
          throw new UnprocessableEntityException(
            `Insufficient stock for ${variant.sku}`,
          );
        checkoutLines.push({
          item,
          variant,
          productName: variant.product.name,
          lineTotal: variant.priceMinor * item.quantity,
        });
      }

      const subtotalMinor = checkoutLines.reduce(
        (sum, line) => sum + line.lineTotal,
        0,
      );
      const { coupon, discountMinor } = await this.coupons.calculate(
        input.couponCode,
        subtotalMinor,
        true,
        manager,
      );
      const shippingMinor = address.city.trim().toLowerCase() === 'dhaka'
        ? 8000
        : 14000;
      const totalMinor = subtotalMinor - discountMinor + shippingMinor;
      if (totalMinor > 2_000_000_000)
        throw new UnprocessableEntityException(
          'Order total exceeds the supported limit',
        );

      const order = manager.create(Order, {
        orderNumber: this.orderNumber(),
        idempotencyKey: input.idempotencyKey,
        user: { id: userId } as User,
        coupon,
        shippingAddress: {
          recipient: address.recipient,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          region: address.region,
          postalCode: address.postalCode,
          country: address.country,
        },
        orderStatus:
          input.paymentProvider === 'cod' ? 'confirmed' : 'pending_payment',
        paymentStatus: 'pending',
        fulfillmentStatus: 'unfulfilled',
        subtotalMinor,
        discountMinor,
        shippingMinor,
        totalMinor,
        currency: 'BDT',
        paymentDeadline:
          input.paymentProvider === 'eps'
            ? new Date(Date.now() + 15 * 60 * 1000)
            : null,
      });
      const savedOrder = await manager.save(order);

      for (const line of checkoutLines) {
        const variant = line.variant;
        variant.stockQuantity -= line.item.quantity;
        await manager.save(variant);
        await manager.save(
          manager.create(OrderItem, {
            order: savedOrder,
            variant,
            productName: line.productName,
            sku: variant.sku,
            unitPriceMinor: variant.priceMinor,
            quantity: line.item.quantity,
            lineTotalMinor: line.lineTotal,
          }),
        );
        await manager.save(
          manager.create(InventoryMovement, {
            variant,
            order: savedOrder,
            actor: { id: userId } as User,
            quantityDelta: -line.item.quantity,
            reason: 'order_reserved',
            note: savedOrder.orderNumber,
          }),
        );
      }

      if (coupon) {
        coupon.usageCount += 1;
        await manager.save(coupon);
      }
      const payment = manager.create(Payment, {
        order: savedOrder,
        provider: input.paymentProvider,
        status: 'pending',
        amountMinor: totalMinor,
        currency: 'BDT',
        merchantTransactionId:
          input.paymentProvider === 'eps' ? this.merchantTransactionId() : null,
        providerTransactionId: null,
        idempotencyKey: input.idempotencyKey,
        providerMetadata: {},
        paidAt: null,
      });
      await manager.save(payment);
      await manager.delete(CartItem, { cart: { id: cart.id } });
      return manager.findOneOrFail(Order, {
        where: { id: savedOrder.id },
        relations: { items: true, payments: true },
      });
    });
  }

  async listMine(userId: number, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [items, total] = await this.orders.findAndCount({
      where: { user: { id: userId } },
      relations: { items: true, payments: true },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    return { items, page: safePage, limit: safeLimit, total };
  }

  async getMine(userId: number, orderNumber: string) {
    const order = await this.orders.findOne({
      where: { orderNumber, user: { id: userId } },
      relations: { items: true, payments: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async cancelMine(userId: number, orderNumber: string) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { orderNumber, user: { id: userId } },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (
        order.paymentStatus === 'paid' ||
        ['shipped', 'delivered', 'cancelled', 'refunded'].includes(
          order.orderStatus,
        )
      ) {
        throw new ConflictException(
          'This order can no longer be cancelled online',
        );
      }
      const items = await manager.find(OrderItem, {
        where: { order: { id: order.id } },
        relations: { variant: true },
      });
      for (const item of items) {
        if (!item.variant) continue;
        const variant = await manager.findOne(ProductVariant, {
          where: { id: item.variant.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!variant) continue;
        variant.stockQuantity += item.quantity;
        await manager.save(variant);
        await manager.save(
          manager.create(InventoryMovement, {
            variant,
            order,
            actor: { id: userId } as User,
            quantityDelta: item.quantity,
            reason: 'order_cancelled',
            note: order.orderNumber,
          }),
        );
      }
      if (order.couponId) {
        const coupon = await manager.findOne(Coupon, {
          where: { id: order.couponId },
          lock: { mode: 'pessimistic_write' },
        });
        if (coupon && coupon.usageCount > 0) {
          coupon.usageCount -= 1;
          await manager.save(coupon);
        }
      }
      order.orderStatus = 'cancelled';
      order.cancelledAt = new Date();
      await manager.save(order);
      return order;
    });
  }

  async listAdmin(page = 1, limit = 20, status?: string) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [items, total] = await this.orders.findAndCount({
      where: status ? { orderStatus: status as Order['orderStatus'] } : {},
      relations: { user: true, items: true, payments: true },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    return { items, page: safePage, limit: safeLimit, total };
  }

  async updateAdminStatus(id: number, status: Order['orderStatus']) {
    const allowed: Record<Order['orderStatus'], Order['orderStatus'][]> = {
      pending_payment: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: [],
      cancelled: [],
      refunded: [],
    };
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (status === order.orderStatus) return order;
      if (!allowed[order.orderStatus].includes(status))
        throw new ConflictException(
          `Cannot change order from ${order.orderStatus} to ${status}`,
        );
      if (status === 'cancelled') {
        if (order.paymentStatus === 'paid')
          throw new ConflictException(
            'Paid orders require a verified refund before cancellation',
          );
        const items = await manager.find(OrderItem, {
          where: { order: { id: order.id } },
          relations: { variant: true },
        });
        for (const item of items) {
          if (!item.variant) continue;
          const variant = await manager.findOne(ProductVariant, {
            where: { id: item.variant.id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!variant) continue;
          variant.stockQuantity += item.quantity;
          await manager.save(variant);
          await manager.save(
            manager.create(InventoryMovement, {
              variant,
              order,
              quantityDelta: item.quantity,
              reason: 'admin_order_cancelled',
              note: order.orderNumber,
            }),
          );
        }
        order.cancelledAt = new Date();
        if (order.couponId) {
          const coupon = await manager.findOne(Coupon, {
            where: { id: order.couponId },
            lock: { mode: 'pessimistic_write' },
          });
          if (coupon && coupon.usageCount > 0) {
            coupon.usageCount -= 1;
            await manager.save(coupon);
          }
        }
      }
      order.orderStatus = status;
      if (status === 'delivered') order.fulfillmentStatus = 'fulfilled';
      return manager.save(order);
    });
  }

  async expirePendingPayments(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const expired = await manager
        .createQueryBuilder(Order, 'o')
        .where(
          "o.order_status = 'pending_payment' AND o.payment_deadline <= now()",
        )
        .orderBy('o.payment_deadline', 'ASC')
        .take(100)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      for (const order of expired) {
        const items = await manager.find(OrderItem, {
          where: { order: { id: order.id } },
          relations: { variant: true },
        });
        for (const item of items) {
          if (!item.variant) continue;
          const variant = await manager.findOne(ProductVariant, {
            where: { id: item.variant.id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!variant) continue;
          variant.stockQuantity += item.quantity;
          await manager.save(variant);
          await manager.save(
            manager.create(InventoryMovement, {
              variant,
              order,
              quantityDelta: item.quantity,
              reason: 'payment_expired',
              note: order.orderNumber,
            }),
          );
        }
        if (order.couponId) {
          const coupon = await manager.findOne(Coupon, {
            where: { id: order.couponId },
            lock: { mode: 'pessimistic_write' },
          });
          if (coupon && coupon.usageCount > 0) {
            coupon.usageCount -= 1;
            await manager.save(coupon);
          }
        }
        order.orderStatus = 'cancelled';
        order.paymentStatus = 'failed';
        order.cancelledAt = new Date();
        await manager.save(order);
        await manager.update(
          Payment,
          { order: { id: order.id }, status: 'pending' },
          { status: 'failed' },
        );
      }
    });
  }

  private orderNumber(): string {
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `ORB-${day}-${randomInt(100000, 1000000)}`;
  }

  private merchantTransactionId(): string {
    return `${Date.now()}${randomInt(100, 1000)}`;
  }
}
