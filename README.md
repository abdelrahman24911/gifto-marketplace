# Gifto Marketplace

Multi-vendor gift marketplace connecting gift shops across Egypt. Alexandria focus for initial operations.

Separate product and infrastructure from FL Tase3 (single-vendor store). This repository never reuses FL Tase3 code, credentials, database, or business logic.

## Tech Stack

- Next.js App Router, React, TypeScript (strict)
- Tailwind CSS
- Supabase (Auth, Postgres, Row Level Security, Storage)
- ESLint

## Getting Started

```bash
npm install
cp .env.example .env.local   # then fill in Gifto Supabase values
npm run dev
```

### Environment variables (names only)

| Name | Exposed to browser | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Gifto Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key (RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | **no** | Server-only. Never expose or commit. |
| `NEXT_PUBLIC_SITE_URL` | yes | Public site URL (auth redirects). |

Never commit `.env*`. Only variable *names* belong in `.env.example`.

## Scripts

```bash
npm run dev       # local dev server
npm run build     # production build (webpack; --webpack works everywhere)
npm run build:turbo  # production build via Turbopack (needs native SWC bindings)
npm run lint      # eslint
npm test          # vitest run — unit tests (money, cart, cart-store, slugify, guest-order, orders)
```

On win32/x64 this machine cannot load the native SWC bindings, so Turbopack builds
fail and `build` is pinned to `--webpack`.

Type check: `npm run typecheck` (alias for `npx tsc --noEmit`, TypeScript strict mode).

Unit tests live next to the modules they cover (`src/lib/*.test.ts`) and run in a
plain Node environment via Vitest — no browser, no database. The RLS suites below
cover the database side.

## Database / Migrations

All schema changes live in version-controlled SQL under `supabase/migrations/`.

```bash
supabase link --project-ref <gifto-project-ref>
supabase db push          # applies pending migrations to the linked Gifto project
supabase migration list   # verify applied migrations
```

Only ever apply migrations to the **Gifto** project. Do not link or push to the FL Tase3 project.

Migrations 1–13 are applied to the hosted Gifto project (`hqusykdyjpruysxezsrn`) and recorded in
`supabase_migrations.schema_migrations`. Migration 11 adds guest COD checkout; migration 12
hardens the order tables to least-privilege grants; migration 13 adds failed-COD-delivery handling
and the parent-only `partially_completed` status. Pushing requires a valid CLI login (`supabase login`) and the project database password for
`db push`.

### Verifying RLS locally

Eight suites exercise the policies against a disposable `supabase/postgres` container
(which already ships the `auth` schema, `auth.users`, `auth.uid()`, and the
`anon`/`authenticated`/`service_role` roles). They simulate Supabase request context the
way PostgREST does and abort non-zero on any failure. Each test sets both
`request.jwt.claim.sub` and `request.jwt.claims`.

| Suite | Coverage |
|---|---|
| `supabase/tests/rls_foundation_test.sql` | Phase 1: vendor privacy, membership, self-elevation guard, status history, `public_vendors` view |
| `supabase/tests/rls_onboarding_test.sql` | Phase 2: profile provisioning, `apply_as_vendor`, approval, pending invisibility |
| `supabase/tests/rls_catalog_test.sql` | Phase 3: categories, products, product images, slug derivation, vendor isolation |
| `supabase/tests/rls_orders_test.sql` | Phase 4: checkout split/pricing/stock, suborder transition rules, privacy (buyer, each shop, admin), cancellation and restock |
| `supabase/tests/rls_commissions_test.sql` | Phase 6: commission earned on delivery (rate × subtotal), idempotent delivery, return reversal, admin-only settlements, vendor isolation |
| `supabase/tests/rls_inventory_test.sql` | Phase 7: manual stock adjustments are audited and role-gated, no direct movement writes, validation and history isolation |
| `supabase/tests/rls_hardening_test.sql` | Phase 8: admin self-provisioning INSERT guard, dropped `is_vendor_staff`, last-owner demotion/deletion guard, service-role bootstrap path |
| `supabase/tests/rls_guest_orders_test.sql` | Phase 11: guest COD checkout with no Auth user, service-role-only RPCs, catalog pricing, idempotent retries, token-gated confirmation, checkout quota, authenticated path unchanged |

Three details matter when running them:

1. **Use the `17.11.0.003` image tag.** `17.6.1.106` segfaults its backend whenever a role
   is denied `EXECUTE` on a function, which kills the `psql` session running the orders suite.
2. **Wait for image init, not just `pg_isready`.** The Supabase image creates the
   `anon`/`authenticated` roles and the `auth` schema *after* Postgres starts accepting
   connections. Poll for `(select count(*) from pg_roles where rolname in ('anon','authenticated')) = 2`
   and `to_regrole('service_role') is not null` before applying migrations, otherwise the
   first migration can fail intermittently.
3. **Run each suite against a fresh schema.** Some assertions use exact row counts
   (`anon sees 1 vendor`), so fixtures from another suite would make them fail. Reset
    `public` and re-apply migrations 1–13 before each suite.

```bash
docker run -d --name gifto-rls-test -e POSTGRES_PASSWORD=postgres \
  -p 65432:5432 public.ecr.aws/supabase/postgres:17.11.0.003
# wait for the init gate described above, then for each of the eight suites:
docker exec gifto-rls-test psql -U postgres -c \
  'drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role;'
docker cp supabase/tests/storage_stub.sql gifto-rls-test:/tmp/storage_stub.sql
docker exec -e PGPASSWORD=postgres gifto-rls-test \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f /tmp/storage_stub.sql
for s in rls_foundation rls_onboarding rls_catalog rls_orders rls_commissions rls_inventory rls_hardening rls_guest_orders; do
  docker exec gifto-rls-test psql -U postgres -c \
    'drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role;'
  docker cp supabase/migrations gifto-rls-test:/tmp/migrations
  docker cp "supabase/tests/${s}_test.sql" gifto-rls-test:/tmp/$s.sql
  docker exec gifto-rls-test sh -c 'for f in /tmp/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -U postgres -f "$f"; done'
  docker exec gifto-rls-test psql -v ON_ERROR_STOP=1 -U postgres -f "/tmp/$s.sql"
done
docker rm -f gifto-rls-test
```

The storage stub is applied once before the loop, **as `supabase_admin`** (the
raw image's `postgres` role is not a superuser and does not own the `storage`
schema; the stub re-owns its tables to `postgres` so the migration runner can
create policies). The raw image has no `storage` tables, and migration 9
creates the `product-images` bucket plus its `storage.objects` policies.
Hosted projects already have storage — never apply the stub there. The
`storage.objects` table (and its policies) survive the per-suite
`drop schema public`, and migration 9 re-creates its policies idempotently
(`drop policy if exists`).


### Phase 1 schema (implemented)

- `profiles` — linked to `auth.users`; single privilege flag `is_platform_admin`.
- `vendors` — store identity: name, slug, description, `logo_path` (Storage path only),
  `status` (`pending` | `active` | `suspended` | `rejected`), city/governorate,
  `delivery_coverage` (jsonb), `commission_rate`, timestamps.
- `vendor_members` — profile ↔ vendor membership with role (`owner` | `manager` | `staff`).
- `vendor_status_history` — audit trail of vendor status transitions.
- Committed-privilege helpers (`is_platform_admin`, `is_vendor_member/owner/manager/staff`),
  `SECURITY DEFINER` with pinned `search_path` and restricted `EXECUTE` grants.
- A trigger that prevents ordinary users from granting themselves platform-admin.
- A trigger that stops vendor owners from changing `status`/`commission_rate`
  (platform-admin-only fields).

`supabase/config.toml` uses non-default local ports (64320–64329, inspector 8183) so a
local Gifto stack can run alongside other Supabase projects on the same machine.

### Phase 2a schema (implemented — backend only)

- `public.handle_new_user()` + `on_auth_user_created` trigger on `auth.users` —
  auto-provisions a `public.profiles` row on signup (idempotent; never grants
  `is_platform_admin`).
- `public.apply_as_vendor(p_name, p_description?, p_city?, p_governorate?, p_phone?, p_email?)`
  — `SECURITY DEFINER` RPC, executable by `authenticated` only. Creates a `pending`
  vendor (server-derived unique `slug`) and its `owner` membership in one transaction,
  and relies on the status-history trigger for an audit row. It cannot set `status` or
  `commission_rate`; the existing finance-field guard still covers later direct updates.

Wired into the app: `/signup`, `/account` (application form), `/admin` (approval), and
`/auth/callback`. A signup-triggered profile row is required for this to work, which is
why `handle_new_user` ships in the same migration.

Note when seeding a first platform admin: the trigger auto-creates the profile, so the
row must be inserted through `auth.users` and the self-elevation guard temporarily
disabled — see `supabase/tests/rls_foundation_test.sql` for the working recipe.

### Phase 3 catalog schema (implemented)

`supabase/migrations/00000000000004_catalog.sql`:

- `categories` — platform-managed taxonomy; public reads active rows only, writes are
  platform-admin only.
- `products` — owned by one vendor. `price_minor int` + `currency` (integer piastres,
  EGP only), `stock`, `status` (`draft` | `active` | `archived`), `unique (vendor_id, slug)`.
  The web address is derived by a `BEFORE INSERT` trigger from the name (or an explicit
  slug), deduplicated per vendor, and **stays fixed after creation**.
- `product_images` — Storage `path` + alt + position. No binaries in the database.
- `is_public_vendor(uuid)` — `SECURITY DEFINER` helper so catalog policies do not need
  the anon role to read `vendors` (whose `SELECT` was revoked in migration 3).
- Policies: the public sees `active` products of `active` vendors; vendor managers/owners
  write their own rows; platform admins moderate everything; only owners (or admins) delete.

Seed categories for local development: `supabase/seed.sql` (8 gift categories, idempotent).
Running it through the API requires platform-admin — it is a development convenience.

### Phase 4 orders schema (implemented)

`supabase/migrations/00000000000005_orders.sql` (business rules: `docs/DECISIONS.md` D-01/D-03/D-04/D-05/D-08):

- `orders` — one checkout: COD only, `EGP` only, integer piastres, delivery address, optional
  `user_id` (nullable so deleting an account keeps order history).
- `order_vendors` — one shop's slice of an order, fulfilled independently. Carries a frozen
  `commission_rate` (per-vendor, snapshotted at placement) and per-stage timestamps.
- `order_items` — immutable line snapshots (name, slug, unit price, quantity, line total).
- `inventory_movements` — audit trail of every stock change (`order_placed`, `order_cancelled`,
  `manual_adjustment`).
- `place_order(p_items, …)` — `SECURITY DEFINER` atomic checkout: requires a session, validates the
  address and cart, locks the product rows, prices everything **from the database**, rejects
  non-active products and vendors with no public presence, then splits the cart per vendor,
  decrements stock and writes the movement ledger. Rejections use `22023`.
- `cancel_order(p_order_id)` — order owner or platform admin, only while the order is `placed`;
  cascades to the suborders and restocks them.
- Triggers enforce the transition table (`placed → confirmed → shipped → delivered`, plus
  `cancelled`/`returned`), including `shipped → cancelled` for a failed COD delivery, stamp the
  stage timestamps, restock on cancellation, and keep the parent order status derived from its
  suborders. Mixed terminal outcomes become the parent-only `partially_completed` state.
- RLS: customers read their own orders; vendors read (and may only update the status of) their own
  suborders, plus the delivery address of any parent order that holds one of their suborders
  (via the `SECURITY DEFINER` helper `is_order_shop_member` — a plain subquery would recurse,
  since `order_vendors` policies point back at `orders`); platform admins read everything.
  Customers never have `INSERT`/`DELETE`; the only write grant in this group is `status` on
  `order_vendors`. Orders are never insertable through PostgREST — only `place_order` writes them.

### Phase 5 checkout app surface (implemented)

- **Cart** (`src/lib/cart.ts`, `src/lib/cart-store.ts`, `src/components/cart-provider.tsx`) — browser
  cart in `localStorage`, keyed by product id, wrapped in a cached external store so
  `useSyncExternalStore` does not loop. Only product ids and quantities are ever sent for
  checkout; prices come from the database.
- `Add to cart` on the product page (`src/components/add-to-cart-button.tsx`), replacing the
  old "ordering is not available" notice. Sold-out products show a disabled state.
- `/cart` — grouped by shop, quantity edit, remove, free-delivery summary.
- `/checkout` — delivery form (recipient, phone, email, address, city, governorate, notes) with a
  COD notice. `/checkout` is public: signed-in customers call `place_order_with_idempotency`;
  guests call the service-role-only `place_guest_order` with a browser-generated token and receive
  an HttpOnly, order-scoped confirmation cookie. On success the cart is cleared and the customer
  is redirected to the order page. Every price is recomputed in the database.
- `/account/orders` and `/account/orders/[id]` — customer history and detail, with self-service
  cancellation while the order is still `placed` (`cancel_order`, which restocks).
- `/vendor/orders` — the shop queue: delivery details, line items, and the lifecycle buttons
  (confirm / ship / deliver / cancel) allowed by `VENDOR_NEXT_STATUSES`. Only owners, managers
  and admins see the buttons; staff get a read-only queue. After dispatch, a vendor can record a
  failed COD delivery, which cancels the line, restocks it, and asks for confirmation first.
- `docs/DECISIONS.md` D-06: delivery is free at launch (`delivery_fee_minor = 0`); a fee model is
  planned later and will be configured in Supabase.

### Phase 6 commissions schema (implemented)

`supabase/migrations/00000000000006_commissions.sql` (business rules: `docs/DECISIONS.md` D-01/D-02/D-08):

- `commission_entries` — one row per delivered suborder, unique on `order_vendor_id` so delivery is
  idempotent. Stores the snapshotted `rate`, the `base_minor` (product subtotal only, D-02) and
  `amount_minor`, with a `CHECK (amount_minor = round(base_minor * rate))` so the ledger cannot be
  inconsistent. `status` is `earned` or `reversed`.
- `settlements` / `settlement_lines` — a manual, admin-driven payout batch: an `open` settlement
  collects a shop's `earned`, unsettled entries (one line each), then `mark_settlement_paid` records
  the payout. An entry belongs to at most one settlement.
- Triggers on `order_vendors.status`: `record_commission_on_delivery` earns commission on the
  transition into `delivered` (D-08); `reverse_commission_on_return` reverses an unsettled entry on a
  return, and raises `23514` if the entry is already part of a settlement.
- RPCs `create_settlement(p_vendor_id, p_note?)` and `mark_settlement_paid(p_settlement_id)` —
  platform-admin only (`42501`), `SECURITY DEFINER` with a pinned `search_path`.
- RLS: vendor members read only their own entries/settlements/lines; platform admins read everything;
  there is **no** `INSERT`/`UPDATE`/`DELETE` grant — the ledger is written only by the triggers and RPCs.

### Phase 7 inventory adjustments (implemented)

`supabase/migrations/00000000000007_inventory_adjustment.sql`:

- `inventory_movements.note` — an optional short reason attached to a movement.
- `adjust_product_stock(p_product_id, p_delta, p_note?)` — the single audited door for manual stock
  changes, restricted to the product's owners/managers (or a platform admin), `42501` otherwise. It
  locks the product row, rejects a zero/oversized delta (`22023`) and a result below zero or above
  1,000,000 (`23514`), updates `products.stock` and writes one `manual_adjustment` movement.
- After creation, **stock is no longer editable through the product form** (an intentional change);
  the form only sets opening stock, and all later changes go through the inventory page.

### Phase 11 guest checkout (implemented)

`supabase/migrations/00000000000011_guest_checkout.sql` (business rule: `docs/DECISIONS.md` D-03,
superseded on 2026-10-19):

- Guests can place a COD order without an Auth account. `orders.contact_email`,
  `orders.guest_token_hash`, `orders.idempotency_key` and `orders.public_reference` were added,
  with unique partial indexes for idempotency keys and public references.
- `place_guest_order(...)` is service-role-only and writes `user_id = NULL`. The browser generates
  a random access token; only its SHA-256 hash reaches the database. `get_guest_order(...)` returns
  an order only when the order id and token hash both match.
- The raw token lives in an HttpOnly, `SameSite=Lax`, order-scoped cookie. The guest confirmation
  page is `/orders/[id]`; authenticated history remains `/account/orders/[id]`.
- `place_order_with_idempotency(...)` keeps the authenticated path idempotent without changing the
  existing `place_order` signature or behaviour.
- `checkout_rate_limits` and `consume_checkout_quota(...)` add a service-role-only hourly checkout
  quota. RLS is enabled with no client policies by design.

### Phase 12 order-table privileges (implemented)

`supabase/migrations/00000000000012_order_table_privileges.sql` closes a default-ACL over-grant
found during hosted verification:

- `anon`, `authenticated` and `public` lose all privileges on `orders`, `order_vendors`,
  `order_items` and `inventory_movements`.
- `authenticated` keeps `SELECT` on `orders`, `order_items` and `inventory_movements`, and
  `SELECT` plus column-level `UPDATE (status, updated_at)` on `order_vendors`.
- Customers cannot update financial or identity columns such as `subtotal_minor`,
  `commission_rate` or `order_id`; vendors can still run the guarded status workflow.
- `service_role` keeps full access for the database RPCs and server-only guest checkout path.

### Phase 9B failed COD delivery (implemented and verified)

`supabase/migrations/00000000000013_failed_delivery.sql` (business rules: `docs/DECISIONS.md`
D-04/D-05; return treatment is D-09):

- A dispatched suborder can now move `shipped -> cancelled` when the COD delivery fails (customer
  refuses or is unreachable). The existing cancellation path restocks every line and writes an
  `order_cancelled` movement; `shipped_at` and `cancelled_at` preserve the fact that the failure
  happened after dispatch. No commission is earned or reversed because the suborder never reached
  `delivered`.
- A parent order whose suborders all finish with mixed outcomes becomes the parent-only
  `partially_completed` state (for example, one shop delivered and another cancelled). The
  suborder transition trigger rejects `partially_completed`, so it cannot leak into fulfilment.
- The vendor queue offers `Delivery failed - cancel and restock` after dispatch, with a browser
  confirmation before the action is submitted.

### App surface (implemented)

- Public: `/`, `/categories`, `/categories/[slug]`, `/shops`, `/shops/[slug]`,
  `/shops/[slug]/[productSlug]`.
- Customer: `/cart`, `/checkout`, `/account/orders`, `/account/orders/[id]`, and the token-gated
  guest confirmation page `/orders/[id]`.
- Vendor: `/vendor/products` (list + shop switcher), `/vendor/products/new`,
  `/vendor/products/[id]` (edit, owner-only delete), `/vendor/products/[id]/inventory` (audited
  stock adjustments + movement history), `/vendor/orders` (fulfilment queue).
  Guarded by `/vendor` in `src/proxy.ts`.
- Admin: `/admin` (vendor approval and commission, category creation) and `/admin/orders`
  (read-only oversight of every order across all shops, with commission shown per suborder).
- Money helpers in `src/lib/money.ts` (`parseEgpToMinor`, `formatEgp`) keep all arithmetic
  in integer piastres.

**Image upload (implemented):** the `product-images` bucket is public-read with
owner/manager-scoped writes (`{vendor_id}/{product_id}/{uuid}.{ext}`), the edit
product page has an upload/manage gallery panel, and public pages render real
photos (the monogram panel remains as the graceful fallback).

### Status semantics (enforced by `place_order` / `place_guest_order`)

- `pending` — submitted, awaiting review; not public.
- `active` — approved and selling; publicly visible.
- `suspended` — blocked by admin; not public; checkout rejects its products
  (`is_public_vendor` must hold, and the product must be `active`).
- `rejected` — declined; not public.

## Architecture notes (planned — not yet implemented)

The catalog (Phase 3), the order/checkout backend (Phase 4), the checkout screens (Phase 5), the
commission ledger and settlements (Phase 6), audited inventory adjustments (Phase 7), image upload,
and guest COD checkout (Phase 11) are implemented. The following are documented for direction only:

- **Catalog extras**: tags and product options/variants.
- **Settlement automation**: settlements are a manual admin batch today; the cadence and payout
  reconciliation are still open (`docs/DECISIONS.md` D-08).
- **Delivery fee**: free at launch (D-06); a distance/zone fee model will be added later
  and configured in Supabase.
- **Subscriptions (optional)**: `subscription_plans`, `vendor_subscriptions`, entitlements
  checked server-side; kept separate from per-order commission.

## Security model

- RLS is the authorization boundary — UI hiding is never relied on.
- A vendor cannot read or mutate another vendor's private data.
- Ordinary users cannot self-assign platform-admin; vendor owners cannot grant platform-admin;
  users cannot create memberships for vendors they do not control.
- Vendor self-application goes through one audited RPC: an applicant can only create a
  `pending` vendor for themselves and cannot set `status`/`commission_rate`.
- The commission ledger is append-only to clients: it is written only by database triggers and the
  admin-only `SECURITY DEFINER` RPCs, with no `INSERT`/`UPDATE`/`DELETE` grant. Manual stock changes
  go through `adjust_product_stock`, never a direct table write.
- Privileged `SECURITY DEFINER` functions pin `search_path` and restrict `EXECUTE`.
- Orders are written only by database RPCs. Migration 12 removed the default-ACL over-grant on the
  four order tables: `anon` has no order-table privileges, and `authenticated` is read-only except
  for the guarded `order_vendors.status` / `updated_at` columns.
- **Residual risk:** Supabase's default privileges still grant ALL on *future* `public` tables to
  `anon` and `authenticated`. New tables need explicit revokes/grants, or a future migration should
  change the default ACL.

## Verification status

Everything below was actually executed unless explicitly marked otherwise; nothing here is
aspirational.

| Check | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | clean |
| `npm test` | 55 passing unit tests across 6 files |
| `npm run build` | exit 0 (all routes) |
| DB suites in disposable container | All eight suites passed on fresh schemas after migrations 1-13, including `rls_guest_orders_test.sql` and the Phase 9B `rls_orders_test.sql` TEST 16 |
| Browser E2E for failed COD delivery | 11/11 checks passed against the live app and hosted DB: two-shop guest checkout, mixed terminal outcomes, failed-delivery restock, ledger, commission, guest confirmation, repeated-cancel no-op, and fixture cleanup |
| Page smoke test (`next start`, earlier) | `/`, `/categories`, `/shops`, `/cart` → 200; unknown paths → 404; `/account`, `/account/orders`, `/vendor/orders`, `/admin` → 307 to login. `/checkout` was protected then; it is now intentionally public for guests. |
| End-to-end render against hosted DB | seeded a temporary category/shop/product, confirmed all public pages rendered it (price formatted as `EGP 150.00`), then deleted the fixture |
| Hosted migrations | migrations 1–13 applied and recorded; migration 11 schema/function ACLs and migration 12 grants verified live; migration 13 structure verified live |
| Hosted guest checkout smoke test (rollback-only) | `place_guest_order` created the order, suborder, item and inventory movement; stock 25→24; repeated idempotency key returned the same order; wrong token and wrong-token replay rejected; order rolled back and stock restored |
| Hosted authenticated checkout smoke test (rollback-only) | `place_order_with_idempotency` created the order; stock 15→14; vendor status update worked; `order_vendors.subtotal_minor` update blocked; anon `orders` select blocked; rolled back with zero residue |
| Hosted privilege check | `anon` has no order-table privileges; `authenticated` has select-only on orders/items/movements plus `status`/`updated_at` update on suborders; `service_role` retains full access |
| Hosted end-to-end (migrations 5–7, earlier) | seed temp shop/product → `place_order` → deliver → ledger earns `rate × subtotal` → `adjust_product_stock` records an audited movement → rolled back (no residue) |

Three limits on the current verification:

- **The browser E2E is a temporary harness, not a repo test suite.** It lives in
  `C:\Users\bodyo\AppData\Local\Temp\opencode\gifto-e2e` and is not wired into `npm test` or CI.
  Other vendor/admin/customer write paths remain covered by the DB suites rather than browser tests.
- **Default database ACLs remain broad.** Migration 12 hardened the current order tables, but
  Supabase still grants ALL on future `public` tables to `anon`/`authenticated`; every new table
  needs explicit grants or a default-ACL migration.
- **`supabase start` does not run on this machine** (the CLI produces no container), so
  there is no local PostgREST/GoTrue stack. Local verification uses the raw
  `supabase/postgres` container; end-to-end checks run against the hosted project. Use the
  image tag `public.ecr.aws/supabase/postgres:17.11.0.003` for these suites — the older
  `17.6.1.106` tag crashes its backend when a role is denied `EXECUTE` on a function, which
  aborts the orders suite.
