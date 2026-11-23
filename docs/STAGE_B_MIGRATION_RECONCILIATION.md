# Stage B: Migration 28-66 Reconciliation

**Status:** Investigation complete. Nothing has been applied, committed, or pushed.
**Date:** 2026-11-22
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`
**Repository HEAD:** `2f18878f09bc2e2898265847f991c8f7fa09a52c`
**Production Supabase project:** `hqusykdyjpruysxezsrn.supabase.co`
**Scope:** Reconcile migrations 28-66 against read-only production evidence, prepare a staging rehearsal, and define the approval gates.

> **Decision: NOT APPROVED TO APPLY.** Migration 36 cannot apply to production as written because two paid settlements have no payout proof. The deployed application also appears to be ahead of the production database. Either condition is enough to stop a production migration until the remediation and deployment sequence are approved.

---

## 1. Executive Summary

1. **The production schema is consistent with migration 27.** All tested 28-66 tables, columns, and RPCs are absent; the legacy order RPCs from migrations 1-27 are present.
2. **No migration 28-66 was observed as applied.** All tested 28-66 objects are absent; the migration set is the one that creates the refund, order-audit, guest-expiry, price-consent, gift, review, mail, and financial-clawback surfaces the current application now uses.
3. **Migration 36 is a hard blocker.** It adds `settlements_payout_proof_matches`, but production has two paid settlements with no proof fields. The constraint fails on those rows. The failure was reproduced in a disposable PostgreSQL rehearsal.
4. **The deployed application appears newer than the database.** The public site serves wishlist and gift/price-consent UI from the post-migration-47 application, while the production project has no `wishlists`, `saved_addresses`, `price_consent_events`, or price-check RPCs. Exact deployed commit and server environment remain unverified, but this is a probable active schema drift, not only a future sequencing risk.
5. **Empty-database validation is not sufficient.** All 17 RLS suites pass on a clean PostgreSQL database after setting `PGCLIENTENCODING=UTF8`, but that run had no remaining paid settlements. Migration 36 succeeds on an empty database and fails only when production-like paid rows are present.
6. **No staging project, database password, Supabase CLI login, or Vercel access is available.** The production state was observed through read-only PostgREST/OpenAPI and row-count probes. No production writes were performed.
7. **Recommended path:** owner decision on legacy payout proof, staging clone restored from a production backup, migration rehearse, backup/PITR confirmation, maintenance window, then production apply. Do not cherry-pick migration 39 or any other migration outside the reviewed sequence.

---

## 2. Evidence and Limits

| Evidence | Classification | What it establishes |
| --- | --- | --- |
| Production PostgREST/OpenAPI probes against `hqusykdyjpruysxezsrn.supabase.co` | OBSERVED (read-only) | Table, column, and RPC presence; production is schema-consistent with migration 27. |
| Production row-count and settlement probes | OBSERVED (read-only) | 44 orders, 47 `order_vendors`, 36 guest orders, 6 vendors, 4 settlements, 26 commission entries, 2 paid settlements without proof. |
| Local disposable PostgreSQL container `gifto-rls-test` | OBSERVED (local) | All 66 migrations apply to an empty database; all 17 RLS suites pass. |
| Local staging rehearsal database `gifto_stage_rehearsal` | OBSERVED (local) | Migrations 1-35 apply; migration 36 fails on a paid settlement without proof. |
| Public production site, `/ar/wishlist` and `/checkout` | OBSERVED (public) | The deployed UI includes localized wishlist, gift-wrap, saved-address, and price-change-consent features. |
| Exact Vercel deployment commit and Vercel server environment | UNVERIFIED | No Vercel dashboard/CLI access. Public evidence strongly indicates a post-47 build, not the exact SHA. |
| `pg_policies`, Storage object RLS, Supabase Auth dashboard limits, backups/PITR | UNVERIFIED | No database password, Supabase CLI login, or dashboard access. |
| Migration dependency graph | INFERRED from SQL scan and manual review | Detailed statement inventory exists in `migration-statements.json`; top-level DML and column actions still need manual confirmation before approval. |

Limits that must remain explicit:

- The production probes used repository-local read-only credentials. No secret values are recorded here.
- The public application was not exercised through checkout, login, admin, or any state-changing action. The live `checkout` failure is inferred from current source and deployed UI, not from a test order.
- The local rehearsal database is not a production clone and is currently partially modified by migration 36. It must not be reused as a clean rehearsal baseline.
- The RLS suites reset their schema per suite and test empty data. They do not prove backfill behavior, proof constraints, or hosted RLS policy state.

---

## 3. Hosted State

### 3.1 Schema state

Production has the migration-27-era functions and lacks the 28-66 objects that were tested:

| Object | Production | Relevant migration |
| --- | --- | --- |
| `order_status_events` | absent | 28 |
| `set_order_vendor_status` | absent | 28/42/46 |
| `delivery_coverage_allows` | absent | 29/37 |
| `refund_cases` | absent | 30 |
| `commission_adjustments` | absent | 30 |
| `open_refund_case` / `open_guest_refund_case` | absent | 30/33 |
| `resolve_refund_case` | absent | 30/35/43/44 |
| `cancel_guest_order` | absent | 32/33 |
| `guest_recovery_tokens` | absent | 33 |
| `orders.guest_token_expires_at` | absent | 33 |
| `place_order_with_price_check` | absent | 34/47/62 |
| `place_guest_order_with_price_check` | absent | 34/47/62 |
| `search_products` | absent | 38 |
| `auth_rate_limits` / `consume_auth_quota` | absent | 39 |
| `order_address_corrections` | absent | 40 |
| `list_vendor_members` | absent | 41 |
| `commission_clawbacks` / `clawback_applications` | absent | 43 |
| `pending_commission_adjustments` | absent | 44 |
| `wishlists` / `saved_addresses` | absent | 47 |
| `product_reviews` | absent | 54 |
| `price_consent_events` | absent | 62 |
| `mail_outbox` | absent | 63 |
| `price_consent_refusals` | absent | 64 |

Production still has these migration-27-era RPCs: `create_settlement`, `mark_settlement_paid` (one argument), `get_guest_order`, `place_order`, `place_order_with_idempotency`, `place_guest_order`, `_create_order`, and `void_settlement`.

This is consistent with migration 27, but it is not a substitute for reading `supabase_migrations.schema_migrations` or comparing a full schema dump. Both remain required in staging and before production approval.

### 3.2 Production data relevant to the migration

| Data | Observed count/value |
| --- | --- |
| `orders` | 44 |
| `order_vendors` | 47 |
| Guest orders | 36 |
| Vendors | 6 |
| Settlements | 4 |
| Paid settlements | 2 |
| `commission_entries` | 26 |
| `order_vendors` rows with status timestamps | 41 |

The two paid settlements are:

| Settlement ID | `total_minor` | `paid_at` | Proof fields |
| --- | ---: | --- | --- |
| `2c589855-3f11-4708-a8c3-7738ffa25e80` | 305760 | 2026-11-11T16:00:00+00:00 | absent |
| `7cadf821-22a4-409f-9617-6bfae5124b6e` | 479500 | 2026-11-11T16:00:00+00:00 | absent |

Both rows were created on 2026-11-09 and marked paid on 2026-11-11. The current schema has no `paid_amount_minor`, `transfer_method`, `transfer_reference`, or `proof_note` columns.

### 3.3 Deployed application state

Public production evidence:

- `/ar/wishlist` returns an Arabic localized title. That is consistent with current HEAD `2f18878` ("localize wishlist and switch locale without refresh").
- `/checkout` includes the "Make it a gift", gift-wrap, saved-address, and price-change-consent copy that the current tree associates with migrations 34, 47, and later checkout/consent work.
- `/wishlist` and `/checkout` are live public routes.
- The checkout client chunk creates a server reference named `placeOrder`; the deployed action ID differs from the local build, so the deployed build is not byte-identical to the local build. Exact SHA is still unknown.

Current HEAD's checkout action calls `place_order_with_price_check` (`src/app/[locale]/(storefront)/checkout/actions.ts:398`) and `place_guest_order_with_price_check` (`:463`). The production project exposes neither RPC and has none of the 47/62 tables. If the Vercel server environment points at the same Supabase project as its public URL (the public CSP does), signed-in and guest checkout cannot complete until migrations 34, 47, and later consent migrations are applied.

This is classified as **INFERRED (high confidence)** because no live order was attempted. Verify the Vercel environment and current deployment commit before drawing the final conclusion. If the deployed app and database are indeed mismatched, this is an active production defect independent of the migration plan.

### 3.4 Storage and preflight

- `occasion-images` is public, limited to 5 MB, and accepts JPEG, PNG, and WebP.
- Two pre-existing objects are unreferenced. They must not be deleted as part of this work.
- `npm run preflight:deploy` fails because `auth_rate_limits` and `consume_auth_quota` are absent. That is expected until migration 39 is applied.
- Storage RLS and Supabase Auth dashboard limits remain unverified.
- Vercel platform request-body limits remain unverified; `serverActions.bodySizeLimit: "30mb"` in `next.config.ts` cannot raise a platform limit.

---

## 4. Migration Inventory and Dependency Map

### 4.1 Inventory

The table summarizes each migration. "Data" means a backfill or value rewrite that can fail or change production state. Dependency notes are sequencing requirements, not a complete SQL dependency proof.

| # | Migration | Creates/changes | Data/backfill | Dependencies and gates |
| ---: | --- | --- | --- | --- |
| 28 | `order_status_audit.sql` | `order_status_events`; audit trigger; 5-arg `set_order_vendor_status`; revokes direct status updates; indexes and RLS | Backfills status events from order timestamps, with actors recorded as `system` | Requires orders/order_vendors/vendors/profiles; establishes the status API used by 42/46 |
| 29 | `delivery_coverage.sql` | `delivery_coverage_allows`; coverage assertion trigger/function | None in the migration, but existing coverage values become enforceable | Requires vendors/orders; 37 normalizes values after 29 |
| 30 | `refunds.sql` | `refund_cases`, `commission_adjustments`, enums, refund/settlement RPCs | None observed; forward-only by design | **D-10 owner-approved irreversibility; no rollback file.** Parent of 35/36/43/44/45/52/53/66 |
| 31 | `fix_parent_status_lock_order.sql` | Replaces `sync_parent_order_status` and its trigger | None | Repairs parent-status locking; keep before later status migrations |
| 32 | `guest_order_cancellation.sql` | `cancel_guest_order` | None | Requires guest-order/token model from migration 11 |
| 33 | `guest_token_expiry.sql` | `orders.guest_token_expires_at`; `guest_recovery_tokens`; token/expiry/recovery/claim RPCs | Backfills 36 guest orders to `created_at + 7 days`; old links expire immediately | Requires 30/32; changes guest RPC grant model; requires customer communication |
| 34 | `price_change_consent.sql` | 13-arg and 11-arg `_create_order`; price-check checkout wrappers | None | Requires order core; parent of 47/51/57/59/62 |
| 35 | `returns_completion.sql` | Refund receipt/return/escalation RPCs; `refund_cases` columns | None | Requires 30; changes return and refund APIs |
| 36 | `payout_proof.sql` | Four `settlements` proof columns; `settlements_payout_proof_matches`; drops 1-arg `mark_settlement_paid`; adds 5-arg version | **No backfill. Production has two paid rows with null proof, so the constraint fails.** | **HARD BLOCKER**; requires 30 and an owner-approved legacy-proof decision |
| 37 | `coverage_normalisation.sql` | `normalize_governorate_name`; rewrites stored coverage values | Rewrites vendor coverage JSON; can change matching behavior | Requires 29; verify all six production vendors first |
| 38 | `product_search_trigram.sql` | `pg_trgm`; trigram index; `search_products` | None | Requires products/categories; extension availability must be verified in staging |
| 39 | `auth_rate_limits.sql` | `auth_rate_limits`; `consume_auth_quota` | None | Technically independent, but **do not cherry-pick**; apply in sequence to preserve migration history |
| 40 | `admin_address_correction.sql` | `order_address_corrections`; `correct_order_address` | None | Requires orders/order_vendors; coverage behavior depends on 29/37 |
| 41 | `vendor_staff_roster.sql` | `list_vendor_members` | None | Requires vendor membership tables |
| 42 | `courier_tracking.sql` | `order_vendors` courier/tracking columns; 7-arg `set_order_vendor_status`; updated `get_guest_order` | None | Requires 28/33; drops the 5-arg status signature |
| 43 | `paid_return_clawback.sql` | `commission_clawbacks`, `clawback_applications`; clawback-aware refund/settlement RPCs | None | Requires 30/35/36; financial migration |
| 44 | `pending_commission_adjustments.sql` | `pending_commission_adjustments`; commission-on-delivery trigger; redefines refund resolution | None | Requires 30/35; financial migration |
| 45 | `cancel_refund_case.sql` | Signed-in and guest cancellation RPCs | None | Requires 30/35; 66 later adds expiry to guest cancellation |
| 46 | `set_order_vendor_status_validation.sql` | 7-arg status RPC with in-RPC transition validation | None | Requires 28/42; supersedes earlier status validation |
| 47 | `gift_shopper.sql` | `wishlists`, `saved_addresses`; gift validation; 15-arg checkout wrappers; drops 11-arg wrappers | None | Requires 34; parent of 48/49 and gift checkout |
| 48 | `guest_order_gift_fields.sql` | Updated `get_guest_order` to expose gift fields | None | Requires 33/47 |
| 49 | `guest_order_item_product_ids.sql` | Updated `get_guest_order` to expose product IDs | None | Requires 48 |
| 50 | `void_settlement_restore_clawbacks.sql` | `void_settlement` restores clawbacks | None | Requires 30/36/43/44; financial migration |
| 51 | `retire_legacy_order_rpcs.sql` | Drops `place_order`, `place_order_with_idempotency`, `place_guest_order` | None | **Destructive API removal**; requires 34/47 and deployed-app verification |
| 52 | `d09_inspection_condition_courier_payer.sql` | Inspection-condition and courier-payer columns; receipt/restock RPCs | None | Requires 35; operational policy gate |
| 53 | `settlement_clawback_only.sql` | Clawback-only `create_settlement` | None | Requires 30/43/50; financial migration |
| 54 | `product_reviews.sql` | `product_reviews`; review summary/submit/moderate/verified-buyer RPCs | None | Requires orders/products |
| 55 | `r07_direct_repayment_open_settlement_guard.sql` | Guarded `record_clawback_direct_repayment` | None | Requires 43/53; financial migration |
| 56 | `vendor_self_review_bar.sql` | Bars vendor self-reviews in `submit_product_review` | None | Requires 54 |
| 57 | `drop_legacy_create_order_wrapper.sql` | Drops the 11-arg `_create_order` | None | **Destructive API removal**; requires 34/47 and deployed-app verification |
| 58 | `correct_inspection_condition.sql` | `correct_refund_inspection_condition` | None | Requires 35/52 |
| 59 | `null_expected_prices.sql` | 13-arg `_create_order` requires non-null expected prices | None | Requires 34; closes a price-consent bypass |
| 60 | `governorate_normalisation_replace.sql` | Replaces `normalize_governorate_name` with per-letter replacement | None | Requires 37; intended to work on UTF8/SQL_ASCII data |
| 61 | `require_explicit_inspection_condition.sql` | 3-arg `confirm_refund_receipt` requiring explicit condition | None | Requires 35/52/58 |
| 62 | `price_consent_audit_trail.sql` | `price_consent_events`; consent recorder; 15-arg checkout wrappers | None | Requires 34/47/59; changes checkout wrapper behavior |
| 63 | `mail_outbox.sql` | `mail_outbox` table and indexes | None | Operational mail retry surface; no SMTP dependency for schema |
| 64 | `price_consent_refusals.sql` | `price_consent_refusals`; refusal recorder | None | Requires 34/62 |
| 65 | `mail_outbox_requeue_cap.sql` | Requeue-count/first-error columns and cap | None | Requires 63 |
| 66 | `cancel_guest_refund_case_expiry.sql` | Token-expiry-aware guest refund cancellation | None | Requires 33/45 |

### 4.2 Primary dependency chains

```
28 -> 42 -> 46
30 -> 35 -> 36
30 -> 35 -> 43 -> 50 -> 53 -> 55
30 -> 35 -> 44
30 -> 35 -> 52 -> 58 -> 61
30 -> 35 -> 45 -> 66
33 -> 42/48/66
34 -> 47 -> 48/49
34 -> 51/57/59/62/64
37 -> 60
54 -> 56
63 -> 65
```

Migration 39 is independent of the others, but applying it alone would leave a non-contiguous migration history. Apply 28-66 in filename order after the 36 remediation is approved.

### 4.3 Special handling

- **Migration 30:** forward-only by owner decision D-10. Do not create or use a destructive rollback. Use a reviewed corrective forward migration if reversal is ever required.
- **Migration 33:** all 36 existing guest links will expire immediately after backfill because expiry is set from `created_at + 7 days`. This needs a customer-communication and support plan before production apply.
- **Migration 36:** requires an explicit legacy-paid settlement decision. See sections 5 and 8.
- **Migrations 51 and 57:** destructive API removals. Any still-running pre-migration app instance or open browser tab that calls the legacy RPCs will fail. Current HEAD uses the new checkout RPCs, but the deployed commit must be confirmed.
- **Migration 47/62:** checkout wrapper signatures change again (15 arguments with defaults). Current HEAD uses this shape; older app builds do not.
- **Migration 39:** do not cherry-pick. It is needed for the current app's rate-limit preflight, but it must travel with the reviewed sequence.

---

## 5. Production Compatibility and Sequencing

### 5.1 Current application dependencies

| Application surface | RPC/table dependency | Production state | Risk if migrations are partial |
| --- | --- | --- | --- |
| Signed-in checkout | `place_order_with_price_check` (34/47/62), `price_consent_events` (62), `price_consent_refusals` (64) | absent | Checkout cannot place orders |
| Guest checkout | `place_guest_order_with_price_check` (34/47/62), service-role guest path, outbox | absent | Guest checkout cannot place orders |
| Order status (vendor/admin) | `set_order_vendor_status` (28/42/46); direct update revoked by 28 | absent | Status actions fail; after 28, old direct-update clients break |
| Delivery coverage | `delivery_coverage_allows` (29/37) | absent | Checkout/vendor settings coverage checks fail |
| Refunds | `open_refund_case`, `open_guest_refund_case`, `resolve_refund_case`, `cancel_refund_case`, `confirm_refund_receipt` (30/35/45/52/58/61/66) | absent | Refund queues and customer refund actions fail |
| Settlements | 5-arg `mark_settlement_paid` (36/43), `create_settlement` (30/53), `void_settlement` (50), direct repayment (43/55) | 1-arg/legacy present only | Current admin payout action fails |
| Guest order links | `get_guest_order` (33/42/48/49), expiry/recovery RPCs | legacy `get_guest_order` only | 33 backfill expires all existing links |
| Search | `search_products` (38), trigram extension | absent | Search/catalog behavior differs |
| Wishlist/addresses | `wishlists`, `saved_addresses` (47) | absent | Deployed UI can render but account operations fail |
| Reviews | `product_reviews`, review RPCs (54/56) | absent | Product review UI/actions fail |
| Rate limits | `consume_auth_quota` (39); checkout uses a separate `consume_checkout_quota` path | absent | Preflight fails; current fail-closed auth handling may reject auth flows until 39 is applied |
| Mail retry | `mail_outbox` (63/65) | absent | No durable outbox yet; app mail send path differs |

### 5.2 Deploy order

The safe order is not "always database first" or "always app first" for this repository; the live state may already be mismatched.

1. Verify the Vercel production commit and server environment. If the deployed app is already post-47, the database is the lagging component and migrations are required to restore compatibility.
2. Freeze writes and take a verified backup/PITR snapshot before any migration.
3. Apply 28-35, then run the owner-approved pre-36 legacy-proof step (manual DDL/data SQL or a reviewed companion migration that adds the proof columns and backfills them), then apply 36-66. The proof columns do not exist before 36, so a backfill cannot be a plain `UPDATE` without an explicit pre-step. Do not split 51/57 away from the app verification.
4. Keep the current application deployed. Do not roll back to a pre-47 app after dropping legacy RPCs in 51/57.
5. Apply migrations inside a maintenance window. A partial sequence leaves checkout, refunds, or settlements unavailable because the current app expects the complete 28-66 surface.
6. After migration, run the application smoke matrix before reopening writes. If the deployment was actually older than expected, stop and reconcile the Vercel commit before applying 51/57.

### 5.3 Rollback reality

- Migration 30 has no rollback by design (D-10). A reversal requires a reviewed forward migration.
- Migration 36 has a rollback file, but rolling it back after production would drop proof columns and could destroy evidence. A backup/PITR restore or forward fix is preferable.
- Migrations 51/57 have rollback files that restore legacy functions, but restoring them would invalidate the current app's security posture. Do not use them as a casual rollback.
- Rollback files are not a substitute for a tested backup. A failed multi-migration apply should be treated as an incident, not as a reason to run every down file.

---

## 6. Staging Rehearsal Plan

### 6.1 Required staging project

Create a separate Supabase project with disposable data and its own keys. It must not share the production project reference. Prefer restoring a production backup into staging so the rehearsal sees the two paid settlements, 36 guest orders, six vendors, coverage values, and 41 status rows. If a full clone is not permitted, seed an equivalent synthetic dataset and record the difference.

### 6.2 Baseline and apply sequence

1. Restore or seed the migration-27 baseline.
2. Confirm the baseline has the legacy RPCs and no 28-66 objects.
3. Apply migrations 28-35.
4. Apply the owner-approved pre-36 legacy-proof remediation.
5. Apply 36. Verify `settlements_payout_proof_matches` exists and both legacy paid rows satisfy it.
6. Apply 37-66 in filename order.
7. Run `scripts/check-deployment-preflight.mjs`, all 17 RLS suites, the targeted Vitest set, and the app smoke flows.
8. On a throwaway database, verify that migration 36 still fails against the unremediated paid rows, then discard that database.

### 6.3 Local rehearsal already performed

- Created `gifto_stage_rehearsal` in the disposable container.
- Applied auth emulation, storage stub, and migrations 1-27.
- Inserted one legacy vendor and one paid settlement (`total_minor=305760`).
- Applied 28-35 successfully.
- Migration 36 failed with:

```
ERROR: check constraint "settlements_payout_proof_matches" of relation "settlements" is violated by some row
```

The local psql run was not transactional, so migration 36 had already added its columns before the constraint failed. Supabase CLI migrations are normally wrapped in a transaction; this does not remove the data blocker. Recreate the local database before any retry.

### 6.4 Windows/RLS command notes

- GitHub Bash: `C:\Program Files\Git\bin\bash.exe`
- psql: `C:\Program Files\PostgreSQL\18\bin\psql.exe`
- Set `PGCLIENTENCODING=UTF8` before running the suites.
- First run failed with `character with byte sequence 0x9d in encoding "WIN1252" has no equivalent in encoding "UTF8"`; with UTF8, all 17 suites passed.
- The local container is `gifto-rls-test` on `localhost:5433`, image `public.ecr.aws/supabase/postgres:17.11.0.003`; do not confuse it with staging or production.

---

## 7. Validation Gates

| Gate | Pass criterion | Owner |
| --- | --- | --- |
| Backup and PITR | A backup restore drill succeeds; recovery window and retention are recorded | Owner / ops |
| Staging exists | Separate project ref, staging keys, disposable data, and a recorded restore or seed method | Owner |
| 36 legacy proof | Both production paid settlements have an approved treatment that satisfies the new constraint without inventing false proof | Owner / finance |
| Staging apply | 28-66 apply with `ON_ERROR_STOP` semantics; no partial DDL remains | DB owner |
| Schema parity | All expected tables, columns, indexes, policies, triggers, and RPC signatures exist; legacy RPC drops are intentional | DB owner |
| RLS | All 17 suites pass; `pg_policies` and Storage RLS are inspected separately | Security / DB owner |
| Application tests | Targeted 18 files/241 tests pass; full 60 files/559 tests, typecheck, lint, build, and i18n remain green | App owner |
| Preflight | `npm run preflight:deploy` passes, including migration 39 and the bucket checks | App owner |
| Live smoke | Guest and signed-in checkout, vendor status, admin refund, admin settlement, guest link, wishlist, reviews, and search | QA |
| Financial invariants | Settlement totals, paid amounts, clawbacks, refunds, and commission entries reconcile to the baseline | Finance |
| Guest communication | All existing guest links affected by migration 33 are covered by a support/communication plan | Owner / support |
| Deployment identity | Vercel production commit and server environment are recorded; older clients are drained | App owner |

---

## 8. Risk Register

| Risk | Severity | Evidence | Mitigation / gate |
| --- | --- | --- | --- |
| Migration 36 fails on two paid settlements | Critical | Rehearsal reproduced exact constraint error; production rows lack proof | Owner-approved legacy remediation before 36; do not apply 36 as-is |
| Live app/database mismatch | Critical | Public site has post-47 wishlist/gift/consent UI; production lacks 47/34/62 objects and RPCs | Verify deployed commit/environment immediately; do not place a test order; plan restore-to-compatibility |
| No staging project | High | Repository and dashboard evidence show no separate staging project | Owner creates staging; restore/seed; rehearse before production |
| Legacy RPC removal breaks old clients | High | 51/57 drop checkout functions; 28 revokes direct status updates; 36 changes payout RPC | Verify deployed commit; drain old tabs/instances; maintenance window; test both signed-in and guest flows |
| Existing guest links all expire | High | 33 backfills 36 orders to `created_at + 7 days` | Customer communication, support script, and a decision on whether to extend expiry before apply |
| No verified backup/PITR | High | No dashboard/backup access; no restore drill in this session | Owner supplies backup proof and runs restore drill; do not proceed without it |
| Financial clawback/settlement changes | High | 43/44/50/53/55 alter money paths with no rollback for 30 | Finance review, staging reconciliation, forward-fix plan |
| Search extension unavailable | Medium | 38 requires `pg_trgm` | Verify extension in staging and production plan; migration fails otherwise |
| Mail outbox behavior | Medium | 63-65 add retry/requeue state; SMTP remains unconfigured | Run mail tests; document no-provider behavior; do not claim email delivery |
| Vercel body limit | Medium | App allows 5 MB image upload; platform limit unverified | Verify with Vercel plan/upload test; do not rely on server-action limit alone |
| Migration scan gaps | Medium | Automated scan may misclassify top-level DML and column actions | Manual review of 28, 33, 36, 37, 47, 51, 57, 62, 64 before approval |
| Unreferenced Storage objects | Low | Two objects have no database references | Leave them; do not delete during migration/rehearsal |

---

## 9. Owner Decisions Required

### 9.1 Proposed decision: migration 36 legacy paid settlements

This is not yet a decision in `docs/DECISIONS.md`. The owner must choose a treatment for the two paid rows:

1. **Explicit legacy backfill before 36.** Add the four proof columns in an owner-approved pre-step, then set each row's `paid_amount_minor` to its recorded `total_minor`, choose a truthful method such as `other`, use an explicitly marked legacy reference, and record that the original proof was not captured. The pre-step must be a documented manual DDL/data operation or a reviewed companion migration; a plain `UPDATE` cannot run before 36 because the columns do not exist yet. This preserves the constraint and the amount, but the reference must not masquerade as a bank reference.
2. **Legacy-proof exception in migration 36.** Add a narrowly scoped marker/constraint exception for rows paid before proof capture. This records the truth (proof unavailable) but weakens the invariant for those rows and requires an explicitly approved edit to migration 36 or a reviewed companion migration.
3. **Reject both and reopen/reclassify the rows.** This is financially misleading and should not be used.

Do not fabricate a bank reference. Finance/owner must approve the exact values, pre-step, and wording. The preferred option depends on whether any external proof exists for those two payments.

### 9.2 Other decisions

- Create and fund a separate staging Supabase project; provide restore/seed access.
- Confirm backup/PITR retention and run a restore drill.
- Confirm the Vercel production commit and server Supabase environment.
- Approve a maintenance window and customer communication for guest-link expiry.
- Approve the production migration sequence and the named two-person apply/verify team.

---

## 10. Approval Checklist

- [ ] Migration 36 legacy-paid treatment approved and recorded.
- [ ] Staging Supabase project created and isolated from production.
- [ ] Production backup restored into staging (or equivalent seed approved).
- [ ] Backup/PITR restore drill recorded.
- [ ] Vercel production commit and server environment verified.
- [ ] Migration dependency matrix manually reviewed for 28, 33, 36, 37, 47, 51, 57, 62, and 64.
- [ ] Staging migrations 28-66 apply successfully with a clean 36.
- [ ] `npm run preflight:deploy` passes in staging.
- [ ] All 17 RLS suites pass in staging; `pg_policies`/Storage RLS inspected.
- [ ] Targeted app tests and full app validation pass on the release commit.
- [ ] Guest-link expiry communication/support plan approved.
- [ ] Financial reconciliation and clawback/settlement tests signed off.
- [ ] Maintenance window and rollback/forward-fix owner named.
- [ ] Production apply is performed by two people, one applying and one verifying.
- [ ] Post-migration smoke matrix passes before writes are reopened.
- [ ] Incident log and evidence are attached to the release record.

---

## 11. Open Blockers

1. Migration 36 cannot apply to the current production data.
2. No separate staging project or hosted clone is available.
3. No production database password/Supabase CLI login for `pg_policies`, schema dumps, or migration history.
4. No Vercel dashboard/CLI access for the exact deployed commit and environment.
5. No verified backup/PITR restore drill in this session.
6. No direct confirmation of Storage RLS, Supabase Auth rate-limit configuration, or Vercel request-body limits.
7. The live app/database mismatch is inferred, not confirmed through a state-changing test; verify before production approval.

---

## 12. Artifacts

- `docs/DEPLOYMENT_PREFLIGHT_AND_STAGING_REHEARSAL.md` - Stage A preflight and staging framework.
- `docs/HOSTED_STATE.md` - prior hosted-state evidence and unresolved rows.
- `scripts/check-deployment-preflight.mjs` - migration 39 and Storage preflight gate.
- `scripts/run-rls-suites.sh` - disposable-Postgres RLS runner.
- `supabase/migrations/00000000000028_order_status_audit.sql` through `00000000000066_cancel_guest_refund_case_expiry.sql` - 39 migrations.
- `supabase/migrations/00000000000036_payout_proof.sql` - hard-blocker migration.
- `supabase/rollbacks/` - rollback inventory; migration 30 has none.
- `supabase/tests/*_test.sql` - 17 RLS/SQL suites.
- `C:\Users\bodyo\AppData\Local\Temp\opencode\migration-statements.json` - structured migration statement inventory.
- `C:\Users\bodyo\AppData\Local\Temp\opencode\migration-scan.json` - migration dependency/table/function summary.
- `C:\Users\bodyo\AppData\Local\Temp\opencode\probe_production.mjs`, `probe_rpc_state.mjs`, `probe_data.mjs`, `probe_paid_settlements.mjs` - read-only production probes.

---

**Bottom line:** Do not apply migrations 28-66 yet. First resolve migration 36 with the owner and finance, stand up an isolated staging clone, verify the deployed application against the production project, and prove backup/restore. The current production schema is at 27; the application and database may already be out of step.
