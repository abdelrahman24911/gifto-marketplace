> **HISTORICAL — 2026-11-20 (P0-08).** Dated snapshot of a past verification (see the date in the file). Its numbers and hosted-state claims were true when written and are not current. Current state: `README.md`, `docs/HOSTED_STATE.md` (single hosted-state table), `docs/DECISIONS.md`. Kept as a record; its findings were not edited.

# Gifto — Post-Migration Compatibility Audit

Date: 2026-11-09
Scope: local working tree vs. Production Supabase project `hqusykdyjpruysxezsrn` after migrations 20–24.
Mode: read-only Production verification, local code fixes, local tests/build. No commit, deploy, Vercel change, or database mutation was performed.

## 1. Executive result

- Migrations 20–24 are applied in Production and were verified: `vendors` has 21 columns, `public_vendors` has 13 public columns, `address_line` is absent from the public view, support tables/policies exist, `vendor-media` exists, and `order_vendors_vendor_created_idx` exists.
- Production still runs the old deployed HEAD `d64dae5`; local code is ahead of Production. The old app remains usable because the public view changes are append-only, but order history loses shop labels after migration 20. Deploying the new code is required to finish the migration.
- Local compatibility fixes are implemented for the confirmed migration-20 order-history regression, vendor profile fields, public shop hours/prep-time display, analytics scale, admin order pagination, admin settlements totals, and stale support copy.
- Local quality gates pass after the changes: `npm run typecheck`, `npm run lint`, `npm test` (17 files, 142 tests), and `npm run build`.
- The SQL/RLS suite is **NOT RUN**. There is no disposable database, `psql`, Docker daemon, or database password available. Do not describe RLS as verified by tests.

## 2. Confirmed compatibility fixes

### 2.1 Customer order history (migration 20 regression)

After migration 20, signed-in customers can no longer read the base `vendors` table. The old order-history pages embedded `vendor:vendors(name, slug)` and would show a generic “Shop” label.

Implemented:

- `src/lib/order-vendors.ts`: pure helpers for vendor ids, profile maps, shop names, and labels. Profiles are sanitized to `id`, `name`, `slug`.
- `src/lib/order-vendors.server.ts`: server-only lookup using the service-role client, limited to public shop fields. Callers must fetch the order first through the session/RLS-scoped client.
- `src/app/account/orders/page.tsx` and `src/app/account/orders/[id]/page.tsx`: now select `order_vendors.vendor_id` and resolve labels through the server helper. Historical orders whose shop is no longer active still resolve; the public view alone would hide them.
- `src/lib/order-vendors.test.ts`: covers multi-shop orders, deduplication, missing vendors, empty labels, and profile sanitization.

### 2.2 Vendor settings fields (migration 20)

Implemented support for `address_line`, `working_hours`, `prep_time_min_days`, and `prep_time_max_days`:

- `src/lib/vendor-settings.ts`: working-day/time parsing and validation, JSON conversion, display formatting, and prep-time parsing.
- `src/app/vendor/settings/page.tsx`: reads the new columns; removed the stale “not configurable yet” placeholder; shows owner edit / manager read-only state.
- `src/app/vendor/settings/actions.ts`: validates and saves the new fields. Address remains optional and private.
- `src/app/vendor/settings/store-settings-form.tsx`: private street address, seven day/time rows, and prep-time min/max inputs.
- `src/lib/vendor-settings.test.ts`: covers valid/invalid hours, blank days, same-day ranges, formatting, and prep-time bounds.

Branding remains owner/platform-admin only. Managers can read settings but cannot change the profile or media. This matches the owner-only `vendors` UPDATE policy and avoids an upload succeeding while the metadata write fails.

### 2.3 Public shop display

- `src/lib/catalog.ts`: the public shop projection now includes working hours, preparation time, cover, and pause state.
- `src/app/shops/[slug]/page.tsx`: displays opening hours and preparation time; does not expose the private street address; shows the paused notice.

### 2.4 Analytics scale

- `src/app/vendor/analytics/page.tsx` now pages date-bound ranges with `fetchAllRows` instead of silently accepting a single 1,000-row PostgREST response.
- The all-time range remains intentionally bounded at 1,000 lines and is labeled as such.
- If a date-bound range exceeds the 20,000-row safety cap, the page shows an incomplete-figures warning instead of presenting partial totals as exact.
- Fixed the mojibake separator in the analytics header.

### 2.5 Admin orders scale

- `src/app/admin/orders/page.tsx` now filters by status in the database, counts with `head: true`, orders by `(created_at desc, id desc)`, paginates with the shared `Pagination` component, and shows a load error instead of an empty list.
- This removes the previous behavior where the first 1,000 rows were loaded and filtered in memory, making “All” and status counts wrong for larger histories.

### 2.6 Admin settlements scale

- `src/app/admin/settlements/page.tsx` loads settlements and commission entries with `fetchAllRows` and stable ordering.
- It flags incomplete totals when the safety cap is reached.
- Settlement lookups now use a `Map`, avoiding repeated linear scans.

### 2.7 Admin dashboard and support

- `src/app/admin/page.tsx` now fetches the “orders requiring attention” list with a status filter, so the list agrees with the exact attention count.
- `src/app/admin/support/page.tsx` uses exact head counts and a server-side status filter; list remains limited to 100 rows and now shows a load-error banner.
- Support FAQ taxonomy was renamed to `SUPPORT_FAQ_CATEGORIES` / `SupportFaqCategory` to remove the duplicate name conflict with ticket categories. FAQ answers now describe shipped settings, support tickets, and the owner-only branding rule.
- Vendor support quick-link copy was updated for hours, lead time, logo, and cover.

### 2.8 Vendor overview error states

- `src/app/vendor/overview/page.tsx` now surfaces failed count/list queries instead of silently rendering zero counts or empty lists.

## 3. Migration compatibility matrix

| Migration | Applied in Production | Code compatibility | Status |
|---|---|---|---|
| 20 — vendor privacy, address, hours, prep, public view | Yes | Local code reads new fields; old order embeds fixed | Compatible |
| 21 — `vendor-media` bucket and policies | Yes | Branding UI uses `vendor-media` with legacy fallback | Compatible with owner-only app rule; see manager-media risk |
| 22 — vendor pause + checkout function | Yes | Catalog, shop page, settings pause, checkout RPC | Compatible |
| 23 — support requests | Yes | Vendor support form/list; admin support queue | Compatible |
| 24 — analytics index | Yes | Analytics date windows and bounded all-time read | Compatible |

## 4. Verification performed

Local commands:

```text
npm run typecheck  → passed
npm run lint       → passed
npm test           → 17 files, 142 tests passed
npm run build      → passed (Next.js 16.4.2, webpack)
```

`npm test -- --runInBand` is not supported by this Vitest version and fails with `Unknown option --runInBand`; use `npm test`.

Production checks performed earlier in this task:

- Remote migration history contains 24 rows.
- `vendors` 21 columns; `public_vendors` 13 columns; no `address_line` on the public view.
- Anonymous `public_vendors` read returns 200; anonymous `address_line` read returns 400; anonymous support read is denied.
- Support table, enum, RLS, indexes, and triggers exist.
- `order_vendors_vendor_created_idx` exists.
- `vendor-media` bucket is public-read, 5 MB, with four policies and zero objects at verification time.
- All five current vendors are active and accepting orders with empty working hours.

Not performed:

- SQL/RLS test suite.
- Guest-order RPC integration test.
- Load test.
- Staging deployment.
- Production code deployment.

## 5. Residual findings

### High / release-blocking

1. **Production code is behind the database.** Production still runs `d64dae5`. Order history degrades after migration 20 until the new code is deployed. Deploy only after the release gates in `PRODUCTION_RELEASE_CHECKLIST.md`.
2. **RLS/DB tests are not run.** The repository suite is not evidence of Production policy correctness until it is executed against a disposable database.
3. **No database backup/PITR.** There is no verified restore point before the release; see `REMAINING_DATABASE_RISKS.md`.

### Medium

4. **Manager-media policy mismatch.** Migration 21 lets managers upload/update/delete `vendor-media` objects, but the app and `vendors` UPDATE RLS are owner-only. A manager using the Storage API directly could create orphan objects or delete a current logo/cover object. The app UI blocks managers, but the policies do not. Recommended fix is a future migration aligning storage writes with the owner-only metadata rule, or explicitly supporting manager branding end-to-end.
5. **Admin vendor list is unbounded.** `src/app/admin/page.tsx` loads all vendors and computes counts in memory; a future project above the PostgREST row cap would show incomplete counts. Current five-vendor data is unaffected.
6. **Admin support list is capped at 100 without pagination.** Counts are exact, but older requests are not reachable from the UI. Add pagination before high support volume.
7. **Support request rate-limit race.** Migration 23 counts before insert; concurrent requests can exceed the intended limit. Documented in `REMAINING_DATABASE_RISKS.md`.
8. **Returns vs. settlement race.** Settlement creation and commission reversal do not lock the same commission row, so a return can interleave with settlement creation. Documented in `REMAINING_DATABASE_RISKS.md`.

### Low / follow-up

9. Admin dashboard vendor/category reads and a few list pages remain unbounded; current data volumes are small.
10. The app still has no CI, no staging, no error tracking, and no automated browser/E2E tests.
11. `next.config.ts` intentionally optimizes only public Storage paths. Future private media must not reuse the public bucket or public URL path.
12. No CSP/HSTS/frame policy is configured; this predates the migration work and remains an infrastructure hardening item.

## 6. Files changed by this audit

Code:

- `src/lib/order-vendors.ts`
- `src/lib/order-vendors.server.ts`
- `src/lib/order-vendors.test.ts`
- `src/app/account/orders/page.tsx`
- `src/app/account/orders/[id]/page.tsx`
- `src/lib/vendor-settings.ts`
- `src/lib/vendor-settings.test.ts`
- `src/app/vendor/settings/page.tsx`
- `src/app/vendor/settings/actions.ts`
- `src/app/vendor/settings/store-settings-form.tsx`
- `src/lib/catalog.ts`
- `src/app/shops/[slug]/page.tsx`
- `src/app/vendor/analytics/page.tsx`
- `src/app/admin/orders/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/settlements/page.tsx`
- `src/app/admin/support/page.tsx`
- `src/app/vendor/overview/page.tsx`
- `src/lib/support-content.ts`
- `src/app/vendor/support/support-faq.tsx`
- `src/app/vendor/support/page.tsx`

Documents:

- `docs/review/POST_MIGRATION_COMPATIBILITY_AUDIT.md` (this file)
- `docs/review/PRODUCTION_RELEASE_CHECKLIST.md`
- `docs/review/REMAINING_DATABASE_RISKS.md`

Pre-existing worktree changes were preserved. This audit did not reset, stash, clean, delete, or overwrite unrelated files.
