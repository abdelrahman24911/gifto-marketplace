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
| 2.0 | Commit Phase 2a working-tree changes | Not started | — | — | — | — |
| 2.1 | Minimal Vitest setup | Not started | — | — | — | — |
| 2.2 | Data model documentation | Not started | — | — | — | — |
| 2.3 | Decision log | Not started | — | — | — | — |
| 2.4 | RLS policy design (document) | Not started | — | — | — | — |
| 2.5 | `categories` table migration | Not started | — | — | — | — |
| 2.6 | Parent order / suborder / order items | Blocked | — | Awaits D-01–D-05 approval | — | — |
| 2.7 | Inventory + stock reservation | Blocked | — | Awaits D-05 approval | — | — |
| 2.8 | Commission ledger + settlement | Blocked | — | Awaits D-01, D-02, D-08 approval | — | — |
| 2.9 | Subscription model | Blocked | — | Awaits D-07 approval | — | — |

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

- Phase 2a changes are uncommitted; working tree is dirty.
- No JS/TS test framework (blocks application-layer authorization tests).
- Six security/architecture findings from Phase 0 audit are not yet addressed (see Baseline above).
- All financial and customer-identity decisions (D-01 through D-08) are blocked pending owner approval.

---