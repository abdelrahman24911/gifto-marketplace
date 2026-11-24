# Gifto — Financial Integrity

- **Audit date:** 2026-11-24
- **Worktree:** `~/workspace/gifto-master-audit`, HEAD `54c780b`
- **Sources:** specialist financial report (`/tmp/gifto-audit/financial.md`); live hosted verification (`DATABASE_AND_MIGRATIONS.md` §2–§4). Money figures are in **piastres** (minor units) unless stated as EGP.
- **Status:** this is the highest-risk area in the audit. The money core is well-built on paper, but the two paid settlements on hosted now carry fabricated proof, the return-after-payout path cannot complete, and there is no COD cash ledger and no reconciliation.

## 1. The money model (as designed)

- **Commission:** per-vendor rate, agreed with each shop and set by the admin; calculated on **product subtotal only** (delivery fee excluded); earned on delivery. The schema default of 10% is a column default, **not** a commercial offer — never print a percentage in vendor materials.
- **Payment:** COD only at launch (owner decisions D-06/D-07). The vendor holds the COD cash; **every Sunday** the vendor remits Gifto's commission for the prior week's delivered orders (D-08). "Mark paid" attests that Gifto received the commission and requires a bank transfer reference.
- **Orders:** one checkout splits into one `order` + one `order_vendors` suborder per vendor, each with its own status, delivery fee, and commission rate. Parent status is derived from suborders.
- **Settlements:** `createSettlement` batches unsettled commission entries per vendor; `markSettlementPaid` / `voidSettlement` / `recordDirectRepayment` manage the lifecycle. Void restores clawbacks (migration 50).
- **Refunds:** approval reverses the commission entry and creates `commission_clawbacks`; post-payout refunds are clawed back from the next settlement or repaid directly (D-08). Cancelled-suborder refund approval is explicit (migration 71, RLS TEST 14f).
- **Returns:** 7 days from delivery (D-09); admin approves, vendor inspects; return courier paid by customer unless wrong/damaged, then vendor pays; restock is inspect-then-restock manually, never automatic; suborder-level only for pilot.

## 2. What is enforced (verified in code / SQL)

- Unique active-line index and one-open-settlement-per-vendor index — a commission entry cannot sit in two open settlements.
- Amount-equality checks: `mark_settlement_paid` (5-arg form, migration 36) requires `amount == sum of lines == stored total`.
- Capped clawback ledgers; row locks (`FOR UPDATE`) on money paths; single-RPC money operations.
- Settlement payment is atomic under concurrency — FIN-001 re-run in this audit: exactly one of two concurrent `mark_settlement_paid()` calls succeeded; the other raised "This settlement is already paid." (23514). **PASS.**
- Parent-order status derivation correct under concurrency — H-01 re-run in this audit. **PASS.**
- 20 of 32 inventoried invariants are enforced in code/SQL. The money paths have the strongest test coverage in the repo (finance 25 tests, RLS commissions 23 tests, RLS refunds 20+ tests, concurrency suites, C1 rehearsal).

## 3. Risks R-01–R-12

| ID | Sev. | Risk | Evidence / status |
|---|---|---|---|
| R-01 | **High** | **Physical return can never complete after payout.** `reverse_commission_on_return` raises on unreleased lines; paid lines are never released — so a return of a paid order has no completion path. | Inferred from RPC logic; needs a targeted SQL test on a disposable DB to confirm the exact failure mode. |
| R-02 | **High** | **Migration-36 backfill + C1 ordering trap — now realised on hosted.** The backfill in `a876e85` was committed into migration 36 and **executed on hosted** as part of the 28–71 run. C1's pre-36 guard now trips, so C1 aborts; the rollback is equally invalid. | **Verified live:** both paid settlements carry the exact `LEGACY-` proof; applied statement for v36 matches the file including the backfill. |
| R-03 | **High** | **Backfill fabricates proof for any legacy paid row, with no flag column.** The proof is indistinguishable from real proof except by the `LEGACY-` prefix convention — there is no `is_legacy_proof` / `proof_source` column, no flag, no audit marker. | Verified live (see §4). A future reader of the settlements table cannot tell fabricated proof from a real transfer without knowing the convention. |
| R-04 | Medium | Paid settlements are irreversible in-app. No unpay / correct-paid RPC exists; the only correction path is C1 (now dead on hosted) or a new forward correction / restore. | Code fact. D-11 (the decision that would authorise a correction path) is still only proposed and absent from `docs/DECISIONS.md`. |
| R-05 | Medium | Payout proof is self-asserted only. Free-text transfer reference (3–200 chars), no uniqueness check, no bank verification, no attachment/upload. A typo or a fiction passes the CHECK equally. | Code fact (migration 36 CHECK). |
| R-06 | Medium | **No COD cash ledger and no reconciliation.** Cash collected by vendors is not recorded per order, per vendor, or per remittance. Settlement arithmetic assumes the commission is remitted; nothing reconciles cash actually received. | Code fact; named polish gap (B-03). Largest financial-ops gap after A-16. |
| R-07 | Medium | C1 snapshot is procedural and brittle: it aborts if any third paid settlement exists. It was designed for exactly two paid settlements; any new paid settlement before execution breaks it. | Moot on hosted (C1 dead), but relevant if a forward correction reuses the pattern — the new correction must not inherit this fragility. |
| R-08 | Low | No total-vs-lines CHECK constraint on settlements (equality is enforced only inside `mark_settlement_paid`, not as a standing constraint). | Code fact. |
| R-09 | Low | No partial direct repayment: `recordDirectRepayment` has no partial-payment path. | Code fact. |
| R-10 | Low | Rounding residuals: integer-piastres arithmetic avoids float error, but residual allocation on split/void paths is untested at the edges. | Code fact. |
| R-11 | Low | Deadlock: no retry on lock contention in money RPCs (row locks are held, but a deadlock aborts the caller with no retry). | Code fact. |
| R-12 | Low | Backfill untested and undocumented: the `a876e85` backfill has no test, no doc, and no owner/finance approval recorded anywhere. | Verified: no test file covers it; `docs/DECISIONS.md` is silent. |

## 4. The two paid settlements — verified live on hosted

| Settlement | Vendor | Amount | Lines | Paid | Proof on hosted |
|---|---|---|---|---|---|
| `2c589855-3f11-4708-a8c3-7738ffa25e80` | Nile Blossoms (demo) | 305,760 | 6 | 2026-11-11T16:00:00Z | `LEGACY-` reference, `paid_amount = total`, exact backfill proof note |
| `7cadf821-22a4-409f-9617-6bfae5124b6e` | Legacy Engraving (demo) | 479,500 | 5 | 2026-11-11T16:00:00Z | `LEGACY-` reference, `paid_amount = total`, exact backfill proof note |
| **Total** | | **785,260 piastres (EGP 7,852.60)** | **11** | | `LEGACY-` count = 2; 0 paid settlements lack a reference |

Both are synthetic fixtures from `demo/catalogue-seed` commit `473fa27` — that part of the record was correct. What changed: they no longer "lack payout proof". They carry proof that was **invented by the backfill** — `transfer_reference = 'LEGACY-' || substr(id,1,8)`, `transfer_method = 'other'`, `paid_amount_minor = total_minor` — and the applied migration-36 statement on hosted proves the backfill ran. The defect the MIGRATION_36 doc identified ("a false paid attestation is the actual defect") is now the live record, worth EGP 7,852.60 across two settlements.

The other two settlements on hosted: open (269,250, Cairo Cocoa & Confections, 6 lines) and voided (76,200, Alexandria Toy Corner, 7 lines). All four belong to demo vendors.

## 5. C1 — selected, rehearsed, and dead on hosted

The C1 package (`supabase/corrections/` + `scripts/rehearse-c1.sh`) is complete, safe, and idempotent **on paper and on disposable data**: single transaction, repeatable read, advisory lock, strict pre/postconditions. The rehearsal was re-run in this audit on a disposable DB: **ALL CHECKS PASSED** (migrations 1–27 + fixtures, C1 applies, C1 re-run is a no-op, migrations 36–67 clean, negative/rollback/empty variants pass).

**But C1 cannot run against hosted.** Its own pre-36 guard trips because `settlements_payout_proof_matches` exists and `transfer_reference` exists — the backfill already supplied proof, so C1's precondition ("paid rows without proof") is false. The C1 rollback is equally invalid. C1 was never run against production, and it never will be in its current form.

**What replaces it:** a new forward correction — a new migration (never an edit to an applied migration) that reclassifies the two settlements from `paid` to `open` and records the reason, or a backup/PITR restore. Either path needs a new, explicit owner/finance decision (D-11, still only proposed, absent from `docs/DECISIONS.md`). **Do not run C1 or its rollback against hosted.**

## 6. Invariants not enforced (12 of 32)

- No transfer verification (R-05) — proof is self-asserted text.
- No COD cash record (R-06) — no ledger of cash collected, held, or remitted.
- No reconciliation — settlement arithmetic only; no bank/cash matching.
- No stored vendor balance — vendor "balance" is derived per query, never stored or snapshotted.
- No paid-reversal path (R-04) — paid settlements cannot be corrected in-app.
- No courier cost model — courier charges are not recorded anywhere (B-06).
- No proof preservation across rollback — rollbacks 59/61–65 reintroduce gaps by design.
- No legacy-proof flag (R-03).
- No settlement cadence enforcement — D-08's weekly Sunday cycle is a process rule; `create_settlement` batches all currently-earned entries with no date window, no reminder, no scheduler.
- No total-vs-lines CHECK (R-08); no partial direct repayment (R-09); no deadlock retry (R-11).
- Refund window opens at delivery, not at resolve (F-04) — deliberate policy, owner decision if change wanted.

## 7. What to do (in order)

1. **Owner/finance decision (new, D-11):** forward correction (reclassify the two LEGACY settlements paid→open with a recorded reason) vs explicit acceptance of the fabricated proof as the record. Until decided, every doc mentioning migration 36 is suspect — update them in the same commit as the decision.
2. **Revert the backfill from the migration file** (`a876e85` lines in `00000000000036_payout_proof.sql`) once the decision is made — as an edit to an applied migration it will never execute again, but leaving it in the file invites a future reader to believe it is the approved path. The correction itself must be a **new migration**, never another edit to migration 36.
3. **Fix R-01:** define and test the return-after-payout completion path (release semantics for paid lines) on a disposable DB before any paid order can be returned in the pilot.
4. **Build the COD cash ledger (B-03)** before scaling past a tightly-controlled pilot: cash collected per order, cash held per vendor, remittance matching against settlements.
5. **Add payout-proof capture (A-16):** attachment/upload or at minimum a structured proof record (method, reference, amount, date, recorded-by) — and a reconciliation view that matches settlements against bank/cash records.
6. **Record D-11 and the Brevo/C1/closure decisions in `docs/DECISIONS.md`** — the decision log is missing the three most recent owner decisions.
