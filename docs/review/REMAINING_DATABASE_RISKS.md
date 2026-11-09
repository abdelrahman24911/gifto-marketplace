# Gifto — Remaining Database Risks

Date: 2026-11-09
Scope: Production Supabase project `hqusykdyjpruysxezsrn`, migrations 1–24 applied.
Status: documentation only. No migration, policy, function, data, or Production change was made by this audit.

## Summary

| ID | Risk | Severity | Current state | Fix owner |
|---|---|---|---|---|
| DB-01 | Support request rate limit is a non-atomic count-then-insert | Medium | Migration 23 applied; race possible | Future migration |
| DB-02 | Return/reversal can interleave with settlement creation | High | Migration 16/17/18 applied; race possible | Future migration |
| DB-03 | Manager-media policies conflict with owner-only vendor metadata writes | Medium | Migration 21 applied; app blocks managers | Policy decision + migration |
| DB-04 | No verified backup/PITR or restore test | High | Unknown plan capability | Owner / infrastructure |
| DB-05 | SQL/RLS suites have not been executed | High | Repository tests exist; not run | Engineering |
| DB-06 | Production app is behind the database | High (release) | DB at 1–24; app at `d64dae5` | Release owner |
| DB-07 | Public `vendor-media` bucket must never hold private files | Low | Public-read bucket with 0 objects at verification | Engineering policy |

## DB-01 — Support request rate-limit race

Evidence: `supabase/migrations/00000000000023_vendor_support_requests.sql`, function `enforce_support_request_rate_limit()`.

The trigger counts the caller’s requests in the last 15 minutes and raises when the count is at least five. Two concurrent inserts can both read four and both insert, producing six or more requests. The check is not serialized by a row lock, advisory lock, or unique constraint.

Impact: a vendor account can exceed the intended five-per-15-minutes limit. This is abuse control, not authorization; the RLS insert policy still requires an active vendor membership.

Recommended fix (future migration, not applied):

- Serialize per `created_by` with `pg_advisory_xact_lock(hashtextextended(new.created_by::text, 0))` before counting; or
- maintain a per-user window row with an atomic upsert and compare the returned count; or
- add a database-enforced rolling-window table with a unique constraint.

Verification: two concurrent inserts as the same authenticated user should produce at most five rows in the window.

## DB-02 — Returns vs. settlement creation race

Evidence:

- `supabase/migrations/00000000000006_commissions.sql`, `reverse_commission_on_return()` and `create_settlement()`.
- `supabase/migrations/00000000000016_settlement_integrity.sql`, replacement `create_settlement()`.

`reverse_commission_on_return()` checks whether the commission entry appears in `settlement_lines`, then updates the entry to `reversed`. `create_settlement()` selects earned entries that are not in `settlement_lines` and inserts settlement lines, without locking those commission rows.

Possible interleaving:

1. Return trigger sees no settlement line.
2. Settlement creation selects the same earned entry and inserts a settlement line.
3. Return trigger updates the entry to `reversed` and commits.
4. Settlement now contains a reversed commission line, or the return fails depending on commit order.

The exact outcome depends on isolation and commit order; either way the ledger and batch can disagree. The intended invariant is “a settled commission cannot be reversed automatically,” but the two functions do not share a lock.

Impact: financial reporting and payout batches may include commission that was reversed, or a return may be blocked after the fact. This is a money-integrity issue.

Recommended fix (future migration, not applied):

- In `create_settlement()`, select the candidate `commission_entries` rows `FOR UPDATE` (or lock the vendor’s ledger with an advisory lock) before inserting `settlement_lines`.
- In `reverse_commission_on_return()`, lock the commission entry `FOR UPDATE` before checking `settlement_lines`.
- Keep the existing “already in a settlement” exception as the user-facing outcome.
- Add a regression test that runs settlement creation and return concurrently.

Do not patch this by weakening the return check or deleting settlement lines.

## DB-03 — Manager-media policy mismatch

Evidence:

- `supabase/migrations/00000000000021_vendor_media.sql`: `vendor media: manager upload/update/delete` use `is_vendor_manager`.
- `supabase/migrations/00000000000015_active_vendor_hardening.sql`: `vendors: owner update own` is owner-only.
- `src/app/vendor/settings/actions.ts` and `page.tsx`: app allows only owner/platform admin to change branding.

A manager can call the Storage API directly and upload, update, or delete objects under `{vendor_id}/branding` or `{vendor_id}/cover`. The metadata update to `vendors.logo_path` / `cover_path` will fail under the owner-only UPDATE policy, so the normal app path is blocked. Direct Storage access can still:

- create orphaned objects (storage cost/noise);
- delete a current logo/cover object if the manager knows its path, causing a broken public image.

The app’s owner-only rule is intentional: allowing manager uploads while metadata writes are owner-only would create a partial-success workflow and orphaned objects. Do not add a service-role workaround.

Recommended decision:

- **Preferred:** align migration 21 policies to owner-only (`is_vendor_owner` / active owner) and keep the app owner-only.
- Alternative: intentionally support manager branding end-to-end, which requires a policy decision and a safe metadata-write path; do not simply broaden the `vendors` UPDATE policy without column-level controls.

## DB-04 — No verified backup/PITR or restore test

There is no evidence in the repository or task record that Production has managed backups, PITR, or a tested restore. Migrations 20 and 23 have data-destructive rollback scripts, so a rollback is not a substitute for a backup.

Required:

- Confirm the Supabase plan’s backup/PITR capability.
- Enable a backup/PITR option or take an owner-approved logical backup before further schema changes.
- Test restore into a disposable project/database.
- Record retention and restore time.

Do not run a Production restore or destructive SQL as part of this audit.

## DB-05 — SQL/RLS suites not executed

`supabase/tests/rls_vendor_dashboard_test.sql` is 718 lines and there are additional SQL/RLS suites under `supabase/tests/`. They were not run because this environment has no disposable database, `psql`, Docker daemon, or database password.

Implication: the policies in migrations 20–24 are verified by inspection and targeted PostgREST probes, not by the full suite. The following must be proven before onboarding real money:

- anonymous cannot read support requests, orders, commission entries, settlements, or base `vendors`;
- signed-in non-members cannot read another shop’s rows;
- vendor staff cannot write beyond their role;
- owner-only settings/branding and manager product/order permissions behave as intended;
- guest order tokens cannot access another order;
- settlement and commission reads are vendor-scoped.

Recommended procedure: start a disposable Supabase stack with Docker, apply migrations 1–24, run all SQL suites, then run the same suites against a staging project. Record results in the release checklist.

## DB-06 — Production app behind the database

Production Supabase is at migrations 20–24, but the Production app still runs the old deployment from `d64dae5`. Migration 20 removed customer reads from the base `vendors` table, so the old order-history pages lose shop names/links. The old app otherwise tolerates the append-only public view changes.

This is a release-ordering risk, not a schema defect. Deploy the reviewed code only after the release gates; do not apply further migrations to “fix” the old app.

## DB-07 — Public vendor media bucket

`vendor-media` is intentionally public-read for storefront logos and covers. The bucket must contain only public branding images. Do not use it for invoices, identity documents, private chat attachments, or other sensitive files. `next.config.ts` only allows Next image optimization from `/storage/v1/object/public/**`; adding private media would require a separate private bucket and signed URLs.

## Verified as safe in the current migrations

- Checkout pause check is transactionally ordered: product rows are locked first, then vendor rows in id order, before reading `is_accepting_orders`.
- Checkout quota increments atomically through the `checkout_rate_limits` upsert.
- Commission rows are one-per-suborder via the unique `order_vendor_id` constraint and delivery trigger `on conflict do nothing`.
- One open settlement per vendor is backed by a partial unique index.
- Paid settlements cannot be voided; voided settlements preserve their rows/lines for audit.
- Anonymous support reads are denied; support inserts require active vendor membership and `created_by = auth.uid()`.
- `public_vendors` exposes only active shops and the approved public columns; `address_line` is absent.

## Change control

Any fix for DB-01, DB-02, or DB-03 requires:

1. a new migration with an explicit rollback or documented irreversibility;
2. a backup/PITR decision;
3. the full SQL/RLS suite on a disposable database;
4. a staging verification;
5. an owner-approved release window.
