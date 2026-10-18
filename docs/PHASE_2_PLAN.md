# Gifto Marketplace — Phase 2 Plan

**Source of truth:** This file is the shared plan between the Architect/Reviewer and the OpenCode implementation agent.  
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`  
**Branch:** `main` (clean at `origin/main`; uncommitted Phase 2a changes exist in working tree)

---

## Phase Context

### What is already done (committed, Phase 1)
- `supabase/migrations/00000000000001_gifto_foundations.sql` — profiles, vendors, vendor_members, vendor_status_history; RLS policies; SECURITY DEFINER helper functions; triggers for updated_at, platform-admin guard, vendor finance guard, status-history audit trail.
- `supabase/tests/rls_foundation_test.sql` — 11 RLS tests (A–K) for Phase 1 isolation.
- `src/proxy.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/database.types.ts` — Supabase clients and hand-written types.
- `package.json` — Next.js 16.4.2, React 19, TypeScript strict, Tailwind v4, Supabase, ESLint. Scripts: dev, build, build:turbo, start, lint. (No `test` script yet.)

### What is implemented but NOT yet committed (Phase 2a, working tree only)
- `supabase/migrations/00000000000002_account_provisioning_and_vendor_onboarding.sql` — `handle_new_user()` trigger + `apply_as_vendor()` SECURITY DEFINER RPC.
- `supabase/tests/rls_onboarding_test.sql` — 10 tests for account provisioning and vendor onboarding.
- `package.json` — added `"typecheck": "tsc --noEmit"` script.
- `src/lib/supabase/database.types.ts` — added `apply_as_vendor` function type.
- `supabase/tests/rls_foundation_test.sql` — seed data updated to rely on auto-provisioning via trigger.
- `README.md` — updated docs for typecheck alias and 0002 migration.

**Note:** These Phase 2a changes are uncommitted. The first implementation task should commit them before starting new work.

---

## Phase 2 Objectives

1. Add a minimal **Vitest** test framework for application-layer authorization and logic tests (no SQL container required).
2. Document the **data model** (parent order → vendor suborders → order items, inventory, commission ledger, optional subscription) before creating business-schema migrations.
3. Document all **unresolved business and architecture decisions** in `docs/DECISIONS.md` and mark them `BLOCKED_PENDING_OWNER_APPROVAL`.
4. Only after (1)–(3) are approved, proceed to minimal schema additions (e.g., `categories` table) as the safest first business-schema migration.

---

## Task Inventory

| ID | Task | Status | Risk | Depends On |
|----|------|--------|------|------------|
| 2.0 | Commit Phase 2a working-tree changes | `READY_FOR_IMPLEMENTATION` | Low | None |
| 2.1 | Minimal Vitest setup (`package.json`, `vitest.config.ts`, `npm test` script) | `READY_FOR_IMPLEMENTATION` | Low | None |
| 2.2 | Data model documentation | `READY_FOR_IMPLEMENTATION` | Low | None |
| 2.3 | Decision log (`docs/DECISIONS.md`) — unresolved business/architecture decisions | `BLOCKED_PENDING_OWNER_APPROVAL` | N/A | None |
| 2.4 | RLS policy design for order/vendor isolation (document only) | `READY_FOR_IMPLEMENTATION` | Low | 2.2 |
| 2.5 | `categories` table migration + RLS + types + RLS test | `READY_FOR_IMPLEMENTATION` | Low | 2.2, 2.4 |
| 2.6 | Parent order / vendor suborder / order items migration + RLS + types + RLS test | `BLOCKED_PENDING_OWNER_APPROVAL` | Medium | 2.2, 2.3 (commission rules), 2.4 |
| 2.7 | Inventory table + stock reservation logic (document only) | `BLOCKED_PENDING_OWNER_APPROVAL` | Medium | 2.2 |
| 2.8 | Commission ledger + settlement design (document only) | `BLOCKED_PENDING_OWNER_APPROVAL` | Medium | 2.3 |
| 2.9 | Subscription model design (document only) | `BLOCKED_PENDING_OWNER_APPROVAL` | Medium | 2.3 |

---

## Task Details

### Task 2.0 — Commit Phase 2a working-tree changes

**Objective:** Commit the already-implemented Phase 2a backend changes so the working tree is clean before new work begins.

**Scope:**
- `supabase/migrations/00000000000002_account_provisioning_and_vendor_onboarding.sql`
- `supabase/tests/rls_onboarding_test.sql`
- `package.json` (add `typecheck` script)
- `src/lib/supabase/database.types.ts` (add `apply_as_vendor` type)
- `supabase/tests/rls_foundation_test.sql` (seed update for auto-provisioning)
- `README.md` (docs update)

**Acceptance criteria:**
- `git status` shows clean working tree.
- Commit message follows existing convention (`feat: ...`).
- No application code or migration content is modified — only committed as-is.

**Test requirements:**
- `npm run typecheck` passes.
- `npm run lint` passes.

**Risk:** Low.

### Task 2.2 — Data model documentation

**Objective:** Document the full Phase 2+ data model before any business-schema migration is written.

**Scope:** New file `docs/DATA_MODEL.md` covering entities (profiles, vendors, vendor_members, vendor_status_history, categories, products, product images, inventory/inventory_movements, orders, order_vendors, order_items, commission_entries, commission_adjustments, settlements, settlement_lines, vendor_subscriptions, subscription_plans, admin_audit_log), relationships, purchase-time snapshots, order status state machine, stock model, commission model, and multi-vendor checkout.

**Acceptance criteria:**
- Every entity has columns, types, constraints, and ownership documented.
- Every relationship has cardinality and foreign-key direction documented.
- Order status transitions list the authorized role for each transition.
- Commission and subscription sections explicitly state "TBD — pending owner approval" where business rules are not yet decided.
- No code or migration is created in this task.

**Test requirements:** N/A (documentation only).

**Risk:** None (documentation).

**Dependencies:** None.

**Status:** `READY_FOR_IMPLEMENTATION`

---

### Task 2.3 — Decision log (`docs/DECISIONS.md`)

**Objective:** Record all unresolved business and architecture decisions so nothing is silently decided.

**Scope:** New file `docs/DECISIONS.md` listing each decision with title, why it matters, options considered, status (`BLOCKED_PENDING_OWNER_APPROVAL` or `DECIDED`), and owner input needed.

**Decisions to log (all `BLOCKED_PENDING_OWNER_APPROVAL` until owner responds):**
1. Commission rate — schema defaults to `0.1000` (10%). Approved rate? Per-vendor variance?
2. Eligible subtotal — product subtotal only, or also delivery fees? Discounts deducted before commission?
3. Customer identity — accounts required at launch, or guest checkout? If guest, how are orders linked?

### Task 2.4 — RLS policy design for order/vendor isolation (document only)

**Objective:** Document the RLS policy matrix for orders, order_vendors, order_items, inventory before migrations are written.

**Scope:** Document:
- Public: read active vendors and products only.
- Vendor members: read own vendor's suborders and items; update own vendor's suborder status (within allowed transitions).
- Platform admin: full read/write on all order/commission tables.
- Customer: read own orders only (authenticated) or order lookup by reference + verification (guest).
- Vendor A cannot read Vendor B's orders, items, stock, or commission.

**Acceptance criteria:**
- Policy matrix table with table, command, role, condition.
- No SQL is written in this task.

**Test requirements:** N/A (design document; SQL tests come with the migration).

**Risk:** None (documentation).

**Dependencies:** 2.2.

**Status:** `READY_FOR_IMPLEMENTATION`

---

### Task 2.5 — `categories` table migration (safest first business-schema migration)

**Objective:** Add a standalone `categories` lookup table — no dependencies on the order model, no financial impact.

**Scope:**
- New migration `supabase/migrations/00000000000003_categories.sql`:
  - `categories` table: id, name (not null), slug (unique), description, created_at, updated_at.
  - RLS: public read, platform admin write, vendor read own.
  - `set_updated_at` trigger.
  - Index on slug.

### Task 2.6 — Parent order / vendor suborder / order items migration

**Objective:** Implement the core multi-vendor order model.

**Scope:** BLOCKED until commission rules (D-01, D-02) and customer identity (D-03) are approved.

**Status:** `BLOCKED_PENDING_OWNER_APPROVAL`

---

### Task 2.7 — Inventory table + stock reservation logic (document only)

**Objective:** Document stock model before implementation.

**Status:** `BLOCKED_PENDING_OWNER_APPROVAL`

---

### Task 2.8 — Commission ledger + settlement design (document only)

**Objective:** Document commission and settlement rules before implementation.

**Status:** `BLOCKED_PENDING_OWNER_APPROVAL`

---

### Task 2.9 — Subscription model design (document only)

**Objective:** Document optional subscription model before implementation.

**Status:** `BLOCKED_PENDING_OWNER_APPROVAL`

---

## Execution Order (Recommended)

1. **Task 2.0** — Commit Phase 2a (clean working tree).
2. **Task 2.1** — Vitest setup (enables application-layer tests).
3. **Task 2.2** — Data model documentation (foundation for all schema work).
4. **Task 2.3** — Decision log (capture unresolved business decisions).
5. **Task 2.4** — RLS design document.
6. **Task 2.5** — `categories` migration (first safe schema addition).
7. **Tasks 2.6–2.9** — Blocked on owner approval of decisions.

---

## Acceptance Gates

Before moving from documentation to schema migrations:

- [ ] `docs/DATA_MODEL.md` exists and is reviewed.
- [ ] `docs/DECISIONS.md` exists with all decisions logged; owner has approved commission rate, customer identity, and order status transitions.
- [ ] `docs/PHASE_2_PLAN.md` is the shared source of truth and is up to date.
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all pass.

---

## Notes

- No migration is applied to any remote database during Phase 2 planning.
- No `.env.local` is read or committed.
- FL Tase3 repository is never touched.
- Financial rules (commission rate, eligible subtotal, settlement timing) are **not** decided here — they await owner approval.
- Update `src/lib/supabase/database.types.ts` with `categories` table type.
- Add RLS test: public can read all categories; anon cannot insert/update/delete; vendor cannot modify categories (platform admin only).

**Acceptance criteria:**
- Migration applies cleanly after migration 0002.
- `npm run typecheck` passes.
- RLS test passes against a local Supabase container (foundation + 0002 + 0003).
- No uncommitted changes left after the task.

**Test requirements:**
- RLS SQL test: public SELECT all categories; anon INSERT denied; vendor INSERT/UPDATE/DELETE denied; platform admin INSERT/UPDATE/DELETE allowed.

**Risk:** Very low — standalone lookup table, no FK to orders, no money involved.

**Dependencies:** 2.2 (data model doc), 2.4 (RLS design).

**Status:** `READY_FOR_IMPLEMENTATION`
4. Order status transitions — which roles can perform `confirm`, `prepare`, `dispatch`, `deliver`, `cancel`, `reject`?
5. Stock model — reserve-at-cart or decrement-at-checkout? Rollback on failure?
6. Delivery fees — flat per vendor, per order, weight-based, or free? Who bears multi-vendor fees?
7. Subscription — required to sell, or optional? Price/cadence? Manual or automated?
8. Settlement — when does commission become "earned"? How are settlements paid out?

**Acceptance criteria:**
- Every decision has a status field.
- No decision is marked `DECIDED` without owner approval.
- File is referenced from `docs/PHASE_2_PLAN.md`.

**Test requirements:** N/A.

**Risk:** None (documentation).

**Dependencies:** None.

**Status:** `BLOCKED_PENDING_OWNER_APPROVAL` (the document can be created, but the decisions within it are blocked)

**Dependencies:** None.

**Status:** `READY_FOR_IMPLEMENTATION`

---

### Task 2.1 — Minimal Vitest setup

**Objective:** Add a JavaScript/TypeScript test framework so application-layer authorization and logic can be tested without a database container.

**Scope:**
- `package.json`: add `vitest` to devDependencies, add `"test": "vitest run"` script.
- `vitest.config.ts`: alias `@/` → `./src`, environment `node`, include `src/**/*.test.ts`.
- At least one passing placeholder test (e.g., `src/lib/supabase/client.test.ts` or a simple math test) to confirm the framework works.

**Acceptance criteria:**
- `npm install` succeeds.
- `npm test` runs and passes (exit code 0).
- `npm run typecheck` still passes.
- `npm run lint` still passes.
- Test file(s) use only stdlib + vitest (no new runtime dependencies beyond vitest).

**Test requirements:**
- One placeholder test that asserts `true === true` (or equivalent) to validate the runner.
- Future tests will import `@/lib/supabase/server` and `@/lib/supabase/client` with mocked environment variables.

**Risk:** Low — adds a dev dependency and a config file only.

**Dependencies:** None.

**Status:** `READY_FOR_IMPLEMENTATION`