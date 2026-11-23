# Gifto — Hosted Courier Schema Investigation

**Date:** 2026-11-24
**Branch:** `muse/decision-closure-brevo`
**Scope:** Explain why courier/tracking fields are missing from the hosted admin
logistics experience, classify what is verified versus suspected, and define the
safe path forward.
**Hosted writes performed:** None. This investigation used repository evidence
and the read-only production observations already recorded in
`docs/STAGE_B_MIGRATION_RECONCILIATION.md`. No hosted access was available in
this session.

## Executive summary

- The courier fields come from **migration 42**
  (`supabase/migrations/00000000000042_courier_tracking.sql`), which adds
  `courier_name`, `tracking_ref`, and `handed_over_at` to `order_vendors` and
  changes `set_order_vendor_status` so shipping requires a courier and a
  tracking reference.
- On **2026-11-22**, read-only production probes found the production Supabase
  project `hqusykdyjpruysxezsrn.supabase.co` consistent with **migration 27**:
  migrations 28–66 objects were absent. Therefore migration 42 is **not applied**
  in production.
- The deployed application appears **newer than the database** (post-migration-47
  UI is publicly visible while post-27 tables are absent). This is a probable
  active schema-drift condition, not only a future deployment-order risk.
- The `codex/logistics-wip` branch (`b71aa11`) and the uncommitted WIP in the
  shared working tree work around the missing columns by hiding/faking the
  courier experience. That is **not a fix** and must not be merged.
- Migration 36 is a **hard blocker** for applying 28–71: two production paid
  settlements have no payout proof, so the migration-36 constraint fails as
  written.
- Correct order: resolve the migration-36 legacy rows with owner/finance
  approval, rehearse 28–71 on a staging clone, verify migration 42 there, then
  apply to production with backup/PITR and a maintenance window, and only then
  deploy the app code that depends on those columns.

## What migration 42 does

Source: `supabase/migrations/00000000000042_courier_tracking.sql`.

| Object | Detail | Lines |
|---|---|---|
| `order_vendors.courier_name` | Nullable text; recorded at shipment; existing shipped rows keep null (no evidence to invent). | 38–44 |
| `order_vendors.tracking_ref` | Nullable text; tracking/handover reference. | 38–46 |
| `order_vendors.handed_over_at` | Nullable timestamptz; stamped by the RPC on the shipped transition. | 38–48 |
| `order_vendors_shipped_courier_idx` | Partial index on `(courier_name, shipped_at desc)` for shipped/delivered rows with a courier. | 50–53 |
| `set_order_vendor_status` | Replaced 5-argument function with a 7-argument version; `shipped` requires courier (2–80 chars) and tracking (3–80 chars); stamps `handed_over_at`. | 59–198 |
| Grants | Execute only to `authenticated`; direct column writes remain closed. | 200–217 |
| `get_guest_order` | Returns `courier_name`, `tracking_ref`, and `handed_over_at` to the guest token holder. | 243–309 |

The migration header explicitly says: **"No courier API is integrated and no
live tracking status is promised — these fields are the handover record only"**
(lines 35–36).

## Code paths that depend on migration 42

| Area | File | Dependency |
|---|---|---|
| Admin logistics list/search | `src/app/admin/logistics/page.tsx:61-72,221-231` | Selects `courier_name`, `tracking_ref`, `handed_over_at`; searches courier/tracking. |
| Admin ship form | `src/app/admin/orders/suborder-actions.tsx:102,113`; `src/app/admin/orders/actions.ts:56-57,125-126` | Sends courier/tracking to the RPC. |
| Vendor ship form | `src/app/vendor/orders/suborder-actions.tsx:116,127`; `src/app/vendor/orders/actions.ts:61-62,147-148` | Sends courier/tracking to the RPC. |
| Customer order detail | `src/app/[locale]/(storefront)/orders/[id]/page.tsx:394-399` | Displays handover record. |
| Customer account order | `src/app/[locale]/(storefront)/account/orders/[id]/page.tsx:310-315` | Displays handover record. |
| Admin order detail | `src/app/admin/orders/[id]/page.tsx:222-229` | Displays handover record. |
| Vendor order detail | `src/app/vendor/orders/[id]/page.tsx:139-144` | Displays handover record. |
| Generated types | `src/lib/supabase/database.types.ts:578-580` | Includes the three columns. |
| RLS tests | `supabase/tests/rls_orders_test.sql:1170-1172,1223-1235`; `supabase/tests/rls_guest_orders_test.sql:353-359` | Assert handover storage/visibility. |

If migration 42 is absent, these paths either fail at runtime or must degrade.
The current application does not contain a supported runtime degradation for
the admin logistics query, which is why the other agent produced a workaround.

## Evidence classification

| Claim | Classification | Evidence |
|---|---|---|
| Production is schema-consistent with migration 27; 28–66 objects absent. | **OBSERVED (read-only, 2026-11-22)** | `docs/STAGE_B_MIGRATION_RECONCILIATION.md:16-20,30-33`; read-only PostgREST/OpenAPI and row-count probes. |
| Production has 44 orders, 47 `order_vendors`, 4 settlements, and 2 paid settlements without payout proof. | **OBSERVED (read-only, 2026-11-22)** | Same document, lines 31–33. |
| Migration 36 fails on a paid settlement without proof. | **OBSERVED (local rehearsal)** | Same document, lines 18, 33. |
| Deployed app appears newer than the production database. | **INFERRED / PROBABLE** | Public production UI shows post-47 features while post-27 objects are absent; exact deployed commit unverified (`STAGE_B:19,34-35`). |
| Migration 42 is not applied in production. | **INFERRED from migration-27 state** | Migration 42 is part of 28–66; all tested 28–66 objects were absent. |
| Hosted migration history table and exact applied versions. | **UNVERIFIED** | No database password, Supabase CLI login, or dashboard access (`STAGE_B:36`). |
| Hosted `order_vendors` currently lacks the courier columns. | **UNVERIFIED directly; strongly expected** | Consequence of migration-27 state; not directly queried this session. |
| Local runtime proof of the courier pages. | **BLOCKED** | Local Supabase `/rest/v1/` returns 503. |

## The workaround branch is not a fix

`codex/logistics-wip` (`b71aa11`, base `e1fa04f`) changes only
`src/app/admin/logistics/page.tsx`:

- removes `courier_name`, `tracking_ref`, and `handed_over_at` from the select;
- filters on `shipped_at` instead of `handed_over_at`;
- replaces the courier/tracking search with
  `.eq("id", "00000000-0000-0000-0000-000000000000")`;
- changes the description to say courier details appear after the hosted
  migration is applied.

Why this is unsafe:

- It is an **incomplete regression**: the admin can no longer see or search the
  handover evidence that migration 42 was designed to provide.
- It hides a schema problem instead of resolving it; other pages that read the
  columns will still fail if the hosted schema is missing them.
- The fake impossible-UUID filter is not a search implementation and will
  confuse future maintainers.
- It conflicts with the completed 3a LIKE-escaping work
  (`src/lib/logistics-search.ts`) and with the shipped courier UI.

The uncommitted WIP in the shared working tree also includes a migration-36
legacy backfill that invents payout proof for two paid settlements. That is a
financial data change and must not be merged without owner/finance approval.

## Safe path forward

1. **Resolve migration 36 first.** Owner/finance must decide how the two paid
   settlements without payout proof are handled. Do not merge an invented
   backfill.
2. **Create a staging clone from a production backup.** Confirm the exact
   migration history and the state of `order_vendors` before changing anything.
3. **Apply migrations 28–71 in order on staging.** Do not cherry-pick migration
   42 or any other migration outside the reviewed sequence.
4. **Verify migration 42 on staging** with the queries below.
5. **Run the app against staging** and exercise: ship a suborder (courier +
   tracking required), admin logistics list/search, customer order detail,
   guest order detail, and the RLS suites.
6. **Confirm backup/PITR and a maintenance window.** Apply to production in the
   reviewed order.
7. **Deploy the app code that depends on the columns only after** the production
   schema is verified. Migration 67 must precede app code that reads
   `app_settings`.
8. **Remove the workaround branch** only after the hosted migration is applied
   and the real UI is verified. Never merge it as a substitute.

## Verification queries

Run read-only on staging first, then on production during the approved window.

```sql
-- 1. Migration history (if the migrations table is available to the operator).
select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 10;

-- 2. Courier columns.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'order_vendors'
  and column_name in ('courier_name', 'tracking_ref', 'handed_over_at')
order by column_name;

-- 3. Courier index.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'order_vendors'
  and indexname = 'order_vendors_shipped_courier_idx';

-- 4. RPC signature (must be the 7-argument version).
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'set_order_vendor_status';

-- 5. Existing shipped rows without handover evidence (expected on legacy rows;
--    do not invent values).
select count(*) as shipped_without_handover
from public.order_vendors
where status in ('shipped', 'delivered')
  and (courier_name is null or tracking_ref is null or handed_over_at is null);
```

Application smoke checks after the migration:

- Vendor ships a suborder: courier and tracking are required; the row stores
  both and `handed_over_at` is set.
- Admin logistics list shows the courier and handover time; courier/tracking
  search returns the row.
- Customer and guest order pages show the handover record.
- Shipping without courier/tracking fails with a clear validation error.
- RLS order/guest-order suites pass.

## What this investigation does not prove

- It does not prove the hosted migration history beyond the 2026-11-22 probes.
- It does not prove the exact deployed application commit.
- It does not prove the courier pages work against the hosted database.
- It does not authorize any hosted write, migration, or deployment.

## Required owner decisions

- How to resolve the two paid settlements without payout proof (migration 36
  blocker).
- Approval to rehearse 28–71 on staging and then apply to production.
- Confirmation of backup/PITR and a maintenance window.
- Whether to keep the handover-only model or add carrier integration (see
  `docs/DECISION_CLOSURE_REPORT.md`, Decision 1).
