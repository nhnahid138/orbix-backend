import 'dotenv/config';
import { DataSource } from 'typeorm';
import {
  Address,
  AdminAuditLog,
  Cart,
  CartItem,
  Category,
  Coupon,
  HomeBanner,
  InventoryMovement,
  Order,
  OrderItem,
  Payment,
  Product,
  ProductImage,
  ProductVariant,
  RefreshToken,
  Review,
  User,
} from './database/entities.js';
import { InitialCommerceSchema1764000000000 } from './database/migrations/1764000000000-initial-commerce-schema.js';
import { StoreBranding1764200000000 } from './database/migrations/1764200000000-store-branding.js';
import { VariantCost1764300000000 } from './database/migrations/1764300000000-variant-cost.js';
import { CategoryCover1764400000000 } from './database/migrations/1764400000000-category-cover.js';
import { FeaturedProducts1764500000000 } from './database/migrations/1764500000000-featured-products.js';
import { CategoryMainImage1764600000000 } from './database/migrations/1764600000000-category-main-image.js';
import { HomeBanners1764100000000 } from './database/migrations/1764100000000-home-banners.js';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [
    User,
    RefreshToken,
    Category,
    Product,
    ProductVariant,
    ProductImage,
    Address,
    Cart,
    CartItem,
    Coupon,
    Order,
    OrderItem,
    Payment,
    InventoryMovement,
    Review,
    AdminAuditLog,
    HomeBanner,
  ],
  migrations: [InitialCommerceSchema1764000000000, HomeBanners1764100000000, StoreBranding1764200000000, VariantCost1764300000000, CategoryCover1764400000000, FeaturedProducts1764500000000, CategoryMainImage1764600000000],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
});
