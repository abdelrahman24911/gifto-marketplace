# Gifto Marketplace — Phase Tasks

**Source:** `docs/project-audit/IMPLEMENTATION_ROADMAP.md`  
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`  
**All tasks initially set to TODO** unless existing work is demonstrably complete.

---

## Phase P-0 — Project Stabilization

### GM-P0-001 — Push unpushed commits to origin

**Priority:** P0 (Critical)  
**Dependencies:** None  
**Expected files:** None (git operation only)  
**Description:** The `main` branch is 3 commits ahead of `origin/main` (image upload, Vitest, hardening). Push these commits so work is backed up remotely.  
**Implementation guidance:** Run `git push origin main`. Verify remote is `https://github.com/abdelrahman24911/gifto-marketplace.git` (Gifto-specific, not FL Tase3).  
**Acceptance criteria:**
- `git status` shows clean working tree
- `git log origin/main..main` returns empty
- `git remote -v` shows the Gifto remote only  
**Testing requirements:** `git status` clean  
**Definition of Done:** All local commits pushed to origin/main  
**Status:** TODO

### GM-P0-002 — Apply migrations 8–9 to hosted Gifto project

**Priority:** P0 (Critical)  
**Dependencies:** GM-P0-001  
**Expected files:** None (Supabase CLI operation)  
**Description:** Migrations 8 (security hardening) and 9 (product image upload) are container-verified but not yet applied to the hosted Gifto project (`hqusykdyjpruysxezsrn`).  
**Implementation guidance:** Run `supabase link --project-ref hqusykdyjpruysxezsrn` then `supabase db push`. Migration 9 is re-runnable (`drop policy if exists`, `on conflict do nothing`).  
**Acceptance criteria:**
- `supabase migration list` shows migrations 8 and 9 applied
- No errors during `db push`  
**Testing requirements:** `supabase migration list` confirms 8–9 present  
**Definition of Done:** Hosted database has all 9 migrations applied  
**Status:** TODO  
**Risk:** Requires valid `supabase login` and project database password

### GM-P0-003 — Review 5 high-severity npm audit advisories

**Priority:** P1 (High)  
**Dependencies:** None  
**Expected files:** None  
**Description:** `npm audit` reports 5 high-severity advisories that are unreviewed. `npm audit fix --force` would introduce breaking changes, so each advisory must be reviewed individually.  
**Implementation guidance:** Run `npm audit` to list advisories. For each, determine if a fix is available without breaking changes, or document the risk acceptance.  
**Acceptance criteria:**
- Each of the 5 advisories has a disposition (fix applied, fix deferred with rationale, or risk accepted)
- No unreviewed high-severity advisories remain  
**Testing requirements:** `npm audit` output reviewed  
**Definition of Done:** All advisories reviewed and dispositioned  
**Status:** TODO

---

## Phase P-1 — Decision Resolution

### GM-P1-004 — Owner resolves D-06 (delivery fee model)

**Priority:** P1 (High)  
**Dependencies:** None  
**Expected files:** `docs/DECISIONS.md`  
**Description:** D-06 is `BLOCKED_PENDING_OWNER_APPROVAL`. Owner must decide: flat fee per vendor, zone-based, weight-based, free forever, or another model.  
**Implementation guidance:** Update `docs/DECISIONS.md` D-06 entry to `DECIDED (YYYY-MM-DD, rationale)`.  

---

## Phase P-2 — Delivery Fee Implementation

### GM-P2-006 — Add delivery fee configuration migration

**Priority:** P2 (Medium)  
**Dependencies:** GM-P1-004 (D-06 decided)  
**Expected files:** `supabase/migrations/00000000000010_delivery_fees.sql`  
**Description:** Create a delivery fee configuration table (per-vendor flat fee or zone-based) with RLS policies.  
**Implementation guidance:**
- Table: `delivery_fees` (vendor_id, fee_minor, currency, effective_from, is_active)
- RLS: public read active fees; vendor members read own; platform admin full access
- Index on vendor_id  
**Acceptance criteria:**
- Migration applies cleanly after migration 0009
- RLS policies restrict vendor access to own fees
- `npm run typecheck` passes  
**Testing requirements:** RLS test for delivery_fees table  
**Definition of Done:** Migration committed and typecheck passes  
**Status:** TODO

### GM-P2-007 — Update place_order to calculate delivery fees

**Priority:** P2 (Medium)  
**Dependencies:** GM-P2-006  
**Expected files:** `supabase/migrations/00000000000005_orders.sql` (place_order RPC update), `src/app/checkout/actions.ts`  
**Description:** Update `place_order` to calculate delivery fees from configuration and snapshot onto order_vendors. Delivery fees excluded from commission base (per D-02).  
**Implementation guidance:**
- `place_order` reads delivery fee config for each vendor in the cart
- Adds `delivery_fee_minor` to each order_vendor row
- Parent order `delivery_fee_minor` = sum of suborder fees
- Commission base remains `subtotal_minor` only  
**Acceptance criteria:**
- place_order calculates and stores delivery fees per suborder
- Commission calculation unaffected by delivery fees
- Checkout UI displays delivery fee per vendor  
**Testing requirements:** RLS orders test additions for delivery fee; Vitest for fee calculation  
**Definition of Done:** Delivery fees calculated server-side and displayed at checkout  
**Status:** TODO

### GM-P2-008 — Add delivery fee admin UI

**Priority:** P2 (Medium)  
**Dependencies:** GM-P2-006  
**Expected files:** `src/app/admin/` (new page or section)  
**Description:** Platform admin can configure delivery fees per vendor.  

---

## Phase P-3 — Subscription Model

### GM-P3-009 — Add subscription schema migration

**Priority:** P2 (Medium)  
**Dependencies:** GM-P1-005 (D-07 decided)  
**Expected files:** `supabase/migrations/00000000000011_subscriptions.sql`  
**Description:** Create `subscription_plans` and `vendor_subscriptions` tables with RLS.  
**Implementation guidance:**
- `subscription_plans`: id, name, price_minor, currency, cadence, features (jsonb), is_active
- `vendor_subscriptions`: id, vendor_id, plan_id, status, starts_at, ends_at, created_at
- RLS: public read active plans; vendor members read own subscription; platform admin full access  
**Acceptance criteria:**
- Migration applies cleanly
- RLS policies enforce vendor isolation
- `npm run typecheck` passes  
**Testing requirements:** RLS tests for subscription tables  
**Definition of Done:** Subscription schema committed  
**Status:** TODO  
**Blocked:** GM-P1-005 (D-07)

### GM-P3-010 — Implement entitlement logic

**Priority:** P2 (Medium)  
**Dependencies:** GM-P3-009  
**Expected files:** `src/lib/subscriptions.ts`  
**Description:** Server-side entitlement checks: can a vendor create products, receive orders, etc. based on subscription status.  
**Implementation guidance:**
- `checkSubscriptionEntitlement(vendorId)` → returns entitlement object
- Called in server actions/middleware before vendor write operations
- If D-07 decides subscription required, block product creation for unsubscribed vendors  
**Acceptance criteria:**
- Entitlement check enforced server-side (not client)
- Subscription status never trusted from client input
- `npm run typecheck` passes  
**Testing requirements:** Vitest for entitlement logic  
**Definition of Done:** Entitlement logic implemented and tested  
**Status:** TODO  
**Blocked:** GM-P3-009

### GM-P3-011 — Add subscription admin UI

**Priority:** P2 (Medium)  
**Dependencies:** GM-P3-009  
**Expected files:** `src/app/admin/` (subscription management section)  
**Description:** Platform admin can create plans, assign subscriptions to vendors, view subscription status.  
**Implementation guidance:** Add subscription management to admin dashboard. Protected by `requirePlatformAdmin`.  

---

## Phase P-4 — Settlement Automation

### GM-P4-012 — Add scheduled settlement runner

**Priority:** P3 (Low)  
**Dependencies:** None (builds on migration 6 settlements)  
**Expected files:** New serverless function or cron job  
**Description:** Automated settlement runs that collect `earned` commission entries into `open` settlements per vendor.  
**Implementation guidance:**
- Scheduled function (Vercel Cron or Supabase Edge Function)
- Queries `commission_entries` where status = 'earned' and not in any settlement
- Groups by vendor, creates settlement via `create_settlement` RPC  
**Acceptance criteria:**
- Scheduled run creates settlements from earned entries
- No double-settlement of already-settled entries
- Settlement total matches sum of entries  
**Testing requirements:** Vitest for settlement calculation logic  
**Definition of Done:** Automated settlement runner working  
**Status:** TODO

### GM-P4-013 — Add payout export and reconciliation

**Priority:** P3 (Low)  
**Dependencies:** GM-P4-012  
**Expected files:** `src/app/admin/settlements/`  
**Description:** CSV export of settlement lines; reconciliation report comparing settlements to commission entries.  
**Implementation guidance:**
- Export settlement lines as CSV per vendor
- Reconciliation page shows expected vs. actual payout
- Variance flagged for review  
**Acceptance criteria:**
- CSV export downloadable per settlement
- Reconciliation report shows zero variance when correct
- Admin can view settlement history  
**Testing requirements:** Vitest for reconciliation logic  
**Definition of Done:** Payout export and reconciliation working  
**Status:** TODO  
**Blocked:** GM-P4-012

---

## Phase P-5 — Guest Checkout

### GM-P5-014 — Update place_order for guest mode

**Priority:** P3 (Low)  
**Dependencies:** None  
**Expected files:** `supabase/migrations/00000000000005_orders.sql` (place_order RPC update)  
**Description:** Allow `place_order` to accept guest mode (no `user_id`) with order reference generation.  
**Implementation guidance:**
- `place_order` accepts optional guest flag
- Generates order reference (e.g., `GFT-XXXXXX`)
- `orders.user_id` remains nullable (already supported by migration 5)
- RLS allows guest to read own order by reference only  
**Acceptance criteria:**
- Guest order creation works without session
- Order reference generated and returned
- Guest cannot read other orders via RLS  
**Testing requirements:** RLS tests for guest order access  
**Definition of Done:** Guest order placement working  
**Status:** TODO

### GM-P5-015 — Add guest order lookup page

**Priority:** P3 (Low)  
**Dependencies:** GM-P5-014  
**Expected files:** New route `/orders/[reference]`  
**Description:** Guest can look up their order by reference + email/phone verification.  

---

## Phase P-6 — Catalog Extras

### GM-P6-016 — Add product tags migration

**Priority:** P3 (Low)  
**Dependencies:** None  
**Expected files:** `supabase/migrations/00000000000012_catalog_extras.sql`  
**Description:** Create `product_tags` table and product-tag join table with RLS.  
**Implementation guidance:**
- `product_tags`: id, name, slug, vendor_id (nullable for platform tags), is_active
- `product_tag_items`: product_id, tag_id
- RLS: public read active tags; vendor manages own tags; platform admin manages all  
**Acceptance criteria:**
- Migration applies cleanly
- RLS policies enforce vendor isolation for vendor-specific tags  
**Testing requirements:** RLS tests for tag tables  
**Definition of Done:** Tag schema committed  
**Status:** TODO

### GM-P6-017 — Add product variants migration

**Priority:** P3 (Low)  
**Dependencies:** GM-P6-016  
**Expected files:** `supabase/migrations/00000000000012_catalog_extras.sql` (same migration)  
**Description:** Create `product_variants` table with option name, price delta, stock.  
**Implementation guidance:**
- `product_variants`: id, product_id, option_name, price_delta_minor, stock, is_active
- `place_order` snapshots variant details at purchase time
- Cart stores variant selection  
**Acceptance criteria:**
- Products can have multiple variants
- Variant stock tracked independently
- Checkout validates variant stock server-side  
**Testing requirements:** RLS tests for variants; Vitest for variant price calculation  
**Definition of Done:** Variant schema committed  
**Status:** TODO  
**Blocked:** GM-P6-016

### GM-P6-018 — Add variant UI to product management

**Priority:** P3 (Low)  
**Dependencies:** GM-P6-017  
**Expected files:** `src/app/vendor/products/[id]/` (variant management)  
**Description:** Vendor can add/edit/delete variants for their products.  
**Implementation guidance:** Extend product form and product detail page with variant selector and management.  

---

## Phase P-7 — Browser E2E Tests

### GM-P7-019 — Set up E2E test framework

**Priority:** P2 (Medium)  
**Dependencies:** GM-P0-001 (build must pass)  
**Expected files:** `tests/e2e/` directory, test config  
**Description:** Install Playwright or Cypress and configure test runner.  
**Implementation guidance:**
- Choose Playwright (recommended for Next.js) or Cypress
- Configure test runner with base URL
- Add test fixtures for synthetic customer/vendor data  
**Acceptance criteria:**
- Test framework installed and configured
- `npm run test:e2e` script added to package.json  
**Testing requirements:** Framework smoke test passes  
**Definition of Done:** E2E framework ready  
**Status:** TODO

### GM-P7-020 — Write customer journey E2E tests

**Priority:** P2 (Medium)  
**Dependencies:** GM-P7-019  
**Expected files:** `tests/e2e/customer-journey.test.*`  
**Description:** Browse → add to cart → checkout → order confirmation → cancel.  
**Implementation guidance:**
- Test full customer flow with synthetic data
- Verify order confirmation page shows correct totals
- Verify cancel restocks inventory  
**Acceptance criteria:**
- Customer journey test passes end-to-end
- Order totals match expected values  
**Testing requirements:** E2E test run passes  
**Definition of Done:** Customer journey E2E test passing  
**Status:** TODO  
**Blocked:** GM-P7-019

### GM-P7-021 — Write vendor journey E2E tests

**Priority:** P2 (Medium)  
**Dependencies:** GM-P7-019  
**Expected files:** `tests/e2e/vendor-journey.test.*`  
**Description:** Apply → approve → add product → receive order → confirm/ship/deliver.  
**Implementation guidance:**
- Test vendor application and admin approval
- Test vendor product creation
- Test suborder status transitions  
**Acceptance criteria:**
- Vendor journey test passes end-to-end
- Vendor cannot access another vendor's data  
**Testing requirements:** E2E test run passes  
**Definition of Done:** Vendor journey E2E test passing  
**Status:** TODO  
**Blocked:** GM-P7-019

### GM-P7-022 — Write cross-vendor isolation E2E tests

**Priority:** P2 (Medium)  
**Dependencies:** GM-P7-019  
**Expected files:** `tests/e2e/cross-vendor-isolation.test.*`  
**Description:** Verify Vendor A cannot see Vendor B's orders, products, or commission.  
**Implementation guidance:**

---

## Phase P-8 — COD Never-Collected Restock

### GM-P8-023 — Define COD never-collected threshold and logic

**Priority:** P3 (Low)  
**Dependencies:** None  
**Expected files:** Migration + serverless function  
**Description:** Define threshold (e.g., 7 days after delivery attempt) for automatic restock or manual review flag.  
**Implementation guidance:**
- Track COD collection status on order_vendors
- Scheduled check for undelivered orders past threshold
- Restock inventory or flag for admin review  
**Acceptance criteria:**
- Threshold defined and documented
- Undelivered COD orders identified correctly  
**Testing requirements:** Vitest for threshold logic  
**Definition of Done:** COD never-collected logic defined  
**Status:** TODO

### GM-P8-024 — Add admin flag for undelivered COD orders

**Priority:** P3 (Low)  
**Dependencies:** GM-P8-023  
**Expected files:** `src/app/admin/orders/`  
**Description:** Admin dashboard shows undelivered COD orders requiring attention.  
**Implementation guidance:**
- Filter orders with status `shipped` or `delivered` but no collection confirmation
- Flag for manual review or automatic restock  
**Acceptance criteria:**
- Admin can see undelivered COD orders
- Restock action available with audit trail  
**Testing requirements:** Vitest for restock authorization  
**Definition of Done:** Admin COD flag working  
**Status:** TODO  
**Blocked:** GM-P8-023

---

## Phase P-9 — Production Readiness

### GM-P9-025 — Create deployment checklist and rollback runbook

**Priority:** P3 (Low)  
**Dependencies:** All prior phases  
**Expected files:** `DEPLOY.md` or `docs/deployment.md`  
**Description:** Document deployment steps, rollback procedures, and environment variables for production.  
**Implementation guidance:**
- Pre-deployment checklist (migrations, env vars, build)
- Rollback steps (revert migrations, disable features)
- Post-deployment verification  
**Acceptance criteria:**
- Checklist documented and reviewed
- Rollback procedure tested on staging  
**Testing requirements:** Staging deploy test  
**Definition of Done:** Deployment documentation complete  
**Status:** TODO

### GM-P9-026 — Configure error logging and alerting

**Priority:** P3 (Low)  
**Dependencies:** All prior phases  
**Expected files:** Monitoring integration code  
**Description:** Add error tracking (e.g., Sentry) and uptime monitoring.  
**Implementation guidance:**
- Integrate error monitoring with Next.js
- Configure alerts for critical errors (checkout failures, DB errors)
- Sanitize PII from error reports  
**Acceptance criteria:**
- Error monitoring configured
- Alerts routed to appropriate channel
- No customer PII in error reports  
**Testing requirements:** Test error capture on staging  
**Definition of Done:** Monitoring and alerting active  
**Status:** TODO

---

## Task Summary by Phase

| Phase | Tasks | Effort | Blocked by |
|-------|-------|--------|------------|
| P-0 | GM-P0-001, GM-P0-002, GM-P0-003 | XS | None |
| P-1 | GM-P1-004, GM-P1-005 | XS | Owner approval |
| P-2 | GM-P2-006, GM-P2-007, GM-P2-008 | S | GM-P1-004 |
| P-3 | GM-P3-009, GM-P3-010, GM-P3-011 | M | GM-P1-005 |
| P-4 | GM-P4-012, GM-P4-013 | M | None |
| P-5 | GM-P5-014, GM-P5-015 | S | None |
| P-6 | GM-P6-016, GM-P6-017, GM-P6-018 | M | Chain: 016 → 017 → 018 |
| P-7 | GM-P7-019, GM-P7-020, GM-P7-021, GM-P7-022 | M | GM-P0-001 |
| P-8 | GM-P8-023, GM-P8-024 | S | Chain: 023 → 024 |
| P-9 | GM-P9-025, GM-P9-026 | S | All prior |

**Total estimated effort:** ~15–25 developer days
- Login as Vendor A, attempt to access Vendor B's order IDs
- Verify 404/403 or empty results
- Verify Vendor A cannot modify Vendor B's products  
**Acceptance criteria:**
- Cross-vendor access denied in all cases
- RLS enforced at database level (verified via API calls)  
**Testing requirements:** E2E test run passes  
**Definition of Done:** Cross-vendor isolation E2E test passing  
**Status:** TODO  
**Blocked:** GM-P7-019
**Acceptance criteria:**
- Vendor can create variants for own products
- Variant stock visible on inventory page
- Checkout shows variant selection  
**Testing requirements:** Vitest for variant CRUD authorization  
**Definition of Done:** Variant management UI working  
**Status:** TODO  
**Blocked:** GM-P6-017
**Implementation guidance:**
- Page accepts order reference and contact phone/email
- Verifies against order record before displaying details
- No session required  
**Acceptance criteria:**
- Guest can view own order by reference + verification
- Wrong verification denied
- Order details displayed (status, items, total)  
**Testing requirements:** Vitest for verification logic  
**Definition of Done:** Guest order lookup working  
**Status:** TODO  
**Blocked:** GM-P5-014
**Acceptance criteria:**
- Admin can create/update subscription plans
- Admin can assign plans to vendors
- Vendor subscription status visible in admin  
**Testing requirements:** Vitest for admin action authorization  
**Definition of Done:** Subscription admin UI working  
**Status:** TODO  
**Blocked:** GM-P3-009
**Implementation guidance:** Add delivery fee configuration to admin page or new `/admin/delivery-fees` route. Protected by `requirePlatformAdmin`.  
**Acceptance criteria:**
- Admin can set/update delivery fee per vendor
- Changes reflected in checkout calculations
- Only platform admin can modify  
**Testing requirements:** Vitest for admin action authorization  
**Definition of Done:** Admin UI for delivery fees working  
**Status:** TODO
**Acceptance criteria:** D-06 marked `DECIDED` with date and rationale  
**Testing requirements:** None (documentation)  
**Definition of Done:** D-06 decision recorded  
**Status:** BLOCKED_PENDING_OWNER_APPROVAL

### GM-P1-005 — Owner resolves D-07 (subscription model)

**Priority:** P1 (High)  
**Dependencies:** None  
**Expected files:** `docs/DECISIONS.md`  
**Description:** D-07 is `BLOCKED_PENDING_OWNER_APPROVAL`. Owner must decide: subscription required to sell or optional? Price, cadence, provider? Manual or automated?  
**Implementation guidance:** Update `docs/DECISIONS.md` D-07 entry to `DECIDED (YYYY-MM-DD, rationale)`.  
**Acceptance criteria:** D-07 marked `DECIDED` with date and rationale  
**Testing requirements:** None (documentation)  
**Definition of Done:** D-07 decision recorded  
**Status:** BLOCKED_PENDING_OWNER_APPROVAL