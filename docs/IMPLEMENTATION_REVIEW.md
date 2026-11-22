> **SUPERSEDED — 2026-11-20 (P0-08).** This file describes the pre-Phase-2 system (before migrations 28–32). Its claims about refunds, the order audit trail, delivery coverage, the admin order detail page, legal pages, SEO, tags, and settlements no longer describe the current system. Current state: `README.md` (features and counts), `docs/HOSTED_STATE.md` (hosted state — the single source), `docs/DECISIONS.md` (owner decisions). Kept as a dated record; its findings were not edited.

# Gifto Marketplace — Implementation Review

**Purpose:** Record review findings and required fixes after each implementation task.  
**Rule:** A task is marked `APPROVED` only after the diff and test results have been reviewed against `docs/PHASE_2_PLAN.md`.  
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`  
**Related:** `docs/PHASE_2_PLAN.md`, `docs/DECISIONS.md`

---

## Baseline (pre-Phase 2 implementation)

**Repository state at start of Phase 2 planning:**
- Branch: `main`, clean at `origin/main` (commit `270b11b`).
- Uncommitted Phase 2a changes in working tree:
  - `supabase/migrations/00000000000002_account_provisioning_and_vendor_onboarding.sql` (new)
  - `supabase/tests/rls_onboarding_test.sql` (new)
  - `package.json` (modified: added `typecheck` script)
  - `src/lib/supabase/database.types.ts` (modified: added `apply_as_vendor` type)
  - `supabase/tests/rls_foundation_test.sql` (modified: seed data for auto-provisioning)
  - `README.md` (modified: docs updates)
- No `docs/` directory existed.
- No Vitest/test framework configured.
- No data model documentation existed.

**Security issues identified during Phase 0 audit (to be tracked as Phase 2 work):**
1. No guard against self-inserting a profile with `is_platform_admin = true` if an INSERT path is added later (trigger is UPDATE-only).
2. `is_vendor_staff` is a duplicate of `is_vendor_member`.
3. No `with_check` guard preventing a vendor owner from demoting themselves to `staff` (orphaning vendor management).
4. No service-role client (`src/lib/supabase/service.ts`) for bootstrapping/operations.
5. `commission_rate` hardcoded default of `0.1000` — business decision not yet approved.
6. No JS/TS test framework (only SQL RLS tests exist).

---

## Task Review Log

| Task ID | Task | Status | Reviewer | Findings | Required Fixes | Approved? |
|---------|------|--------|----------|----------|----------------|-----------|
| 2.0 | Commit Phase 2a working-tree changes | Completed (`663ad4d`) | — | — | — | Yes |
| 2.1 | Minimal Vitest setup | Completed (`347eda9`) | — | Pinned vitest@4 — v5 requires `@types/node` ≥22; project is on v20. 31 tests across money/cart/cart-store/slugify | — | Yes |
| 2.2 | Data model documentation | Completed (`docs/DATA_MODEL.md`) | — | — | — | Yes |
| 2.3 | Decision log | Completed (`docs/DECISIONS.md`) | — | D-01–D-06, D-08 decided; D-07 still blocked | — | Yes |
| 2.4 | RLS policy design (document) | Completed | — | Implemented as migrations 3–7 + suites | — | Yes |
| 2.5 | `categories` table migration | Completed (migration 4) | — | — | — | Yes |
| 2.6 | Parent order / suborder / order items | Completed (migration 5) | — | D-01–D-05 approved before implementation | — | Yes |
| 2.7 | Inventory + stock reservation | Completed (migrations 5, 7) | — | D-05 approved; audited `adjust_product_stock` door | — | Yes |
| 2.8 | Commission ledger + settlement | Completed (migration 6) | — | D-01, D-02, D-08 approved; automation deferred | — | Yes |
| 2.9 | Subscription model | Blocked | — | Awaits D-07 approval | — | — |
| 8.1 | Security hardening (migration 8) | Completed (`d74098c`) | — | Storage-policy `name` qualification bug found and fixed during catalog-suite extension; DELETE assertions must check row counts (RLS filters, does not raise) | — | Yes |
| 8.2 | Product image upload (migration 9 + UI) | Completed (`add89f5`) | — | Storage policies key off `objects.name` because `products.name` collides; storage stub must be applied as `supabase_admin` | — | Yes |

---

## Completed Task Reviews

*(Fill in as tasks are completed and reviewed. Template:)*

### Task 2.X — [Task name]

**Date:** YYYY-MM-DD  
**Reviewer:** Architect  
**Diff reviewed:** [files changed]  
**Tests run:** `npm test`, `npm run typecheck`, `npm run lint`  
**Results:** [pass/fail details]  
**Findings:** [what was found, good or bad]  
**Required fixes:** [list or "none"]  
**Verdict:** `APPROVED` / `CHANGES_REQUIRED`

---

## Open Issues

- Migrations 8–9 are container-verified but not yet applied to the hosted Gifto project (`supabase db push` pending).
- Subscription model (2.9) remains blocked on D-07 owner approval.
- Phase 0 findings 1–4 are resolved (migration 8 + `src/lib/supabase/service.ts`); findings 5–6 were business decision / framework items, both now closed.
- Remaining blocked decisions: D-07 (subscriptions), D-06 fee model, D-08 settlement cadence.

---