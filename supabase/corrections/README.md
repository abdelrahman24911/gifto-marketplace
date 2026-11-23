# Manual financial corrections (not migrations)

Files in this directory are **standalone scripts run manually by an
operator** against a specific database state. They are NOT numbered
migrations and must NEVER be added to `supabase/migrations/` — the
migration runner applies that directory in order, and a correction
that must run *between* two migrations (here: before 36, after 28–35
or 1–27) cannot live in the chain.

## C1 — synthetic paid settlements (2026-11-23)

- `20261123_c1_synthetic_settlement_correction.sql` — sets the two
  owner-confirmed synthetic paid settlements back to `open`, clears
  `paid_at` / `paid_by`, preserves everything else, fabricates no
  proof. Run once, before migration 36. Idempotent (skip when targets
  absent, no-op when already open, abort when inconsistent).
- `20261123_c1_rollback_pre36_only.sql` — emergency reversal only,
  pre-36 only. Recreates the unsupported paid state; needs a new owner
  decision. Invalid after migration 36.

### Run order for a fresh deploy

1. Apply migrations 1–35 (or 1–27 — C1 guards the migration-30
   tables, so it works at either state).
2. Rehearse first: `scripts/rehearse-c1.sh` (disposable database only).
3. Capture the pre-update snapshot (the script's snapshot SELECT) to
   an access-controlled ops location, checksummed, with operator /
   approver / timestamp / database project ref / SQL revision logged.
4. Run the C1 script against the target database.
5. Apply migrations 36–67, then `db push` / deploy.

### Gates (owner decisions, not code)

- D-11: no-transfer premise + approval to run the correction.
- Verified backup / PITR restore path before running.
- Staging rehearsal passed (see `scripts/rehearse-c1.sh` output).

### Never

- Never run C1 against production without D-11 and a backup.
- Never fabricate payout proof (a transfer reference, amount, or
  method) for these rows — after 36 they can only be paid again with
  real proof for a real transfer.
- Never add a demo exception to migration 36.
- Never run the rollback after migration 36.
