import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Payment } from '../database/entities.js';
import { EpsClient } from './eps.client.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly eps: EpsClient,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
  ) {}

  availableMethods() {
    const requiredEpsSettings = [
      'EPS_USERNAME',
      'EPS_PASSWORD',
      'EPS_HASH_KEY',
      'EPS_MERCHANT_ID',
      'EPS_STORE_ID',
      'API_PUBLIC_URL',
    ];
    const eps =
      this.config.get('EPS_ENABLED') === 'true' &&
      requiredEpsSettings.every((key) => Boolean(this.config.get(key)));
    return {
      methods: [
        { provider: 'cod', enabled: true },
        { provider: 'eps', enabled: eps },
      ],
    };
  }

  async initialize(paymentId: number, userId: number) {
    const payment = await this.payments.findOne({
      where: { id: paymentId },
      relations: { order: { user: true, items: true } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.order.user.id !== userId) throw new ForbiddenException();
    if (payment.status !== 'pending')
      throw new ConflictException('Payment is no longer pending');
    if (payment.provider === 'cod')
      return {
        paymentId,
        provider: 'cod',
        instructions: 'Pay the courier on delivery.',
      };
    if (!payment.merchantTransactionId)
      throw new ConflictException('Payment transaction is not initialized');
    const user = payment.order.user;
    const epsResult = await this.eps.initializePayment({
      merchantTransactionId: payment.merchantTransactionId,
      orderNumber: payment.order.orderNumber,
      amountMinor: payment.amountMinor,
      customerName: user.name,
      customerEmail: user.email,
      customerPhone:
        user.phoneNumber ??
        this.stringValue(payment.order.shippingAddress.phone),
      address: payment.order.shippingAddress,
      productName: payment.order.items
        .map((item) => item.productName)
        .slice(0, 3)
        .join(', '),
    });
    await this.payments.update(
      { id: payment.id, providerTransactionId: IsNull() },
      { providerTransactionId: epsResult.transactionId },
    );
    return {
      paymentId,
      orderNumber: payment.order.orderNumber,
      redirectUrl: epsResult.redirectUrl,
    };
  }

  async getMine(paymentId: number, userId: number) {
    const payment = await this.payments.findOne({
      where: { id: paymentId },
      relations: { order: { user: true } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.order.user.id !== userId) throw new ForbiddenException();
    return {
      id: payment.id,
      orderNumber: payment.order.orderNumber,
      provider: payment.provider,
      status: payment.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      createdAt: payment.createdAt,
      paidAt: payment.paidAt,
    };
  }

  async receiveIpn(data: string) {
    const ipn = this.eps.decryptIpn(data);
    const merchantTransactionId = ipn.merchant_transaction_id;
    if (
      typeof merchantTransactionId !== 'string' ||
      merchantTransactionId.length > 40
    ) {
      throw new UnprocessableEntityException(
        'EPS notification is missing a transaction ID',
      );
    }
    const result = await this.eps.verifyPayment(merchantTransactionId);
    await this.applyVerifiedResult(merchantTransactionId, result);
    return { status: 'OK', message: 'IPN received and verified' };
  }

  async verifyReturn(merchantTransactionId: string) {
    if (!/^\d{10,40}$/.test(merchantTransactionId))
      throw new UnprocessableEntityException('Invalid transaction ID');
    if (
      !(await this.payments.existsBy({
        merchantTransactionId,
        provider: 'eps',
      }))
    )
      throw new NotFoundException('Payment transaction not found');
    const result = await this.eps.verifyPayment(merchantTransactionId);
    const payment = await this.applyVerifiedResult(
      merchantTransactionId,
      result,
    );
    return { orderNumber: payment.order.orderNumber, status: payment.status };
  }

  private async applyVerifiedResult(
    merchantTransactionId: string,
    result: Record<string, unknown>,
  ) {
    const payment = await this.dataSource.transaction(async (manager) => {
      const current = await manager
        .createQueryBuilder(Payment, 'payment')
        .innerJoinAndSelect('payment.order', 'o')
        .where(
          'payment.merchantTransactionId = :merchantTransactionId AND payment.provider = :provider',
          { merchantTransactionId, provider: 'eps' },
        )
        .setLock('pessimistic_write')
        .getOne();
      if (!current)
        throw new NotFoundException('Payment transaction not found');
      const paymentOrder = current.order;
      const returnedId =
        result.MerchantTransactionId ?? result.merchantTransactionId;
      if (
        typeof returnedId === 'string' &&
        returnedId !== merchantTransactionId
      )
        throw new UnprocessableEntityException('EPS transaction mismatch');
      const rawStatus = result.Status ?? result.status;
      const status =
        typeof rawStatus === 'string' ? rawStatus.toLowerCase() : '';
      if (status === 'success') {
        const amount = this.amountToMinor(
          result.TotalAmount ?? result.totalAmount,
        );
        if (amount !== current.amountMinor)
          throw new UnprocessableEntityException(
            'EPS amount does not match the order',
          );
        if (current.status !== 'paid') {
          current.status = 'paid';
          current.paidAt = new Date();
          const providerId =
            result.EpsTransactionId ??
            result.EPSTransactionId ??
            result.TransactionId;
          current.providerTransactionId =
            typeof providerId === 'string'
              ? providerId
              : current.providerTransactionId;
          current.providerMetadata = {
            verifiedStatus: status,
            paymentMethod: result.FinancialEntity ?? null,
          };
          paymentOrder.paymentStatus = 'paid';
          if (paymentOrder.orderStatus === 'pending_payment')
            paymentOrder.orderStatus = 'confirmed';
          await manager.save(paymentOrder);
          await manager.save(current);
        }
      } else if (status === 'failed' || status === 'cancelled') {
        if (current.status === 'pending') {
          current.status = 'failed';
          current.providerMetadata = { verifiedStatus: status };
          paymentOrder.paymentStatus = 'failed';
          await manager.save(paymentOrder);
          await manager.save(current);
        }
      }
      return manager.findOneOrFail(Payment, {
        where: { id: current.id },
        relations: { order: true },
      });
    });
    return payment;
  }

  private amountToMinor(value: unknown): number {
    if (typeof value !== 'string' && typeof value !== 'number')
      throw new UnprocessableEntityException('EPS response has no amount');
    const text = String(value);
    if (!/^\d+(\.\d{1,2})?$/.test(text))
      throw new UnprocessableEntityException(
        'EPS response has an invalid amount',
      );
    const [major, minor = ''] = text.split('.');
    return Number(major) * 100 + Number(minor.padEnd(2, '0'));
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
