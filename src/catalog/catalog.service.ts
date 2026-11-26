import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AdminAuditLog,
  Category,
  InventoryMovement,
  Product,
  ProductImage,
  ProductVariant,
  User,
} from '../database/entities.js';
import {
  CategoryDto,
  ProductDto,
  StockAdjustmentDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './catalog.dto.js';

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variants: Repository<ProductVariant>,
    @InjectRepository(ProductImage)
    private readonly images: Repository<ProductImage>,
    @InjectRepository(InventoryMovement)
    private readonly movements: Repository<InventoryMovement>,
  ) {}

  async listCategories(includeInactive = false) {
    return this.categories.find({
      where: includeInactive ? {} : { isActive: true },
      relations: { parent: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async createCategory(input: CategoryDto) {
    const parent = input.parentId
      ? await this.categories.findOneBy({ id: input.parentId })
      : null;
    if (input.parentId && !parent)
      throw new NotFoundException('Parent category not found');
    try {
      return await this.categories.save(
        this.categories.create({
          name: input.name.trim(),
          slug: slugify(input.slug ?? input.name),
          description: input.description ?? null,
          coverImageUrl: input.coverImageUrl ?? null,
          mainImageUrl: input.mainImageUrl ?? null,
          parent,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        }),
      );
    } catch (error) {
      this.mapUniqueConflict(error);
    }
  }

  async updateCategory(id: number, input: UpdateCategoryDto) {
    const category: Partial<Category> = {};
    if (input.name !== undefined) category.name = input.name.trim();
    if (input.slug !== undefined || input.name !== undefined)
      category.slug = slugify(input.slug ?? input.name ?? '');
    if (input.description !== undefined)
      category.description = input.description;
    if (input.coverImageUrl !== undefined)
      category.coverImageUrl = input.coverImageUrl;
    if (input.mainImageUrl !== undefined)
      category.mainImageUrl = input.mainImageUrl;
    if (input.sortOrder !== undefined) category.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) category.isActive = input.isActive;
    if (input.parentId !== undefined) {
      category.parent = null;
      if (input.parentId !== null) {
        const seen = new Set([id]);
        let ancestorId: number | undefined = input.parentId;
        while (ancestorId !== undefined) {
          if (seen.has(ancestorId))
            throw new UnprocessableEntityException('Category hierarchy cannot contain a cycle');
          seen.add(ancestorId);
          const ancestor: Category | null = await this.categories.findOne({
            where: { id: ancestorId }, relations: { parent: true },
          });
          if (!ancestor) throw new NotFoundException('Parent category not found');
          if (!category.parent) category.parent = ancestor;
          ancestorId = ancestor.parent?.id;
        }
      }
    }
    try {
      if (Object.keys(category).length) await this.categories.update(id, category);
      const updated = await this.categories.findOneBy({ id });
      if (!updated) throw new NotFoundException('Category not found');
      return updated;
    } catch (error) {
      this.mapUniqueConflict(error);
    }
  }

  async removeCategory(id: number) {
    return this.updateCategory(id, { isActive: false });
  }

  async deleteCategory(id: number, actorId: number, ip?: string) {
    await this.dataSource.transaction(async (manager) => {
      const result = await manager.delete(Category, id);
      if (!result.affected) throw new NotFoundException('Category not found');
      await manager.insert(AdminAuditLog, {
        actor: { id: actorId },
        action: 'category.delete',
        entityType: 'category',
        entityId: String(id),
        ip: ip?.slice(0, 64) ?? null,
      });
    });
  }

  async listProducts(
    query: {
      page?: number;
      limit?: number;
      q?: string;
      categoryId?: number;
      sort?: string;
    },
    includeInactive = false,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const qb = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect(
        'product.variants',
        'variant',
        'variant.is_active = true',
      )
      .leftJoinAndSelect('product.images', 'image')
      .take(limit)
      .skip((page - 1) * limit);
    if (includeInactive) qb.addSelect('variant.costMinor');
    if (!includeInactive)
      qb.where('product.status = :status', { status: 'active' });
    if (query.q)
      qb.andWhere('(product.name ILIKE :q OR product.description ILIKE :q)', {
        q: `%${query.q.trim().slice(0, 100)}%`,
      });
    if (query.categoryId)
      qb.andWhere(`category.id IN (
        WITH RECURSIVE branch(id) AS (
          SELECT id FROM categories WHERE id = :categoryId AND is_active
          UNION
          SELECT c.id FROM categories c JOIN branch ON c.parent_id = branch.id WHERE c.is_active
        ) SELECT id FROM branch
      )`, {
        categoryId: query.categoryId,
      });
    if (query.sort === 'price_asc') qb.orderBy('variant.priceMinor', 'ASC');
    else if (query.sort === 'price_desc')
      qb.orderBy('variant.priceMinor', 'DESC');
    else qb.orderBy('product.createdAt', 'DESC');
    qb.addOrderBy('image.sortOrder', 'ASC');
    const [items, total] = await qb.getManyAndCount();
    return { items, page, limit, total };
  }

  async getProduct(slug: string) {
    const product = await this.products.findOne({
      where: { slug, status: 'active' },
      relations: { category: true, variants: true, images: true },
      order: { images: { sortOrder: 'ASC' } },
    });
    if (!product) throw new NotFoundException('Product not found');
    product.variants = product.variants.filter((variant) => variant.isActive);
    return product;
  }

  async createProduct(input: ProductDto, actorId: number) {
    if (!input.variants?.length)
      throw new UnprocessableEntityException(
        'At least one variant is required',
      );
    const product = this.products.create({
      name: input.name.trim(),
      slug: slugify(input.slug ?? input.name),
      description: input.description ?? null,
      category: input.categoryId
        ? ({ id: input.categoryId } as Category)
        : null,
      status: input.status ?? 'draft',
      isFeatured: input.isFeatured ?? false,
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      variants: input.variants.map((variant) =>
        this.variants.create({
          sku: variant.sku,
          attributes: variant.attributes ?? {},
          currency: 'BDT',
          name: variant.name ?? null,
          priceMinor: variant.priceMinor,
          compareAtMinor: variant.compareAtMinor ?? null,
          costMinor: variant.costMinor ?? null,
          stockQuantity: variant.stockQuantity,
          isActive: variant.isActive ?? true,
        }),
      ),
      images: [],
    });
    if (
      input.categoryId &&
      !(await this.categories.existsBy({ id: input.categoryId }))
    )
      throw new NotFoundException('Category not found');
    try {
      return await this.dataSource.transaction(async (manager) => {
        const saved = await manager.save(Product, product);
        const images = (input.images ?? []).map((image) =>
          manager.create(ProductImage, {
            url: image.url,
            alt: image.alt ?? null,
            sortOrder: image.sortOrder ?? 0,
            product: { id: saved.id } as Product,
          }),
        );
        if (images.length) await manager.save(ProductImage, images);
        const initialStock = (saved.variants ?? product.variants ?? [])
          .filter((variant) => variant.stockQuantity > 0)
          .map((variant) =>
            manager.create(InventoryMovement, {
              variant,
              actor: { id: actorId } as User,
              quantityDelta: variant.stockQuantity,
              reason: 'opening_stock',
              note: 'Initial stock when product was created',
            }),
          );
        if (initialStock.length)
          await manager.save(InventoryMovement, initialStock);
        return manager.findOneOrFail(Product, {
          where: { id: saved.id },
          relations: { category: true, variants: true, images: true },
        });
      });
    } catch (error) {
      this.mapUniqueConflict(error);
    }
  }

  async updateProduct(id: number, input: UpdateProductDto, actorId: number) {
    const product = await this.products.findOne({
      where: { id },
      relations: { variants: true, images: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (input.name !== undefined) product.name = input.name.trim();
    if (input.slug !== undefined || input.name !== undefined)
      product.slug = slugify(input.slug ?? input.name ?? product.name);
    if (input.description !== undefined)
      product.description = input.description;
    if (input.status !== undefined) product.status = input.status;
    if (input.isFeatured !== undefined) product.isFeatured = input.isFeatured;
    if (input.seoTitle !== undefined) product.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined)
      product.seoDescription = input.seoDescription;
    if (input.categoryId !== undefined) {
      product.category =
        (await this.categories.findOneBy({ id: input.categoryId })) ?? null;
      if (!product.category) throw new NotFoundException('Category not found');
    }
    try {
      return await this.dataSource.transaction(async (manager) => {
        const saved = await manager.save(Product, product);
        if (input.variants) {
          for (const variantInput of input.variants) {
            const existing = product.variants.find(
              (variant) => variant.sku === variantInput.sku,
            );
            if (existing) {
              if (existing.stockQuantity !== variantInput.stockQuantity) {
                throw new UnprocessableEntityException(
                  'Use the stock adjustment endpoint to change inventory',
                );
              }
              Object.assign(existing, variantInput);
              await manager.save(ProductVariant, existing);
            } else {
              const created = await manager.save(
                ProductVariant,
                manager.create(ProductVariant, {
                  sku: variantInput.sku,
                  name: variantInput.name ?? null,
                  attributes: variantInput.attributes ?? {},
                  priceMinor: variantInput.priceMinor,
                  compareAtMinor: variantInput.compareAtMinor ?? null,
                  costMinor: variantInput.costMinor ?? null,
                  stockQuantity: variantInput.stockQuantity,
                  isActive: variantInput.isActive ?? true,
                  product: saved,
                  currency: 'BDT',
                }),
              );
              if (created.stockQuantity > 0) {
                await manager.save(
                  InventoryMovement,
                  manager.create(InventoryMovement, {
                    variant: created,
                    actor: { id: actorId } as User,
                    quantityDelta: created.stockQuantity,
                    reason: 'opening_stock',
                    note: 'Initial stock when variant was added',
                  }),
                );
              }
            }
          }
        }
        if (input.images) {
          await manager.delete(ProductImage, { product: { id } });
          await manager.save(
            ProductImage,
            input.images.map((image) =>
              manager.create(ProductImage, {
                url: image.url,
                alt: image.alt ?? null,
                sortOrder: image.sortOrder ?? 0,
                product: saved,
              }),
            ),
          );
        }
        return manager.findOneOrFail(Product, {
          where: { id },
          relations: { variants: true, images: true, category: true },
        });
      });
    } catch (error) {
      this.mapUniqueConflict(error);
    }
  }

  async adjustStock(
    input: StockAdjustmentDto,
    actorId: number,
    productId: number,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const variant = await manager.findOne(ProductVariant, {
        where: { id: input.variantId, product: { id: productId } },
        lock: { mode: 'pessimistic_write' },
      });
      if (!variant) throw new NotFoundException('Product variant not found');
      if (variant.stockQuantity + input.quantityDelta < 0)
        throw new UnprocessableEntityException('Stock cannot become negative');
      if (input.quantityDelta === 0)
        throw new UnprocessableEntityException(
          'Quantity adjustment cannot be zero',
        );
      variant.stockQuantity += input.quantityDelta;
      await manager.save(variant);
      const movement = manager.create(InventoryMovement, {
        variant,
        actor: { id: actorId } as User,
        quantityDelta: input.quantityDelta,
        reason: input.reason.trim(),
        note: input.note ?? null,
      });
      return manager.save(movement);
    });
  }

  private mapUniqueConflict(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new ConflictException(
        'A record with that slug, SKU or code already exists',
      );
    }
    throw error;
  }
}
