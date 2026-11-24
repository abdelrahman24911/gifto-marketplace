# Gifto — Database & Migrations

- **Audit date:** 2026-11-24
- **Worktree:** `~/workspace/gifto-master-audit`, HEAD `54c780b`
- **Sources:** specialist database report (`/tmp/gifto-audit/database.md`); specialist hosted-verification report (`/tmp/gifto-audit/hosted.md`) with raw query outputs in `/tmp/gifto-audit/raw/*.json` and comparison scripts `compare.py`, `policydef.py`, `grants.py`, `applied_vs_file.py`.
- **Hosted target:** Supabase project `hqusykdyjpruysxezsrn` (Gifto, eu-central-1, ACTIVE_HEALTHY, **PostgreSQL 17.11**). The connector helper allows SELECT/WITH only and refuses anything else before sending. No hosted writes were made; no customer PII was pulled (settlement aggregates only).

## 1. Migration inventory (repo files)

| Item | Count |
|---|---|
| Migration files | **71, versions 1–71 contiguous**, 17,349 lines |
| Tables | 38 (+ 1 view, `public_vendors`) |
| Enums | 11 |
| Functions | 98 defined across the migration files |
| Triggers | 42 defined across the migration files |
| Indexes | 77 defined across the migration files |
| `CREATE POLICY` statements | 133 (121 distinct policy names) |
| Extensions | 2 (`pgcrypto`, `pg_trgm`) |
| Storage buckets | 3 |
| Rollback files | 55 in `supabase/rollbacks/`; 16 migrations without one (1–13, 19, 27, 30 — migration 30 is forward-only by design, owner-approved D-10) |

The chain applies cleanly from scratch: every RLS suite re-applies migrations 1–71 fresh (18× in this audit's RLS run), and the C1 rehearsal applies 1–67 in stages. There is no dedicated migration test file and no rollback test wired into CI.

## 2. Hosted verification — live, 2026-11-24 (the headline result)

Both headline disputes are resolved with live evidence, not taken on faith.

### 2.1 Migrations 28–71 ARE applied on hosted — owner claim confirmed

Hosted `supabase_migrations.schema_migrations` holds **all 71 versions, 1–71, none missing, no duplicates**. The old assumption that they were pending is dead. The last direct evidence before this audit (2026-11-22 probes) said hosted was at migration 27; the 28–71 run happened after that.

### 2.2 Courier columns DO exist on hosted — the workaround premise is false

`order_vendors.courier_name` (text), `order_vendors.handed_over_at` (timestamptz), `order_vendors.tracking_ref` (text) — all present, all nullable. Migration 42's 7-arg `set_order_vendor_status` and the `order_vendors_shipped_courier_idx` partial index are also live.

### 2.3 Drift: ZERO real drift

| Object class | Hosted count | Result |
|---|---|---|
| Tables | 41 (= repo exactly, incl. `public_vendors` view) | Match |
| Columns | 403 | Match |
| Functions | 93/93 signature match | Match |
| Triggers | 49 | Match |
| Enums | 11 (38 labels) | Match |
| Indexes | 136 | Match |
| RLS + storage policies | 120/120 by name, 0 real definition differences | Match |
| Extensions | Match (hosted extras are Supabase platform defaults) | Match |
| Explicit table grants | 34/34 checks pass | Match |

Every apparent diff was chased down and cleared as a parser artefact. (Counts differ from the §1 migration-file inventory — e.g. 98 functions defined in files vs 93 on hosted, 42 triggers vs 49, 77 indexes vs 136 — because the two inventories count different things: files count definitions, hosted counts live objects including auto-created PK/unique indexes and platform objects. The hosted comparison reconciled each apparent difference individually and found zero real drift.)

**Applied statements vs repo files:** the `statements` arrays in `schema_migrations` match the current repo files exactly for **67/71** versions (v11–13 NULL, v39 empty — recording gaps only; the objects are present). **No migration file was edited after hosted application.**

Also verified: `app_settings.demo_orders_allowed = false` (migration 67 flag exists; demo orders disabled on hosted). RLS enabled on all 40 tables. 109 public + 11 storage policies, 0 name drift, 0 real definition drift. Four tables have zero policies (`app_settings`, `auth_rate_limits`, `checkout_rate_limits`, `guest_recovery_tokens`) and are service-role-only by grant — see `SECURITY_AND_RLS.md` §4 for the posture question this raises.

### 2.4 What hosted verification did NOT cover

- Function-level EXECUTE ACLs and column-level grants were **not** diffed (follow-up for the security auditor).
- Exact time/method of the hosted 28–71 run: **Unknown** — `schema_migrations` records no timestamps. The owner should record how and when the run was done.
- Whether the degradation was written against pre-run hosted or a stale local DB: **Unknown** (inferred pre-run hosted or stale local — see §5).
- Contents of `codex/logistics-wip`: **Unverifiable** (local-only branch, not available here).

## 3. Migration 36 — payout proof (the most consequential migration)

Migration 36 adds 4 payout-proof columns to `settlements` plus a CHECK requiring proof on every paid row, and redefines `mark_settlement_paid` to a 5-argument form requiring `amount == sum of lines == stored total`. As originally written (pre-`a876e85`) it failed on pre-existing paid rows without proof — which is why C1 (reclassify paid→open, fabricate no proof) was selected by the owner.

**Current state of the file at HEAD:** commit `a876e85` ("wip(db): add legacy payout-proof backfill", +16 lines) inserted a backfill at lines 50–61 that fills proof for paid rows *before* the CHECK is added:

```sql
-- backfill (a876e85): paid rows lacking proof receive
-- paid_amount_minor = total_minor,
-- transfer_method = 'other',
-- transfer_reference = 'LEGACY-' || substr(id::text, 1, 8)
```

**Hosted proof the backfill executed:** the two paid settlements carry exactly this proof (see §4), and the applied statement for version 36 in `schema_migrations` matches the current file **including the backfill**. Therefore the 28–71 run happened on/after **2026-11-24 00:57:31 EET**. The docs that say "migration 36 fails as written" are now false of both the file and hosted. The backfill's semantics are sound as SQL; as an edit to an already-applied migration file it will never execute again on hosted — its only live effect is the record it already created.

## 4. The two paid settlements — verified live

| Settlement | Vendor | Amount (piastres) | Lines | Status | Proof on hosted |
|---|---|---|---|---|---|
| `2c589855-3f11-4708-a8c3-7738ffa25e80` | Nile Blossoms (demo) | 305,760 | 6 | paid 2026-11-11T16:00:00Z | `LEGACY-` reference, `paid_amount = total`, exact backfill proof note |
| `7cadf821-22a4-409f-9617-6bfae5124b6e` | Legacy Engraving (demo) | 479,500 | 5 | paid 2026-11-11T16:00:00Z | `LEGACY-` reference, `paid_amount = total`, exact backfill proof note |
| **Total** | | **785,260 (EGP 7,852.60)** | **11** | | `LEGACY-` count = 2; **0 paid settlements lack a reference** |

The other two settlements on hosted are open (269,250, Cairo Cocoa & Confections, 6 lines) and voided (76,200, Alexandria Toy Corner, 7 lines). **All four belong to demo vendors (`is_demo=true`).**

**C1 is dead on hosted.** C1's own pre-36 guard trips (`settlements_payout_proof_matches` exists, `transfer_reference` exists), so C1 would abort; the rollback is equally invalid. Only a new forward correction or a backup/PITR restore can change these two settlements now. **Do not run C1 or its rollback against hosted.** See `FINANCIAL_INTEGRITY.md` §5.

## 5. Migration 42 — courier schema, and the `dc5a59e` degradation

Migration 42 adds `courier_name`, `tracking_ref`, `handed_over_at` to `order_vendors`, a partial index, a 7-argument `set_order_vendor_status` (shipping requires courier 2–80 chars + tracking 3–80 chars, stamps `handed_over_at`), and redefines `get_guest_order`. **10+ code paths hard-require the courier columns with no fallback** — a missing column fails the whole query (PGRST204). That is why the workaround mattered, and why its premise mattered.

**Timeline (most likely, inferred from commit timestamps + hosted evidence):**

- 2026-11-20: migration 42 lands in the repo.
- 2026-11-22: STAGE_B probes observe hosted at migration 27 (28–66 objects absent).
- 2026-11-24 00:57:20 EET: `dc5a59e` preserves the degradation (authored against a database still at migration ≤27).
- 2026-11-24 00:57:31 EET (or later): the hosted 28–71 run executes — including migration 36 **with** the backfill — making the degradation obsolete minutes after it was preserved.

The degradation removes exactly the objects from migrations 28–71 (courier 42, payout proof 36, gift fields 47/48, inspection columns 52/58/61, reviews 54, refusals 64), and its PGRST205 notices name migrations 54/64 as "waiting to be applied". **All 15 degraded columns/tables it touches are verified present on hosted.**

**Correction to an earlier claim:** `dc5a59e` does **not** touch `admin/logistics/page.tsx` — its courier degradation is in `vendor/orders/page.tsx`. The Codex logistics workaround itself lives only on the local-only branch `codex/logistics-wip` and was never in this worktree. The degradation is **still live at HEAD** in `vendor/orders` (no courier references) and `admin/settlements` (proof fields hard-coded null); only `admin/logistics` was restored by fix 3a (`ec7d3bf`). It also bundles genuine new work — a new `src/app/vendor/reviews/page.tsx` (+282 lines) plus vendor nav entries — which must be extracted, not discarded, when the degradation is reverted.

## 6. Other migrations worth naming

| Migration | Subject | Note |
|---|---|---|
| 11 / 22 | Guest checkout / `_create_order` | Idempotency, price check, vendor-pause refusal; redefined in 22 |
| 25 | Settlement payout atomicity | FIN-001 concurrency test; mark-paid atomic under concurrency (PASS in this audit) |
| 28 | Order-status audit trail | Foundation for A-24; no admin UI to view it |
| 30 | Refunds | Forward-only by design (D-10, owner-approved 2026-11-22); no rollback file |
| 31 | Parent-status lock order | Fixes suborder→parent derivation under concurrency (H-01 PASS) |
| 35 | Returns completion | 7-day window (D-09) |
| 36 | Payout proof | See §3 — backfill executed on hosted |
| 38 | Product search trigram | `pg_trgm`, GIN indexes, `search_products()`; default threshold 0.3 (Postgres default, not set in file); no Arabic normalisation |
| 39 | Auth quota (`consume_auth_quota`) | The 2026-11-22 sign-in lockout hypothesis centred here; owner fixed the bug himself; sign-in worked on retry 2026-11-23 |
| 42 | Courier tracking | See §5 |
| 47 / 48 | Gift fields | Gift wrap/message/preferred date |
| 52 / 58 / 61 | Inspection condition + return-courier payer | Derived payer, not a financial charge (see B-06) |
| 54 | Product reviews | Vendor self-review barred (56); moderation once-only |
| 62 / 64 | Price-consent refusals | Audit trail + refusals table |
| 63 / 65 | Mail outbox | 5-attempt / 2-requeue caps |
| 67 | Demo order containment | `app_settings.demo_orders_allowed`; **must be applied before app code that reads `app_settings`** (verified in its header; app fail-opens if absent) |
| 68 | Ramadan slug fix | Occasion slug |
| 69 | Support replies | `replied_by` FK — caused F-02 PGRST201, fixed with FK-qualified embed |
| 70 | Window indexes | — |
| 71 | Cancelled-suborder refund approval | Makes approval explicit; RLS TEST 14f |

**Ordering hazard (verified in migration 67's header and across docs):** migration 67 must be applied BEFORE the app code that reads `app_settings` is deployed. The hosted 28–71 run satisfied this; any future staging/production sequence must preserve it. The deployment preflight (`scripts/check-deployment-preflight.mjs`) is manual and was failing on hosted before the run (migration 39 absent); it needs a re-run against current hosted state.

## 7. Rollback posture

- 55 rollback files exist; 16 migrations have none. Rollbacks 59/61/62/63/64/65 must never be applied outside a disposable DB (they reintroduce gaps by design — noted only in `docs/MUSE_PRODUCTION_BLOCKERS.md`, not in any rollback runbook).
- There is **no rollback runbook for 28–71**: no doc states which of 28–71 are safely reversible, in what order, or what the rollback decision point is. Given that 28–71 are now applied on hosted, this gap matters more than it did a week ago.
- Migration 30 has no rollback by design (D-10).

## 8. Verification SQL (read-only; for re-checking hosted state)

These are the queries the hosted verification used, in substance. They are SELECT-only and safe to run in the Supabase SQL editor. They pull no customer PII.

```sql
-- 1. Applied migrations (expect 71 rows, versions 1-71)
select version from supabase_migrations.schema_migrations order by version;

-- 2. Courier columns (expect 3 rows)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'order_vendors'
  and column_name in ('courier_name', 'tracking_ref', 'handed_over_at');

-- 3. Migration 42 RPC + index (expect 1 row each)
select proname, pg_get_function_identity_arguments(oid)
from pg_proc where proname = 'set_order_vendor_status';
select indexname from pg_indexes
where schemaname = 'public' and indexname = 'order_vendors_shipped_courier_idx';

-- 4. Settlement proof state (aggregates only; expect 2 LEGACY- paid rows)
select status, count(*), sum(total_minor),
       count(*) filter (where transfer_reference like 'LEGACY-%') as legacy_proof
from public.settlements group by status;

-- 5. Demo containment flag (expect false)
select key, value from public.app_settings where key = 'demo_orders_allowed';

-- 6. RLS enabled on all public tables (expect 0 rows)
select schemaname, tablename from pg_tables
where schemaname = 'public' and rowsecurity = false;
```

## 9. Follow-ups

1. **Revert the `dc5a59e` degradation** (vendor/orders, admin/settlements; re-check admin/orders and admin/refunds) and extract the vendor-reviews page + nav entries into their own change.
2. **Decide the forward correction** for the two LEGACY-proof settlements (new owner decision); record the hosted 28–71 run's time/method from the owner.
3. **Diff function-level EXECUTE ACLs and column-level grants** (not done in this audit).
4. **Confirm the posture of the 4 zero-policy tables** (`app_settings`, `auth_rate_limits`, `checkout_rate_limits`, `guest_recovery_tokens`).
5. **Write the rollback runbook for 28–71** and re-run the deployment preflight against current hosted state.
