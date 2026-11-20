> **SUPERSEDED — 2026-11-20 (P0-08).** This file describes the pre-Phase-2 system (before migrations 28–32). Its claims about refunds, the order audit trail, delivery coverage, the admin order detail page, legal pages, SEO, tags, and settlements no longer describe the current system. Current state: `README.md` (features and counts), `docs/HOSTED_STATE.md` (hosted state — the single source), `docs/DECISIONS.md` (owner decisions). Kept as a dated record; its findings were not edited.

# Gifto Marketplace — Implementation Roadmap

**Audit date:** 2026-10-19  
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`  
**Branch:** `main` @ commit `347eda9`  
**Baseline status:** Phases 1–7 database migrations complete; complete first-pass app surface implemented; 3 commits ahead of origin (unpushed); migrations 8–9 container-verified but not yet on hosted project.

---

## Current Baseline

**Completed (DONE):**
- 9 migrations: foundations → onboarding → vendor directory → catalog → orders → commissions → inventory adjustment → security hardening → product image upload
- 7 RLS test suites (107 assertions), 31 Vitest unit tests
- 23 routes: public storefront, auth, customer cart/checkout/orders, vendor products/orders/inventory/images, admin vendors/categories/orders
- All business decisions D-01 through D-06 and D-08 decided (see `docs/DECISIONS.md`)
- D-07 (vendor subscriptions) blocked pending owner approval

**Immediate prerequisites before new feature work:**
1. Push 3 ahead commits to `origin/main`
2. Apply migrations 8–9 to hosted Gifto project via `supabase db push`
3. Review 5 high npm audit advisories

---


---

## Ordered Phases

| Phase | Title | Scope | Effort | Prerequisites |
|-------|-------|-------|--------|---------------|
| P-0 | Project Stabilization | Push unpushed commits, apply migrations 8–9, review npm advisories | XS | None |
| P-1 | Decision Resolution | Owner resolves D-06 (delivery fee model) and D-07 (subscription model) | XS | None |
| P-2 | Delivery Fee Implementation | Non-free delivery fee model (zone/flat per vendor) | S | P-1 (D-06) |
| P-3 | Subscription Model | Optional vendor subscriptions with entitlement checks | M | P-1 (D-07) |
| P-4 | Settlement Automation | Scheduled settlement runs, payout export/reconciliation | M | None |
| P-5 | Guest Checkout | Optional guest checkout with order reference + email/phone lookup | S | None |
| P-6 | Catalog Extras | Product tags, options/variants | M | None |
| P-7 | Browser E2E Tests | Playwright/Cypress for checkout, vendor flows, admin flows | M | P-0 |
| P-8 | COD Never-Collected Restock | Automatic restock or delivery-confirmation restock path | S | None |
| P-9 | Production Readiness | Monitoring, alerts, backup verification, deployment checklist | S | All prior phases |

---

## Phase Details

### Phase P-0 — Project Stabilization

**Business objective:** Ensure the codebase is backed up remotely, the hosted database has all migrations, and dependencies are secure.

**Current problem:** 3 commits ahead of origin (unpushed); migrations 8–9 not on hosted project; 5 unreviewed npm audit advisories.

**Scope:**
- Push `main` to `origin/main`
- Run `supabase db push` against Gifto project `hqusykdyjpruysxezsrn` to apply migrations 8–9
- Review 5 high-severity npm audit advisories; decide on fix strategy


### Phase P-1 — Decision Resolution

**Business objective:** Resolve the two open business decisions (D-06 delivery fee model, D-07 subscription model) so dependent schema work can proceed.

**Current problem:** D-06 and D-07 are `BLOCKED_PENDING_OWNER_APPROVAL` in `docs/DECISIONS.md`.

**Scope:** Owner review and decision on:
- D-06: Delivery fee model (flat per vendor, zone-based, weight-based, free forever?)
- D-07: Subscription required to sell or optional? Price, cadence, provider? Manual or automated?

**Files affected:** `docs/DECISIONS.md` (update status to DECIDED with date and rationale)

**Dependencies:** None

**Security considerations:** None (documentation only)

**Acceptance criteria:**
- D-06 and D-07 marked `DECIDED (YYYY-MM-DD, rationale)` in `docs/DECISIONS.md`

**Testing:** N/A

**Definition of Done:** Owner has provided answers; document updated

**Risks:** None

---

### Phase P-2 — Delivery Fee Implementation

**Business objective:** Implement a non-free delivery fee model for multi-vendor orders.

**Current problem:** Delivery is free at launch (`delivery_fee_minor = 0` hardcoded); D-06 eventual model TBD.

**Scope:**
- Add delivery fee configuration (per-vendor flat fee or zone-based)
- Update `place_order()` to calculate and snapshot delivery fees per suborder
- Update checkout UI to display delivery fees
- Update commission logic: delivery fees excluded from commission base (per D-02)
- Update admin UI to configure delivery fees per vendor

**Files affected:**
- New migration for delivery fee configuration table
- `supabase/migrations/00000000000010_delivery_fees.sql`
- `src/lib/catalog.ts` (delivery fee reads)
- `src/app/checkout/actions.ts` (pass delivery fee to place_order)
- Migration 5 `place_order` RPC update (if needed)
- `src/app/admin/` (delivery fee configuration UI)

**Dependencies:** P-1 (D-06 decision)

**Security considerations:** Delivery fees recalculated server-side; never trusted from client

**Acceptance criteria:**
- Delivery fee configured per vendor (or zone)
- Checkout shows delivery fee per vendor suborder
- Commission calculated on product subtotal only (delivery fee excluded)
- `npm run typecheck`, `npm run lint`, `npm test` pass

**Testing:** RLS test additions for delivery fee table; Vitest for fee calculation logic

**Definition of Done:** Delivery fees configured, calculated, and displayed; tests pass

**Risks:** Commission base integrity (must exclude delivery fees per D-02)

**Effort:** S

---

### Phase P-3 — Subscription Model

### Phase P-4 — Settlement Automation

**Business objective:** Automate settlement cadence and payout reconciliation.

**Current problem:** Settlements are a manual admin-driven batch; D-08 cadence open.

**Scope:**
- Scheduled settlement runs (cron or serverless)
- Payout export (CSV or bank transfer file format)
- Reconciliation report (settlements vs. commission entries vs. adjustments)
- `mark_settlement_paid` already exists; add payout tracking

**Files affected:**
- New migration for payout tracking fields (if needed)
- Serverless function or cron job for scheduled settlements
- `src/app/admin/settlements/` (new admin UI)
- Reconciliation report endpoint/page

**Dependencies:** None (builds on migration 6 settlements)

**Security considerations:** Settlement writes via SECURITY DEFINER RPCs only; admin-only

**Acceptance criteria:**
- Scheduled settlement run creates `open` settlements from `earned` uncommissioned entries
- Payout export generated per vendor per settlement
- Reconciliation report shows variance zero
- `mark_settlement_paid` records authorized payout

**Testing:** Vitest for settlement calculation logic; RLS tests for settlement tables

**Definition of Done:** Automated settlement cadence with payout export and reconciliation

**Risks:** Double-payout if automation and manual process overlap; reconciliation variance

**Effort:** M

---

### Phase P-5 — Guest Checkout

**Business objective:** Support optional guest checkout with order reference lookup.

**Current problem:** `place_order` requires signed-in session (42501 for anon); `orders.user_id` nullable (allows future).

**Scope:**
- Generate order reference for guest checkout
- Order lookup by reference + email/phone verification
- `place_order` accepts optional guest mode (no `user_id`)
- Guest order confirmation page (no login required)
- RLS: guest can read own order by reference only

**Files affected:**
- Migration 5 `orders.user_id` already nullable (no schema change needed)
- `place_order` RPC update for guest mode
- New route `/orders/[reference]` for guest lookup
- Checkout flow branch: login-required vs. guest

**Dependencies:** None

**Security considerations:** Guest order lookup requires email/phone verification; no ID enumeration

**Acceptance criteria:**
- Guest can place order without account
- Guest can look up order by reference + verification
- Authenticated users still required by default (D-03)
- RLS prevents guest from reading other orders

**Testing:** RLS tests for guest order access; Vitest for reference generation

**Definition of Done:** Guest checkout available as option alongside account checkout

**Risks:** Order reference enumeration; guest abuse

**Effort:** S

---

### Phase P-7 — Browser E2E Tests

**Business objective:** Add browser-level end-to-end test coverage for write paths.

**Current problem:** Write paths covered by DB suites only; no browser click-through tests.

**Scope:**
- Playwright or Cypress test suite
- Customer journey: browse → add to cart → checkout → order confirmation → cancel
- Vendor journey: apply → approve → add product → receive order → confirm/ship/deliver
- Admin journey: login → approve vendor → set commission → view orders
- Cross-vendor isolation: Vendor A cannot see Vendor B's orders

**Files affected:**
- New `tests/e2e/` directory (or `src/e2e/`)
- Test configuration (playwright.config.ts or cypress.config.ts)

**Dependencies:** P-0 (build must pass)

**Security considerations:** Test data uses synthetic customer data; no real PII

**Acceptance criteria:**
- E2E suite runs and passes against local or hosted preview
- All critical journeys covered
- Cross-vendor isolation verified in browser

**Testing:** The E2E suite itself

**Definition of Done:** E2E suite passes; included in CI

**Risks:** Test flakiness; maintenance burden

**Effort:** M

---

### Phase P-8 — COD Never-Collected Restock

**Business objective:** Handle COD orders that are never collected.

**Current problem:** No automatic restock path for undelivered COD orders; requires manual adjustment.

**Scope:**
- Define "never collected" threshold (e.g., N days after delivery attempt)
- Automatic restock or flag for manual review
- Customer notification (if notification system added later)
- Admin dashboard flag for undelivered COD orders

**Files affected:**
- New migration for COD collection tracking (if needed)
- Serverless function or cron for restock check
- `src/app/admin/orders/` flag for undelivered COD

**Dependencies:** None

**Security considerations:** Restock only for genuinely undelivered orders; audit trail

**Acceptance criteria:**
- Undelivered COD orders restocked after threshold
- Audit trail records restock reason
- Admin can see undelivered COD orders

**Testing:** Vitest for restock logic; RLS tests

**Definition of Done:** COD never-collected handling automated or flagged

**Risks:** Premature restock if delivery delayed; customer disputes

**Effort:** S

---

### Phase P-9 — Production Readiness

**Business objective:** Prepare for production launch with monitoring and operational controls.

**Current problem:** No monitoring, alerts, backup verification, or deployment checklist documented.

**Scope:**
- Error logging and alerting (Sentry or similar)
- Uptime monitoring
- Database backup verification
- Deployment checklist and rollback runbook
- Environment variable documentation for production

**Files affected:**
- `DEPLOY.md` or `docs/deployment.md` (create or update)
- Monitoring integration code (if any)

**Dependencies:** All prior phases

**Security considerations:** No secrets in logs; monitoring data sanitized

**Acceptance criteria:**
- Deployment checklist documented
- Rollback runbook tested
- Error alerting configured
- Backup verification procedure documented

**Testing:** Staging deploy test

**Definition of Done:** Production-ready with monitoring and rollback plan

**Risks:** Production incident without observability

**Effort:** S

---

## Phase Dependencies

```
P-0 → P-7 (build must pass for E2E)
P-1 → P-2 (D-06 decision needed for delivery fees)
P-1 → P-3 (D-07 decision needed for subscriptions)
P-3 → P-4 (subscriptions affect settlement revenue separation)
All phases → P-9 (production readiness)
```

---

## Priority and Rationale

| Priority | Phases | Rationale |
|----------|--------|-----------|
| P0 (Critical) | P-0 | Code not backed up remotely; DB not fully migrated; unreviewed advisories |
| P1 (High) | P-1 | D-06/D-07 block dependent schema work |
| P2 (Medium) | P-2, P-3, P-7 | Delivery fees, subscriptions, E2E tests are core marketplace gaps |
| P3 (Low) | P-4, P-5, P-6, P-8, P-9 | Automation, guest checkout, extras, COD restock, production readiness |

---

## Release-Readiness Gates

Before any production release:

- [ ] P-0 complete (code pushed, DB migrated, advisories reviewed)
- [ ] P-1 complete (D-06, D-07 decided)
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all pass
- [ ] RLS suites pass against hosted project (107 assertions)
- [ ] Migration 8–9 applied to hosted project
- [ ] Cross-vendor isolation verified (RLS + E2E if available)
- [ ] No secrets in client code, logs, or docs

---

## Deferred and Optional Features

| Feature | Reason for deferral | Revisit condition |
|---------|---------------------|-------------------|
| Settlement automation | Manual batch acceptable for MVP | D-08 cadence decided |
| Guest checkout | Accounts required at launch (D-03) | Owner approves post-launch |
| Catalog extras (tags, variants) | MVP doesn't require variants | Product complexity warrants |
| COD never-collected restock | Manual adjustment acceptable | COD collection issues arise |
| Email/SMS notifications | No provider integrated | Notification requirement confirmed |

---

## Effort Estimate Summary

| Size | Approximate effort | Assumptions |
|------|-------------------|-------------|
| XS | < 1 day | No new schema; git/DB operations only |
| S | 1–3 days | Minor schema + UI; limited RLS |
| M | 3–7 days | New tables, RPCs, UI pages, tests |
| L | 1–2 weeks | Multiple subsystems, complex RLS |
| XL | 2+ weeks | New integration, major architectural change |

Total estimated effort for all remaining phases: approximately 15–25 developer days (excluding P-9 production infrastructure setup).

### Phase P-6 — Catalog Extras

**Business objective:** Add product tags and options/variants.

**Current problem:** No tagging or variant system; products are single SKU with one price.

**Scope:**
- `product_tags` table + product-tag join table
- `product_variants` table (size, color, option name, price delta, stock)
- Product detail page shows variant selector
- Cart stores variant selection
- `place_order` snapshots variant details at purchase time

**Files affected:**
- New migration for tags and variants
- `src/lib/catalog.ts` (variant reads)
- `src/app/vendor/products/[id]/` (variant management UI)
- Product detail page variant selector
- Cart item type extended with variant

**Dependencies:** None

**Security considerations:** Variant stock validated server-side at checkout

**Acceptance criteria:**
- Products can have tags and variants
- Variant stock tracked independently
- Checkout snapshots variant name/price/stock
- `npm run typecheck`, `npm run lint`, `npm test` pass

**Testing:** RLS tests for tag/variant tables; Vitest for variant price calculation

**Definition of Done:** Tags and variants implemented end-to-end

**Risks:** Cart complexity with variant stock; `place_order` complexity increases

**Effort:** M

**Business objective:** Implement optional vendor subscriptions with entitlement checks.

**Current problem:** No subscription schema exists; D-07 blocked pending owner approval.

**Scope:**
- `subscription_plans` table (price, cadence, features)
- `vendor_subscriptions` table (status, start/end, plan reference)
- Entitlement check: can vendor list products without subscription? (per D-07 decision)
- Server-side entitlement middleware for vendor product writes
- Admin UI for subscription management
- Keep subscription revenue separate from order commissions

**Files affected:**
- New migration for subscription tables
- `src/lib/subscriptions.ts` (entitlement logic)
- Middleware or server action guards for vendor write paths
- `src/app/admin/` (subscription management UI)
- `src/app/account/` (vendor subscription view)

**Dependencies:** P-1 (D-07 decision)

**Security considerations:** Entitlement enforced server-side; subscription status never trusted from client

**Acceptance criteria:**
- Subscription plans and vendor subscriptions creatable via admin
- Vendor without subscription cannot create products (if D-07 decides required)
- Subscription status separate from commission ledger
- `npm run typecheck`, `npm run lint`, `npm test` pass

**Testing:** RLS tests for subscription tables; Vitest for entitlement logic

**Definition of Done:** Subscription schema + entitlement enforcement + admin UI

**Risks:** Vendor lockout if entitlement check is too strict; revenue tracking confusion with commissions

**Effort:** M
**Files affected:** None (git push + DB operation only)

**Dependencies:** None

**Security considerations:** Never push to FL Tase3 remote; never apply migrations to FL Tase3 database

**Acceptance criteria:**
- `git status` shows clean tree, `git log origin/main..main` is empty
- Hosted project reports migrations 8 and 9 applied
- npm audit advisories reviewed and dispositioned

**Testing:** `git status` clean; `supabase migration list` shows 8–9

**Definition of Done:** Code backed up remotely; DB fully migrated; advisories reviewed

**Risks:** `supabase db push` requires valid CLI login and project DB password
## Target Outcome

A production-ready multi-vendor gift marketplace for Egypt (Alexandria) with:
- Public catalog with search, categories, and shop browsing
- Customer cart, COD checkout, order tracking, and self-cancel
- Vendor onboarding, product/inventory management, order fulfillment
- Platform admin vendor approval, commission configuration, category management, order oversight
- Commission ledger with earn-on-delivery and manual settlement batching
- Full vendor isolation via RLS, audited stock adjustments, security-hardened profile/vendor management