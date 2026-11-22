> **SUPERSEDED — 2026-11-20 (P0-08).** This file describes the pre-Phase-2 system (before migrations 28–32). Its claims about refunds, the order audit trail, delivery coverage, the admin order detail page, legal pages, SEO, tags, and settlements no longer describe the current system. Current state: `README.md` (features and counts), `docs/HOSTED_STATE.md` (hosted state — the single source), `docs/DECISIONS.md` (owner decisions). Kept as a dated record; its findings were not edited.

# Gifto Marketplace — Decisions and Open Questions

**Audit date:** 2026-10-19  
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`  
**Related:** `docs/DECISIONS.md` (authoritative decision log), `docs/PHASE_2_PLAN.md` (Phase 2 plan)

---

## Confirmed Decisions (with evidence)

| ID | Decision | Date | Evidence | Status |
|----|----------|------|----------|--------|
| D-01 | Commission: per-vendor rate set by platform admin; snapshotted onto suborder at placement | 2026-10-18 | `docs/DECISIONS.md`; migration 6 `commission_entries.rate` snapshot; `place_order` snapshots `order_vendors.commission_rate` | DECIDED |
| D-02 | Commission base: product subtotal only (delivery fees and discounts excluded) | 2026-10-18 | `docs/DECISIONS.md`; migration 6 `base_minor` = `order_vendors.subtotal_minor`; CHECK constraint `amount_minor = round(base_minor * rate)` | DECIDED |
| D-03 | Customer identity: signed-in accounts required at launch; no guest checkout | 2026-10-18 | `docs/DECISIONS.md`; `place_order` raises 42501 for anon; `orders.user_id` nullable for future guest support | DECIDED |
| D-04 | Order lifecycle: `placed → confirmed → shipped → delivered`, plus `cancelled` / `returned`; per-shop suborders; parent status derived | 2026-10-18 | `docs/DECISIONS.md`; migration 5 `order_status` enum; trigger `assert_order_vendor_transition`; `src/lib/orders.ts` | DECIDED |
| D-05 | Stock: decrement at placement (row-locked, movement-audited); restock on cancellation | 2026-10-18 | `docs/DECISIONS.md`; migration 5 `place_order` triggers; migration 7 `inventory_movements` | DECIDED |
| D-06 | Delivery: free at launch (`delivery_fee_minor = 0`); fee model deferred | 2026-10-18 | `docs/DECISIONS.md`; migration 5 `delivery_fee_minor int not null default 0`; checkout UI shows "Free" | PARTIALLY DECIDED (model TBD) |
| D-08 | Commission earned on delivery confirmation; settlements are manual admin batch | 2026-10-18 | `docs/DECISIONS.md`; migration 6 `record_commission_on_delivery` trigger; `create_settlement` / `mark_settlement_paid` RPCs | DECIDED (cadence still open) |

**Not yet decided (blocked):**

| ID | Topic | Status | Blocks |
|----|-------|--------|--------|
| D-06 (final) | Delivery fee model for post-launch (flat per vendor, zone-based, weight-based, or free forever) | `BLOCKED_PENDING_OWNER_APPROVAL` | GM-P2-006 to GM-P2-008 |
| D-07 | Vendor subscription model: required or optional? Price, cadence, provider? Manual or automated? | `BLOCKED_PENDING_OWNER_APPROVAL` | GM-P3-009 to GM-P3-011 |

### Q-02 — Delivery fee model
**Question:** After launch, will delivery fees be: (a) flat fee per vendor, (b) zone/area-based, (c) weight-based, (d) free forever, or (e) another model? Who bears the fee in multi-vendor orders?

**Current state:** Free at launch (`delivery_fee_minor = 0`). D-06 decided free at launch; eventual model TBD.

**Impact:** Affects delivery fee configuration table, `place_order` calculation, checkout UI, and commission base (D-02 excludes delivery fees).

### Q-03 — Vendor subscription requirement
**Question:** Is a subscription required for a vendor to sell on Gifto, or is it optional? If required, what happens to vendors without an active subscription?

**Current state:** No subscription schema exists. D-07 blocked pending owner approval.

**Impact:** Affects `subscription_plans`, `vendor_subscriptions` tables, entitlement middleware, and vendor product write paths.

### Q-04 — Subscription pricing and cadence
**Question:** If subscriptions are implemented, what is the price, billing cadence (monthly/annual), and provider? Will payments be automated or manually managed?

**Current state:** No schema, no provider integrated. D-07 blocked.

**Impact:** Affects subscription revenue tracking (separate from commission), admin UI, and vendor entitlement checks.

### Q-05 — Settlement cadence
**Question:** How often should settlements be run (weekly, monthly, on demand)? What is the payout reconciliation process?

**Current state:** Manual admin batch via `create_settlement` / `mark_settlement_paid`. D-08 cadence open.

**Impact:** Affects settlement automation (GM-P4-012, GM-P4-013).

---

## Decisions Explicitly Out of Scope for MVP

The following are documented as **deferred** and should NOT be implemented in the MVP:

| Feature | Reason | Revisit condition |
|---------|--------|-------------------|
| Settlement automation | Manual batch acceptable for MVP | D-08 cadence decided |
| Guest checkout | Accounts required at launch (D-03) | Owner approves post-launch |
| Catalog extras (tags, variants) | MVP doesn't require variants | Product complexity warrants |
| COD never-collected auto-restock | Manual adjustment acceptable | COD collection issues arise |
| Email/SMS notifications | No provider integrated | Notification requirement confirmed |

---yes 

## How to Resolve an Open Question

1. **Owner reviews** `docs/DECISIONS.md` and this file.
2. **Owner provides answers** for each `BLOCKED_PENDING_OWNER_APPROVAL` item.
3. **Architect/Reviewer updates** the status to `DECIDED (YYYY-MM-DD, rationale)` in `docs/DECISIONS.md`.
4. **Implementation agent (OpenCode)** proceeds with the dependent schema or business-logic task.
5. **No migration or application code** that depends on a blocked decision may be written before resolution.

---

## Cross-references

- `docs/DECISIONS.md` — authoritative decision log (D-01 through D-08)
- `docs/project-audit/AUDIT_REPORT.md` — full audit report
- `docs/project-audit/IMPLEMENTATION_ROADMAP.md` — ordered phases
- `docs/project-audit/PHASE_TASKS.md` — actionable task backlog (GM-PX-YYY IDs)
- `docs/PHASE_2_PLAN.md` — Phase 2 plan (legacy)

### Q-06 — COD never-collected handling
**Question:** What happens when a COD order is delivered but never collected? After how many days should stock be restocked? Should this be automatic or manual admin review?

**Current state:** No automatic restock path. Manual adjustment via `adjust_product_stock`.

**Impact:** Affects inventory consistency and customer disputes (GM-P8-023, GM-P8-024).

### Q-07 — Guest checkout post-launch
**Question:** Should guest checkout be added after launch? If so, what is the order lookup mechanism (reference + email/phone verification)?

**Current state:** `orders.user_id` nullable (allows future), but `place_order` requires session. D-03 decided accounts required at launch.

**Impact:** Affects `place_order` RPC, guest lookup route, and RLS policies.

### Q-08 — Email/SMS notification provider
**Question:** Will Gifto use email notifications (order confirmations, status updates) or SMS? Which provider (if any)?

**Current state:** No notification provider integrated.

**Impact:** Affects customer experience and vendor/customer communication.
| D-08 (cadence) | Settlement cadence and payout reconciliation frequency | Open (manual batch acceptable for MVP) | GM-P4-012 to GM-P4-013 |

---

## Open Questions Requiring Owner Input

### Q-01 — Commission rate policy
**Question:** Is there a platform-wide default commission rate, or is every vendor's rate set individually by the platform admin? If per-vendor, what is the starting rate for new vendors?

**Current state:** Migration 1 sets `commission_rate numeric(5,4) not null default 0.1000` (10%). D-01 decided per-vendor rate set by admin, but the column default remains 10% for new vendors until an admin sets a rate.

**Impact:** Affects `vendors.commission_rate` column, `setCommissionRate()` admin action, and `place_order` snapshot behavior.