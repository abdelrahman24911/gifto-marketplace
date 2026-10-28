# Gifto Marketplace — Next Phase Plan

> **Historical note (2026-10-26):** this plan predates Phase 9A. Migrations 8-13 are now applied, guest checkout and failed-COD-delivery handling are implemented, and the eight Docker RLS suites plus the failed-delivery browser E2E have passed. See `docs/STATUS_REPORT.md`.

**Date:** 2026-10-19  
**Basis:** `docs/POST_MERGE_READINESS.md` (evidence) and `docs/OWNER_DECISIONS_BRIEF.md` (open decisions).  
**Naming:** deliberately not auto-numbered as "Phase 9" — the phase number should be agreed with the owner alongside the scope. Working title: **Launch Readiness**.  
**Rule:** nothing already completed is repeated; every task below traces to a gap confirmed by the post-merge audit.

---

## Phase theme

The marketplace feature set through commissions/inventory/hardening/images is implemented and independently verified at `357891e`. What stands between now and a real launch is: **(1) getting migrations 8–9 onto the hosted project, (2) making settlements operable by a human, (3) closing the COD-failure inventory gap, (4) three owner decisions that shape post-launch monetisation.** None of the remaining work is a rewrite; it is deployment, a small admin surface, and one guardrail.

---

## Workstream A — Deployment prerequisites (highest priority, no decisions needed)

Everything here is evidence-backed from `POST_MERGE_READINESS.md` §3.

| # | Task | Depends on | Acceptance criteria | Testing |
|---|---|---|---|---|
| A1 | Confirm hosted migration state: run `supabase migration list` against the linked Gifto project (`hqusykdyjpruysxezsrn`) | CLI login + project password (secrets stay local) | List shows migrations 1–7 applied; 8–9 pending (expected). If it shows otherwise, stop and reconcile before A2 | Read-only command; record output in the PR/commit message of A3 |
| A2 | Pre-push conflict checks on hosted (SQL, read-only): no existing triggers named `profiles_protect_platform_admin_insert` / `vendor_members_guard_last_owner`; no existing `product-images` bucket owned by another workflow | A1 | Both queries return empty / expected | Screenshot or pasted query results into the deploy notes |
| A3 | Apply migrations 8–9 via `supabase db push` (only ever to the Gifto project — never FL Tase3) | A1, A2 | `supabase migration list` shows 8–9 applied; no errors | `psql` smoke: `select tgname from pg_trigger where tgname like '%last_owner%' or tgname like '%platform_admin_insert%'` returns 2 rows |
| A4 | Hosted image-upload smoke test | A3 | As a vendor manager session: upload an image to a product, see it render on the public product page, delete it; anon can read the bucket URL; a second vendor's manager cannot upload into the first vendor's folder | Manual 5-minute checklist (mirrors storage tests 16–19, but through the real Storage API) |
| A5 | Seed the first platform admin (documented recipe: signup trigger auto-creates the profile; insert via `auth.users` with the self-elevation guard temporarily disabled — see `supabase/tests/rls_foundation_test.sql`) | A3 | A real admin account can sign in and open `/admin` | Manual sign-in |
| A6 | Docs sync pass: fix `STATUS_REPORT.md` push-status line and README's "migrations 1–7" prose (audit findings §2) | A3 | Docs state migrations 1–9 applied; no stale "pending push" claims | Review only |

**Out of scope for A:** local `supabase start` (still broken on this machine; the disposable-container workflow remains the local standard, per README).

---

## Workstream B — Owner decisions (parallel track; blocks only C2/C3 and post-launch monetisation)

| # | Task | Depends on | Acceptance criteria |
|---|---|---|---|
| B1 | Owner answers D-06, D-07, D-08 per `OWNER_DECISIONS_BRIEF.md` | Owner availability | `docs/DECISIONS.md` entries updated to `DECIDED (date, rationale)` |
| B2 | If D-07 ≠ "no subscription": design + migration for `subscription_plans` / `vendor_subscriptions` + entitlement checks — **separate phase, do not start until B1** | B1 | New plan entry with its own migration and RLS suite |

No schema or code may be written against a blocked decision (`DECISIONS.md` rule).

---

## Workstream C — Remaining MVP features (evidence: gaps confirmed in the audit)

| # | Task | Depends on | Acceptance criteria | Testing |
|---|---|---|---|---|
| C1 | **Admin settlements UI** — a `/admin/settlements` page: per-vendor earned-unsettled totals, "open settlement" (calls `create_settlement`), "mark paid" (calls `mark_settlement_paid`), list of past settlements with lines. The RPCs exist and are admin-gated; only the UI is missing (audit §5) | A3 (hosted parity) | Admin can run a full payout batch without SQL access; non-admin gets 403/redirect | Extend `rls_commissions_test.sql` only if new RPC wrappers are added; otherwise server-action tests + manual pass; Vitest for any pure formatting helpers |
| C2 | **COD-failure restock guard** (D-05 "still open") — define and implement the path for orders that never collect: smallest safe step is an admin/vendor "mark failed delivery → restock" transition reusing the existing restock trigger, or a documented manual `adjust_product_stock` runbook if the owner prefers no code | B1 (D-08/D-04 owners may want input); decision recorded in `DECISIONS.md` | No silent inventory drift: either an automated transition or an explicit, documented manual procedure | New assertions in `rls_orders_test.sql` for whichever transition is added |
| C3 | **Settlement cadence operationalisation** — the cadence chosen in B1 (D-08) becomes the schedule admins follow with the C1 UI; if automation is chosen, a scheduled job (deferred by recommendation) | B1, C1 | Documented cadence in README/DECISIONS; UI lists support it | Manual runbook test |

C1 is the only item here that is unconditionally buildable without owner input.

---

## Workstream D — Technical debt and testing gaps (schedule after A; none block launch)

| # | Item | Evidence | Notes |
|---|---|---|---|
| D1 | Review the 5 high npm audit advisories (all via `eslint-config-next`) | `npm audit --audit-level=high` | Dev-time only; plan an eslint-config upgrade rather than `audit fix --force` |
| D2 | Browser-level E2E for the write paths (signup → apply → approve → list → order → fulfil in → deliver → settle) | README limitation; audit §5 | Playwright against the hosted staging data or the disposable container's HTTP surface; this is the largest remaining verification hole |
| D3 | Server-action authorization tests (Vitest with mocked Supabase clients) | Only money/cart/slug covered by 31 unit tests | Priority: image actions, product delete, checkout action |
| D4 | Vitest 5 / `@types/node` ≥22 upgrade | Pinned to Vitest 4 for v20 types | One-line future upgrade once Node types move |
| D5 | Turbopack build on win32 | README | Track upstream SWC binary issue; `--webpack` remains the pinned path |
| D6 | Commit or retire `docs/project-audit/AUDIT_REPORT.md` (currently untracked, stale push-status line) | Audit §6 | Housekeeping |

---

## Workstream E — Post-MVP enhancements (explicitly *not* next phase)

- Delivery fees (D-06 direction; columns already reserved — `supabase/migrations/00000000000005_orders.sql` lines 39/72).
- Vendor subscriptions (D-07 option B/C; no schema exists).
- Settlement automation (D-08 option C).
- Catalog extras: tags, product options/variants (README "planned — not yet implemented").
- Guest checkout (D-03 deferred; `orders.user_id` already nullable).

---

## Suggested execution order

1. **A1–A6** (deployment) — no dependencies outside credentials.
2. **B1** (owner decisions) in parallel with A.
3. **C1** (settlements UI) immediately after A3; it is the last operational blocker.
4. **C2/C3** after B1 records the answers.
5. **D1–D6** interleaved as capacity allows; D2 (E2E) should land before any public launch marketing.

## Unresolved questions for the next planning session

1. Phase number/name and duration with the owner (this plan intentionally does not assume one).
2. Is there a staging Supabase project, or does `db push` target production directly? (Affects how A3/A4 are rehearsed.)
3. Who performs payouts operationally (bank batch owner) — this determines whether C1 needs multi-admin visibility or a single-admin flow.
4. Minimum payout threshold for settlements (matters only if D-08 trends toward automation).
