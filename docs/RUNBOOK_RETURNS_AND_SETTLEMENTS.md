# Returns before payout — operating rule and manual runbook

**Status:** P0-07 (2026-11-20). Mitigates CR-01 / CR-03 / N-01 **for the pilot only**.
The build that closes them is P1-04 (returns/refunds completion) and N-01
(paid-return clawback). Do not treat this runbook as closing CR-01 or CR-03.

**Who this is for:** the Gifto admin who marks settlements paid and approves
refund cases. No developer is needed to follow it. Every step uses tools that
exist today: the admin refunds queue (`/admin/refunds`), the admin order
detail page (`/admin/orders/[id]`), the admin settlement detail page
(`/admin/settlements/[id]`), and the vendor inventory page.

---

## The rule

> **No settlement containing a suborder still inside the D-09 return window,
> or with an OPEN refund case on any of its lines, may be marked paid. Wait
> until the window has passed and every refund case is resolved, or exclude
> the affected entries and settle them in a later batch.**

---

## Why the rule exists — the dead end

Once a settlement is marked paid, a refund on its orders **cannot be resolved
in the system at all**:

- Approving a refund case whose commission sits in a settlement raises:
  *"This commission is part of an active settlement. Void or release it
  before approving the refund."* A paid settlement's lines are never
  released, so paid commissions are blocked too.
- Voiding is no escape: voiding a paid settlement raises *"A paid settlement
  cannot be voided."*
- Moving the suborder to `returned` is blocked the same way: the commission
  trigger raises *"This order's commission is already part of a settlement
  and cannot be reversed automatically."* whenever the entry is in any
  settlement line — open or paid.

So the only safe moment to pay a settlement is **after** the return window
has closed on every line and **after** every refund case on the batch is
resolved. There is no undo.

## The decided facts this runbook uses (D-08, D-09 — decided 2026-11-20)

- **Return window (D-09): 7 days from delivery**, per shop suborder (an order
  from several shops is handled shop by shop; no partial / quantity-level
  returns in the pilot).
- **Who decides:** Gifto admin approves the return; the vendor inspects the
  returned item.
- **Return courier:** paid by the customer, **unless the gift is wrong or
  damaged — then the vendor pays**.
- **Restock:** inspect-then-restock manually, **never automatic**. A returned
  unit is not sellable until inspected; if it is resaleable, stock is added
  back by hand (see step 3e).
- **Settlement (D-08):** the vendor holds the COD cash. Weekly, **every
  Sunday, for the prior week's delivered orders**, the vendor remits Gifto's
  commission to Gifto. "Mark paid" attests that the commission **was received
  by Gifto** and requires a **bank transfer reference**.
- **What "mark paid" records:** the settlement total is **Gifto's commission
  only**, not the vendor's net. The settlement detail page shows the
  delivered gross, the commission, and the shop net — check all three (see
  the four-eyes step below).
- **Known gaps the runbook works around (not fixed here):**
  - The system does not yet store the bank transfer reference — record it in
    the runbook log (step 3f) until P1-05 adds the field.
  - The settlement detail page still says "Transfer … to the shop". That
    wording predates D-08; the decided direction is the vendor remits
    Gifto's commission to Gifto. Correcting the page wording is P1-05 work.
  - A customer cannot yet cancel their own open refund case in the product
    (N-03) even though D-09 allows it — until then, cancellations go through
    support and are recorded in the log.

---

## Pre-payout checklist — do this before every "Mark settlement paid"

Work from the settlement detail page (`/admin/settlements/[id]`). Do not
mark paid until **every** box is ticked. The "Record payout" section shows
a return-window check — the earliest delivered date, whether the 7-day
window is still open, and any open refund cases on the batch — treat a
warning there as a stop, not a suggestion.

1. **Settlement is open.** Status must be `open` — not `paid`, not `voided`.
   A voided batch is dead; open a new one instead of reusing it.
2. **Return window has passed on every line.** For each suborder in the
   batch, take its delivered date (`delivered_at`) and add 7 days. The window
   has passed only when **today is after that date** for every line. The
   panel shows the earliest delivered date in the batch: if that date + 7
   days is still in the future, wait. If any line's delivered date is
   missing, treat the window as open and ask a developer before paying.
3. **No open refund case on any line.** Open `/admin/refunds` (it defaults to
   the "open" filter) and check every order reference in the batch. Also
   check for any open support request or return report about those orders —
   a customer who wrote in but has no case yet still counts. If there is
   one, resolve it first (procedure below) or exclude that entry and settle
   it in a later batch.
4. **Four-eyes.** Show the settlement detail page to a second person before
   marking paid: delivered gross, commission, and shop net, plus the bank
   transfer reference for the vendor's remittance. Two people agree the
   numbers and the reference before anyone clicks "Mark settlement paid".
5. **Record the reference.** The system does not store the bank transfer
   reference yet. Write it in the runbook log (table below) with the date,
   amount, and who verified it — the log is the proof until P1-05 ships.

If any check fails: **do not mark paid.** Either wait (window / open case)
or exclude the affected entries — void the batch with a reason, then open a
new settlement without those entries and settle them in a later batch.

---

## Manual return procedure — using today's tools only

Follow the steps **in this order**. The order matters: steps (b) and (d)
both fail if the commission is still sitting in a settlement.

### a. Record the return

The customer (signed in, or a guest from their order page) opens a refund
case, or contacts support. Whoever takes it records: date, order reference
and suborder, customer name and contact, reason, item condition as reported,
and who received the returned item and when. Open a row in the log table
below immediately — do not wait until the refund is approved.

### b. BEFORE approving anything, check the commission's settlement state

Find the suborder's commission entry (via the settlement detail page, or
ask a developer to check `commission_entries` / `settlement_lines` for the
order). Then:

- **If the entry is in an open (unpaid) settlement:** void that settlement
  first — the "Opened by mistake?" section on the settlement page, with a
  reason (e.g. "Voided: return in progress for order GFT-…"). Voiding
  releases the lines, so the commission can be settled again in a later
  batch. There is **no per-line release** in today's UI; voiding the whole
  batch is the only way to free the entry.
- **If the entry is in a paid settlement:** stop. Go to
  "Return arrives AFTER payout" below. Do not approve the case and do not
  try to edit the settlement.
- **If the entry is in no settlement:** proceed.

This check comes first because approving the refund (step c) raises
*"This commission is part of an active settlement…"* and moving the
suborder to `returned` (step d) raises *"This order's commission is already
part of a settlement…"* — both while the entry sits in any settlement line.

### c. Admin approves the case in `/admin/refunds`

Open the case, approve it with the refund amount, and add a resolution
note. Then verify — do not assume:

- A **negative `commission_adjustments` row** was recorded for the refund
  (ask a developer to check, or confirm in the next settlement batch that
  the entry's remaining commission is reduced).
- If the refund consumed the whole commission, the entry flipped to
  `reversed`.

Approving a case does **not** move the suborder to `returned` and does
**not** restock. Both are separate manual steps below.

### d. Separately move the suborder delivered → returned

On the admin order detail page (`/admin/orders/[id]`), change the suborder
from `delivered` to `returned`, choosing a reason code (a note is required
if the reason is "other"). Say it plainly to the customer if asked: refund
approval alone does not change the order status; this step does.

Do this only after step (b): if the commission is still in a settlement,
this change raises and the suborder stays `delivered`.

### e. Restock ONLY if D-09 says so and the item is resaleable

- The vendor inspects the returned item first.
- **Resaleable:** the vendor (or an admin) adds the quantity back with
  `adjust_product_stock` — on the vendor inventory page — with a note
  naming the order reference (e.g. "Returned, inspected resaleable —
  GFT-…"). The movement is recorded as a manual adjustment.
- **Damaged, wrong, used, or not inspected:** do **not** restock. Stock
  stays decremented; the unit is not sellable.
- **Never** restock automatically, and never restock before inspection.
  There is no quarantine state in the system — an uninspected restock
  overstates sellable stock.

### f. Refund the customer — COD cash, off-system

Cash-on-delivery refunds happen **between the shop and the customer,
off-system**; the system records the approval, not the money movement.
Agree with the shop who hands the cash back and how, then record in the
log: refund amount, method (e.g. cash handed back by the shop), date, and
who paid it. If the customer was wronged (wrong/damaged item), the shop
also bears the return courier — see D-09 above.

---

## Return arrives AFTER payout — the honest procedure

This is the case the rule exists to prevent. If it happens anyway:

1. **The system cannot approve the refund.** `resolve_refund_case` will
   raise *"This commission is part of an active settlement…"* and there is
   no way around it in the product.
2. **The system cannot void the paid settlement.** Voiding raises *"A paid
   settlement cannot be voided."*
3. **Do NOT edit the paid settlement, its lines, or its totals — ever.**
   No manual database edit, no "correction" to the recorded total. The paid
   record is the audit trail.
4. **Record the case in the runbook log** (table below) with the paid
   settlement's ID, and handle the money by the D-08 agreed route: a
   **documented deduction from the vendor's next settlement**, recorded as a
   manual note on that settlement until N-01 ships the in-system clawback —
   or **direct repayment** by the vendor if there is no next settlement.
   Write the deduction into the next batch's note field and the log so the
   two records agree.
5. **Flag the case to the owner the same day.** A post-payout return is an
   owner-level exception, not a routine refund: same-day flag, with the
   order reference, the paid settlement ID, the refund amount, and the
   agreed recovery (next-settlement deduction or direct repayment).
6. Still move the suborder to `returned` (step d) and restock only after
   inspection (step e) — those steps are not blocked by the payout. Only
   the commission reversal is blocked, and that is what the deduction
   recovers.

---

## Runbook log — copy this table, one row per return

| Date | Order ref | Suborder | Refund case ID | Amount (EGP) | Commission effect | Restock (Y/N + movement) | Refund proof (amount / method / date / who paid) | Bank transfer ref (for the settlement) | Handled by | Owner notified (Y/N) |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |
| | | | | | | | | | | |
| | | | | | | | | | | |

Keep the filled log with the week's settlement records. The bank-transfer
reference column is the proof that "mark paid" was earned until P1-05
stores the reference in the system.

---

## What this runbook does not do

- It does not build returns tables, RPCs, or customer UI (P1-04 / N-01 /
  N-03 own that).
- It does not close CR-01 (returns/refunds/disputes) or CR-03 (settlement
  payout): both stay open. This runbook mitigates them for the pilot.
- It does not authorise editing a paid settlement or restocking without
  inspection — ever.
