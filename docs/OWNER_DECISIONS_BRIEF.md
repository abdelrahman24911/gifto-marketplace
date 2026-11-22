> **SUPERSEDED — 2026-11-20 (P0-08).** This file describes the pre-Phase-2 system (before migrations 28–32). Its claims about refunds, the order audit trail, delivery coverage, the admin order detail page, legal pages, SEO, tags, and settlements no longer describe the current system. Current state: `README.md` (features and counts), `docs/HOSTED_STATE.md` (hosted state — the single source), `docs/DECISIONS.md` (owner decisions). Kept as a dated record; its findings were not edited.

> **P0-08 note (2026-11-20):** the three decisions this brief asked about (D-06 remainder, D-07, D-08 remainder, plus D-09) were decided by the owner 2026-11-20 and recorded in `docs/DECISIONS.md`. Nothing in this brief is a decision.
# Gifto Marketplace — Owner Decisions Brief

**Date:** 2026-10-19  
**Purpose:** Give the owner exactly what is needed to resolve the three open decisions (D-06 remainder, D-07, D-08 remainder). Nothing here is decided on the owner's behalf — recommendations are marked as such and carry explicit assumptions.  
**Source of truth for statuses:** `docs/DECISIONS.md` (update statuses there once the owner answers).  
**Audience:** non-technical owner; each entry ends with the single question to answer.

---

## Context you can assume

- Launch model: **Cash on Delivery only**, signed-in customers only, Egypt (Alexandria focus), EGP.
- Revenue today: **per-vendor commission** (admin-set rate) earned **on delivery confirmation** — already decided (D-01, D-02, D-08 earning rule) and fully implemented.
- Every shop fulfils its own slice of a multi-vendor order (one parent order, one suborder per shop).
- The database already reserves columns for delivery fees on both orders and suborders (`delivery_fee_minor`, currently always 0) — no schema work is needed to *keep* fees at zero.

---

## D-06 — Delivery fee model (remainder: the future model)

**Status today:** partially decided — **free delivery at launch**. What remains undecided is the direction for when fees are introduced.

**The business question:** when Gifto starts charging delivery, how should the fee be computed and who bears it in a multi-vendor order?

**Options:**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| A. Flat fee per shop | Each suborder gets a fixed fee (e.g., EGP 30), set per vendor | Simple to explain to shops; matches per-shop fulfilment; commission base stays clean (D-02 already excludes fees) | Customers ordering from 3 shops pay 3 fees — can hurt conversion |
| B. Flat fee per order, split | One fee on the whole checkout, split across suborders for accounting | Best customer experience; one number at checkout | Splitting rule is arbitrary; shops may dispute their share; reconciliation noise |
| C. Zone/weight-based | Fee from governorate/distance or product weight | Most "correct" pricing | Needs data we don't have yet (weights, zone table); delays launch; heavier to implement |
| D. Stay free permanently | Absorb delivery into product prices | Simplest; conversion-friendly | Margin pressure; large/heavy gifts become unviable |

**Implications if/when introduced:**
- *Database:* columns already exist on `orders` and `order_vendors`; the CHECK constraint `total = subtotal + delivery_fee` already holds. A small migration would add a per-vendor fee setting and change `place_order` to accept/derive the fee.
- *App/UI:* cart and checkout must display the fee; order pages must show it per shop.
- *Commission:* unaffected — D-02 fixed the base as product subtotal only.
- *Not needed for launch:* nothing blocks going live with fees at zero.

**Dependencies:** none on D-07/D-08. D-02 already isolates commission from fees.

**Recommendation (not a decision):** **Option A (flat fee per shop), introduced only after launch data exists.** Assumptions: fulfilment stays per-shop; Alex-and-Cairo-only geography at first; shop count stays small enough that multi-shop fees won't shock customers. Start free, measure basket abandonment, then enable per-shop fees.

> **Owner question D-06:** "Keep delivery free through launch — agreed? And when fees come, is a simple flat fee per shop acceptable as the target model, or do you want a different rule (one fee per order / zone-based / stay free permanently)?"

---

## D-07 — Vendor subscription requirement and pricing

**Status today:** `BLOCKED_PENDING_OWNER_APPROVAL`. No schema exists; this is the only truly blocking decision in the log.

**The business question:** must a vendor pay (or have) a subscription to sell on Gifto, or is the marketplace commission-only?

**Options:**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| A. No subscription at launch | Commission-only revenue; admin approves shops manually | Zero friction for supply-side onboarding; fastest path to a full catalog; no billing integration needed | Single revenue stream; no recurring revenue cushion |
| B. Subscription required to sell | A shop cannot publish products (or its orders are blocked) without an active plan | Recurring revenue; filters unserious sellers | Needs billing (card rails we don't have — COD market, limited local card penetration), plan/proration logic, grace periods, dunning — a significant build; blocks supply onboarding |
| C. Optional subscription with perks | e.g., lower commission rate, more images, priority placement for subscribers | Soft monetisation without blocking supply | Requires entitlement checks across catalog/checkout; harder to explain; still needs billing |

**Implications:**
- *Database:* none for Option A. Options B/C need `subscription_plans` + `vendor_subscriptions` tables, entitlement checks in `place_order` and/or product publishing, and a billing provider (Stripe/Paddle/local) — none of which exist.
- *App/UI:* B/C need a vendor-facing billing page and admin plan management; A needs nothing.
- *Commission interaction:* Option C's "lower commission for subscribers" would interact with D-01's per-vendor rate — the rate already exists per vendor, so a subscription could simply drive that rate, but that policy would need defining.
- *Operations:* B adds a support burden (failed payments, refunds) before there is demand-side traffic.

**Dependencies:** none blocking on D-06/D-08. Option C's perk design would lean on D-01's per-vendor commission rate.

**Recommendation (not a decision):** **Option A — no subscription at launch.** Assumptions: the goal for the first months is catalog depth and order volume, not recurring revenue; there is no card-billing infrastructure in place and COD-first Egypt makes payment-provider setup a separate project; commission (D-01) already provides a revenue lever per shop. Revisit subscriptions once there are active shops and a reason for sellers to pay for upside.

> **Owner question D-07:** "Launch with commission only and no vendor subscription (Option A)? Or do you want a subscription to be required/optional — and if so, roughly what should it cost and what should it unlock?"

---

## D-08 remainder — Settlement cadence and payout reconciliation

**Status today:** earning rule decided (on delivery); **cadence open**. Settlements exist as a *manual admin batch*: an admin runs `create_settlement` for a shop (collects all earned, unpaid commission rows), then `mark_settlement_paid` when the payout happens. **There is currently no UI for this** — it is SQL/RPC only (confirmed gap in the readiness audit).

**The business question:** how often should shops actually be paid out, and who triggers it?

**Options:**

| Option | How it works | Pros | Cons |
|---|---|---|---|
| A. Manual, on-demand (current) | Admin creates a settlement whenever they decide (e.g., after a bank transfer batch) | Zero build; full control; fits early stage with few shops | Relies on admin discipline; no schedule shops can expect; no UI exists yet (small build regardless) |
| B. Fixed cadence, still manual-trigger | Admin runs a weekly/monthly batch; shops know the schedule | Predictable for shops; same mechanics as A | Still manual; needs calendar discipline |
| C. Automated cadence | A scheduled job opens settlements (e.g., every Monday for all shops above a minimum) | Hands-off; scales | Needs scheduling infra and payout minimums, refund/return edge cases (a return can reverse an unsettled entry — but not once settled), and higher stakes if the job misfires |

**Implications:**
- *Database:* A and B need nothing new — `create_settlement` / `mark_settlement_paid` already implement the flow, and returns already block reversal of settled entries (`23514`).
- *App/UI:* **All options need a small admin settlements page** (list entries per shop, open settlement, mark paid) — today it requires database access, which is not an operational model.
- *Cash-flow:* C pays out faster; A/B let the platform hold funds longer (a real, if modest, float consideration).
- *Vendor trust:* even A should publish an *expected* cadence to shops once the UI exists.

**Dependencies:** none on D-06/D-07. Earning-on-delivery (D-08 core) is already shipped.

**Recommendation (not a decision):** **Option B — fixed weekly cadence, admin-triggered — with a minimal admin settlements UI as the first build item.** Assumptions: shop count is small enough that a weekly manual run is minutes of work; a published schedule builds vendor trust without automation risk; automation (C) can follow once the manual flow has been exercised for a few cycles and minimum payout thresholds are known.

> **Owner question D-08:** "Should shops be paid on a fixed schedule (e.g., every Sunday for the prior week's delivered orders), or only when you decide case-by-case? Once you pick a cadence, we'll build the admin settlements page to match."

---

## Summary — three answers needed

| ID | One-line question | Recommended (yours to overrule) |
|---|---|---|
| D-06 | Free through launch — and flat-fee-per-shop as the future model? | Free at launch; Option A later |
| D-07 | Commission-only at launch, no vendor subscription? | Option A (no subscription) |
| D-08 | Fixed weekly payout cadence, admin-triggered? | Option B + admin settlements UI |

After the owner answers, update each entry in `docs/DECISIONS.md` to `DECIDED (YYYY-MM-DD, rationale)` and hand the dependent work to implementation per `docs/NEXT_PHASE_PLAN.md`.
