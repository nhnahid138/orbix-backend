import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialCommerceSchema1764000000000 implements MigrationInterface {
  name = 'InitialCommerceSchema1764000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name varchar(120) NOT NULL,
        email varchar(320) NOT NULL,
        phone_number varchar(30),
        password_hash varchar(255) NOT NULL,
        role varchar(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
        status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_users_email UNIQUE (email)
      );
      CREATE TABLE refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash varchar(64) NOT NULL UNIQUE,
        family_id uuid NOT NULL,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);
      CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name varchar(100) NOT NULL,
        slug varchar(120) NOT NULL UNIQUE,
        description text,
        parent_id integer REFERENCES categories(id) ON DELETE SET NULL,
        sort_order integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        name varchar(180) NOT NULL,
        slug varchar(200) NOT NULL UNIQUE,
        description text,
        category_id integer REFERENCES categories(id) ON DELETE SET NULL,
        status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
        seo_title varchar(180),
        seo_description varchar(320),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_products_status_created ON products(status, created_at DESC);
      CREATE TABLE product_variants (
        id SERIAL PRIMARY KEY,
        product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        sku varchar(80) NOT NULL UNIQUE,
        name varchar(140),
        attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
        price_minor integer NOT NULL CHECK (price_minor >= 0),
        compare_at_minor integer CHECK (compare_at_minor IS NULL OR compare_at_minor >= price_minor),
        currency varchar(3) NOT NULL DEFAULT 'BDT',
        stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
        is_active boolean NOT NULL DEFAULT true,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_variants_product_active ON product_variants(product_id, is_active);
      CREATE TABLE product_images (
        id SERIAL PRIMARY KEY,
        product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        url varchar(2048) NOT NULL,
        alt varchar(180),
        sort_order integer NOT NULL DEFAULT 0
      );
      CREATE TABLE addresses (
        id SERIAL PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient varchar(120) NOT NULL,
        phone varchar(30) NOT NULL,
        line_1 varchar(220) NOT NULL,
        line_2 varchar(220),
        city varchar(100) NOT NULL,
        region varchar(100),
        postal_code varchar(20),
        country varchar(2) NOT NULL DEFAULT 'BD',
        is_default boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_addresses_user ON addresses(user_id);
      CREATE TABLE carts (
        id SERIAL PRIMARY KEY,
        user_id integer NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE cart_items (
        id SERIAL PRIMARY KEY,
        cart_id integer NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
        variant_id integer NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_cart_items_variant UNIQUE(cart_id, variant_id)
      );
      CREATE TABLE coupons (
        id SERIAL PRIMARY KEY,
        code varchar(40) NOT NULL UNIQUE,
        discount_type varchar(20) NOT NULL CHECK (discount_type IN ('fixed','percent')),
        discount_value integer NOT NULL CHECK (discount_value > 0),
        minimum_subtotal_minor integer NOT NULL DEFAULT 0,
        maximum_discount_minor integer,
        usage_limit integer,
        usage_count integer NOT NULL DEFAULT 0,
        starts_at timestamptz,
        expires_at timestamptz,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        order_number varchar(40) NOT NULL UNIQUE,
        idempotency_key varchar(100),
        user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        coupon_id integer REFERENCES coupons(id) ON DELETE SET NULL,
        shipping_address jsonb NOT NULL,
        order_status varchar(30) NOT NULL DEFAULT 'pending_payment',
        payment_status varchar(20) NOT NULL DEFAULT 'pending',
        fulfillment_status varchar(30) NOT NULL DEFAULT 'unfulfilled',
        subtotal_minor integer NOT NULL CHECK (subtotal_minor >= 0),
        discount_minor integer NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
        shipping_minor integer NOT NULL DEFAULT 0 CHECK (shipping_minor >= 0),
        total_minor integer NOT NULL CHECK (total_minor >= 0),
        currency varchar(3) NOT NULL DEFAULT 'BDT',
        cancelled_at timestamptz,
        payment_deadline timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (order_status IN ('pending_payment','confirmed','processing','shipped','delivered','cancelled','refunded')),
        CHECK (payment_status IN ('pending','paid','failed','refunded')),
        CHECK (fulfillment_status IN ('unfulfilled','partially_fulfilled','fulfilled','returned'))
      );
      CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);
      CREATE UNIQUE INDEX uq_orders_user_idempotency ON orders(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX idx_orders_status_created ON orders(order_status, created_at DESC);
      CREATE INDEX idx_orders_payment_deadline ON orders(payment_deadline) WHERE order_status = 'pending_payment';
      CREATE TABLE order_items (
        id SERIAL PRIMARY KEY,
        order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        variant_id integer REFERENCES product_variants(id) ON DELETE SET NULL,
        product_name varchar(180) NOT NULL,
        sku varchar(80) NOT NULL,
        unit_price_minor integer NOT NULL CHECK (unit_price_minor >= 0),
        quantity integer NOT NULL CHECK (quantity > 0),
        line_total_minor integer NOT NULL CHECK (line_total_minor >= 0)
      );
      CREATE TABLE payments (
        id SERIAL PRIMARY KEY,
        order_id integer NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        provider varchar(20) NOT NULL CHECK (provider IN ('eps','cod')),
        status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
        amount_minor integer NOT NULL CHECK (amount_minor >= 0),
        currency varchar(3) NOT NULL DEFAULT 'BDT',
        merchant_transaction_id varchar(40) UNIQUE,
        provider_transaction_id varchar(100),
        idempotency_key varchar(100),
        provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        paid_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX uq_payments_provider_txn ON payments(provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;
      CREATE UNIQUE INDEX uq_payments_idempotency ON payments(order_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX idx_payments_order_created ON payments(order_id, created_at DESC);
      CREATE TABLE inventory_movements (
        id SERIAL PRIMARY KEY,
        variant_id integer NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
        order_id integer REFERENCES orders(id) ON DELETE SET NULL,
        actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
        reason varchar(40) NOT NULL,
        note varchar(240),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_inventory_variant_created ON inventory_movements(variant_id, created_at DESC);
      CREATE TABLE reviews (
        id SERIAL PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variant_id integer REFERENCES product_variants(id) ON DELETE SET NULL,
        rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title varchar(180),
        body text,
        status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_reviews_user_variant UNIQUE(user_id, variant_id)
      );
      CREATE TABLE admin_audit_logs (
        id SERIAL PRIMARY KEY,
        actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
        action varchar(100) NOT NULL,
        entity_type varchar(80) NOT NULL,
        entity_id varchar(80),
        request_id varchar(80),
        ip varchar(64),
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_audit_created ON admin_audit_logs(created_at DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS admin_audit_logs, reviews, inventory_movements, payments,
        order_items, orders, coupons, cart_items, carts, addresses, product_images,
        product_variants, products, categories, refresh_tokens, users CASCADE;
    `);
  }
}
