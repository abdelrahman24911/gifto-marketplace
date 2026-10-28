# Gifto Marketplace — Decision Log

**Purpose:** Record all unresolved business and architecture decisions.  
**Rule:** No decision is silently implemented. Anything marked `BLOCKED_PENDING_OWNER_APPROVAL` requires explicit owner approval before code or migration is written.  
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`  
**Related:** `docs/PHASE_2_PLAN.md`

---

## Format

Each decision entry:

- **ID:** e.g. D-01
- **Title:** short name
- **Status:** `BLOCKED_PENDING_OWNER_APPROVAL` | `DECIDED (YYYY-MM-DD, rationale)`
- **Why it matters:** impact on schema, security, or finance
- **Options considered:** brief list
- **Current schema default (if any):** what the code currently assumes, if anything
- **Owner input needed:** specific question for the owner

---

## D-01 — Commission rate

- **Status:** `DECIDED (2026-10-18, owner: per-vendor rate set by the platform admin; no platform-wide rate)`
- **Why it matters:** Affects vendor payouts, platform revenue, and the `commission_rate` column on `vendors`.
- **Options considered:** flat 10% for all vendors; per-vendor configurable rate; tiered rate by volume.
- **Decision:** Each vendor carries its own rate, set by a platform admin (the admin UI already
  exists). There is no platform-wide default rate. `place_order` snapshots the vendor's rate onto
  the suborder (`order_vendors.commission_rate`) so a later rate change cannot rewrite past orders.
- **Current schema default:** `commission_rate numeric(5,4) not null default 0.1000` (10%) — a
  Phase 1 *column* default. It only applies to newly inserted vendors; it is not a business rule.
- **Resolved (2026-10-18):** a brand-new vendor starts at the existing 10% column default until an
  admin sets a rate; no migration change.

## D-02 — Eligible subtotal for commission

- **Status:** `DECIDED (2026-10-18, owner: product subtotal only)`
- **Why it matters:** Determines what amount commission is calculated on. Affects `commission_entries` schema and reconciliation.
- **Options considered:** product subtotal only; subtotal + delivery fees; subtotal minus discounts; subtotal minus discounts + delivery fees.
- **Current schema default:** `order_vendors.subtotal_minor` holds the product subtotal only (delivery
  fee and discounts are separate columns, currently 0); the money phase uses it as the commission base.
- **Decision:** commission is calculated on the **product subtotal only**
  (`order_vendors.subtotal_minor`); delivery fees and discounts are excluded. `record_commission_on_delivery`
  computes `amount_minor = round(subtotal_minor * rate)` and a `CHECK` constraint enforces it, so no
  client can supply a rate, base or amount.


## D-05 — Stock model: reserve vs. decrement

- **Status:** `DECIDED (2026-10-18, implemented: decrement at placement, audited, restocked on cancellation; COD failure resolved 2026-10-26)`
- **Why it matters:** Affects inventory consistency, overselling protection, and rollback behavior on failed order creation.
- **Options considered:** reserve at cart add; reserve at checkout initiation; decrement only at order confirmation; decrement with movement history.
- **Decision:** `place_order` locks the product rows (`FOR UPDATE`), validates stock, and decrements in
  the same transaction, recording one `inventory_movements` row per line (`reason = 'order_placed'`).
  Cancelling a suborder restocks and logs `reason = 'order_cancelled'`. Nothing is reserved in the cart.
- **Resolved (2026-10-26):** a COD delivery that fails after dispatch moves `shipped -> cancelled`;
  the existing restock trigger returns every line to stock and logs `order_cancelled`. See D-04 and
  `supabase/migrations/00000000000013_failed_delivery.sql`.
- **Still open:** whether `delivered -> returned` should also restock; see D-09.

## D-09 - Delivered -> returned stock treatment

- **Status:** `BLOCKED_PENDING_OWNER_APPROVAL`
- **Why it matters:** A return can mean a resaleable unit is back in the shop, a damaged unit that
  must not be sold, or a unit still with the customer. `products.stock` is a single sellable count
  with no quarantine/bin state, so automatic restocking can overstate inventory.
- **Current behavior (2026-10-26):** `delivered -> returned` is platform-admin-only. The commission
  trigger reverses an unsettled `earned` entry, but no stock trigger runs. `products.stock` stays
  decremented, the original `order_placed` movement remains the only stock movement, and there is no
  `returned_at` timestamp column. The parent becomes `returned` only when every suborder is returned;
  mixed terminal outcomes become `partially_completed`.
- **Options considered:**
  1. **No automatic restock (current default).** Treat a returned unit as non-sellable until
     inspected. If it is resaleable, a manager records a manual `+quantity` through
     `adjust_product_stock` with a note. This needs no migration and avoids overstating sellable stock.
  2. **Automatic restock on return.** Add an idempotent `delivered -> returned` trigger that
     increments stock and writes an `inventory_movements` row with a new `order_returned` reason.
     This is simple for full, resaleable returns but wrong for damaged, lost, or partial returns, and
     it requires a separate migration plus tests.
  3. **Inspect-then-restock with a return/quarantine state.** Record received quantity separately,
     then move only inspected, sellable units into stock. This is the most accurate model but needs
     new schema and an operational workflow; it is larger than Phase 9B.
- **Inventory states today:**

| Event | `products.stock` | Inventory movement | Order state |
|---|---|---|---|
| Placement | `-quantity` | `order_placed` | `placed` |
| Failed COD (`shipped -> cancelled`) | `+quantity` | `order_cancelled` | `cancelled` |
| Delivered | unchanged | none | `delivered`; commission earned |
| Returned now | unchanged | none | `returned`; unsettled commission reversed |
| Manual resaleable return | `+quantity` | `manual_adjustment` with a note | unchanged |

- **Owner input needed:** Should a return automatically restore sellable stock, or must a shop
  inspect and manually restock? Are partial/quantity-level returns in scope (current status is
  suborder-level only)? Should `returned_at` and a dedicated `order_returned` movement reason be added?
- **Implementation note:** If approved, implement as a separate migration with idempotency and
  RLS/ACL tests; do not fold it into the failed-delivery path.

## D-06 — Delivery fee model for multi-vendor orders

- **Status:** `PARTIALLY DECIDED (2026-10-18)`
- **Why it matters:** Affects checkout totals, vendor suborder amounts, and commission base (see D-02).
- **Options considered:** flat fee per vendor; flat fee per order split across vendors; weight/area-based; free delivery.
- **Decision (2026-10-18):** delivery is free at launch — `delivery_fee_minor` is 0 on both the
  parent order and each suborder, so the total equals the product subtotal. Fulfillment is
  per-vendor: each shop delivers its own suborder, so a multi-vendor cart becomes one parent order
  with one suborder per shop. Any fee model will be added later, configured in Supabase.
- **Current schema default:** `delivery_fee_minor` exists on both `orders` and `order_vendors`;
  `vendors.delivery_coverage` (jsonb) is still unused.

## D-07 — Vendor subscription requirement and pricing

- **Status:** `BLOCKED_PENDING_OWNER_APPROVAL`
- **Why it matters:** Determines whether a vendor can sell without a subscription, and how subscription revenue is tracked separately from commission.
- **Options considered:** subscription required to sell; optional subscription with benefits; no subscription at launch (manual management).
- **Current schema default:** None — `vendor_subscriptions` and `subscription_plans` tables do not exist yet.
- **Owner input needed:** Is a subscription required to sell, or optional? If optional, what are the price and billing cadence? Is it managed manually or by an automated provider?

---

## Decisions Already Made (for reference, not for re-litigation)

| ID | Title | Decision | Source |
|----|-------|----------|--------|
| — | Multi-vendor checkout | Parent order + vendor-specific suborders; one checkout may contain products from multiple vendors | Product requirements (handoff §7) |
| — | Initial payment method | Cash on Delivery (COD) only; no card payments unless explicitly approved | Product requirements (handoff §8) |
| — | Geographic scope | Egypt, initial focus Alexandria | Product requirements (handoff §5) |
| — | Currency | EGP consistently; integer minor units for money where practical | Product requirements (handoff §8) |
| — | Separate repo + Supabase | Gifto has its own repository and Supabase project; never reuses FL Tase3 | Handoff §6.1 |
| — | Stack | Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase Auth/Postgres/RLS/Storage | Handoff §6.2 |

---

## How to Resolve a Blocked Decision

1. Owner reviews this file and provides answers for each `BLOCKED_PENDING_OWNER_APPROVAL` item.
2. Architect/Reviewer updates the status to `DECIDED (YYYY-MM-DD, rationale)` and records the rationale.
3. Implementation agent (OpenCode) can then proceed with the dependent schema or business-logic task.
4. No migration or application code that depends on a blocked decision may be written before resolution.

## D-08 — Commission earning and settlement timing

- **Status:** `DECIDED (2026-10-18, owner: earned on delivery confirmation)`
- **Why it matters:** Determines when commission moves from `pending` to `earned` and when settlements are paid out. Affects `commission_entries`, `settlements`, `settlement_lines`.
- **Options considered:** earned on delivery confirmation; earned on cash collection (COD); earned 14 days after delivery; earned immediately on order confirmation.
- **Decision:** commission is earned when the suborder reaches `delivered` (COD cash is collected on
  delivery, so the two coincide). Implemented in `supabase/migrations/00000000000006_commissions.sql`:
  the `order_vendors_record_commission` trigger writes one `earned` `commission_entries` row per
  delivered suborder; a return reverses an unsettled entry.
- **Still open:** settlement cadence and payout reconciliation (how often shops are paid out).
  Settlements are currently a **manual, admin-driven batch** (`create_settlement` collects a shop's
  `earned`, unsettled entries into one `open` settlement; `mark_settlement_paid` records the payout).
  Automating the cadence is deferred.

## D-03 — Customer identity and guest checkout

- **Status:** `DECIDED (2026-10-18, owner: signed-in accounts required at launch)`
- **Why it matters:** Determines whether `orders` links to `auth.users` (authenticated customers only) or supports guest checkout with a token/reference.
- **Options considered:** accounts required (Supabase Auth); guest checkout with order reference + email/phone lookup; both.
- **Decision:** ordering requires an account. `place_order` takes `user_id` from the session and raises
  `42501` for an anonymous caller. `orders.user_id` is nullable only so that deleting an account does
  not delete order history, and so a guest flow could be added later without a migration.
- **Superseded (2026-10-19, owner):** true guest checkout is now in scope. Guests can place a COD
  order with no Auth account. Implemented in `supabase/migrations/00000000000011_guest_checkout.sql`:
  a service-role-only `place_guest_order` writes `user_id = NULL` and stores only a SHA-256 hash of a
  browser-generated access token; the token lives in an HttpOnly, order-scoped cookie and confirmation
  is served by a token-gated `get_guest_order`. The existing authenticated `place_order` signature and
  behaviour are unchanged, and no anon/authenticated table privileges or RLS policies were weakened.

## D-04 — Order status transitions and authorized roles

- **Status:** `DECIDED (2026-10-18, owner: per-vendor suborder state machine)`
- **Why it matters:** Defines the state machine and who can move an order between states. Affects server-side authorization and vendor workflows.
- **Options considered:** `pending → confirmed → preparing → ready_for_delivery → out_for_delivery → delivered` with exceptions `cancelled`, `rejected`, `failed_delivery`, `returned`.
- **Decision:** statuses are `placed -> confirmed -> shipped -> delivered`, plus `cancelled` and
  `returned`. Each shop moves its own suborder; the parent order is derived automatically
  (`confirmed` once any shop starts, `delivered` only when every suborder is, `cancelled` only
  when every suborder is, `returned` only when every suborder is, and `partially_completed` when
  every suborder is terminal but the outcomes differ).
  - Vendor suborder: `placed -> confirmed | cancelled`; `confirmed -> shipped | cancelled`;
    `shipped -> delivered | cancelled`; `delivered -> returned` (platform admin only). The
    `shipped -> cancelled` path is the failed-COD-delivery case; it reuses the existing
    cancellation/restock trigger and stamps `cancelled_at` after `shipped_at`. Transitions are
    enforced by a trigger; invalid jumps raise `23514`.
  - `partially_completed` is parent-only; the suborder transition trigger rejects it.
  - Customer: may cancel the whole order only while it is `placed` (no shop has started).
  - Authorized roles: vendor manager/owner (or platform admin) for suborder transitions; order
    owner (or platform admin) for cancellation.
- **Current schema default:** implemented in `supabase/migrations/00000000000005_orders.sql`;
  failed-delivery extension in `supabase/migrations/00000000000013_failed_delivery.sql`.