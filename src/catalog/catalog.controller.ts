import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser, Public, Roles } from '../common/security.decorators.js';
import type { AuthenticatedUser } from '../common/security.decorators.js';
import { AdminAuditService } from '../common/admin-audit.service.js';
import {
  CategoryDto,
  ProductDto,
  StockAdjustmentDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './catalog.dto.js';
import { CatalogService } from './catalog.service.js';

function numberQuery(
  value: string | undefined,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new BadRequestException(`${name} must be a positive integer`);
  return parsed;
}

@Controller('categories')
export class CategoriesController {
  constructor(private readonly catalog: CatalogService) {}
  @Public() @Get() list() {
    return this.catalog.listCategories();
  }
}

@Controller('products')
export class ProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
    @Query('sort') sort?: string,
  ) {
    return this.catalog.listProducts({
      page: numberQuery(page, 'page'),
      limit: numberQuery(limit, 'limit'),
      q,
      categoryId: numberQuery(categoryId, 'categoryId'),
      sort,
    });
  }

  @Public() @Get(':slug') get(@Param('slug') slug: string) {
    return this.catalog.getProduct(slug);
  }
}

@Roles('admin')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get() list() {
    return this.catalog.listCategories(true);
  }

  @Post()
  async create(
    @Body() dto: CategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const category = await this.catalog.createCategory(dto);
    await this.audit.record({
      actorId: user.id,
      action: 'category.create',
      entityType: 'category',
      entityId: category.id,
      ip: request.ip,
    });
    return category;
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const category = await this.catalog.updateCategory(id, dto);
    await this.audit.record({
      actorId: user.id,
      action: 'category.update',
      entityType: 'category',
      entityId: id,
      ip: request.ip,
    });
    return category;
  }

  @Delete(':id/permanent')
  @HttpCode(204)
  async deletePermanently(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.catalog.deleteCategory(id, user.id, request.ip);
  }

  @Delete(':id')
  async archive(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const category = await this.catalog.removeCategory(id);
    await this.audit.record({
      actorId: user.id,
      action: 'category.archive',
      entityType: 'category',
      entityId: id,
      ip: request.ip,
    });
    return category;
  }
}

@Roles('admin')
@Controller('admin/products')
export class AdminProductsController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly audit: AdminAuditService,
  ) {}

  @Get()
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    return this.catalog.listProducts(
      {
        page: numberQuery(page, 'page'),
        limit: numberQuery(limit, 'limit'),
        q,
      },
      true,
    );
  }

  @Post()
  async create(
    @Body() dto: ProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const product = await this.catalog.createProduct(dto, user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'product.create',
      entityType: 'product',
      entityId: product.id,
      ip: request.ip,
    });
    return product;
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const product = await this.catalog.updateProduct(id, dto, user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'product.update',
      entityType: 'product',
      entityId: id,
      ip: request.ip,
    });
    return product;
  }

  @Post(':id/stock-adjustments')
  async adjustStock(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StockAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const movement = await this.catalog.adjustStock(dto, user.id, id);
    await this.audit.record({
      actorId: user.id,
      action: 'inventory.adjust',
      entityType: 'product',
      entityId: id,
      ip: request.ip,
      metadata: {
        variantId: dto.variantId,
        delta: dto.quantityDelta,
        reason: dto.reason,
      },
    });
    return movement;
  }
}
