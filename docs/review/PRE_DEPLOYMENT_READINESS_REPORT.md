> **HISTORICAL — 2026-11-20 (P0-08).** Dated snapshot of a past verification (see the date in the file). Its numbers and hosted-state claims were true when written and are not current. Current state: `README.md`, `docs/HOSTED_STATE.md` (single hosted-state table), `docs/DECISIONS.md`. Kept as a record; its findings were not edited.

# Gifto Pre-Deployment Readiness Report

Date: 2026-11-09

## Executive Summary

- **No critical or high-severity app-code deployment blocker was found.**
- The local app code depends on Production migrations **20-24**, and all are already applied. **No new migration is required for this app-only release.**
- All local gates pass: typecheck, lint, **142 tests**, production build, and Tailwind verification.
- **Nothing was deployed, committed, pushed, migrated, or changed in Vercel/Supabase.**
- Production app still runs `d64dae5`; the local worktree has 95 entries: **36 modified + 59 untracked**, with no removals or renames.
- **Full SQL/RLS suite is still NOT RUN.** No verified backup/PITR, staging, CI, error tracking, or E2E/load tests exist.
- Release requires owner approval and explicit acceptance of the database/operational risks below.

## Exact Changed-File Inventory

Baseline `C:\Users\bodyo\AppData\Local\Temp\opencode\gifto-baseline.txt` had 85 entries. Current status has 95: **36 modified, 59 untracked, 0 staged**. Comparison shows only 10 additions versus baseline, no deletions/renames. `git diff --check` produced only CRLF conversion warnings.

### Modified tracked files (36)

```text
next.config.ts
package.json
src/app/account/orders/[id]/page.tsx
src/app/account/orders/actions.ts
src/app/account/orders/page.tsx
src/app/account/page.tsx
src/app/admin/actions.ts
src/app/admin/orders/page.tsx
src/app/admin/page.tsx
src/app/admin/settlements/page.tsx
src/app/cart/cart-view.tsx
src/app/checkout/page.tsx
src/app/layout.tsx
src/app/shops/[slug]/[productSlug]/page.tsx
src/app/shops/[slug]/page.tsx
src/app/vendor/finance/page.tsx
src/app/vendor/orders/actions.ts
src/app/vendor/orders/page.tsx
src/app/vendor/overview/page.tsx
src/app/vendor/products/[id]/images/actions.ts
src/app/vendor/products/[id]/images/product-images-panel.tsx
src/app/vendor/products/[id]/inventory/actions.ts
src/app/vendor/products/actions.ts
src/app/vendor/products/page.tsx
src/app/vendor/vendor-shell.tsx
src/components/product-card.tsx
src/components/product-image.tsx
src/components/shop-card.tsx
src/components/site-header.tsx
src/lib/auth.ts
src/lib/catalog.test.ts
src/lib/catalog.ts
src/lib/guest-order.ts
src/lib/supabase/database.types.ts
src/lib/vendor.ts
src/proxy.ts
```

### Untracked files (59)

```text
docs/GIFTO_PHASE_0_STAGE_1_REPORT.md
docs/GIFTO_PRE_LAUNCH_AUDIT.md
docs/VENDOR_DASHBOARD_BACKEND_GAPS.md
docs/VENDOR_DASHBOARD_BACKEND_IMPLEMENTATION.md
docs/VENDOR_DASHBOARD_BACKEND_SECURITY_AUDIT.md
docs/review/ARCHITECTURE.md
docs/review/LAUNCH_PLAN.md
docs/review/POST_MIGRATION_COMPATIBILITY_AUDIT.md
docs/review/PRODUCTION_READINESS.md
docs/review/PRODUCTION_RELEASE_CHECKLIST.md
docs/review/REMAINING_DATABASE_RISKS.md
scripts/backfill-vendor-media.mjs
src/app/admin/support/actions.ts
src/app/admin/support/page.tsx
src/app/admin/support/support-status-form.tsx
src/app/vendor/analytics/bar-chart.tsx
src/app/vendor/analytics/page.tsx
src/app/vendor/settings/actions.ts
src/app/vendor/settings/branding-upload.tsx
src/app/vendor/settings/page.tsx
src/app/vendor/settings/pause-orders.tsx
src/app/vendor/settings/store-settings-form.tsx
src/app/vendor/support/actions.ts
src/app/vendor/support/page.tsx
src/app/vendor/support/support-faq.tsx
src/app/vendor/support/support-request-form.tsx
src/components/pagination.tsx
src/components/shop-cover.tsx
src/components/shop-logo.tsx
src/lib/auth.test.ts
src/lib/catalog-cache.test.ts
src/lib/catalog-cache.ts
src/lib/fetch-all.test.ts
src/lib/fetch-all.ts
src/lib/images.test.ts
src/lib/images.ts
src/lib/order-vendors.server.ts
src/lib/order-vendors.test.ts
src/lib/order-vendors.ts
src/lib/pagination.test.ts
src/lib/pagination.ts
src/lib/supabase/public.ts
src/lib/support-content.ts
src/lib/support-requests.ts
src/lib/vendor-analytics.test.ts
src/lib/vendor-analytics.ts
src/lib/vendor-settings.test.ts
src/lib/vendor-settings.ts
supabase/migrations/00000000000020_vendor_profile_privacy.sql
supabase/migrations/00000000000021_vendor_media.sql
supabase/migrations/00000000000022_vendor_pause_checkout.sql
supabase/migrations/00000000000023_vendor_support_requests.sql
supabase/migrations/00000000000024_analytics_scale.sql
supabase/rollbacks/00000000000020_vendor_profile_privacy_rollback.sql
supabase/rollbacks/00000000000021_vendor_media_rollback.sql
supabase/rollbacks/00000000000022_vendor_pause_checkout_rollback.sql
supabase/rollbacks/00000000000023_vendor_support_requests_rollback.sql
supabase/rollbacks/00000000000024_analytics_scale_rollback.sql
supabase/tests/rls_vendor_dashboard_test.sql
```

No source edits were made during final review. `npm run build` refreshed ignored `.next` artifacts only; status remained 95 entries.

## Validation Results

| Check | Result |
|---|---|
| `npm run typecheck` | Passed, clean |
| `npm run lint` | Passed, clean |
| `npm test` | **17 files / 142 tests passed**, 2.05s; non-failing Vite ESM/CommonJS warning |
| `npm run build` | Next.js 16.4.2 webpack, compiled in 8.1s, TypeScript 4.7s, 3/3 static pages, 34 routes all dynamic, proxy middleware present |
| Postbuild Tailwind verification | Passed |
| Secret scan | Clean: only `.env.example` tracked; `.env.local` gitignored; no JWT/service-role literals in source/scripts/docs; no build/coverage/`.vercel` entries in status |
| Production smoke | `/`, `/shops`, `/shops/nile-blossoms` return 200; `/account/orders` redirects to login |
| PostgREST probes | Anonymous `public_vendors` 200; `address_line` 400; anonymous support 401 |
| Production schema | Migrations 1-24 applied; `public_vendors` 13 approved columns, no `address_line`; vendor-media public 5 MB with 4 policies and 0 objects; analytics index exists |
| Vendor data | All 5 vendors active/accepting; working hours empty |
| SQL/RLS suite | **NOT RUN** - no disposable DB, `psql`, Docker daemon, or DB password |

## Findings

### Critical / High App-Code Findings

- **Critical: none.**
- **High: none.**

### High Operational / Database Risks

1. **No verified backup/PITR.** No managed backup or tested restore is proven. Do not make further database changes without an owner-approved backup.
2. **Full RLS suite not run.** `supabase/tests/rls_vendor_dashboard_test.sql` and the order/money/state-machine suites remain unexecuted. Do not call RLS "verified."
3. **Production app is behind the database.** Production app runs `d64dae5` while the database has migrations 20-24. The app-only release should be deployed promptly; do not deploy app code against a database at migrations 1-19.
4. **Manager-media policy mismatch (DB-03).** Migration 21 storage policies allow active managers to write `vendor-media`, while the app restricts branding to owner/platform admin. No silent bypass found because actions pre-check, but the policy decision must be accepted or aligned later.
5. **Support rate-limit race (DB-01)** and **returns/settlement race (DB-02)** remain database-level risks; no app-only fix is safe without a migration.
6. **Public bucket handling (DB-07).** `vendor-media` must never contain private files.

### Medium App Findings

1. **Settlement totals can misstate gross/net.** `settlementTotals` in `src/lib/finance.ts` falls back to the settlement line's `amount_minor` as gross when a commission entry is missing. `totalsIncomplete` warns on `fetchAllRows` truncation, but not every missing-entry/error case. With >20k entries or failed reads, admin settlement totals may be misleading. Prefer server-side aggregation or fail-closed behavior in a future change.
2. **Account orders lack an explicit `user_id` filter.** `/account/orders` and `/account/orders/[id]` rely on RLS. A platform admin is authorized by RLS to see all orders, so the customer "Your orders" UI can display all orders. This is not privilege escalation, but it is confusing and overbroad. The list also ignores query errors. Add an explicit user filter or admin-specific copy/error handling in a future change.

### Low App Findings

- Admin orders `openCount` and vendor open filters use `.not("status","in","(delivered,cancelled,returned)")`, counting terminal parent-only `partially_completed` as "in progress."
- Admin support list is capped at 100 without pagination.
- Admin vendor list is unbounded and computes counts in memory.
- Vendor support ignores `recentRequests` query errors.
- `loadProductsByShop` cache tags omit `categories`; category rename could stale shop-page labels, though no app category-update action currently exists.
- Checkout `getRequestContext` pulls profile/memberships for prefill; deduped with the header, but adds minor request work.
- A platform admin without a vendor membership cannot enter vendor pages because `requireVendorRole` builds shops only from memberships. This is expected behavior, not an authorization bypass.
- `vendors` RLS includes `vendors: platform admin update`; the earlier "owner-only update" assumption was corrected. Managers still cannot update the vendor row, and branding UI/actions remain owner/platform-admin only.

## Deployment Risks

- Production Supabase is already at migrations 20-24; the release is **app-only**. Do not apply another migration unless separately approved and backed up.
- Vercel must have the correct Production environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` - server-only, never `NEXT_PUBLIC_`
  - `NEXT_PUBLIC_SITE_URL` - public origin, never localhost in Production
- The previous Vercel deployment must remain available for app rollback.
- Do not roll back migrations 20 or 23 without a backup and an explicit data-loss decision; both are data-destructive in this project. Prefer fixing forward.
- No staging, CI, error tracking, E2E, or load tests exist; release verification is manual.
- Supabase CLI token is expired; further read-only Production checks require re-login.
- The SQL/RLS gap, backup/PITR gap, manager-media mismatch, support rate-limit race, and returns/settlement race must be explicitly accepted by the owner.

## Recommended App-Only Deployment Procedure - Not Executed

1. Obtain owner approval and explicit acceptance of the risks above.
2. Confirm Production database is at migrations 1-24 with no pending migration.
3. Confirm all four Production Vercel environment variables are set correctly.
4. Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` from the release worktree.
5. Inspect `git diff`/`git status`; confirm no `.env.local`, secret, generated build output, or unrelated file is included.
6. Deploy **only the app code** to Vercel. Do not apply migrations.
7. Keep the previous deployment available for rollback.
8. Run the post-deployment smoke checklist below.
9. Roll back app-only by restoring the previous Vercel deployment if needed. Do not weaken RLS as a workaround. Note the old app will show generic "Shop" labels in order history after migration 20; that is degraded but not data-destructive.

## Post-Deployment Smoke Checklist

### Public

- `/` returns 200 and shop rails render.
- `/shops` returns 200 and shows active shops.
- `/shops/<active-slug>` returns 200; hours/prep time render when set; private address is absent.
- Product detail loads; add-to-cart works.
- Guest checkout completes; `/orders/<id>` is accessible only in the same browser with the HttpOnly token cookie.
- Signed-in customer sees shop names on `/account/orders` and `/account/orders/<id>`.

### Vendor

- Owner can save name, description, contact, location, private address, hours, and prep time.
- Manager sees settings read-only and cannot save profile or branding.
- Owner can upload/remove logo and cover; public shop updates.
- Pause/resume orders work; checkout rejects a paused shop clearly.
- Order status transitions work; delivered commission appears in finance.
- Analytics loads for 7d/30d/90d/all; all-time cap notice is correct.
- Support request submits and appears in Recent requests.

### Admin

- `/admin` counts and attention list agree.
- `/admin/orders` filters, pagination, and totals agree.
- `/admin/settlements` loads exact/incomplete state correctly; open/paid/voided sections render.
- `/admin/support` counts, filter, and status update work.

### Security

- Anonymous requests cannot read support requests, orders, commission entries, settlements, or base `vendors` rows.
- A signed-in non-member cannot read another shop's dashboard data.
- No service-role key or private address appears in public HTML or client bundles.

## Release Decision

**Status: ready for owner decision - not deployed.**

Required owner decisions before release:

- Accept or resolve the unrun SQL/RLS suite.
- Accept or resolve the missing backup/PITR.
- Accept the manager-media policy mismatch.
- Accept DB-01, DB-02, DB-03, DB-06, and DB-07.
- Approve the app-only Vercel deployment and target time.

Full release gate details are in `docs/review/PRODUCTION_RELEASE_CHECKLIST.md`; remaining database risks are in `docs/review/REMAINING_DATABASE_RISKS.md`.
