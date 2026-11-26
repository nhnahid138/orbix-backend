import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

export type UserRole = 'customer' | 'admin';
export type UserStatus = 'active' | 'blocked';
export type ProductStatus = 'draft' | 'active' | 'archived';
export type OrderStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type FulfillmentStatus =
  'unfulfilled' | 'partially_fulfilled' | 'fulfilled' | 'returned';
export type PaymentProvider = 'eps' | 'cod';

@Entity('users')
@Index('uq_users_email', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column({ type: 'varchar', length: 320 }) email: string;
  @Column({ name: 'phone_number', type: 'varchar', length: 30, nullable: true })
  phoneNumber: string | null;
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;
  @Column({ type: 'varchar', length: 20, default: 'customer' }) role: UserRole;
  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: UserStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens: RefreshToken[];
}

@Entity('refresh_tokens')
@Index('uq_refresh_tokens_hash', ['tokenHash'], { unique: true })
@Index('idx_refresh_tokens_family', ['familyId'])
export class RefreshToken {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => User, (user) => user.refreshTokens, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;
  @Column({ name: 'family_id', type: 'uuid' }) familyId: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('categories')
@Index('uq_categories_slug', ['slug'], { unique: true })
export class Category {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar', length: 100 }) name: string;
  @Column({ type: 'varchar', length: 120 }) slug: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'cover_image_url', type: 'text', nullable: true })
  coverImageUrl: string | null;
  @Column({ name: 'main_image_url', type: 'text', nullable: true })
  mainImageUrl: string | null;
  @ManyToOne(() => Category, (category) => category.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Category | null;
  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];
  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('products')
@Index('uq_products_slug', ['slug'], { unique: true })
export class Product {
  @Column({ name: 'is_featured', type: 'boolean', default: false })
  isFeatured: boolean;
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar', length: 180 }) name: string;
  @Column({ type: 'varchar', length: 200 }) slug: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;
  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: ProductStatus;
  @Column({ name: 'seo_title', type: 'varchar', length: 180, nullable: true })
  seoTitle: string | null;
  @Column({
    name: 'seo_description',
    type: 'varchar',
    length: 320,
    nullable: true,
  })
  seoDescription: string | null;
  @OneToMany(() => ProductVariant, (variant) => variant.product, {
    cascade: ['insert', 'update'],
  })
  variants: ProductVariant[];
  @OneToMany(() => ProductImage, (image) => image.product, {
    cascade: ['insert', 'update'],
  })
  images: ProductImage[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('product_variants')
@Index('uq_product_variants_sku', ['sku'], { unique: true })
export class ProductVariant {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;
  @Column({ type: 'varchar', length: 80 }) sku: string;
  @Column({ type: 'varchar', length: 140, nullable: true }) name: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) attributes: Record<
    string,
    string
  >;
  @Column({ name: 'price_minor', type: 'integer' }) priceMinor: number;
  @Column({ name: 'compare_at_minor', type: 'integer', nullable: true })
  compareAtMinor: number | null;
  @Column({ name: 'cost_minor', type: 'integer', nullable: true, select: false })
  costMinor: number | null;
  @Column({ type: 'varchar', length: 3, default: 'BDT' }) currency: string;
  @Column({ name: 'stock_quantity', type: 'integer', default: 0 })
  stockQuantity: number;
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
  @VersionColumn({ name: 'version', type: 'integer' }) version: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => Product, (product) => product.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'product_id' })
  product: Product;
  @Column({ type: 'varchar', length: 2048 }) url: string;
  @Column({ type: 'varchar', length: 180, nullable: true }) alt: string | null;
  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;
}

@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
  @Column({ type: 'varchar', length: 120 }) recipient: string;
  @Column({ type: 'varchar', length: 30 }) phone: string;
  @Column({ name: 'line_1', type: 'varchar', length: 220 }) line1: string;
  @Column({ name: 'line_2', type: 'varchar', length: 220, nullable: true })
  line2: string | null;
  @Column({ type: 'varchar', length: 100 }) city: string;
  @Column({ type: 'varchar', length: 100, nullable: true }) region:
    string | null;
  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode: string | null;
  @Column({ type: 'varchar', length: 2, default: 'BD' }) country: string;
  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('carts')
@Index('uq_carts_user', ['user'], { unique: true })
export class Cart {
  @PrimaryGeneratedColumn() id: number;
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
  @OneToMany(() => CartItem, (item) => item.cart, {
    cascade: ['insert', 'update'],
  })
  items: CartItem[];
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('cart_items')
@Index('uq_cart_items_variant', ['cart', 'variant'], { unique: true })
export class CartItem {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart: Cart;
  @ManyToOne(() => ProductVariant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;
  @Column({ type: 'integer' }) quantity: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('coupons')
@Index('uq_coupons_code', ['code'], { unique: true })
export class Coupon {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar', length: 40 }) code: string;
  @Column({ name: 'discount_type', type: 'varchar', length: 20 }) discountType:
    'fixed' | 'percent';
  @Column({ name: 'discount_value', type: 'integer' }) discountValue: number;
  @Column({ name: 'minimum_subtotal_minor', type: 'integer', default: 0 })
  minimumSubtotalMinor: number;
  @Column({ name: 'maximum_discount_minor', type: 'integer', nullable: true })
  maximumDiscountMinor: number | null;
  @Column({ name: 'usage_limit', type: 'integer', nullable: true }) usageLimit:
    number | null;
  @Column({ name: 'usage_count', type: 'integer', default: 0 })
  usageCount: number;
  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('orders')
@Index('uq_orders_order_number', ['orderNumber'], { unique: true })
@Index('uq_orders_user_idempotency', ['user', 'idempotencyKey'], {
  unique: true,
})
export class Order {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'order_number', type: 'varchar', length: 40 })
  orderNumber: string;
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  idempotencyKey: string | null;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;
  @ManyToOne(() => Coupon, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'coupon_id' })
  coupon: Coupon | null;
  @RelationId((order: Order) => order.coupon) couponId: number | null;
  @Column({ name: 'shipping_address', type: 'jsonb' }) shippingAddress: Record<
    string,
    unknown
  >;
  @Column({
    name: 'order_status',
    type: 'varchar',
    length: 30,
    default: 'pending_payment',
  })
  orderStatus: OrderStatus;
  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  paymentStatus: PaymentStatus;
  @Column({
    name: 'fulfillment_status',
    type: 'varchar',
    length: 30,
    default: 'unfulfilled',
  })
  fulfillmentStatus: FulfillmentStatus;
  @Column({ name: 'subtotal_minor', type: 'integer' }) subtotalMinor: number;
  @Column({ name: 'discount_minor', type: 'integer', default: 0 })
  discountMinor: number;
  @Column({ name: 'shipping_minor', type: 'integer', default: 0 })
  shippingMinor: number;
  @Column({ name: 'total_minor', type: 'integer' }) totalMinor: number;
  @Column({ type: 'varchar', length: 3, default: 'BDT' }) currency: string;
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;
  @Column({ name: 'payment_deadline', type: 'timestamptz', nullable: true })
  paymentDeadline: Date | null;
  @OneToMany(() => OrderItem, (item) => item.order, { cascade: ['insert'] })
  items: OrderItem[];
  @OneToMany(() => Payment, (payment) => payment.order) payments: Payment[];
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;
  @ManyToOne(() => ProductVariant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant | null;
  @Column({ name: 'product_name', type: 'varchar', length: 180 })
  productName: string;
  @Column({ type: 'varchar', length: 80 }) sku: string;
  @Column({ name: 'unit_price_minor', type: 'integer' }) unitPriceMinor: number;
  @Column({ type: 'integer' }) quantity: number;
  @Column({ name: 'line_total_minor', type: 'integer' }) lineTotalMinor: number;
}

@Entity('payments')
@Index('uq_payments_merchant_txn', ['merchantTransactionId'], { unique: true })
export class Payment {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => Order, (order) => order.payments, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order: Order;
  @Column({ type: 'varchar', length: 20 }) provider: PaymentProvider;
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: PaymentStatus;
  @Column({ name: 'amount_minor', type: 'integer' }) amountMinor: number;
  @Column({ type: 'varchar', length: 3, default: 'BDT' }) currency: string;
  @Column({
    name: 'merchant_transaction_id',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  merchantTransactionId: string | null;
  @Column({
    name: 'provider_transaction_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerTransactionId: string | null;
  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  idempotencyKey: string | null;
  @Column({
    name: 'provider_metadata',
    type: 'jsonb',
    default: () => "'{}'::jsonb",
  })
  providerMetadata: Record<string, unknown>;
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('inventory_movements')
export class InventoryMovement {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => ProductVariant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;
  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_user_id' })
  actor: User | null;
  @Column({ name: 'quantity_delta', type: 'integer' }) quantityDelta: number;
  @Column({ type: 'varchar', length: 40 }) reason: string;
  @Column({ type: 'varchar', length: 240, nullable: true }) note: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('reviews')
@Index('uq_reviews_user_variant', ['user', 'variant'], { unique: true })
export class Review {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
  @ManyToOne(() => ProductVariant, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant | null;
  @Column({ type: 'integer' }) rating: number;
  @Column({ type: 'varchar', length: 180, nullable: true }) title:
    string | null;
  @Column({ type: 'text', nullable: true }) body: string | null;
  @Column({ type: 'varchar', length: 20, default: 'pending' }) status:
    'pending' | 'published' | 'rejected';
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('admin_audit_logs')
export class AdminAuditLog {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_user_id' })
  actor: User | null;
  @Column({ type: 'varchar', length: 100 }) action: string;
  @Column({ name: 'entity_type', type: 'varchar', length: 80 })
  entityType: string;
  @Column({ name: 'entity_id', type: 'varchar', length: 80, nullable: true })
  entityId: string | null;
  @Column({ name: 'request_id', type: 'varchar', length: 80, nullable: true })
  requestId: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) ip: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" }) metadata: Record<
    string,
    unknown
  >;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('home_banners')
@Index('idx_home_banners_active_order', ['isActive', 'sortOrder'])
export class HomeBanner {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar', length: 100 }) eyebrow: string;
  @Column({ type: 'varchar', length: 180 }) title: string;
  @Column({ type: 'text', nullable: true }) subtitle: string | null;
  @Column({ name: 'image_url', type: 'varchar', length: 2048 }) imageUrl: string;
  @Column({ name: 'cta_label', type: 'varchar', length: 80, default: 'Shop now' })
  ctaLabel: string;
  @Column({ name: 'cta_href', type: 'varchar', length: 255, default: '/products' })
  ctaHref: string;
  @Column({ name: 'sort_order', type: 'integer', default: 0 }) sortOrder: number;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive: boolean;
  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true }) startsAt: Date | null;
  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true }) endsAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
