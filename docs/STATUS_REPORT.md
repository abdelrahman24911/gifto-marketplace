> **SUPERSEDED — 2026-11-20 (P0-08).** This file describes the pre-Phase-2 system (before migrations 28–32). Its claims about refunds, the order audit trail, delivery coverage, the admin order detail page, legal pages, SEO, tags, and settlements no longer describe the current system. Current state: `README.md` (features and counts), `docs/HOSTED_STATE.md` (hosted state — the single source), `docs/DECISIONS.md` (owner decisions). Kept as a dated record; its findings were not edited.

# Gifto Marketplace - Status Report

**Date:** 2026-10-26

**Repository state:** `main` @ `357891e`; working tree has uncommitted Phase 9A/9B changes (guest checkout, demo tooling, migration 12, failed-delivery handling, docs). Nothing was committed or pushed during this phase.

**Hosted project:** `hqusykdyjpruysxezsrn` (`gifto`, `eu-central-1`); migrations `1`-`13` are applied and recorded.

---

## Summary

Phases 1-7 and the first-pass app surface remain implemented. Phase 9A is complete and verified: migration 11 (guest COD checkout) and migration 12 (order-table least-privilege grants) are applied to the hosted project; hosted rollback-only smoke tests verified guest checkout, authenticated checkout, vendor status updates, and privilege boundaries; and the guest-order RLS suite passed in Docker on a fresh schema.

Phase 9B is implemented and verified: migration 13 allows `shipped -> cancelled` for a failed COD delivery, reuses the existing restock trigger, and adds the parent-only `partially_completed` state for mixed terminal suborders. The vendor queue exposes the new action behind a confirmation. Migration 13 is applied to the hosted project; all eight RLS suites passed in Docker, including updated orders TEST 16 and the guest-order suite; and a browser E2E passed 11 checks covering checkout, mixed terminal outcomes, restock, ledger, commission, guest confirmation, repeated cancellation, and fixture cleanup.

---

## Finished

### Database (migrations 1-13 applied on the hosted project)

| # | Migration | Contents |
|---|---|---|
| 1 | `gifto_foundations` | `profiles`, `vendors`, `vendor_members`, `vendor_status_history`; RLS; privilege helpers; self-elevation and vendor-finance guards |
| 2 | `account_provisioning_and_vendor_onboarding` | Signup profile trigger; `apply_as_vendor()` RPC |
| 3 | `public_vendor_directory` | `public_vendors` view; vendor privacy lockdown |
| 4 | `catalog` | Categories, products, product images, slug derivation, public/catalog RLS |
| 5 | `orders` | Orders/suborders/items/inventory movements; atomic `place_order()`; `cancel_order()`; status state machine; restock on cancellation |
| 6 | `commissions` | Append-only commission ledger; settlements; earn-on-delivery and reverse-on-return triggers; admin-only settlement RPCs |
| 7 | `inventory_adjustment` | Audited manual stock adjustment RPC |
| 8 | `security_hardening` | Platform-admin INSERT guard; dropped `is_vendor_staff`; last-owner guard; service-role client |
| 9 | `product_image_upload` | Public-read `product-images` bucket; manager-scoped storage policies |
| 10 | `demo_flags` | `is_demo` flags for catalog fixture cleanup |
| 11 | `guest_checkout` | Guest order columns, idempotency/public reference indexes, `place_guest_order`, `get_guest_order`, `place_order_with_idempotency`, checkout rate limiting |
| 12 | `order_table_privileges` | Revokes default-ACL over-grants; authenticated read-only plus guarded suborder status updates; service role retains full access |
| 13 | `failed_delivery` | `shipped -> cancelled` for failed COD delivery; parent-only `partially_completed` for mixed terminal outcomes; reuses restock and inventory movement triggers |

Migrations 11-13 were recorded manually in `supabase_migrations.schema_migrations`. Their `statements` column is `NULL`; the local migration files are the source of truth.

### Hosted Phase 9A verification

All smoke tests were rollback-only and left zero order/child/commission rows and restored stock.

| Check | Result |
|---|---|
| Migration 11 structure | Guest columns, checks, unique partial indexes, `checkout_rate_limits`, and the `_create_order`-based guest RPC are present |
| Function ACLs | `_create_order` has no client execute; guest/quota RPCs are service-role-only; authenticated order RPCs exclude `anon` |
| Privilege check | `anon` has no order-table privileges; `authenticated` has select-only on orders/items/movements plus `status`/`updated_at` update on suborders; `service_role` retains full access |
| Guest checkout smoke test | Order, suborder, item and inventory movement created; stock 25 to 24; repeated idempotency key returned the same order; wrong token and wrong-token replay rejected; rollback restored stock |
| Authenticated checkout smoke test | `place_order_with_idempotency` created the order; stock 15 to 14; vendor status update worked; `subtotal_minor` update blocked; anon `orders` select blocked; rollback left zero residue |
| Guest confirmation | Correct token returned the reference/items; wrong token returned null |

### Hosted Phase 9B verification

Migration 13 was applied and its history row normalized to `00000000000013` with `statements = NULL`. A rollback-only fixture used two real products from different shops, delivered one suborder and moved the other `placed -> confirmed -> shipped -> cancelled`.

| Check | Result |
|---|---|
| Enum/function structure | `partially_completed` exists; `assert_order_vendor_transition` allows `shipped -> cancelled`; `sync_parent_order_status` handles mixed terminal outcomes |
| Failed-delivery smoke test | Stock restored by exactly one; `cancelled_at` stamped; parent became `partially_completed`; exactly one `order_cancelled` movement; rollback left zero orders/suborders/movements and restored stock |
| RLS suites | All eight suites passed in Docker on a fresh schema; updated orders TEST 16 and `rls_guest_orders_test.sql` passed |
| Browser E2E | 11/11 checks passed against the live app and hosted DB: two-shop guest checkout, delivery of one line, failed dispatch/cancel/restock of the other, parent `partially_completed`, guest confirmation, and repeated-cancel no-op; all temp fixtures cleaned up |

### App-layer tests (55 tests, six files)

Vitest (Node environment) covers `src/lib/money.ts`, `src/lib/cart.ts`, `src/lib/cart-store.ts`, `src/lib/slugify.ts`, `src/lib/guest-order.ts`, and `src/lib/orders.ts`.

### Application surface

- **Public:** `/`, `/categories`, `/categories/[slug]`, `/shops`, `/shops/[slug]`, `/shops/[slug]/[productSlug]`, `/search`
- **Auth:** `/signup`, `/login`, `/auth/callback`
- **Customer:** `/cart`, `/checkout` (public; authenticated and guest COD), `/account`, `/account/orders`, `/account/orders/[id]`, `/orders/[id]` (token-gated guest confirmation)
- **Vendor:** `/vendor`, `/vendor/products` (+ new/edit), `/vendor/products/[id]` (image gallery), `/vendor/products/[id]/inventory`, `/vendor/orders`
- **Admin:** `/admin` (vendor approval, commission, categories), `/admin/orders` (cross-shop oversight)

`npm run build` exits 0 across all routes. The checkout action calls `place_order_with_idempotency` for signed-in customers and the service-role-only `place_guest_order` for guests; every price is recomputed by the database.

### Decided business rules (`docs/DECISIONS.md`)

| ID | Decision |
|---|---|
| D-01 | Commission: per-vendor rate set by platform admin; snapshotted onto the suborder at placement |
| D-02 | Commission base: product subtotal only |
| D-03 | Guest checkout is now in scope (supersedes the earlier accounts-only decision): COD order with no Auth account, hashed token, HttpOnly order-scoped cookie |
| D-04 | Order lifecycle: `placed -> confirmed -> shipped -> delivered`, plus `cancelled` / `returned`; `shipped -> cancelled` handles failed COD delivery; parent status derived, with parent-only `partially_completed` for mixed terminal outcomes |
| D-05 | Stock: decrement at placement (row-locked, movement-audited); restock on cancellation, including failed delivery; return treatment is tracked in D-09 |
| D-06 | Delivery: free at launch (`delivery_fee_minor = 0`); fee model deferred |
| D-08 | Commission earned on delivery confirmation; settlements are a manual admin batch |
| D-09 | `delivered -> returned` stock treatment remains blocked pending owner approval; current behavior leaves stock unchanged and reverses only an unsettled commission |

---

## Current verification status

| Check | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | clean |
| `npm test` | 55/55 passing across six files |
| `npm run build` | exit 0 across all routes |
| DB suites | All eight RLS suites passed on a fresh Docker schema after migrations 1-13; updated orders TEST 16 and `rls_guest_orders_test.sql` passed |
| Browser E2E | 11/11 checks passed for the failed-delivery flow; the temporary Playwright harness is outside the repo and left zero fixture residue |
| Local page smoke test | Earlier run: public pages 200, unknown paths 404, protected routes redirect when signed out; `/checkout` is intentionally public |
| Hosted migration history | `1`-`13` recorded; migration 11/12 schema, ACLs, and grants verified live; migration 13 structure and behavior verified by rollback-only checks |

The RLS suites are destructive by design (they delete orders and seed Auth users). They should not be run against the hosted project without an explicit adaptation and approval.

---

## Remaining

### 1. Phase 9A/9B verification close-out

- Phase 9B verification is complete: eight RLS suites and the failed-delivery browser E2E passed with zero fixture residue.
- Optional: move the temporary Playwright harness into the repo with an approved test runner and CI credentials.
- Decide whether to backfill migration 11-13 `statements` history values or keep the local files authoritative.

### 2. Returns and stock

- Decide D-09: whether `delivered -> returned` should automatically restock, require inspection plus manual adjustment, or move to a future quarantine workflow. Today it reverses an unsettled commission but leaves stock unchanged.
- If returns should restock, add an idempotent trigger and tests as a separate migration; do not fold it into the failed-delivery path.
- `returned_at` is not currently stamped; add it only with an approved return workflow.

### 3. Settlements and operational tooling

- Admin settlements UI (`/admin/settlements`) for opening and marking settlements paid.
- Settlement audit columns (`created_by`, `paid_by`), one-open-settlement-per-vendor unique index, and a void path.
- Document the return-before-payout rule: a paid settlement currently blocks a later return.
- Customer-management/profile and vendor shop-settings surfaces remain deferred.

### 4. Security and launch hardening

- Supabase default ACLs still grant ALL on future `public` tables to `anon`/`authenticated`; migration 12 only hardened the current order tables.
- Security advisor still reports `public_vendors` as a `SECURITY DEFINER` view and five anon-executable `SECURITY DEFINER` helper functions.
- Leaked-password protection is still disabled.
- `checkout_rate_limits` has RLS enabled with no policies by design (service-role only).

### 5. Process / housekeeping

- No commit or push was performed. Migration 13 was applied to the hosted project through Supabase MCP; the working tree contains the Phase 9A/9B implementation and docs changes.
- Docker is available and the RLS suites were run; Supabase CLI project operations remain blocked by an invalid access token; `psql` is not installed and `.env.local` has no database URL.
- Browser-level E2E now exists only as a temporary harness in `C:\Users\bodyo\AppData\Local\Temp\opencode\gifto-e2e`; it is not committed or wired into `npm test`.
- `npm audit` still reports five high-severity advisories, all through `eslint-config-next` (dev-time only).
