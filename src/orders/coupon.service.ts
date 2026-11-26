import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon } from '../database/entities.js';
import { CouponDto, UpdateCouponDto } from './coupon.dto.js';

@Injectable()
export class CouponService {
  constructor(
    @InjectRepository(Coupon) private readonly coupons: Repository<Coupon>,
  ) {}

  async calculate(
    code: string | undefined,
    subtotalMinor: number,
    lock = false,
    manager = this.coupons.manager,
  ) {
    if (!code) return { coupon: null, discountMinor: 0 };
    const repo = manager.getRepository(Coupon);
    const coupon = await repo.findOne({
      where: { code: code.trim().toUpperCase() },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    const now = new Date();
    if (
      !coupon ||
      !coupon.isActive ||
      (coupon.startsAt && coupon.startsAt > now) ||
      (coupon.expiresAt && coupon.expiresAt < now)
    ) {
      throw new UnprocessableEntityException('Coupon is invalid or expired');
    }
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit)
      throw new UnprocessableEntityException('Coupon usage limit reached');
    if (subtotalMinor < coupon.minimumSubtotalMinor)
      throw new UnprocessableEntityException(
        'Order total does not meet coupon minimum',
      );
    let discountMinor =
      coupon.discountType === 'fixed'
        ? coupon.discountValue
        : Math.floor((subtotalMinor * coupon.discountValue) / 10000);
    if (coupon.maximumDiscountMinor !== null)
      discountMinor = Math.min(discountMinor, coupon.maximumDiscountMinor);
    discountMinor = Math.min(subtotalMinor, discountMinor);
    return { coupon, discountMinor };
  }

  async list() {
    return this.coupons.find({ order: { createdAt: 'DESC' } });
  }

  async create(input: CouponDto) {
    if (input.discountType === 'percent' && input.discountValue > 10000)
      throw new UnprocessableEntityException(
        'Percent discount must be at most 10000 basis points',
      );
    if (
      input.expiresAt &&
      input.startsAt &&
      new Date(input.expiresAt) <= new Date(input.startsAt)
    )
      throw new UnprocessableEntityException(
        'Coupon end must follow its start',
      );
    try {
      return await this.coupons.save(
        this.coupons.create({
          code: input.code.trim().toUpperCase(),
          discountType: input.discountType,
          discountValue: input.discountValue,
          minimumSubtotalMinor: input.minimumSubtotalMinor ?? 0,
          maximumDiscountMinor: input.maximumDiscountMinor ?? null,
          usageLimit: input.usageLimit ?? null,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          isActive: input.isActive ?? true,
        }),
      );
    } catch (error) {
      this.uniqueError(error);
    }
  }

  async update(id: number, input: UpdateCouponDto) {
    const coupon = await this.coupons.findOneBy({ id });
    if (!coupon) throw new NotFoundException('Coupon not found');
    Object.assign(coupon, input);
    if (input.code !== undefined) coupon.code = input.code.trim().toUpperCase();
    if (input.startsAt !== undefined)
      coupon.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (input.expiresAt !== undefined)
      coupon.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (coupon.discountType === 'percent' && coupon.discountValue > 10000)
      throw new UnprocessableEntityException(
        'Percent discount must be at most 10000 basis points',
      );
    try {
      return await this.coupons.save(coupon);
    } catch (error) {
      this.uniqueError(error);
    }
  }

  async archive(id: number) {
    const coupon = await this.coupons.findOneBy({ id });
    if (!coupon) throw new NotFoundException('Coupon not found');
    coupon.isActive = false;
    return this.coupons.save(coupon);
  }

  private uniqueError(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    )
      throw new ConflictException('Coupon code already exists');
    throw error;
  }
}
