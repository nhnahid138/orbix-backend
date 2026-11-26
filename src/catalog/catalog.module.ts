import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AdminAuditLog,
  Category,
  InventoryMovement,
  HomeBanner,
  Product,
  ProductImage,
  ProductVariant,
} from '../database/entities.js';
import { AdminAuditService } from '../common/admin-audit.service.js';
import {
  AdminCategoriesController,
  AdminProductsController,
  CategoriesController,
  ProductsController,
} from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { HomeBannerService } from './banners.service.js';
import {
  AdminHomeBannersController,
  HomeBannersController,
} from './banners.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Category,
      Product,
      ProductVariant,
      ProductImage,
      InventoryMovement,
      AdminAuditLog,
      HomeBanner,
    ]),
  ],
  controllers: [
    CategoriesController,
    ProductsController,
    AdminCategoriesController,
    AdminProductsController,
    HomeBannersController,
    AdminHomeBannersController,
  ],
  providers: [CatalogService, AdminAuditService, HomeBannerService],
  exports: [CatalogService],
})
export class CatalogModule {}
