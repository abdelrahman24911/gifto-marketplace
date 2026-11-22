# Settlement payout atomicity

Migration `00000000000025_atomic_settlement_payout.sql` closes the remaining
database-level settlement payout integrity gap.

## Regression-test remediation

The original TEST 17 reused `comm_settlement3_id`, which TEST 14 voids before
TEST 17 runs. TEST 17 now creates independent open settlements and commission
entries: a vendor-B settlement with a deliberately mismatched line amount, and
a separate vendor-A settlement whose earned entry and line snapshot are both
changed to zero. The first payout is rejected by the financial consistency
check; the second succeeds and verifies `paid_at` and `paid_by`.

TEST 16 now voids its empty fixture after checking the empty-settlement guard,
so it cannot block the later vendor settlement fixture through the one-open
settlement rule.

TEST 18 verifies the existing foreign-key boundary for invalid commission
references. It does not fabricate orphaned settlement lines, because the
foreign key correctly prevents them.

## Invariant

`mark_settlement_paid` can mark an open settlement paid only when every
settlement line has a matching commission entry whose vendor, currency, status,
release state, and snapshotted commission amount are consistent with the
settlement. Empty settlements are rejected explicitly.

The function derives all data from the settlement ID. It does not accept or
trust client-provided totals, vendor IDs, gross values, or net values.

## Locking

Payout locks the settlement row first, then locks settlement-line and
commission-entry rows in ascending commission-entry ID order while validating
them. Return reversal locks its commission entry before checking active
settlement allocation. Settlement creation locks eligible commission entries in
the same deterministic order before copying their amounts into settlement lines.

This means a return and settlement creation/payout serialize on the commission
entry. A return that obtains the lock first can reverse before allocation; a
settlement operation that obtains it first creates or validates the active
allocation before the return check proceeds. The settlement row lock continues
to serialize payout and void operations.

The SQL regression suite cannot safely simulate two independent transactions in
the existing disposable-database test harness. A manual concurrency test must
run two sessions against a disposable database and interleave a return update
with `create_settlement` or `mark_settlement_paid`; the expected result is one
operation waiting on the commission-entry lock and then observing the committed
state.

## Validation status

**Two-session concurrency test: RUN AND PASSED — 2026-11-20 (P0-03,
FIN-001 closed for the tested definition).**

- Environment: disposable local PostgreSQL 16, database `gifto_conc_test`,
  migrations 1–30 applied, storage stub applied, `auth` schema emulated by
  `scripts/auth-emulation.sql`.
- Runner: `scripts/run-settlement-concurrency.mjs`; fixtures:
  `supabase/tests/concurrency_mark_settlement_paid.sql`.
- Result: two concurrent `mark_settlement_paid()` calls on the same
  settlement — exactly one succeeded, the other raised "This settlement is
  already paid." (23514). Final state: settlement paid once, `paid_at` /
  `paid_by` stamped, commission entry still `earned`.
- Sequential cases in the same run: mismatch (line +1) rejected, settlement
  stayed open; zero-value payout (entry + line zeroed after creation, the
  TEST 17 method) succeeded with audit fields stamped.
- Afterwards: `supabase/tests/rls_commissions_test.sql` — PASS.
- All 13 RLS suites were run separately (P0-02, 2026-11-20):
  **13 passed, 0 failed** on disposable local PostgreSQL 16.

The SQL regression suite itself still cannot simulate two independent
transactions in a single psql session — that is why the runner above spawns
two separate psql processes. Only the two-payouts scenario was executed;
payout vs return, payout vs creation, and creation vs return remain
code-inspection reasoning (see the final report, §6). No hosted database
was touched.

## Rollback

`supabase/rollbacks/00000000000025_atomic_settlement_payout_rollback.sql`
restores the migration-18 function bodies and grants. It does not alter
financial data. Rolling back intentionally removes the database-level
completeness and commission-entry locking protections.
