import { BrandingController } from './branding/branding.controller.js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtAuthGuard, RolesGuard } from './common/auth.guards.js';
import { AuthModule } from './auth/auth.module.js';
import { AdminModule } from './admin/admin.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { validateEnv } from './config/validate-env.js';
import {
  Address,
  AdminAuditLog,
  Cart,
  CartItem,
  Category,
  Coupon,
  InventoryMovement,
  HomeBanner,
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
import { HealthController } from './health.controller.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { MediaModule } from './media/media.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { ShoppingModule } from './shopping/shopping.module.js';
import { UsersModule } from './users/users.module.js';

const entities = [
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
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.getOrThrow<string>('DB_HOST'),
        port: config.getOrThrow<number>('DB_PORT'),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_DATABASE'),
        ssl:
          config.get('DB_SSL') === 'true'
            ? { rejectUnauthorized: true }
            : false,
        entities,
        migrations: [InitialCommerceSchema1764000000000, HomeBanners1764100000000, StoreBranding1764200000000, VariantCost1764300000000, CategoryCover1764400000000, FeaturedProducts1764500000000, CategoryMainImage1764600000000],
        migrationsTableName: 'typeorm_migrations',
        migrationsRun: false,
        synchronize: false,
        retryAttempts: 1,
        extra: {
          connectionTimeoutMillis: Number(
            config.get('DB_CONNECT_TIMEOUT_MS', '10000'),
          ),
        },
        poolSize: Number(config.get('DB_POOL_SIZE', '10')),
      }),
    }),
    TypeOrmModule.forFeature([User]),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    AuthModule,
    CatalogModule,
    MediaModule,
    ShoppingModule,
    OrdersModule,
    PaymentsModule,
    ReviewsModule,
    UsersModule,
    AdminModule,
  ],
  controllers: [HealthController, BrandingController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
