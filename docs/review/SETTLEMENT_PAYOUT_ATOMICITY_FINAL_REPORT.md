# Settlement Payout Atomicity Final Report

## 1. Final verdict

**FAIL — blocking issues remain.**

The deterministic TEST 17 defect was corrected locally, and application-level
validation passes. Migration 25 and its rollback were reviewed against the
actual migration history. However, the disposable PostgreSQL/Supabase
validation and two-session concurrency tests could not run because Docker
Desktop is unavailable. The Supabase CLI is linked to the hosted project, so
no database command was run.

This is a local development result only. It is not production approval and no
deployment is authorized by this report.

## 2. Changes made

- `supabase/tests/rls_commissions_test.sql`
  - Replaced TEST 17's reuse of the voided `comm_settlement3_id`.
  - Added independent vendor-B mismatch fixtures and vendor-A zero-value
    fixtures.
  - Added audit-field assertions for the successful zero-value payout.
  - Voids the TEST 16 empty fixture after its assertions so it cannot block
    later settlement creation.
  - Clarified TEST 18 as a foreign-key boundary test.
- `docs/settlement-payout-atomicity.md`
  - Documented the TEST 17 correction, TEST 18 boundary, and validation status.
- `docs/review/SETTLEMENT_PAYOUT_ATOMICITY_FINAL_REPORT.md`
  - Added this evidence-based readiness report.

Migration 25 and its rollback were not modified:

- `supabase/migrations/00000000000025_atomic_settlement_payout.sql`
- `supabase/rollbacks/00000000000025_atomic_settlement_payout_rollback.sql`

## 3. TEST 17 correction

The original TEST 17 reused `comm_settlement3_id`, which TEST 14 had already
voided. Consequently, payout was rejected by the lifecycle guard before the
financial mismatch and zero-value paths were exercised.

The corrected test:

1. Creates a new order for vendor B.
2. Delivers it through the existing order-status transitions.
3. Creates a fresh open settlement.
4. Changes only the settlement-line amount to create a valid-reference,
   matching-vendor, matching-currency, earned-entry mismatch.
5. Verifies payout rejection.
6. Creates a separate vendor-A order and settlement.
7. Changes both the commission-entry base/amount and settlement-line snapshot
   to zero.
8. Verifies successful payout plus `paid_at` and `paid_by`.

TEST 16 now voids its empty settlement fixture after checking the empty
settlement rejection. This preserves the lifecycle assertion while preventing
the one-open-settlement rule from contaminating TEST 17.

## 4. TEST 18

TEST 18 now states accurately that it verifies rejection of an invalid
commission-entry reference by the existing foreign key. It does not attempt to
disable constraints or fabricate impossible orphaned settlement lines.

## 5. Migration 25 security review

Reviewed migration 25 against migrations 6 and 16-24.

### `mark_settlement_paid(uuid)`

- Signature and `void` return type are unchanged.
- Remains `SECURITY DEFINER` with `search_path = public`.
- Checks `is_platform_admin()` before settlement reads.
- Locks the settlement row.
- Rejects missing, voided, paid, and empty settlements.
- Locks settlement lines and commission entries in ascending commission-entry
  ID order.
- Requires matching vendor and currency.
- Requires commission status `earned`.
- Rejects released lines and release metadata.
- Requires exact minor-unit amount equality.
- Assigns `paid_at` and `paid_by`.
- Revokes execution from `public` and `anon`; grants execution to
  `authenticated`.

### `create_settlement(uuid, text)`

- Preserves authorization, signature, `SECURITY DEFINER`, and search path.
- Preserves note and vendor validation.
- Uses the one-open-settlement uniqueness backstop.
- Locks eligible commission entries in deterministic ID order.
- Snapshots database-held commission amounts.
- Rejects empty settlements.
- Preserves `created_by` and existing grants.

### `reverse_commission_on_return()`

- Preserves trigger signature, `SECURITY DEFINER`, and search path.
- Is not directly executable by client roles.
- Locks the commission entry before checking active allocation.
- Rejects reversal while an active allocation exists.
- Reverses only entries still marked `earned`.

The existing application-level guard remains in
`src/app/admin/settlements/actions.ts` as defense in depth.

## 6. Concurrency

### Code-inspection reasoning

| Scenario | Lock order | Result |
|---|---|---|
| Payout vs return | Settlement, then line/commission rows; return locks commission row | Operations serialize on the commission row; return observes committed allocation state |
| Payout vs creation | Payout settlement then commission rows; creation commission rows after settlement insert | Existing open-settlement uniqueness prevents duplicate active vendor batches |
| Payout vs void | Both lock the settlement row first | One lifecycle operation waits and then observes the committed state |
| Creation vs return | Both lock commission entries; creation orders by entry ID | One wins the row lock; the other observes the committed earned/allocated state |
| Two creations | Unique partial index plus friendly unique-violation handling | Exactly one active open settlement per vendor |
| Two payouts | Settlement `FOR UPDATE` | One succeeds; the other observes `paid` and fails |
| Return during release | Return locks commission entry; void locks settlement then releases lines | Return sees active allocation before release or proceeds after committed release |
| Return during payout | Payout locks settlement then commission entry; return waits on commission entry | Return cannot reverse an entry accepted by payout |

### Actual two-session execution

**NOT RUN.** Docker Desktop was unavailable:

`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`

No hosted or remote database was used.

## 7. SQL/RLS results

### Intended command

The repository does not define an npm SQL runner. The existing suite is
`supabase/tests/rls_*.sql` and requires a disposable PostgreSQL/Supabase
database, `psql`, and the safety GUC
`gifto.rls_test_disposable = 'yes'`.

### Actual result

- Database target: **none; SQL execution was not run**.
- Local Supabase CLI: available, version 2.120.0.
- Docker: installed but Docker Desktop daemon unavailable.
- `psql`: unavailable.
- Hosted project link: detected by `supabase status`; no remote command was run.
- Migration count: statically verified at 25 files.
- SQL test count: not executed.
- Full RLS suite: **NOT RUN**.
- Transaction rollback behavior: reviewed in the SQL source, not executed.

## 8. Rollback results

Rollback was not executed because no disposable database was available.

Static review confirms that
`supabase/rollbacks/00000000000025_atomic_settlement_payout_rollback.sql`
restores the migration-18 definitions and grants for the three replaced
functions without mutating settlement or commission data.

Rollback deliberately removes migration 25's database-level completeness and
commission-entry locking protections.

## 9. Application validation

The following local commands were run without database access:

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- Targeted settlement tests — passed, 2 files / 20 tests.
- `npm test` — passed, 19 files / 160 tests.
- `git diff --check` — passed; existing LF/CRLF normalization warnings only.

The application guard remains in place and was not weakened. Existing
settlement total, payout, account-order, guest-order, and lifecycle coverage
remains present.

`npm run build` was not rerun in this remediation pass; the prior local build
had passed before the SQL-test-only changes.

## 10. Remaining risks

### Medium

- Migration 25 has not been executed against disposable PostgreSQL/Supabase.
- No two-session concurrency test has been executed.
- Rollback has not been executed and compared in an isolated database.

### Low

- The SQL suite cannot test physically orphaned settlement lines because the
  foreign key correctly prevents them; TEST 18 verifies the boundary instead.
- The migration does not explicitly compare `settlements.total_minor` with the
  sum of settlement-line amounts. Existing write permissions and settlement
  creation logic preserve that value, but this assertion remains a possible
  future defense-in-depth enhancement.

## 11. Production readiness

Migration 25 is **not ready for production review yet** because the required
disposable-database validation is blocked.

Before production review:

1. Start a demonstrably local Supabase/PostgreSQL environment.
2. Apply migrations 1-25 locally.
3. Run all SQL/RLS tests, including corrected TEST 17 and TEST 18.
4. Run the four two-session concurrency scenarios.
5. Apply and compare the rollback only in a separate disposable database.
6. Re-run the application validation, including `npm run build`.
7. Review the final diff and migration output.

## 12. Safety confirmation

- No hosted Supabase changes occurred.
- No production SQL executed.
- No migration was applied.
- No deployment occurred.
- No commit, push, merge, or staging occurred.
- No reset, stash, clean, checkout, deletion, or destructive Git operation
  occurred.
- All pre-existing modified and untracked work was preserved.
