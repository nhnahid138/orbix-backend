# Orbix E-commerce Backend

This document is the implementation plan and API contract for the Orbix store backend. The backend is a versioned NestJS REST API backed by PostgreSQL and TypeORM migrations. The first delivery focuses on a secure single-store commerce core: customer accounts, catalog, inventory, cart, checkout, orders, coupons, payment lifecycle, and admin operations.

## Architecture

- **HTTP:** NestJS REST API under `/api/v1`, DTO validation, OpenAPI docs in development.
- **Database:** PostgreSQL with TypeORM entities and explicit migrations. `synchronize` stays disabled.
- **Auth:** short-lived signed access JWTs plus rotating, hashed refresh tokens in secure HTTP-only cookies. Admin access is role guarded.
- **Money:** integer minor units (BDT poisha); no floating point arithmetic.
- **Checkout:** one DB transaction locks stock rows, validates price/stock/coupon, snapshots item and address data, reserves stock, then creates the order and payment attempt.
- **Payments:** Cash on delivery is available. EPS is represented by a gateway adapter. Live EPS calls and callback verification must use merchant-issued credentials and EPS's current integration contract; redirects alone never mark an order paid.
- **Operations:** structured logs without credentials/card data, health endpoint, audit records for privileged mutations, request IDs, throttling, CORS allowlist, Helmet, and database migrations.

## Data model and relationships

Primary keys are generated `id` columns. Foreign keys use `ON DELETE RESTRICT` for financial/catalog history unless explicitly noted.

| Table | Key columns and relationships |
| --- | --- |
| `users` | `id` PK; unique normalized `email`; password hash; `role` (`customer`, `admin`); active/blocked state; timestamps. One-to-many with addresses, orders, refresh tokens, reviews, audit events. |
| `refresh_tokens` | `id` PK; `user_id` FK → users; token hash, family ID, expiry, revoked/replaced timestamps. Never stores a raw refresh JWT. |
| `categories` | `id` PK; unique slug; nullable `parent_id` FK → categories for a tree; active/sort fields. |
| `home_banners` | `id` PK; eyebrow/title/subtitle, image URL, CTA label/href, active/sort fields, optional start/end schedule and timestamps. |
| `products` | `id` PK; unique slug; nullable `category_id` FK → categories; name/description/SEO fields and draft/active/archived status; timestamps. |
| `product_variants` | `id` PK; `product_id` FK → products (cascade); unique SKU; JSONB attributes; BDT price/compare-at price in poisha; stock quantity/version/status. Each purchasable item is a variant, including a default variant for simple products. |
| `product_images` | `id` PK; `product_id` FK → products (cascade); URL, alt text, sort order. |
| `addresses` | `id` PK; `user_id` FK → users; recipient, phone, address lines, city/region/postcode/country, default flag. Checkout copies an immutable address snapshot to the order. |
| `carts` | `id` PK; unique `user_id` FK → users (cascade); one active cart per customer. |
| `cart_items` | `id` PK; `cart_id` FK → carts (cascade); `variant_id` FK → product_variants; unique `(cart_id, variant_id)`; quantity. |
| `coupons` | `id` PK; unique code; fixed or percent discount; validity window, minimum, maximum discount and usage limits. |
| `orders` | `id` PK; unique human-readable `order_number`; `user_id` FK → users; nullable `coupon_id` FK → coupons; unique per-user idempotency key; address JSON snapshot; order/payment/fulfillment states; totals in poisha; optional online-payment deadline. |
| `order_items` | `id` PK; `order_id` FK → orders (cascade); nullable `variant_id` FK → product_variants (set null); immutable SKU/name/unit-price/quantity/line-total snapshot. |
| `payments` | `id` PK; `order_id` FK → orders; provider, state, amount/currency, unique merchant transaction ID and nullable provider transaction ID; idempotency key and safe provider metadata. Multiple attempts per order are allowed. |
| `inventory_movements` | `id` PK; `product_id` FK → products; optional order and actor FKs; signed quantity delta, reason, timestamp. Append-only stock audit ledger. |
| `reviews` | `id` PK; `user_id`, `product_id` and nullable `variant_id` FKs; unique `(user_id, variant_id)`; rating/body/moderation state. |
| `admin_audit_logs` | `id` PK; actor FK → users; action, entity type/id, request ID, IP, redacted JSON metadata, timestamp. |

### Invariants

1. Registration always assigns `customer`; no public endpoint accepts a role.
2. Product prices and totals are read from the database during checkout, never trusted from the client.
3. Stock cannot go below zero. Product opening stock, admin adjustments, checkout reservations, cancellation, and expired reservation release each write an inventory movement in the same transaction.
4. Order items and shipping address are snapshots so later catalog/address edits do not rewrite history.
5. A payment success is accepted only after provider verification and amount/order matching. Callback processing is idempotent.
6. Admin state changes are authorized and audited. Refund, order cancellation and stock restoration are transactional.

## API conventions

- JSON, UTF-8; timestamps in ISO-8601 UTC.
- Prefix `/api/v1`; list endpoints use `page` (1-based), `limit` (maximum 100), and return `{ items, page, limit, total }`.
- Access token: `Authorization: Bearer <access-token>`; refresh token uses an HTTP-only cookie.
- Error shape follows NestJS HTTP exceptions (`statusCode`, `message`, `error`); validation errors do not echo secrets.
- Idempotency: checkout and payment-initiation accept `Idempotency-Key`; repeated keys return the original result.

## Endpoint plan

### Health and discovery

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | Public | Liveness/readiness without exposing secrets or connection strings. |
| GET | `/docs` | Development only | OpenAPI/Swagger UI. |

### Authentication and account

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | Public, throttled | Create customer account and initial cart. |
| POST | `/auth/login` | Public, throttled | Verify password; return access JWT and set refresh cookie. |
| POST | `/auth/refresh` | Refresh cookie, throttled | Rotate refresh token; revoke token family on reuse. |
| POST | `/auth/logout` | Refresh cookie | Revoke current refresh token and clear cookie. |
| GET | `/auth/me` | Customer/admin | Current account profile. |
| PATCH | `/users/me` | Customer/admin | Update own name/contact fields. |
| POST | `/users/me/password` | Customer/admin | Change password after current-password verification; revoke sessions. |

### Public catalog

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/categories` | Public | Active category tree/list. |
| GET | `/banners` | Public | Active homepage banners within their optional schedule, ordered by `sortOrder`. |
| GET | `/products` | Public | Search/filter/sort/paginate active products. |
| GET | `/products/:slug` | Public | Product detail and images. |
| GET | `/products/:id/reviews` | Public | Published reviews and aggregate rating. |

### Customer shopping

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/addresses` | Customer | List own addresses. |
| POST | `/addresses` | Customer | Add address. |
| PATCH/DELETE | `/addresses/:id` | Owner | Update/delete own address. |
| GET | `/cart` | Customer | Cart with current product prices and stock. |
| POST | `/cart/items` | Customer | Add item; enforce quantity/stock bounds. |
| PATCH/DELETE | `/cart/items/:id` | Owner | Update/remove own item. |
| POST | `/coupons/validate` | Customer | Preview coupon against current cart; does not reserve usage. |
| POST | `/orders/checkout` | Customer, idempotent | Re-price, validate, reserve stock, snapshot order, create payment attempt. |
| GET | `/orders` | Customer | Own order history. |
| GET | `/orders/:orderNumber` | Owner | Order detail and payment state. |
| POST | `/orders/:orderNumber/cancel` | Owner | Cancel eligible unpaid order and restore reserved stock. |
| POST | `/products/:productId/reviews` | Verified purchaser | Submit one review for a purchased variant. |
| POST | `/payments/:paymentId/initialize` | Owner | Start EPS redirect flow or return COD instructions. |
| GET | `/payments/methods` | Public | List enabled payment providers without exposing merchant credentials. |
| POST | `/payments/eps/ipn` | EPS callback, public | Verify/decrypt according to EPS contract, de-duplicate, reconcile payment. |
| GET | `/payments/eps/return` | Public callback | Verify server-to-server; browser redirect is not proof of payment. |

### Admin panel API

All routes below require `admin` role.

| Method | Path | Purpose |
| --- | --- | --- |
| CRUD | `/admin/categories` | Manage category tree and visibility. |
| CRUD | `/admin/banners` | Create, schedule, reorder, update and archive homepage banners; every mutation is audited. |
| POST/PATCH | `/admin/products` | Create/edit/archive products and image URLs; archive with `status: "archived"`. |
| POST | `/admin/media/products` | Admin-only multipart upload (`file`) for JPG, PNG, WebP or AVIF images up to 8 MB; returns a public `/media/products/...` URL. |
| POST | `/admin/products/:id/stock-adjustments` | Adjust stock with mandatory reason and ledger entry. |
| GET | `/admin/orders` | Filter/search orders. |
| PATCH | `/admin/orders/:id/status` | Validated order/fulfillment transitions with audit. |
| POST | `/admin/orders/:id/refunds` | **Planned, not implemented.** EPS refund contract and reconciliation must be confirmed first. |
| CRUD | `/admin/coupons` | Manage coupons/limits. |
| GET | `/admin/reviews` | Review moderation queue. |
| PATCH | `/admin/reviews/:id` | Approve/reject review. |
| GET | `/admin/users` | Search customers and state. |
| PATCH | `/admin/users/:id/status` | Block/unblock (cannot promote through this route). |
| GET | `/admin/audit-logs` | Search privileged actions. |
| GET | `/admin/dashboard` | Sales/order/inventory summary. |

## Security controls

- Validate configuration on boot; production refuses missing/weak JWT secrets or absent CORS origins.
- Hash passwords with a deliberately slow adaptive hash; constant-shape login errors and throttling on authentication routes.
- Access JWTs are short-lived and signed with a dedicated secret, issuer, audience and token type. Refresh JWTs use a separate secret, are stored hashed, rotated once, and revocable by family.
- Authorization guards deny by default on admin routes; ownership is checked in services, never only in the frontend.
- Global DTO validation strips/rejects unknown fields. Pagination and search inputs are bounded/parameterized.
- The built-in rate limiter uses process-local memory. Use a shared Redis-backed throttler store before running multiple API instances.
- Helmet, HTTPS in production, exact CORS origin allowlist, request-size limits, global throttling, and safe error handling.
- EPS credentials are server-only environment secrets. Never collect or store card numbers/CVV. Verify transaction status server-to-server; check amount, merchant transaction ID, currency and order before marking paid. Persist a unique transaction ID for replay protection.
- No production auto-sync. Schema changes only through reviewed TypeORM migrations. Backups, alerting, gateway reconciliation, email delivery, and deployment secrets are operational prerequisites.

## Delivery phases

1. **Foundation:** config validation, migrations, common DTO/error/guard infrastructure, health/docs.
2. **Catalog and admin:** category/product/image management, stock ledger, audit trail.
3. **Accounts and shopping:** registration/JWT sessions, profile/addresses, cart, coupon, transactional checkout/order/cancellation.
4. **Payments:** COD plus EPS adapter, server-side verification, callbacks/IPN, reconciliation and refund workflow.
5. **Production hardening:** deployment configuration, backups, email transport, monitoring, sandbox/live payment acceptance and operational runbook.

## Local setup

1. Copy `.env.example` to `.env` and fill the PostgreSQL connection and separate random JWT secrets. Keep `.env` out of version control.
2. Install packages with `npm install`.
3. Apply the reviewed initial schema with `npm run migration:run`.
4. Optionally set both `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` (16+ characters), start the backend once to create the first admin, then remove both bootstrap values. Public registration cannot create an administrator.
5. Start with `npm run start:dev`; Swagger is available at `/docs` in development and the API is prefixed with `/api/v1`.

To inspect or roll back the last migration, use `npm run migration:show` or `npm run migration:revert`. Review a migration before applying it to any environment containing important data.

The initial commerce migration has been applied to the PostgreSQL database currently configured in `.env`. It created the 16 commerce tables plus the TypeORM migration ledger; the existing `test` table was preserved.

The follow-up `HomeBanners1764100000000` migration adds the `home_banners` table. Run `npm run migration:run` in each environment before using the homepage banner API; it is intentionally not auto-applied at application startup.

## EPS onboarding

`EPS_IPN_SECRET_KEY` is optional for the redirect-and-verify payment flow. Set `EPS_ENABLED=true` only after EPS supplies and confirms merchant credentials and the API public HTTPS URL. Set `EPS_SANDBOX=true` for sandbox; use production only with live merchant credentials. Register `/api/v1/payments/eps/return` as the success, fail, and cancel return URL. The backend verifies the merchant transaction with EPS server-to-server; it does not trust the browser redirect to mark an order paid.

Only configure `https://<api-host>/api/v1/payments/eps/ipn` as an EPS IPN URL if EPS has enabled encrypted IPN for this merchant and supplied the corresponding secret. EPS public IPN documentation specifies AES-256-CBC `IV:CipherText` framing but does not state the secret-key encoding. Without that merchant secret, leave `EPS_IPN_SECRET_KEY` blank and do not configure the IPN callback. Customers who do not return to the shop after payment may then require payment reconciliation.

EPS merchant verification is server-to-server on the browser return and, when configured, IPN path. Browser callback query parameters do not mark an order paid. Online checkout remains unavailable when credentials are missing or `EPS_ENABLED` is false; COD remains available.

## Current implementation coverage

The API currently implements registration/login/refresh/logout/password change, profile update, public categories/products/home banners, admin category/product/variant/image/banner editing, stock ledger adjustments, customer addresses/cart, coupon preview/admin management, transactional checkout/order listing/cancellation, EPS/COD payment attempt initialization and EPS verification callback, verified-purchase reviews/moderation, admin user block/unblock, audit log listing, dashboard metrics, health, rate limiting, CORS, Helmet and DTO validation. EPS orders reserve stock for 15 minutes; a scheduled job releases stock and coupon usage after expiry.

Before taking live orders, finish email verification/password reset and notification delivery, shipping rules, tax/VAT policy, refund execution/reconciliation with EPS, payment sandbox qualification, backup/restore exercises, deployment HTTPS and operational monitoring. Refund records, shipment integrations and a full staff permission matrix are not yet implemented. A verified payment arriving after an order reservation expires is recorded as paid while the order remains cancelled; this needs an operator refund workflow before live launch.

## Integration gates / not inferred

- EPS live/sandbox username, password, hash key, merchant ID/store ID, callback URLs, and current merchant API contract must come from the merchant dashboard/EPS. The public EPS site documents IPN encryption, but the Node.js SDK publicly linked by the EPS GitHub organization identifies itself as community-maintained and unofficial; verify behavior against EPS merchant documentation before live funds are accepted.
- Shipping fees/zones, tax/VAT rules, return window, cancellation policy, email/SMS provider, and legal/privacy text need business decisions. The core stores these outcomes but does not invent policy.
