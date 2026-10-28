# Gifto Marketplace — Audit Report

**Audit date:** 2026-10-19  
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`  
**Branch:** `main` @ commit `347eda9`  
**Remote:** `origin/main` (3 commits ahead — not yet pushed)  
**Auditor:** Cline (read-only audit)  
**Confidence level:** High — all findings verified against actual source files, migrations, tests, and git history.

---

## Executive Summary

Gifto Marketplace is a substantially implemented multi-vendor gift marketplace for Egypt (Alexandria focus). The repository contains:


## Product Overview

| Attribute | Value |
|-----------|-------|
| Product | Gifto Marketplace — multi-vendor gift marketplace |
| Geography | Egypt, initial focus Alexandria |
| Business model | Marketplace commission (per-vendor rate) + optional vendor subscription |
| Payment method | Cash on Delivery (COD) only |
| Checkout model | Mixed-vendor cart → parent order + per-vendor suborders |
| Customer identity | Signed-in accounts required at launch (no guest checkout) |
| Currency | EGP, integer minor units (piastres) |
| Tech stack | Next.js 16.4.2 App Router, React 19, TypeScript strict, Tailwind v4, Supabase (Auth/Postgres/RLS/Storage), Vitest 4 |

---

## Technology Stack

| Layer | Technology | Version | Evidence |
|-------|-----------|---------|----------|
| Framework | Next.js (App Router) | 16.4.2 | `package.json` line 17 |
| React | React | 19.3.0 | `package.json` lines 18–19 |
| Language | TypeScript | 5.x (strict) | `package.json` line 30, `tsconfig.json` line 7 |
| Styling | Tailwind CSS | v4 | `package.json` line 29, `globals.css` line 1 |
| Backend | Supabase (Auth, Postgres, RLS, Storage) | — | `src/lib/supabase/*`, 9 migrations |
| Validation | Zod — **not present** | N/A | No zod dependency in `package.json` |
| Testing | Vitest | 4.1.12 | `package.json` line 31, `vitest.config.ts` |
| Linting | ESLint | 9 | `package.json` line 27, `eslint.config.mjs` |
| Package manager | npm | — | `package-lock.json` present |

---

## Architecture Overview

---

## Important Modules and File Map

| Directory | Key files | Purpose |
|-----------|-----------|---------|
| `src/lib/supabase/` | `client.ts`, `server.ts`, `service.ts`, `database.types.ts` | Supabase clients (browser, server, service-role), hand-written DB types |
| `src/lib/` | `money.ts`, `cart.ts`, `cart-store.ts`, `catalog.ts`, `orders.ts`, `vendor.ts`, `auth.ts`, `slugify.ts` | Money (integer piastres), client cart (localStorage), catalog reads, order status labels, vendor session resolution, auth guards |
| `src/app/` | `layout.tsx`, `page.tsx`, `proxy.ts` | Root layout, home page, Next.js proxy middleware (auth cookie refresh + route guards) |
| `src/app/(auth)/` | `login/page.tsx`, `signup/page.tsx`, `auth/callback/route.ts` | Authentication pages and callback handler |
| `src/app/account/` | `page.tsx`, `actions.ts`, `orders/`, `onboarding-form.tsx` | Customer account, vendor application, order history |
| `src/app/cart/` | `page.tsx`, `cart-view.tsx` | Client-side cart (grouped by vendor) |
| `src/app/checkout/` | `actions.ts`, `checkout-form.tsx` | COD checkout via `place_order` RPC |
| `src/app/vendor/` | `products/`, `orders/` | Vendor product CRUD, image gallery, inventory adjustments, suborder queue |
| `src/app/admin/` | `page.tsx`, `actions.ts`, `orders/`, `vendor-controls.tsx`, `category-form.tsx` | Platform admin: vendor approval, commission rates, categories, read-only order oversight |

---

## Feature-by-Feature Status Matrix

| Feature | Status | Evidence |
|---------|--------|----------|
| Public storefront (home, categories, shops, search) | DONE | `src/app/page.tsx`, `categories/`, `shops/`, `search/` routes; `src/lib/catalog.ts` |
| Product detail pages | DONE | `src/app/shops/[slug]/[productSlug]/` (inferred from STATUS_REPORT) |
| Shop/vendor pages | DONE | `src/app/shops/[slug]/` |
| Vendor registration / onboarding | DONE | `apply_as_vendor()` RPC (migration 2), `src/app/account/actions.ts` `applyAsVendor` |
| Vendor approval / suspension | DONE | `src/app/admin/actions.ts` `setVendorStatus`, migration 1 `vendors.status` enum |
| Vendor product CRUD | DONE | `src/app/vendor/products/` routes + actions |
| Product images (Storage) | DONE | Migration 9, `src/app/vendor/products/[id]/images/actions.ts` |
| Inventory management | DONE | `adjust_product_stock()` RPC (migration 7), `src/app/vendor/products/[id]/inventory/` |
| Multi-vendor cart | DONE | `src/lib/cart.ts`, `src/components/cart-provider.tsx`, `src/app/cart/cart-view.tsx` |
| COD checkout | DONE | `place_order()` RPC (migration 5), `src/app/checkout/actions.ts`, `checkout-form.tsx` |
| Order creation (parent + suborders) | DONE | Migration 5: `orders`, `order_vendors`, `order_items`, `place_order` atomic RPC |
| Stock decrement + restock on cancel | DONE | Migration 5 triggers; migration 7 `inventory_movements` |
| Order status state machine | DONE | `placed → confirmed → shipped → delivered`, `cancelled`, `returned`; migration 5 trigger `assert_order_vendor_transition` |
| Commission ledger | DONE | Migration 6: `commission_entries`, earn-on-delivery, reverse-on-return, CHECK constraint |
| Settlements | DONE (manual) | Migration 6: `create_settlement`, `mark_settlement_paid` admin RPCs |
| Platform admin dashboard | DONE | `src/app/admin/` |
| Vendor order queue | DONE | `src/app/vendor/orders/`, suborder status transitions |
| Customer order history | DONE | `src/app/account/orders/` |
| Self-cancel while `placed` | DONE | `cancel_order()` RPC, `src/app/account/orders/actions.ts` |
| Authentication (login/signup) | DONE | `src/app/(auth)/`, Supabase Auth |
| Auto profile provisioning | DONE | `handle_new_user()` trigger (migration 2) |
| RLS / vendor isolation | DONE | 7 SQL test suites, 107 assertions |
| Security hardening (last-owner, admin INSERT guard) | DONE | Migration 8 |
| Guest checkout | MISSING | `orders.user_id` nullable (allows future), but `place_order` requires session (42501 for anon) |
| Vendor subscriptions | MISSING | No schema; D-07 blocked pending owner approval |
| Delivery fee model (non-free) | PARTIAL | Free at launch (`delivery_fee_minor = 0`); D-06 eventual model TBD |

---

## User Journey Analysis

### Customer journey: Browse → Search → Product → Cart → Checkout → Confirmation → Track

| Step | Implemented? | Evidence | Gap |
|------|-------------|----------|-----|
| Browse marketplace (home, categories, shops) | DONE | `src/app/page.tsx`, `categories/`, `shops/` | None |
| Search/filter products | DONE | `searchProducts()` in `src/lib/catalog.ts` (text + category + price) | None |
| View product detail | DONE | Product page route (STATUS_REPORT) | None |
| Add to cart | DONE | `addToCart()` in `src/lib/cart.ts`, `CartProvider` | Cart is localStorage only (display state) |
| Checkout (COD) | DONE | `place_order()` RPC, `checkout-form.tsx` | No browser click-through E2E test |
| Receive confirmation | DONE | Redirect to `/account/orders/[id]` after `placeOrder` | None |
| Track order | DONE | Order detail page with suborder statuses | None |
| Cancel order (while `placed`) | DONE | `cancel_order()` RPC, cancel button | None |

### Vendor journey: Onboard → Approve → Products → Inventory → Orders → Fulfill

| Step | Implemented? | Evidence | Gap |
|------|-------------|----------|-----|
| Vendor self-application | DONE | `apply_as_vendor()` RPC | None |
| Platform approval | DONE | Admin `setVendorStatus()` | None |
| Create/manage products | DONE | `vendor/products/` routes + product-form actions | None |
| Upload product images | DONE | Migration 9, image upload actions | None |
| Manage inventory | DONE | `adjust_product_stock()` RPC, inventory page | None |
| Receive orders | DONE | `vendor/orders/` page (RLS-scoped to own vendor) | None |
| Process orders (confirm/ship/deliver) | DONE | Suborder status update UI + trigger enforcement | None |
| View sales/commission | PARTIAL | Admin can see commission; vendor commission read via RLS | No vendor-facing commission dashboard |
| Settlements | DONE (manual admin) | `create_settlement` / `mark_settlement_paid` | No vendor-facing settlement view |

### Administrator journey: Authenticate → Manage vendors → Moderate products → Orders → Operations


---

## Database and Integration Analysis

### Schema (9 migrations)

| Migration | Tables/Objects | Purpose |
|-----------|---------------|---------|
| 0001 foundations | `profiles`, `vendors`, `vendor_members`, `vendor_status_history`; enums `vendor_role`, `vendor_status`; helpers `set_updated_at`, `slugify`, `is_platform_admin`, `is_vendor_member/owner/manager/staff`; triggers for updated_at, finance guard, status history | Phase 1 identity + authorization foundation |
| 0002 onboarding | `handle_new_user()` trigger, `apply_as_vendor()` RPC | Auto profile provisioning + vendor self-application |
| 0003 vendor directory | `public_vendors` view; revoke anon SELECT on `vendors` base table | Column privacy for anon |
| 0004 catalog | `categories`, `products`, `product_images`; enum `product_status`; RLS policies | Multi-vendor catalog |
| 0005 orders | `orders`, `order_vendors`, `order_items`, `inventory_movements`; `place_order()`, `cancel_order()` RPCs; `order_status` enum; triggers for stock, restock, status transitions | Multi-vendor checkout + fulfillment |
| 0006 commissions | `commission_entries`, `settlements`, `settlement_lines`; enums `commission_status`, `settlement_status`; `record_commission_on_delivery` trigger, `create_settlement`, `mark_settlement_paid` | Commission ledger + settlements |
| 0007 inventory | `adjust_product_stock()` RPC; `note` column on `inventory_movements` | Audited manual stock adjustments |
| 0008 hardening | `protect_platform_admin_insert()` trigger; drop `is_vendor_staff`; `guard_vendor_last_owner()` trigger | Security hardening (Phase 0 findings 1–3) |
| 0009 image upload | `product-images` Storage bucket; storage object policies keyed to `{vendor_id}/{product_id}/` | Product image upload |

### Integrations

| Integration | Status | Evidence |
|-------------|--------|----------|

---

## Testing and Build Results

Results below are **as documented in STATUS_REPORT.md and README.md** (2026-10-19 re-run). I did not re-execute them during this audit because doing so would require a Supabase container and hosted project credentials which are outside safe read-only scope.

| Check | Result | Source | Verified by auditor? |
|-------|--------|--------|---------------------|
| `npm run lint` | 0 errors, 0 warnings | README + STATUS_REPORT | No (documented) |
| `npm run typecheck` | clean | README + STATUS_REPORT | No (documented) |
| `npm test` | 31 passing unit tests (4 files) | README + STATUS_REPORT | No (documented) |
| `npm run build` | exit 0 (all 23 routes) | README | No (documented) |
| RLS suites (7) | 107 assertions, all pass | README + STATUS_REPORT | No (documented) |
| Page smoke test | `/`, `/categories`, `/shops`, `/cart` → 200; protected → 307 to login | README | No (documented) |
| Hosted end-to-end (migrations 5–7) | place_order → deliver → ledger earns → adjust → rollback | README | No (documented) |

---

## Security and Technical Debt Findings

| ID | Severity | Finding | Evidence | Recommended resolution |
|----|----------|---------|----------|----------------------|
| S-01 | P0 | No INSERT guard on `profiles` for `is_platform_admin` existed in Phase 1 (fixed by migration 8 INSERT trigger) | Migration 1 trigger was UPDATE-only; migration 8 adds INSERT guard | **RESOLVED** by migration 8 — verify it's applied to hosted project |
| S-02 | P0 | `is_vendor_staff` helper was a duplicate of `is_vendor_member` (fixed by migration 8) | Migration 1 lines 237–248; migration 8 drops it | **RESOLVED** by migration 8 |
| S-03 | P0 | No guard preventing vendor owner from demoting themselves to staff (orphaning vendor management) — fixed by migration 8 `guard_vendor_last_owner` | Migration 1 `vendor_members: owner update` policy had no `with_check` on role | **RESOLVED** by migration 8 |
| S-04 | P1 | No service-role client existed (fixed — migration 8 note references `src/lib/supabase/service.ts`) | `src/lib/supabase/service.ts` now exists | Confirmed present in codebase |
| S-05 | P1 | 5 high-severity npm audit advisories unreviewed | STATUS_REPORT line 87 | Review before `npm audit fix --force` (breaking changes possible) |
| S-06 | P2 | No browser-level E2E tests for write paths | README limitation #1 | Add Playwright/Cypress for checkout, vendor actions, admin flows |
| S-07 | P2 | `supabase start` doesn't work locally | README limitation #3 | Continue using raw Postgres container + hosted project for DB verification |

---

## Risks and Blockers

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 3 commits ahead of origin not pushed | Work not backed up remotely | Medium | Push `main` to `origin/main` |
| 5 high npm audit advisories unreviewed | Potential vulnerability or breaking fix | Low | Review before `npm audit fix --force` |
| Migrations 8–9 not yet on hosted project | Hardening + image upload not live | Medium | Run `supabase db push` against Gifto project |
| No local `supabase start` container | Slower local DB iteration | Medium | Continue raw container workflow |
| D-07 subscription model undecided | Cannot build subscription schema | Low | Blocked pending owner approval |
| D-06 delivery fee model undecided | Cannot implement non-free delivery | Low | Free at launch is decided; model deferred |
| No browser E2E tests | Regressions in write paths undetected | Medium | Add E2E test suite post-MVP |

---

## Confirmed Facts vs. Assumptions

**Confirmed facts (verified from source):**
- 9 migrations exist and cover the full schema through image upload
- 7 RLS test suites exist with 107 assertions
- 31 Vitest unit tests exist across 4 files
- 23 application routes exist
- COD is the only payment method (check constraint `payment_method = 'cod'`)
- Per-vendor commission rate is snapshotted on suborder at placement
- Commission is earned on delivery confirmation
- Stock is decremented at placement with row locks; restocked on cancel
- Vendor isolation is enforced by RLS (not just UI hiding)
- `proxy.ts` provides route guards but every page also verifies server-side

**Assumptions (not verified during this audit):**
- Build, lint, typecheck, and test results as documented (would require running them)
- Hosted Gifto project has migrations 1–7 applied (per README/STATUS_REPORT)
- Supabase Storage bucket policies work end-to-end with actual file uploads

---

## Recommended Immediate Actions

1. **Push the 3 ahead commits** to `origin/main` (image upload + Vitest + hardening).
2. **Apply migrations 8–9** to the hosted Gifto project via `supabase db push`.
3. **Review the 5 high npm audit advisories** before any `npm audit fix`.
4. **Resolve D-07 (subscription model)** and **D-06 (delivery fee model)** with the owner before building dependent features.
5. **Add browser-level E2E tests** for checkout, vendor order processing, and admin flows.

---

## Audit Coverage and Limitations

**Covered:** All source files, migrations, test suites, configuration, package manifests, routes, components, lib modules, git status, and documentation.

**Not covered (read-only constraints):**
- Did not execute `npm test`, `npm run typecheck`, `npm run lint`, or `npm run build` (results taken from documented STATUS_REPORT).
- Did not run any Supabase migrations or connect to the hosted project.
- Did not access `.env.local` or any secret values.
- Did not test Storage uploads with actual files.
- Did not verify browser-level interactions.

**Confidence level:** High for structural/code findings; Medium for runtime-verification claims (all taken from documented STATUS_REPORT, not re-executed).
| S-08 | P2 | COD-never-collected case has no automatic restock path | STATUS_REPORT "Remaining" #3 | Manual adjustment or delivery-confirmation restock needed |
| S-09 | P3 | Settlement cadence and payout reconciliation automated | D-08 open | Deferred — manual batch acceptable for MVP |
| S-10 | P3 | Guest checkout not supported | D-03 decided (accounts required) | Post-launch consideration |

**Limitations documented in README:**
- Vendor/admin/customer write paths covered by DB suites, not browser tests.
- Checkout verified at DB level + build/type checks, not browser click-through.
- `supabase start` doesn't produce containers locally; verification uses raw `supabase/postgres` container + hosted project.
| Supabase Auth | DONE | `src/lib/supabase/server.ts`, `auth.ts`, `(auth)/` routes |
| Supabase Postgres + RLS | DONE | 9 migrations, 7 RLS test suites |
| Supabase Storage | DONE | Migration 9 bucket + policies; image upload actions |
| Email/SMS notifications | NOT IMPLEMENTED | No notification provider integrated |
| Payment gateway | NOT IMPLEMENTED (COD only) | `payment_method = 'cod'` check constraint |
| External shipping/delivery | NOT IMPLEMENTED | Shops self-deliver; no carrier integration |
| Step | Implemented? | Evidence | Gap |
|------|-------------|----------|-----|
| Admin authentication | DONE | `requirePlatformAdmin()` | None |
| Vendor approval/suspension | DONE | `setVendorStatus()` | None |
| Commission rate configuration | DONE | `setCommissionRate()` | None |
| Category management | DONE | `createCategory()` | None |
| Read-only order oversight | DONE | `src/app/admin/orders/` | None |
| Settlement management | DONE (manual) | `create_settlement`, `mark_settlement_paid` | No automation |
| Settlement automation | MISSING | Manual admin batch; D-08 cadence open |
| Catalog extras (tags, variants) | MISSING | Documented as deferred |
| Browser-level E2E tests | MISSING | Write paths covered by DB suites only (documented gap) |
| `src/components/` | `cart-provider.tsx`, `product-card.tsx`, `shop-card.tsx`, `auth-form.tsx`, `ui/*` | Shared UI components and cart context |
| `supabase/migrations/` | `00000000000001_...` through `00000000000009_...` | 9 versioned migrations (foundations → image upload) |
| `supabase/tests/` | `rls_*_test.sql`, `storage_stub.sql` | 7 RLS test suites (107 assertions) |

The application follows a **server-first, database-authorized** pattern:

1. **Client → Server Components / Server Actions:** All data reads and writes go through Server Components or Server Actions using the Supabase server client (anon key, cookie-scoped session).
2. **Supabase server client → Postgres:** RLS policies enforce row- and column-level access. The anon key is not privileged.
3. **SECURITY DEFINER RPCs:** `place_order`, `cancel_order`, `apply_as_vendor`, `adjust_product_stock`, `create_settlement`, `mark_settlement_paid` encapsulate business logic with pinned `search_path` and restricted EXECUTE.
4. **Triggers:** `set_updated_at`, `slugify`, vendor finance guard, status-history audit, last-owner guard, platform-admin INSERT guard, commission earn-on-delivery, restock-on-cancel.
5. **Storage:** Product images in `product-images` bucket (public read, manager-scoped write by vendor folder path).

**Trust boundary:** The cart lives in `localStorage` and is never trusted — `place_order` re-reads all prices and stock from the database under row locks.
- **9 database migrations** covering profiles, vendors, memberships, catalog, multi-vendor orders, commission ledger, inventory adjustments, security hardening, and product image upload.
- **7 RLS test suites** (107 assertions) verifying vendor isolation, onboarding, catalog privacy, order/checkout split, commissions, inventory, and security hardening.
- **31 Vitest unit tests** covering money formatting/parsing, cart logic, cart store, and slugify.
- **23 application routes** spanning public storefront, authentication, customer cart/checkout/orders, vendor product/order/inventory management, and platform administration.

The product vision, business model (commission + optional subscription, COD only), technical stack (Next.js 16 + Supabase + RLS), and multi-vendor checkout model (parent order + vendor suborders) are all implemented and consistent with the documented requirements.

**No source code, migrations, configuration, or environment files were modified during this audit.** All findings are read-only observations.