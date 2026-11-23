# Migration 36 Financial Reconciliation: Two Paid Demo Settlements

**Status:** Read-only investigation complete. **Not approved to apply.**
**Date:** 2026-11-23
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`
**Repository HEAD:** `2f18878f09bc2e2898265847f991c8f7fa09a52c`
**Production Supabase project:** `hqusykdyjpruysxezsrn.supabase.co`
**Scope:** Resolve why migration 36 fails on production, establish the provenance and financial meaning of the two blocking paid settlements, and present the owner/finance decision required before any remediation.

> **Executive finding: both blocking paid settlements are synthetic demo fixtures, not real commission payouts.** They were created by the unmerged `demo/catalogue-seed` branch (`473fa27`) using `DEMO-SEED:` notes, legacy one-argument `mark_settlement_paid`, and direct backdated timestamps. There is no evidence that any money moved. The recommended correction is to preserve the ledger and reclassify the two fixtures from `paid` to `open` after an evidence snapshot, then apply migration 36. This report does not authorize that correction.
>
> Nothing was written to production or staging. No migration was applied, no financial record was changed, and no commit was made.

This report supersedes **only** `docs/STAGE_B_MIGRATION_RECONCILIATION.md` section 9.1's option framing and its characterization of reclassification as financially misleading. All other Stage B findings, including the app/database drift, staging, backup, and later-migration gates, remain in force.

---

## 1. Executive Summary

1. **Migration 36 fails deterministically.** The production database is at the migration-27 schema. Its two `paid` settlements have no payout-proof columns and no proof data. Migration 36 adds `settlements_payout_proof_matches`, which requires every paid row to have `paid_amount_minor`, `transfer_method`, and `transfer_reference`. Both rows fail the constraint at `00000000000036_payout_proof.sql:62`.
2. **Both blockers are demo data.** The two rows carry `DEMO-SEED:` notes, belong to vendors with `is_demo = true`, and point only to demo orders with `@demo.gifto.example` contact emails. The four production settlements are all demo-seeded; there is no non-demo settlement in production.
3. **The exact source is identified.** The unmerged `demo/catalogue-seed` branch at `473fa27d47bc3ceb6855e628e3dd75b938c1ca44` contains `scripts/demo-seed/seed-orders.mjs`, which maps Nile Blossoms and Legacy Engraving to `paid`, creates `DEMO-SEED:` settlements, calls the legacy one-argument `mark_settlement_paid`, then directly backdates `created_at` and `paid_at`. The displayed dates and the actual write window match the seeder exactly.
4. **The ledger otherwise reconciles.** The two paid batches contain 6 + 5 = 11 lines, totaling 305760 + 479500 = 785260 piastres. The 11 lines map one-to-one to 11 unique `earned` commission entries with equal amounts. All 11 lines are unreleased, all 11 source suborders are delivered, and all 11 source orders use demo contact emails.
5. **No payout proof exists to recover.** The seeder never captured a transfer method, reference, or note. The old one-argument RPC only recorded status, `paid_at`, and `paid_by`. The displayed `paid_at` was written directly after the RPC, not by the RPC. A real bank reference cannot be recovered from the system because none was ever stored.
6. **A false paid attestation is the actual defect.** Under D-08, `paid` means Gifto received the commission and the payout requires a bank transfer reference. These rows assert receipt of 785260 piastres (EGP 7,852.60) without any recorded transfer, reference, or proof of a real payout.
7. **Recommended treatment: Option C1.** Snapshot the two rows, their lines, entries, and source orders; then set the two settlements to `open` and clear `paid_at` and `paid_by`, keeping the lines, entries, totals, IDs, and notes. This is truthful, least destructive, passes the one-open-per-vendor index, and lets migration 36 apply without inventing proof. It leaves the 11 commissioned amounts outstanding rather than falsely received.
8. **Do not apply migration 36 yet.** The correction requires owner/finance confirmation that no funds moved, a backup/PITR and staging gate, and a two-person application/verification step. If a real transfer did occur outside the system, Option A applies instead, but documentary evidence must be supplied.

---

## 2. Evidence and Limits

| Evidence | Classification | What it establishes |
| --- | --- | --- |
| Read-only production PostgREST/OpenAPI and row probes against `hqusykdyjpruysxezsrn.supabase.co` | OBSERVED (read-only) | Production is at the migration-27 schema; two paid settlements exist without proof; all four settlements are `DEMO-SEED:` rows. |
| Production settlement/line/entry/source-order probe, `migration36_data.json` | OBSERVED (read-only) | Exact settlement, line, commission-entry, vendor, order, and timestamp values used in this report. |
| Production provenance probe, `migration36_provenance.json` | OBSERVED (read-only) | All four demo settlements, demo vendors, 24 demo-batch lines, and the 22-order demo batch. |
| `git show demo/catalogue-seed:scripts/demo-seed/seed-orders.mjs` and `shared.mjs` | OBSERVED (local git object) | The seeder's exact status map, note prefix, one-argument RPC call, and backdating logic. |
| Current `main` `docs/DEMO_DATA_GUIDE.md` and branch version of the same file | OBSERVED (local) | Current main explicitly has no demo orders; the branch adds 40 demo orders and four demo settlements and makes cleanup destructive to them. |
| Disposable PostgreSQL rehearsal | OBSERVED (local) | Migration 36 fails with the exact constraint error on a paid settlement without proof. |
| Production `commission_adjustments` table | OBSERVED absent (HTTP 404, `PGRST205`) | Consistent with migration 27; no adjustment ledger exists to explain the paid line amounts. |
| Real bank transfer or external remittance record | **NOT AVAILABLE** | No source document, reference, date, amount, or bank statement has been produced. No such record is expected from the code path. |
| Exact Vercel deployment commit/environment, database logs, backup/PITR, staging | **UNVERIFIED** | No Vercel, database-owner, backup, or staging access in this session. |

Limits that remain explicit:

- The production probes used repository-local read-only credentials. No secret values are recorded here.
- No production write, deployment, migration, or test order was performed.
- The seeder's execution cannot be confirmed from PostgreSQL audit logs because no logs were available. Provenance is established by exact matching values plus the branch source; it is high confidence, not a database audit-log assertion.
- The owner must confirm that no off-platform transfer occurred. If the owner has documentary proof of a real transfer, this report's financial conclusion changes and Option A must be evaluated.
- No customer PII is reproduced. Email values are represented only by their domain/equality check.
- The local rehearsal database is not a production clone and must not be reused after the failed migration-36 attempt without being recreated.

---

## 3. The Blocking Condition in Migration 36

### 3.1 What migration 36 requires

`supabase/migrations/00000000000036_payout_proof.sql`:

- adds nullable `settlements.paid_amount_minor`, `transfer_method`, `transfer_reference`, and `proof_note` (lines 36-46);
- adds constraint `settlements_payout_proof_matches` (lines 51-62):
  - for non-paid rows, **all four proof fields must be null**;
  - for paid rows, `paid_amount_minor`, `transfer_method`, and `transfer_reference` must be non-null; `proof_note` is optional;
  - no exception exists for zero-net rows, legacy rows, demo rows, or missing proof;
- drops the old one-argument `mark_settlement_paid(uuid)` (line 69);
- creates the five-argument `mark_settlement_paid(uuid, int, text, text, text)` (lines 71-223), which:
  - requires amount >= 0, method in `bank_transfer|cash|other`, and a trimmed reference of 3-200 characters;
  - requires the paid amount to equal the sum of settlement lines;
  - requires the stored settlement total to equal the sum of its lines;
  - requires all lines to belong to the settlement vendor, be `earned`, be unreleased, and equal the commission entry plus adjustments;
  - writes `paid_at`, `paid_by`, amount, method, reference, and optional note.

The production failure is at the constraint, not the RPC. The local rehearsal reproduced:

```
ERROR: check constraint "settlements_payout_proof_matches" of relation "settlements" is violated by some row
```

The local `psql` run was not transactional, so migration 36 had already added columns before failing. Recreate the local database before any retry; do not reuse the partially modified rehearsal database.

### 3.2 Why the two production rows fail

Both paid rows have `status = 'paid'` and no proof columns in the current schema. Even if the columns were added by a pre-step, their values would be null:

- no `paid_amount_minor` was ever recorded;
- no `transfer_method` was ever recorded;
- no `transfer_reference` was ever recorded;
- no `proof_note` was ever recorded.

The old one-argument RPC only wrote `status`, `paid_at`, and `paid_by`. The seeder then directly updated `paid_at` to a backdated value. That direct update did not add proof, and no RPC path existed to add it before migration 36.

### 3.3 Migration 43 does not solve this

Migration 43 re-adds the constraint with a third branch for batches fully offset by clawbacks: paid amount 0, total 0, `clawback_minor > 0`, and all proof fields null. Both demo rows have `total_minor` 305760 and 479500, no clawbacks, and no proof. They fail both the migration-36 and migration-43 constraints. The zero-net exception is irrelevant to them.

The current app's zero-net settlement path (`src/app/admin/settlements/actions.ts:268-274`) sends `p_paid_amount_minor: 0`, `p_transfer_method: null`, `p_transfer_reference: null`, and `p_proof_note: null`. That path is compatible with migration 43's zero-net exception, but not with migration 36 alone. During a maintenance window no settlement is being paid, so this is an adjacent compatibility note, not the blocker. Do not smoke-test a zero-net payout between migration 36 and migration 43.

### 3.4 Rollback caution

`supabase/rollbacks/00000000000036_payout_proof_rollback.sql` restores the one-argument RPC and drops the proof columns. Rolling back after production application would destroy any proof data and return the app to an incompatible payout signature. A verified backup/PITR restore or a reviewed forward fix is preferable to running this rollback as a casual undo.

---

## 4. Production Records

### 4.1 All four production settlements are demo seeds

No non-demo settlement exists in production. All four rows use the `DEMO-SEED:` note prefix, and all four vendors have `is_demo = true`.

| Settlement ID | Vendor | Status | Total (piastres) | Displayed `created_at` | Displayed `paid_at` | Actual `updated_at` | Note |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `2c589855-3f11-4708-a8c3-7738ffa25e80` | Nile Blossoms (`a59bb38c-729d-4a0e-b3fd-8e7dd46717d6`) | paid | 305760 | 2026-11-09T10:00:00Z | 2026-11-11T16:00:00Z | 2026-11-19T13:22:04.707729Z | `DEMO-SEED: nile-blossoms payout history` |
| `7cadf821-22a4-409f-9617-6bfae5124b6e` | Legacy Engraving Studio (`6d0b15cb-575f-4eec-95b4-78db59ff71ac`) | paid | 479500 | 2026-11-09T10:00:00Z | 2026-11-11T16:00:00Z | 2026-11-19T13:22:05.300990Z | `DEMO-SEED: legacy-engraving payout history` |
| `d1e74ebf-7b72-4195-93ae-bb1c08c7c7b4` | Cairo Cocoa & Confections (`532990c6-3e99-481a-bc42-eb232c7c01c9`) | open | 269250 | 2026-11-15T10:00:00Z | null | 2026-11-19T13:22:05.739351Z | `DEMO-SEED: cairo-cocoa payout history` |
| `f4fb0a4d-8ab7-4a8b-b4e0-73e1953b8e42` | Alexandria Toy Corner (`fab89811-3d29-4474-a09c-880c95803e5f`) | voided | 76200 | 2026-11-13T10:00:00Z | null | 2026-11-19T13:22:06.355359Z | `DEMO-SEED: alex-toy-corner payout history` |

The Alex row has `voided_at = 2026-11-17T12:00:00Z` and `void_reason = 'DEMO-SEED: duplicate payout batch voided.'`.

The displayed `created_at` and `paid_at` dates are **synthetic display dates**, not real event dates. The actual write happened during the seed run on 2026-11-19, as shown by `updated_at` and by the demo orders' `updated_at` values at 13:20-13:21. The seeder intentionally backdates the rows after creation.

### 4.2 The two blocking rows in detail

| Field | Nile Blossoms | Legacy Engraving |
| --- | --- | --- |
| Settlement ID | `2c589855-3f11-4708-a8c3-7738ffa25e80` | `7cadf821-22a4-409f-9617-6bfae5124b6e` |
| Vendor ID | `a59bb38c-729d-4a0e-b3fd-8e7dd46717d6` | `6d0b15cb-575f-4eec-95b4-78db59ff71ac` |
| Vendor `is_demo` | true | true |
| Status | `paid` | `paid` |
| Currency | EGP | EGP |
| `total_minor` | 305760 | 479500 |
| Settlement lines | 6 | 5 |
| Line sum | 305760 | 479500 |
| Created by | `15a1e4f6-2abf-480e-acea-ec47d01dea86` | same |
| Paid by | `15a1e4f6-2abf-480e-acea-ec47d01dea86` | same |
| `paid_amount_minor` | absent (column not in schema) | absent |
| `transfer_method` | absent | absent |
| `transfer_reference` | absent | absent |
| `proof_note` | absent | absent |
| Void fields | all null | all null |

The actor profile `15a1e4f6-2abf-480e-acea-ec47d01dea86` is a platform administrator created on 2026-11-06. The same actor created and paid all four demo settlements.

### 4.3 Ledger reconciliation for the two paid batches

| Check | Result |
| --- | --- |
| Settlement lines | 11 total: 6 Nile + 5 Legacy |
| Unique commission entries | 11 |
| Entries in multiple lines | none |
| Entry status | all `earned`; no `reversed` |
| Line amount equals entry amount | all 11 |
| Line currency equals entry currency | all EGP |
| Line sum equals stored total | 305760 and 479500 |
| Paid-batch lines released | none; `released_at`, `released_by`, and `release_reason` are null on all 11 |
| Source suborders | all 11 `delivered` |
| Source orders | all 11 `delivered` |
| Source order contact emails | all 11 are demo (`@demo.gifto.example`) |
| Commission adjustments | table absent at migration 27; no adjustment rows |
| Duplicate allocations | none across all 24 demo-batch lines |

The four demo batches together contain 24 lines and 24 unique entries; all four stored totals equal their line sums. The two non-demo-email orders in the overall 24-line batch are in the **voided Alexandria Toy Corner** batch, not in either paid batch:

- `a7914d5a-0991-493a-b740-3b67f2387fe8` - created 2026-10-27T18:39:06Z, delivered 2026-10-27T19:15:42Z, subtotal 58000.
- `58e1119a-75ed-4e59-a00a-9ee74deae579` - created 2026-10-27T19:17:30Z, delivered 2026-11-05T13:55:17Z, subtotal 44000.

These are the "two earlier guest orders" that the branch's guide says pre-date the demo order seed. They are not part of the two paid blockers, but they make the branch's full `cleanup-demo` unsafe.

### 4.4 Financial meaning

- Recorded paid amount across the two blockers: 305760 + 479500 = **785260 piastres = EGP 7,852.60**.
- The rows assert that Gifto received this commission. No transfer, receipt, reference, or other remittance evidence has been found.
- The 11 commission entries remain `earned` and attached to settlement lines. They are not reversed, and their lines are unreleased.
- Reclassifying the settlements to `open` does not change the commission ledger. It changes the settlement from "received" to "outstanding" and clears the payment actor/time.
- Deleting the settlements would also leave the 11 entries unsettled, but it would lose the settlement IDs, line history, and allocation evidence. It is more destructive than reclassification.
- Because all four settlements and their vendors are demo fixtures, this misstatement is confined to demo financial history, not a real vendor payout. It is still visible in a public production project and must be corrected before a financial-proof migration.

---

## 5. Provenance

### 5.1 Exact source

- Branch: `demo/catalogue-seed`
- Commit: `473fa27d47bc3ceb6855e628e3dd75b938c1ca44`
- Subject: `chore(demo): add catalogue and marketplace seed assets`
- Commit date: 2026-11-20 16:39:05 +0200
- Graph relationship: `main` is 84 commits ahead; the demo branch is 1 commit ahead. Neither contains the other.
- Files introduced by the branch (absent from current `main`):
  - `scripts/demo-seed/seed-orders.mjs`
  - `scripts/demo-seed/shared.mjs`
- Files modified by the branch (present on both branches, substantially different):
  - `scripts/cleanup-demo.mjs`
  - `docs/DEMO_DATA_GUIDE.md`

Current `main` returns false for `Test-Path scripts/demo-seed/seed-orders.mjs`. The order/settlement seeder is absent from current main, so the production data cannot have been produced by the current main branch.

### 5.2 Seeder behavior

`scripts/demo-seed/seed-orders.mjs` on the branch:

- defines `SETTLEMENT_NOTE_PREFIX = "DEMO-SEED:"`;
- uses `create_settlement({ p_vendor_id, p_note: "DEMO-SEED: <slug> payout history" })`;
- defines the desired settlement map:

  ```
  nile-blossoms    -> paid
  legacy-engraving -> paid
  cairo-cocoa      -> open
  alex-toy-corner  -> voided
  ```

- for paid rows, calls the legacy one-argument `mark_settlement_paid({ p_settlement_id })`;
- then directly updates `settlements` with:

  ```
  paid:   { created_at: isoDaysAgo(10, 10, 0), paid_at: isoDaysAgo(8, 16, 0) }
  voided: { created_at: isoDaysAgo(6, 10, 0),  voided_at: isoDaysAgo(2, 12, 0) }
  open:   { created_at: isoDaysAgo(4, 10, 0) }
  ```

- also directly updates the settlement lines' `created_at` to the settlement's `created_at`;
- verifies four demo settlements exist, with the statuses paid/open/voided, and verifies that paid rows have a non-null `paid_at`; it does **not** verify proof because proof did not exist at migration 27.

The seed run was 2026-11-19 at approximately 13:22 UTC. `isoDaysAgo(10, 10, 0)` yields 2026-11-09T10:00:00Z and `isoDaysAgo(8, 16, 0)` yields 2026-11-11T16:00:00Z. Those are the exact displayed values on both paid rows. The actual `updated_at` values are 13:22:04-06 on 2026-11-19; the demo orders were updated at 13:20-13:21.

### 5.3 Documentation and policy conflict

Current `main`'s `docs/DEMO_DATA_GUIDE.md` states:

- `Demo orders | none (intentional - see Limitations)`;
- the checkout RPCs and triggers are the only writers of order, inventory, and commission ledger rows;
- "fabricating orders directly would create financial history that never happened";
- cleanup "does **not** remove ... orders, commissions, or inventory ledger rows."

The demo branch's version instead states:

- `Demo orders | 40 (42 total orders including 2 earlier guest orders)`;
- `Demo settlements | 4 (2 paid, 1 open, 1 voided)`;
- sending the seed creates "40 backdated order[s], all order/suborder status transitions, ... commission entries, and four settlements";
- cleanup removes settlement lines and settlements, commission entries, and **every order containing a demo-vendor suborder**, including the two earlier guest orders.

This is not a missing-file coincidence. The branch that created the financial fixtures explicitly contradicts the current main policy that demo seeding must not fabricate financial history.

### 5.4 Alternative explanations considered

1. **A real admin manually paid both vendors through the old RPC.** Rejected with high confidence: the exact `DEMO-SEED:` notes, the exact four-status map, the exact backdated formula, the demo vendors and demo orders, the branch source, the same actor for all four rows, and the absence of any proof all point to the seeder. A manual payment would still not explain the backdated `created_at` and `paid_at`.
2. **Real payments occurred and were later overwritten by the seed.** No evidence exists, but this cannot be excluded from database rows alone. If the owner has bank records for these exact amounts and dates, Option A applies. The displayed `paid_at` may be synthetic even if some real payment happened at another time.
3. **A demo environment was intended, and someone pointed the seeder at production.** This is consistent with the evidence. It still leaves production with false paid attestations and must be corrected.
4. **The data is harmless because it is labeled demo.** The note prefix helps humans, but the database status and D-08 semantics are the same as real payouts. The label does not satisfy migration 36 and does not make the paid assertion true.

---

## 6. Options

### Option A - Recover and record a real payout

Use only if owner/finance produces documentary evidence that the exact commission amounts were actually transferred outside the system.

- Requires: exact amount, date, method, transfer reference, and a source document or bank statement.
- Implementation: owner-approved pre-step adds the four proof columns (because they do not exist before 36), sets each row's `paid_amount_minor` to its stored total, records the truthful method/reference/note, then applies migration 36.
- Preserves `paid` status and history.
- Not available on current evidence. Do not invent a bank reference to make this option work.

### Option B - Keep `paid` with a legacy/demo exception

Two variants:

- **B1: Explicit synthetic proof backfill.** Add the proof columns in a pre-step and set `paid_amount_minor` to the total, `transfer_method = 'other'`, an explicitly marked reference such as `DEMO-SEED-<settlement-id>`, and a proof note stating that no funds were transferred. Migration 36 then passes. This is a documented data exception, not a recovered bank proof.
- **B2: Constraint exception for demo/legacy rows.** Edit migration 36 or add a companion migration so paid demo/legacy rows may have null proof. This weakens the invariant and makes the schema demo-aware. It is the most invasive option.

Both variants keep a `paid` status that means "commission received" under D-08 even though no commission was received. B1 is less invasive than B2, but it still records a false attestation. Not recommended for the production financial ledger. If the owner requires a paid-history demo, use an isolated demo environment with explicit synthetic metadata, not production.

### Option C - Correct the synthetic paid state (recommended)

- **C1: Reclassify both rows to `open`.** Snapshot the rows, lines, entries, and source orders. Set `status = 'open'`, `paid_at = null`, `paid_by = null`, preserve `total_minor`, `note`, IDs, lines, and entries. This is truthful, least destructive, passes the one-open-per-vendor index (Nile and Legacy have no other open settlement), and passes migration 36 because open rows require null proof. Preferred.
- **C2: Delete the two settlements and their lines after snapshot.** The 11 commission entries become unsettled and can be resettled later. This removes the false paid history but loses settlement IDs, allocation evidence, and audit context. More destructive than C1; use only if the owner wants the fixtures removed entirely.
- **C3: Full demo reset with the branch cleanup script.** Rejected. The branch cleanup removes every order tied to a demo vendor, including the two non-demo-email guest orders, plus all demo commission and settlement history. It is broader than the problem, can delete real-looking order records, and is not needed to unblock migration 36.

### Comparison

| Option | Truthful paid state | Migration 36 | Data loss | Constraint integrity | Recommendation |
| --- | --- | --- | --- | --- | --- |
| A - real proof | Yes, if evidence is real | Passes | None | Preserved | Only with documentary proof |
| B1 - synthetic proof | No | Passes | None | Preserved but semantically false | Last resort, not recommended |
| B2 - constraint exception | No | Passes | None | Weakened | Not recommended |
| C1 - reclassify open | Yes | Passes | Settlement paid status only; lines/entries preserved | Preserved | **Recommended** |
| C2 - delete rows | Yes | Passes | Settlement and line history lost | Preserved | Fallback |
| C3 - full demo reset | Yes | Passes | All demo-vendor orders and financial history lost | Preserved | Do not use |

---

## 7. Recommendation and Decision Required

### 7.1 Recommended decision

**Choose Option C1**, conditional on owner/finance confirmation that:

1. No funds were transferred for either the Nile Blossoms 305760-piastre batch or the Legacy Engraving 479500-piastre batch.
2. The two rows are demo fixtures and may be corrected without altering a real vendor's payout record.
3. The original fixture state is exported and retained before the correction.
4. The correction is applied by a database owner/service role in a transaction, reviewed by a second person, with before/after counts.
5. The demo seeder and both demo guides are corrected before any merge or rerun.
6. Migration 36 is applied only after the correction is verified, with the Stage B backup, staging, and deployment gates still satisfied.

### 7.2 Proposed decision record

> **D-11 (proposed) - Synthetic demo settlement correction.** The two paid settlements `2c589855-3f11-4708-a8c3-7738ffa25e80` (Nile Blossoms, 305760 piastres) and `7cadf821-22a4-409f-9617-6bfae5124b6e` (Legacy Engraving Studio, 479500 piastres) are demo fixtures created by `demo/catalogue-seed` commit `473fa27`. They were seeded with `DEMO-SEED:` notes, the legacy one-argument `mark_settlement_paid`, and direct backdated timestamps. No commission was received and no transfer proof exists. Authorize an evidence snapshot, then reclassify both settlements to `open` and clear `paid_at`/`paid_by` while preserving their lines, entries, totals, IDs, and notes; correct the demo seeder and documentation; and proceed with migration 36 only after the Stage B backup, staging, and two-person verification gates are met. This is a data correction, not a payout.

The next free decision ID is D-11; confirm numbering when recording it in `docs/DECISIONS.md`.

### 7.3 Decision checklist

- [ ] Owner/finance confirms no real transfer occurred for the two blocker amounts.
- [ ] Owner selects A / B1 / B2 / C1 / C2.
- [ ] If A, documentary proof is attached and verified.
- [ ] If C1, the evidence snapshot and direct-correction authorization are approved.
- [ ] Demo seeder and `docs/DEMO_DATA_GUIDE.md` correction is authorized.
- [ ] Backup/PITR, staging, and the wider Stage B gates remain approved and scheduled.
- [ ] Named database owner and second verifier are assigned.

If the owner cannot confirm that no real transfer occurred, stop. Do not reclassify, do not backfill proof, and do not apply migration 36.

---

## 8. If Option C1 Is Approved: Execution Plan

This section is a draft runbook. None of it has been executed.

### 8.1 Preconditions

- Verified backup or PITR snapshot; restore drill recorded.
- Isolated staging database restored from the production backup, or an approved equivalent seed.
- Production writes frozen for the correction and migration window.
- Evidence export of the two settlements, all 11 lines, all 11 commission entries, the 11 source suborders/orders, and the current note/actor/timestamp values.
- Two-person review: one applies, one verifies.
- Owner/finance approval recorded.

### 8.2 Correction transaction (draft, not executed)

```sql
begin;

select id, vendor_id, status, total_minor, paid_at, paid_by, note
  from public.settlements
 where id in (
   '2c589855-3f11-4708-a8c3-7738ffa25e80',
   '7cadf821-22a4-409f-9617-6bfae5124b6e'
 )
 for update;

-- Expected: exactly two rows, both status = 'paid', both notes start with DEMO-SEED:.

update public.settlements
   set status = 'open',
       paid_at = null,
       paid_by = null
 where id in (
   '2c589855-3f11-4708-a8c3-7738ffa25e80',
   '7cadf821-22a4-409f-9617-6bfae5124b6e'
 )
   and status = 'paid'
   and note like 'DEMO-SEED:%';

-- Must affect exactly 2 rows. If not, rollback.

select id, status, paid_at, paid_by, total_minor, note
  from public.settlements
 where id in (
   '2c589855-3f11-4708-a8c3-7738ffa25e80',
   '7cadf821-22a4-409f-9617-6bfae5124b6e'
 );

-- Expected: both open, paid_at null, paid_by null, totals unchanged.

select settlement_id, count(*) as lines, sum(amount_minor) as line_total
  from public.settlement_lines
 where settlement_id in (
   '2c589855-3f11-4708-a8c3-7738ffa25e80',
   '7cadf821-22a4-409f-9617-6bfae5124b6e'
 )
 group by settlement_id;

-- Expected: 6 lines / 305760 and 5 lines / 479500.

select count(*) as open_batches_for_these_vendors
  from public.settlements
 where status = 'open'
   and voided_at is null
   and vendor_id in (
     'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6',
     '6d0b15cb-575f-4eec-95b4-78db59ff71ac'
   );

-- Expected: 2, one per vendor, before commit.

commit;
```

Technical checks this draft relies on:

- `settlements_paid_at_matches` requires `paid_at` to be null when the status is not paid; clearing it satisfies that.
- `settlements_void_state_matches` requires `voided_at` to be null for non-voided rows; it is already null.
- `settlements_one_open_per_vendor` is a partial unique index on `(vendor_id)` for open, non-voided rows. Nile and Legacy each have exactly one open row after the update and no other open row.
- `settlements_payout_proof_matches` does not exist before migration 36. After 36, open rows must have all four proof fields null; they do.
- There is no `paid_by`-must-be-null-for-open constraint, but clearing it is part of the truthful correction.
- The `updated_at` trigger will stamp the correction time; do not overwrite it.

### 8.3 Post-correction validation

- Exactly two settlement rows changed; all other settlements unchanged.
- Both corrected rows are `open`, `paid_at` null, `paid_by` null, totals unchanged.
- 11 lines and 11 entries remain; no amounts, statuses, or release fields changed.
- No paid settlement remains in production without proof.
- All four production settlements are still `DEMO-SEED:` rows; the Cairo row remains open, the Alex row remains voided.
- Export the post-correction state and attach it to the change record.

### 8.4 Then, and only then, migration 36

- Recreate a clean staging database; do not reuse the partially modified rehearsal database.
- Apply migrations 1-35 to the staging baseline.
- Confirm the corrected data state in staging.
- Apply migration 36; verify `settlements_payout_proof_matches` exists and no row violates it.
- Apply 37-66 in filename order; run the full Stage B validation gates.
- Apply 36 only in the approved production maintenance window, with the same two-person verification and backup.

### 8.5 Seeder and documentation correction

Before the demo branch is merged or rerun:

- remove the legacy one-argument `mark_settlement_paid` call;
- do not seed `paid` financial history into the production project;
- if a demo environment genuinely needs a paid fixture, use the five-argument RPC with an explicitly synthetic method/reference/note only after a separate owner decision, and never present it as real receipt;
- make the seeder's verification assert the chosen invariant (for example, all demo settlements open) rather than only checking that a `paid_at` exists;
- reconcile the branch guide with current main's policy that demo seeding must not fabricate financial history;
- do not merge the branch's destructive cleanup behavior without a scope review; it deletes every order tied to a demo vendor, including the two earlier guest orders.

### 8.6 Abort conditions

Abort and restore from snapshot if:

- the update affects anything other than exactly two expected rows;
- any line or entry count/total changes;
- a unique-index, paid-at, void-state, or proof constraint fails unexpectedly;
- the corrected rows are not both `open` with null payment fields;
- the owner cannot confirm the no-transfer premise;
- the backup/PITR or staging gate is unavailable.

Do not "fix" an abort by backfilling synthetic proof.

---

## 9. Corrections to Stage B

- **Section 9.1 option 3 is superseded.** Stage B said reclassifying the rows was "financially misleading and should not be used" because it assumed the payments were real. The new evidence shows the rows are demo fixtures and no funds moved. Reclassifying to `open` is now the truthful correction, not a concealment of a real payout.
- **The "created Nov 9 / paid Nov 11" dates are display dates.** They were backdated by the seeder. The actual write window is 2026-11-19 13:20-13:22 UTC. Do not cite the display dates as real payment dates.
- **The Stage B approval item "36 legacy proof" is now "demo fixture treatment."** It remains an owner/finance gate, but the question is whether to correct synthetic data, not how to document a real legacy payout.
- **Stage B's "no original proof recovered" remains true and is now explained.** No proof was ever captured because the seeder used the legacy RPC and direct timestamp update.
- **All other Stage B findings stand.** In particular, the public app/database drift, the absence of staging/backup/Vercel access, guest-link expiry, and the later destructive migrations are separate blockers.

---

## 10. Appendix: Exact Paid-Batch Records

All 11 source suborders and orders are `delivered`; all entries are `earned`; all lines are unreleased. No customer PII is shown.

### Nile Blossoms - settlement `2c589855-3f11-4708-a8c3-7738ffa25e80`

| Line ID | Commission entry ID | Order vendor ID | Source order ID | Amount | Delivered / earned (UTC) |
| --- | --- | --- | --- | ---: | --- |
| `4a082518-3541-462e-9400-4bd986ce5c18` | `7d96612d-cff2-4dc3-94bc-9f5d97a8c097` | `b6571e5c-87e2-4d48-b112-018ec550d8e6` | `1502b6c6-6b33-4a1c-af92-4c2f78e79f0f` | 93000 | 2026-09-09T09:08:00Z |
| `69212aca-66f4-4c3d-91e3-e6b241f7035d` | `8fc0f721-f50f-4ae4-a6b5-7dc6e0ae238a` | `8a1226db-46a2-4a1b-8001-11a0df8d4b00` | `c9d70a8e-360e-4638-aa73-8fd999635d31` | 34800 | 2026-09-01T09:00:00Z |
| `a7dec7f2-8383-4e3f-83dd-117cb37575eb` | `9302e469-354d-4c0e-811f-e0d505f53702` | `6270d0bd-1a1d-472e-94b4-53184c168b85` | `820809db-1aba-41d7-b770-2d7be3490b7f` | 18000 | 2026-09-25T09:24:00Z |
| `d86ba039-fbc0-4091-b5ad-bff49393bf83` | `98af07a3-7f45-4471-b2e4-b6184939fa54` | `d432da42-6f59-4429-a4d3-6492fa82afe5` | `b2949089-dc8f-428b-8134-d2f0e294b7ac` | 31800 | 2026-09-17T09:16:00Z |
| `fb4347aa-493b-4ca3-b045-8933134ade5e` | `b55bb4b8-23d9-4558-a128-ffdeadebb49b` | `f8765c62-1657-4d18-a042-df2e9298f006` | `56f1e4b6-80de-4f83-91d9-8213418877d0` | 22320 | 2026-10-03T09:32:00Z |
| `38de8d55-521d-4986-8608-4c4000d2afed` | `e6904c81-7c32-4926-b641-c68a5ba93820` | `7bbea970-eaa0-436e-84cc-31530abb98ce` | `fb6cb318-a301-4b97-a01a-923bdc1ada31` | 105840 | 2026-10-09T18:23:00Z |
| **Total** |  |  |  | **305760** |  |

### Legacy Engraving Studio - settlement `7cadf821-22a4-409f-9617-6bfae5124b6e`

| Line ID | Commission entry ID | Order vendor ID | Source order ID | Amount | Delivered / earned (UTC) |
| --- | --- | --- | --- | ---: | --- |
| `720f8aee-c2da-44fa-ba32-3993e3c33cff` | `11572aca-7197-4e94-a031-e7be1befc532` | `c6f0f88e-4aaa-435d-bf1e-36cfa92afbd0` | `13a60ea7-c84b-480d-ae1b-a84a2572d526` | 41500 | 2026-09-03T12:17:00Z |
| `9cc7ad95-63f1-49d4-82e9-fb52fbb240f8` | `2f26c6e5-028c-4e96-9a62-7d9d70ec271c` | `e1cfde98-ce7a-4aca-ab02-0e244765c71b` | `c626eca3-ecd8-4ec7-a1cd-d8fef2caf92f` | 320100 | 2026-09-11T12:25:00Z |
| `10ccca1d-feb3-4caa-8dff-f67e01bebb8a` | `c724af19-d88c-448f-a7e8-c805118799aa` | `1610ab2e-df39-4a34-b141-95584daade9a` | `ea852549-30b0-4add-9b44-e04036d5925e` | 3200 | 2026-09-19T12:33:00Z |
| `742f141a-51f5-4a62-a10f-ae7ac5c1ec07` | `e150fa09-1f2c-4c35-a27d-716665ebd596` | `db382cd4-f83b-40ce-bf67-e80fbfe9d2bf` | `870273b5-c957-47e2-b2dc-946212db7eea` | 61800 | 2026-10-05T12:49:00Z |
| `b83bb335-1a44-4e6a-90d6-620d73b78001` | `f69a4910-0855-413c-85e1-f0f2a754970e` | `d4877ec7-b846-43ed-8cf7-f0737e0a9df8` | `e46c3e9a-82a7-4fb3-b2d1-9da78c4ef68f` | 52900 | 2026-09-27T12:41:00Z |
| **Total** |  |  |  | **479500** |  |

### Evidence artifacts

- `C:\Users\bodyo\AppData\Local\Temp\opencode\migration36_data.json` - generated 2026-11-22T22:42:46.344Z; exact settlement/line/entry/order probe.
- `C:\Users\bodyo\AppData\Local\Temp\opencode\migration36_provenance.json` - generated 2026-11-22T22:45:59.798Z; all four demo settlements, demo vendors, and 22-order demo batch.
- `C:\Users\bodyo\AppData\Local\Temp\opencode\probe_migration36_data.mjs` and `probe_migration36_provenance.mjs` - read-only probe scripts.
- `C:\Users\bodyo\AppData\Local\Temp\opencode\probe_production.mjs`, `probe_rpc_state.mjs`, `probe_data.mjs`, `probe_paid_settlements.mjs` - prior read-only production probes.
- `supabase/migrations/00000000000036_payout_proof.sql` - failure point.
- `supabase/migrations/00000000000043_paid_return_clawback.sql` - zero-net exception, which does not cover these rows.
- `supabase/rollbacks/00000000000036_payout_proof_rollback.sql` - destructive rollback caveat.
- `demo/catalogue-seed` at `473fa27` - seeder source.

**Bottom line:** The two migration-36 blockers are synthetic demo payouts, not real commission receipts. The truthful, least destructive correction is to snapshot and reclassify them to open; backfilling proof would fabricate a transfer that never happened. Do not apply migration 36 until the owner confirms the no-transfer premise and approves the correction, backup, staging, and verification gates.
