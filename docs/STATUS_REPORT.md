# Gifto Marketplace — Status Report

**Date:** 2026-10-19  
**Repository state:** `main` @ `347eda9` (clean working tree; pushed through `d74098c`; image-upload and Vitest commits pending push)  
**Verification re-run on this date:** `npm test` 31/31, `npm run typecheck` clean, `npm run lint` clean, DB suites 107 assertions across seven suites (all pass).

---

## Summary

Phases 1–7 of the database and the complete first-pass app surface (public storefront, customer checkout, vendor back office, admin console) are implemented, and all four buckets of previously unfinished work — image upload, app-layer tests, Phase 0 security hardening, and planning-doc refresh — are now done. Migrations 1–7 are live on the hosted Gifto project; migrations 8 (hardening) and 9 (image upload bucket/policies) are verified in the disposable container and ready to push to the hosted project.

---

## Finished

### Database (migrations 1–7 live on the hosted project; 8–9 container-verified, awaiting `supabase db push`)

| # | Migration | Contents |
|---|---|---|
| 1 | `gifto_foundations` | `profiles`, `vendors`, `vendor_members`, `vendor_status_history`; RLS; `SECURITY DEFINER` privilege helpers; self-elevation guard; vendor finance-field guard |
| 2 | `account_provisioning_and_vendor_onboarding` | `handle_new_user()` signup trigger; `apply_as_vendor()` RPC |
| 3 | `public_vendor_directory` | `public_vendors` public view; vendor privacy lockdown |
| 4 | `catalog` | `categories`, `products`, `product_images`; slug derivation trigger; public/catalog RLS |
| 5 | `orders` | `orders` / `order_vendors` / `order_items` / `inventory_movements`; atomic `place_order()`; `cancel_order()`; suborder status state machine; derived parent status; restock on cancel |
| 6 | `commissions` | `commission_entries` (append-only ledger, `CHECK amount = round(base × rate)`); `settlements` / `settlement_lines`; earn-on-delivery and reverse-on-return triggers; admin-only `create_settlement` / `mark_settlement_paid` RPCs |
| 7 | `inventory_adjustment` | `adjust_product_stock()` — the single audited door for manual stock changes |
| 8 | `security_hardening` | `BEFORE INSERT` guard blocking self-provisioned `is_platform_admin`; `is_vendor_staff` dropped; last-owner demotion/deletion guard (`pg_trigger_depth()` skips cascade deletes); service-role client at `src/lib/supabase/service.ts` |
| 9 | `product_image_upload` | `product-images` bucket (public read, 5 MB, jpeg/png/webp/avif); manager-scoped insert/delete policies on `storage.objects` keyed to `{vendor_id}/{product_id}/…` paths |

### RLS / storage test suites (107 assertions, seven suites)

`rls_foundation`, `rls_onboarding`, `rls_catalog` (incl. storage policies 16–19), `rls_orders`, `rls_commissions`, `rls_inventory`, `rls_hardening` — each runs against a fresh schema in a disposable `supabase/postgres:17.11.0.003` container (procedure documented in README, including the one-time `storage_stub.sql` applied as `supabase_admin`).

### App-layer unit tests (31 tests, four files)

Vitest (node environment) covering `src/lib/money.ts` (parse/format/round-trip, rejection cases), `src/lib/cart.ts` (merge, clamps, line cap, totals, server-side empty cart), `src/lib/cart-store.ts` (snapshot stability, subscription, persistence shim), `src/lib/slugify.ts`.

### Application surface (23 routes)

- **Public:** `/`, `/categories`, `/categories/[slug]`, `/shops`, `/shops/[slug]`, `/shops/[slug]/[productSlug]`, `/search`
- **Auth:** `/signup`, `/login`, `/auth/callback`
- **Customer:** `/cart`, `/checkout` (COD, server-priced via `place_order`), `/account` (vendor application), `/account/orders`, `/account/orders/[id]` (self-cancel while `placed`)
- **Vendor:** `/vendor/products` (+ new/edit, owner-only delete), `/vendor/products/[id]` (image gallery panel: upload up to 8 images, delete, reorder handled by `position`), `/vendor/products/[id]/inventory` (audited adjustments + movement history), `/vendor/orders` (confirm / ship / deliver / cancel queue)
- **Admin:** `/admin` (vendor approval, commission rate, category creation), `/admin/orders` (read-only cross-shop oversight with per-suborder commission)
- Supporting: cart in `localStorage` (ids + quantities only; prices always from the DB), money helpers in integer piastres (`src/lib/money.ts`), route protection in `src/proxy.ts`; product images render from the public bucket URL with a typographic monogram fallback (`src/components/product-image.tsx`); product delete removes storage objects

### Decided business rules (docs/DECISIONS.md)

| ID | Decision |
|---|---|
| D-01 | Commission: per-vendor rate set by platform admin; snapshotted onto the suborder at placement |
| D-02 | Commission base: product subtotal only (no fees, no discounts) |
| D-03 | Customer identity: signed-in accounts required at launch; no guest checkout |
| D-04 | Order lifecycle: `placed → confirmed → shipped → delivered`, plus `cancelled` / `returned`; per-shop suborders; parent status derived |
| D-05 | Stock: decrement at placement (row-locked, movement-audited); restock on cancellation |
| D-06 | Delivery: free at launch (`delivery_fee_minor = 0`); fee model deferred |
| D-08 | Commission earned on delivery confirmation; settlements are a manual admin batch |

---

## Remaining

### 1. Hosted deployment of migrations 8–9

Run `supabase db push` (link against project `hqusykdyjpruysxezsrn`) to apply the hardening migration and the image-upload bucket/policies to the hosted database. Migration 9 is written to be re-runnable (`drop policy if exists`, `on conflict do nothing`).

### 2. Business decisions pending owner input

| ID | Topic | Status |
|---|---|---|
| D-07 | Vendor subscriptions — required to sell or optional? Price, cadence, provider? | `BLOCKED_PENDING_OWNER_APPROVAL` — no schema exists |
| D-06 | Delivery fee model — flat per vendor, zone-based, etc. (free at launch is decided; the eventual model is not) | Partially decided |
| D-08 | Settlement cadence and payout reconciliation — currently a manual, admin-driven batch; automation deferred | Cadence still open |

### 3. Deferred / documented as "later"

- **Catalog extras:** tags, product options/variants.
- **Settlement automation:** scheduling, payout export/reconciliation.
- **Guest checkout:** possible post-launch; schema already allows nullable `orders.user_id`.
- **Order-state edge case (D-05):** COD-never-collected case has no automatic restock path — requires delivery confirmation or manual adjustment.

### 4. Process / housekeeping

- **Browser-level verification gap:** vendor/admin/customer write paths are covered by the DB suites, not by browser click-through tests (documented limitation in README).
- **Local stack:** `supabase start` does not produce containers on this machine; local DB verification relies on the raw `supabase/postgres` container, end-to-end checks on the hosted project.
- **Dependencies:** 5 high-severity npm audit advisories (unreviewed; `npm audit fix --force` would introduce breaking changes). Vitest was pinned to v4 because v5 requires `@types/node` ≥22 and the project is on v20.
- **Main branch ahead of origin:** image-upload (`add89f5`) and Vitest (`347eda9`) commits await push.
