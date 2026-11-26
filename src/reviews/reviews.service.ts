import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  OrderItem,
  Product,
  ProductVariant,
  Review,
  User,
} from '../database/entities.js';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
  ) {}

  async listPublished(productId: number, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [items, total] = await this.reviews.findAndCount({
      where: { product: { id: productId }, status: 'published' },
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        createdAt: true,
        user: { id: true, name: true },
      },
      relations: { user: true },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    const aggregate = await this.reviews
      .createQueryBuilder('review')
      .select('AVG(review.rating)', 'averageRating')
      .where('review.product_id = :productId AND review.status = :status', {
        productId,
        status: 'published',
      })
      .getRawOne<{ averageRating: string | null }>();
    return {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      averageRating: Number(aggregate?.averageRating ?? 0),
    };
  }

  async create(
    userId: number,
    productId: number,
    input: { variantId: number; rating: number; title?: string; body?: string },
  ) {
    const variant = await this.dataSource
      .getRepository(ProductVariant)
      .findOne({ where: { id: input.variantId, product: { id: productId } } });
    if (!variant) throw new NotFoundException('Product variant not found');
    const purchase = await this.dataSource
      .getRepository(OrderItem)
      .createQueryBuilder('item')
      .innerJoin('item.order', 'o')
      .where(
        'o.user_id = :userId AND o.order_status = :status AND item.variant_id = :variantId',
        { userId, status: 'delivered', variantId: input.variantId },
      )
      .getOne();
    if (!purchase)
      throw new UnprocessableEntityException(
        'A delivered purchase is required to review this product',
      );
    try {
      return await this.reviews.save(
        this.reviews.create({
          user: { id: userId } as User,
          product: { id: productId } as Product,
          variant,
          rating: input.rating,
          title: input.title ?? null,
          body: input.body ?? null,
          status: 'pending',
        }),
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      )
        throw new ConflictException('You have already reviewed this item');
      throw error;
    }
  }

  listAdmin(status?: string) {
    return this.reviews.find({
      where: status ? { status: status as Review['status'] } : {},
      relations: { user: true, product: true, variant: true },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async moderate(id: number, status: 'published' | 'rejected') {
    const review = await this.reviews.findOneBy({ id });
    if (!review) throw new NotFoundException('Review not found');
    review.status = status;
    return this.reviews.save(review);
  }
}
