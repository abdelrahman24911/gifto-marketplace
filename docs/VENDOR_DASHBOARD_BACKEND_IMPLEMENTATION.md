> **HISTORICAL — 2026-11-20 (P0-08).** Dated snapshot of a past verification (see the date in the file). Its numbers and hosted-state claims were true when written and are not current. Current state: `README.md`, `docs/HOSTED_STATE.md` (single hosted-state table), `docs/DECISIONS.md`. Kept as a record; its findings were not edited.

# Vendor Dashboard Backend Implementation

**Date:** 2026-11-06
**Scope:** migrations 20–24 and the matching vendor/admin application code.
**Deployment status:** implemented and validated against the local/disposable database only. Nothing has been applied to the hosted Supabase project `hqusykdyjpruysxezsrn`, committed, or pushed.

---

## 1. What shipped

| Area | Behaviour | Main files |
| --- | --- | --- |
| Public vendor privacy | Private vendor columns are no longer readable through the authenticated base table. `address_line` is never exposed. | `00000000000020_vendor_profile_privacy.sql` |
| Vendor profile | Cover image, private street address, working hours, and preparation-time range. Working hours use an explicit JSON shape and validator. | migration 20, `src/lib/vendor-settings.ts`, `/vendor/settings` |
| Vendor media | Public-read `vendor-media` bucket for logos and covers. Writes are scoped to active managers of the vendor in path segment 1 and `branding`/`cover` folders. | `00000000000021_vendor_media.sql`, `src/components/shop-logo.tsx`, `src/components/shop-cover.tsx` |
| Existing logos | Dual-read/fallback keeps old `product-images` logo objects working. A backfill script copies them into `vendor-media`; old objects stay in place for rollback. | `scripts/backfill-vendor-media.mjs` |
| Order pause | Vendors can pause new orders while the shop and products stay visible. Checkout rejects paused shops transactionally. | `00000000000022_vendor_pause_checkout.sql`, `/vendor/settings`, shop pages |
| Support requests | Vendors submit a request to a manual admin queue. No notifications, replies, or external integrations. Submissions are rate limited to 5 per rolling 15 minutes per creator. | `00000000000023_vendor_support_requests.sql`, `/vendor/support`, `/admin/support` |
| Analytics scale | Vendor analytics use an indexed date read. The latest-1,000 option is explicitly bounded and labelled; older lines are excluded from those totals. | `00000000000024_analytics_scale.sql`, `src/lib/vendor-analytics.ts` |

## 2. Decisions encoded in the implementation

- **Pause blocks checkout only.** `public_vendors` exposes `is_accepting_orders`; products and shops remain visible. Paused shops show a notice and product pages hide Add to cart.
- **Checkout is race-safe.** `_create_order` locks product rows by id, then locks each distinct vendor row in id order, re-checks `status = 'active'`, re-checks active membership/public visibility, rejects `is_accepting_orders = false`, and only then reads `commission_rate`.
- **Public profile fields are approved explicitly.** The public view exposes cover, working hours, and preparation times. `address_line` stays private.
- **Support is a manual queue.** Vendors see their own requests and status; platform admins see all requests and may change status. Request metadata (`created_by`, `status`, timestamps, id) is server-assigned.
- **Analytics all-time is bounded.** The UI option is "Latest 1,000"; the query applies `.limit(1000)` and the page states that older lines are excluded. Date windows remain indexed.
- **No hosted changes.** The migrations and backfill must be applied through the normal reviewed deployment process after explicit owner approval.

## 3. Deployment order

1. Apply migrations in filename order:

   ```text
   00000000000020_vendor_profile_privacy.sql
   00000000000021_vendor_media.sql
   00000000000022_vendor_pause_checkout.sql
   00000000000023_vendor_support_requests.sql
   00000000000024_analytics_scale.sql
   ```

2. Deploy the matching application code. The code expects the new columns, view fields, bucket, and support table.
3. Run the logo backfill after the `vendor-media` bucket exists and before relying on new URLs as the only source:

   ```bash
   npm run media:backfill
   ```

   The script reads `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (or the project’s existing service-role environment names), copies existing logo objects into `vendor-media`, and verifies them. It is safe to re-run. Old objects are retained for rollback.

4. Smoke-test:
   - Public shop shows cover, working hours, prep times, and not the street address.
   - Signed-in non-member cannot read the vendor base row.
   - Paused shop stays visible; checkout rejects with the paused message.
   - Vendor support submission appears in the admin queue; vendor sees only its own requests.
   - Analytics date ranges load, and Latest 1,000 shows the bounded-history notice.

## 4. Validation performed

- `npm run typecheck` — passes.
- `npm run lint` — passes.
- `npm test` — 99 tests pass across 11 files.
- `npm run build` — see the Phase 6 verification result in the handoff.
- Disposable RLS container `gifto-rls-test`:
  - Migrations 20–24 applied in order.
  - `supabase/tests/rls_vendor_dashboard_test.sql` passes all 16 test groups, including base-table privacy, working-hours validation, media policies, pause/resume checkout, support grants/isolation/rate limiting, and the analytics index.
  - Rollback scripts 24 → 23 → 22 → 21 → 20 executed successfully, then migrations 20–24 were re-applied and the suite passed again.

## 5. Rollback order

Roll back in reverse dependency order:

```text
00000000000024_analytics_scale_rollback.sql
00000000000023_vendor_support_requests_rollback.sql
00000000000022_vendor_pause_checkout_rollback.sql
00000000000021_vendor_media_rollback.sql
00000000000020_vendor_profile_privacy_rollback.sql
```

Important rollback guards:

- Migration 23 refuses while support-request history exists. Export it first.
- Migration 22 refuses until 23 is rolled back; it restores the pre-pause `_create_order`.
- Migration 21 refuses while `vendor-media` objects exist. Copy/export them first; old `product-images` objects are untouched.
- Migration 20 removes profile columns and restores the old broad vendor read policy, which is intentionally insecure. Coordinate it with the old application code.

## 6. Known limits and follow-ups

- Hosted Supabase has not been touched. Applying these migrations is a separate approved deployment action.
- Support requests have no notifications or replies; this matches the approved manual-queue scope.
- Working hours are display-only; no timezone or order-cutoff enforcement is attached.
- Analytics "Latest 1,000" is a bounded sample, not a full historical aggregate. A database-side RPC can replace it later if measured need justifies the change.
- `src/lib/supabase/database.types.ts` remains hand-written; regenerate it from the live schema after applying the migrations.
