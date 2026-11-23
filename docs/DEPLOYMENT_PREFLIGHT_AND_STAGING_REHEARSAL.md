# Deployment Preflight and Migrations 28-66 Staging Rehearsal

**Status:** design and local tooling prepared 2026-11-22. No hosted schema, Storage policy, deployment, or data was changed.

## Why this exists

The occasion image upload fails before any upload starts because the hosted Supabase project is at migration 27 while the app expects migration 39 (`public.auth_rate_limits` and `public.consume_auth_quota`). The quota check fails closed, so the form shows a misleading rate-limit message. The app-side error handling is now explicit, but the feature remains blocked until the database is provisioned.

The deployment preflight is a read-only gate. It does not apply migrations, write rows, consume quota, or change Storage.

## Preflight usage

```powershell
npm run preflight:deploy
```

The script loads `.env.local` and `.env` if present, with the process environment taking precedence. It needs:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

It prints the Supabase host but never prints the service key. Optional `--json` output is available for CI.

The script performs these checks:

| Check | Method | Blocks deploy |
|---|---|---|
| Supabase URL and service key present | Environment validation | Yes |
| `public.auth_rate_limits` exists and is readable | `GET /rest/v1/auth_rate_limits?select=bucket&limit=1` | Yes |
| `public.consume_auth_quota` exists | PostgREST OpenAPI schema path probe; no RPC call | Yes |
| `public.occasions` exists | `GET /rest/v1/occasions?select=id&limit=1` | Yes |
| `occasion-images` bucket exists and is public | Storage bucket metadata | Yes |
| Bucket file limit covers the app's 5 MB limit | Storage bucket metadata | Yes when a smaller explicit limit exists |
| Bucket allows JPEG, PNG and WebP | Storage bucket metadata | Yes when an explicit allow-list omits a required type |
| Storage object RLS policies | Not exposed by the Storage API | Manual SQL check required |

The script cannot read `pg_policies`. Before any production deploy, run this read-only query with the owner's database access and confirm the four occasion-image policies exist with the expected commands:

```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'occasion images:%'
order by policyname;
```

Expected: public read, admin insert, admin update, admin delete. The upload/update/delete policies must enforce the one-segment UUID folder and the existing-occasion check from migration 26.

### Current observed result

Read-only preflight against `hqusykdyjpruysxezsrn.supabase.co` on 2026-11-22:

- PASS: environment, `public.occasions`, `occasion-images` public bucket, 5 MB limit, JPEG/PNG/WebP.
- FAIL: `public.auth_rate_limits` is absent (`PGRST205`).
- FAIL: `public.consume_auth_quota` is absent from the PostgREST schema.
- WARN: Storage object RLS cannot be proven through the API.

Expected exit code: `1`. This is the correct gate result, not a script failure.

## Deployment rule

Do not deploy the app as a fix for this issue. The database must be provisioned first, and the preflight must pass against the target environment:

1. Staging preflight passes.
2. Staging smoke tests pass.
3. Backup/PITR is confirmed for production.
4. Production preflight passes.
5. Database migration is applied.
6. App is deployed.
7. Admin create/edit/remove image is verified with a real image.

Migration 39 is technically independent of 28-38, but applying only 39 to production would create migration-history drift. Do not cherry-pick it outside the reviewed 28-66 sequence.

## Migrations 28-66 risk table

All paths below are under `supabase/migrations/`. Rollbacks are under `supabase/rollbacks/`. Migration 30 has no rollback by owner decision; all other migrations in this range have a rollback file.

| Migration | Main change | Rehearsal risk / verification | Rollback |
|---|---|---|---|
| 28 order status audit | Status event table, audit trigger, controlled transition RPC, direct-write revokes | Old app may still write statuses directly. Run the current production app against migrated staging before cutover. Verify every legal edge and audit rows. | Yes |
| 29 delivery coverage | BEFORE INSERT trigger on `order_vendors` | False rejection at checkout if coverage data/matching is wrong. Test empty coverage, governorate match, area match, out-of-area, direct RPC insert. | Yes |
| 30 refunds | Refund cases, commission-adjustment ledger, refund RPCs, net settlement | Highest financial risk. Forward-only. Exercise open, approve, resolve, cancel, settlement netting, permissions, and concurrent settlement holds. | No, by design |
| 31 parent status lock | Replaces `sync_parent_order_status()` lock order | Concurrency regression risk. Run `scripts/run-parent-status-concurrency.mjs` and the parent-status SQL test. | Yes |
| 32 guest cancellation | `cancel_guest_order` token-gated RPC | Verify token-hash ownership, placed-only rule, no information leak, signed-in path unchanged. | Yes |
| 33 guest token expiry | Guest expiry column/backfill, recovery tokens, RPC redefinitions | Existing guest orders become inaccessible after the backfilled 7-day window. Verify expiry, recovery, single-use rotation, and cookie behavior. | Yes |
| 34 price consent | `_create_order` expected-price checks and new wrappers | Checkout breakage or stale client mismatch. Test exact price, changed price, missing expected prices, signed-in and guest paths. | Yes |
| 35 returns completion | Refund/return RPC redefinitions, 7-day window, inspection/restock rules | Financial and order-state changes. Test delivered vs shipped, 7-day boundary, vendor inspection, restock, and settlement hold. | Yes |
| 36 payout proof | Settlement proof columns, 5-argument `mark_settlement_paid` | Payout flow signature change. Test proof-required, amount equality, already-paid rejection, zero-net exception. | Yes |
| 37 coverage normalization | Updates stored governorates in place; replaces matching function | Data mutation during migration. Back up first. Verify Arabic/English variants, wildcard escaping, and no false allows. | Yes |
| 38 product search trigram | `pg_trgm`, GIN indexes, `search_products` RPC | Extension availability and index build lock time. Verify search ranking, description matches, and escaped wildcards. | Yes |
| 39 auth rate limits | `auth_rate_limits`, service-role-only RPC | Current production blocker. Load test quota exhaustion and schema-cache reload. Do not apply alone. | Yes |
| 40 admin address correction | Address correction table and admin RPC | Verify audit actor, before/after values, admin-only access, and order detail rendering. | Yes |
| 41 vendor staff roster | Roster read RPC | Verify owner/manager/staff visibility and no profile leakage. Invite mail remains a separate SMTP blocker. | Yes |
| 42 courier tracking | Courier/tracking columns and 7-argument status RPC | New required fields on shipped transitions. Test vendor, admin, stale page, missing tracking, and old callers. | Yes |
| 43 paid return clawback | Clawback table, netting, direct repayment | High financial risk. Test paid-then-returned, next settlement netting, partial repayment, and void behavior. | Yes |
| 44 pending commission adjustments | Pending adjustment table and delivery conversion | High financial risk. Test shipped refund before delivery, partial refunds, cancel/return voiding, and settlement exclusion. | Yes |
| 45 cancel refund case | Cancel RPCs and resolution CHECK redefinition | Verify opener-only cancel, guest token, reserved slot release, and resolved-case rejection. | Yes |
| 46 status transition validation | In-RPC transition edge validation | Verify every legal and illegal edge, exact trigger message, and no audit row on rejection. | Yes |
| 47 gift shopper | Wishlist, saved addresses, gift fields, checkout wrapper changes | Checkout compatibility and saved-address ownership. Test guest/signed-in gift fields and reorder. | Yes |
| 48 guest gift fields | Replaces `get_guest_order` JSON shape | Low risk. Verify gift fields, token expiry, and grants unchanged. | Yes |
| 49 guest item product IDs | Replaces `get_guest_order` item shape | Low risk. Verify product IDs and reorder from guest order. | Yes |
| 50 void settlement restore clawbacks | Replaces `void_settlement` | High financial risk. Test void restores consumed clawbacks exactly once and preserves historical totals. | Yes |
| 51 retire legacy order RPCs | Drops `place_order`, `place_order_with_idempotency`, `place_guest_order` | Any old caller breaks. Confirm production app/version uses only price-check RPCs before applying. | Yes |
| 52 inspection condition | Inspection columns, CHECK, backfill, restock guard | Financial courier-payer change. Test good/wrong/damaged, backfill, damaged restock refusal, and settlement display. | Yes |
| 53 clawback-only settlement | `create_settlement` distinguishes clawback-only vendor | Test outstanding clawback with no commission, empty vendor, partial clawback, and direct-repayment path. | Yes (`00000000000053_settlement_clawback_only.rollback.sql`) |
| 54 product reviews | Review table, verified-buyer submit, moderation RPCs, UI | Test one-per-user, pending visibility, admin approval, anonymous reads, and vendor visibility. | Yes (`00000000000054_product_reviews.rollback.sql`) |
| 55 direct repayment guard | Replaces `record_clawback_direct_repayment` | High financial risk. Test clawback already applied to an open settlement, paid/void races, and partial remainder. | Yes |
| 56 vendor self-review bar | Replaces `submit_product_review` | Verify vendor members cannot review their own shop after a delivered purchase; normal buyers still can. | Yes |
| 57 drop legacy create-order wrapper | Drops the 11-argument `_create_order` wrapper | Confirm no caller remains. Test both price-check wrappers and gift wrappers. | Yes |
| 58 inspection correction | Corrected inspection RPC and audit | Test condition correction, courier-payer re-derivation, and restock guard after correction. | Yes |
| 59 null expected prices | Rejects null expected prices/totals in `_create_order` | High checkout risk. Test direct RPC with nulls, malformed data, and normal checkout. | Yes |
| 60 governorate normalization | Replaces normalization using `replace()` instead of `translate()` | SQL_ASCII and UTF-8 behavior. Test Arabic variants in both encodings. | Yes (`00000000000060_governorate_translate_rollback.sql`) |
| 61 explicit inspection condition | Removes silent `good` defaults in RPC and UI | Test missing/invalid condition rejects, explicit condition succeeds, and vendor form requires a choice. | Yes |
| 62 price consent audit | Consent table and wrapper writes | Test one row per order, guest/signed-in actor, expected vs charged totals, and admin detail. | Yes |
| 63 mail outbox | Outbox table, admin retry, mail module enqueue | Test skipped send, failed send, SMTP absent, retry, and no secret/message leakage. | Yes |
| 64 price consent refusals | Refusal table and separate-transaction recording | Test PRICE_CHANGED, idempotency key uniqueness, retried recording, and no PII leakage. | Yes |
| 65 mail outbox requeue cap | Requeue count and first-error preservation | Test cap at two requeues, original error retained, and terminal failure stays failed. | Yes |
| 66 guest refund cancel expiry | Replaces `cancel_guest_refund_case` with expiry check | Test expired vs valid guest token, signed-in cancel, and resolved-case rejection. | Yes |

## Staging rehearsal plan

### Phase 0: freeze and baseline

1. Record production migration state read-only (`supabase migration list`) and take a backup or confirm PITR before any production step.
2. Confirm the current production app commit and whether it still uses direct status updates or legacy order RPCs. This determines whether the database can be migrated before the app is deployed.
3. Run local gates from a clean install: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
4. Run the disposable database lane: `scripts/run-rls-suites.sh` with all migrations, `storage_stub.sql`, and the 17 SQL suites. This must be green before touching a hosted staging project.

### Phase 1: create a real staging target

1. Owner creates a separate Supabase staging project and staging Vercel environment. It must not share the production project ref, database, bucket, SMTP recipients, or secrets.
2. Set staging env names, not values, in the staging environment: Supabase URL/anon/service key, site URL, and SMTP values if mail testing is enabled.
3. Confirm no staging process can send real customer email. Use a sink or disabled SMTP except for explicit mail tests.

### Phase 2: rehearse the migration chain

1. Start staging at migration 27 (fresh apply 1-27, or a non-production clone if available).
2. Apply 28-66 in order through the same mechanism intended for production. Record each filename, start/end time, warnings, and errors.
3. Do not skip 30 or 39. Do not apply 39 alone. Do not edit applied migration files.
4. Capture migration timings, lock waits, table/index sizes, and any notices. Flag migrations over the acceptable maintenance window.
5. Run schema assertions: expected tables, functions, triggers, constraints, indexes, grants, RLS enabled, and storage bucket configuration.
6. Check data backfills: guest token expiry, governorate normalization, inspection-condition backfill, and any default changes.

### Phase 3: application smoke on staging

Run the current production app build against the migrated staging schema first, then the new app build. This detects backward-incompatible database changes before production.

Minimum smoke matrix:

- admin login, occasion create without image, create with image, edit image, remove image, delete occasion;
- rate-limit exhaustion and a simulated missing-migration/configuration error, with no upload or database mutation;
- signup/login/reset and guest order recovery with the new quota table;
- checkout exact price, changed price, null expected prices, signed-in and guest;
- vendor status transitions, courier/tracking fields, admin status override;
- refund open/approve/cancel, return inspection, clawback, settlement netting, payout proof, void;
- reviews submit/moderate and vendor self-review rejection;
- mail outbox skip/fail/retry/requeue cap, with no real recipients;
- product search, coverage variants, wishlist, saved addresses, reorder.

For the occasion image path specifically, verify the new form preserves the selected file after a failed submit and shows the real configuration error rather than the rate-limit message.

### Phase 4: rollback rehearsal

1. Rehearse rollback only on disposable Postgres or staging, never production.
2. Apply rollbacks in reverse order and re-run the relevant smoke tests.
3. Migration 30 cannot be rolled back. A staging rollback plan that crosses 30 must stop before it and use a reviewed forward fix or restore from backup.
4. Record which rollback files have nonstandard names (53, 54, 60) so automation does not silently miss them.

### Phase 5: production gate

1. Staging preflight must pass, including the manual Storage RLS query.
2. Production backup/PITR must be confirmed.
3. Production preflight must pass before the app deploy.
4. Use two-person review for the migration plan and the exact ordered file list.
5. Apply the database migration, then deploy the app, then verify admin occasion image create/edit/remove with a real image.
6. Keep the preflight failing closed if migration 39 or the bucket is missing; do not add fail-open behavior for admin or vendor mutations.

## Open blockers

- Hosted migration 39 is absent, so production preflight correctly fails.
- No staging Supabase project exists yet.
- Storage object RLS policies cannot be verified with the current hosted access; owner must run the read-only SQL check.
- Vercel deployment commit and environment are unverified.
- SMTP, monitoring, and backup/PITR remain separate launch blockers recorded in `docs/HOSTED_STATE.md`.
- The Vercel request-body limit may be lower than the app's 5 MB image limit; confirm with a real 4-5 MB upload on staging.
