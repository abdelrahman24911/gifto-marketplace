# Gifto — Agent WIP Inventory

**Date:** 2026-11-24
**Branch:** `muse/decision-closure-brevo` (created from
`muse/gifto-autonomous-improvement` at `8c90221`)
**Scope:** Read-only inventory of another agent's branches and uncommitted work
that shares this working tree. Nothing in this inventory was modified,
committed, merged, stashed, reset, or checked out by this mission.

## Current repository state

| Item | Value |
|---|---|
| Current branch | `muse/decision-closure-brevo` |
| HEAD | `8c90221` (`docs: record 3a completion and Codex logistics WIP location`) |
| Base branch | `muse/gifto-autonomous-improvement` at the same commit |
| `main` | `b369412` |
| Other-agent workaround branch | `codex/logistics-wip` at `b71aa11` |
| Working tree | Clean for this mission's committed files; the other agent's uncommitted changes are still present and must not be staged. |

This mission's own uncommitted files are separate and identifiable:
`.github/workflows/ci.yml`, `scripts/check-i18n-keys.mjs`, and the five new
`docs/*.md` files. They are not part of the other agent's WIP.

## Branch: `codex/logistics-wip` (`b71aa11`)

**Commit:** `b71aa11 chore(admin): degrade logistics page when courier columns are absent`
**Base:** `e1fa04f`
**Diff:** 1 file changed, 9 insertions, 13 deletions
**File:** `src/app/admin/logistics/page.tsx`

What it does:

- removes `courier_name`, `tracking_ref`, and `handed_over_at` from the
  `order_vendors` select;
- filters on `shipped_at` instead of `handed_over_at`;
- replaces the courier/tracking search with
  `.eq("id", "00000000-0000-0000-0000-000000000000")`;
- changes the description to say courier details appear after the hosted
  migration is applied.

Assessment:

- It is an **incomplete regression**, not a fix. The admin loses the handover
  evidence the courier migration was designed to provide.
- The impossible-UUID filter is not a search implementation.
- It conflicts with the completed 3a LIKE-escaping work and the shipped
  courier UI.
- **Never merge this branch** as a substitute for applying migration 42.

## Uncommitted WIP in the shared working tree

The following files were modified by another agent and are present in the
working tree. They form a coordinated “hosted schema is at migration 27”
degradation: they hide columns/tables that migrations 36, 52, 54, 63/64 add.

| File | Change | Risk / note |
|---|---|---|
| `e2e/admin/dashboard-mobile.spec.ts` | Adds `/admin/price-consent-refusals` and `/vendor/reviews` to the mobile route list. | Test coverage for new pages; harmless by itself, but the pages are uncommitted. |
| `src/app/admin/orders/page.tsx` | Removes `commission_clawbacks` from the select and passes `clawbacks: []` to `returnedCommissionNote`. | Hides clawback information; not a schema fix. |
| `src/app/admin/price-consent-refusals/page.tsx` | Handles `PGRST205` with a warning that migration 64 is not applied. | Masks the missing table; keeps the page from erroring. |
| `src/app/admin/refunds/page.tsx` | Removes migration-52 inspection/courier fields from the select. | Hides return-condition/payer data; not a fix. |
| `src/app/admin/reviews/page.tsx` | Handles `PGRST205` with a warning that migration 54 is not applied. | Masks the missing table. |
| `src/app/admin/settlements/page.tsx` | Removes migration-36/43 fields (`clawback_minor`, payout proof) and zeroes/nullifies them. | Hides financial reconciliation data; **high risk** if merged as-is. |
| `src/app/vendor/nav.ts` | Adds a Logistics link and a Reviews link. | Reviews page is new/untracked; Logistics route is a query filter. |
| `src/app/vendor/orders/page.tsx` | Removes courier/tracking, gift-wrap/message, preferred-delivery-date, and delivery-time-note fields and display. | Removes real customer/vendor information; not a fix. |
| `supabase/migrations/00000000000036_payout_proof.sql` | Adds a legacy backfill: for paid settlements missing proof, sets `paid_amount_minor = total_minor`, `transfer_method = 'other'`, `transfer_reference = 'LEGACY-' || substr(id::text,1,8)`, and a proof note. | **Financial data change.** It invents proof for rows that have none. Do not merge without owner/finance approval. |

### Untracked WIP

| Path | Size | Assessment |
|---|---:|---|
| `.github/copilot-instructions.md` | 1,087 B | Design/agent context file; not application code. |
| `.impeccable.md` | 1,087 B | Identical design-context text; not application code. |
| `MUSE_MISSION_REPORT.pdf` | 545,796 B | Generated report artifact; not part of the app. |
| `src/app/vendor/reviews/page.tsx` | 9,185 B | New vendor reviews page. English-only, not localized, no tests, and depends on migration 54. RLS restricts vendors to reviews on their own products, so the query is not a cross-vendor leak, but the page still needs review before merge. |

The vendor reviews page:

- uses `requireVendorRole(vendor)` and the caller's vendor scope;
- queries `product_reviews` with a product join and status/count queries;
- relies on the migration-54 RLS policy that lets shop members read reviews on
  their own products;
- handles `PGRST205` as “migration 54 not applied”;
- is English-only and uses hard-coded labels, consistent with the deliberate
  English-only dashboard limitation, but not localized;
- has no test coverage in the current WIP;
- is linked from the modified `src/app/vendor/nav.ts`.

## Other branches

| Branch | Local / remote | Commit | Assessment |
|---|---|---|---|
| `audit/phase-2-refunds-orders-seo` | local, ahead 3 of origin | `25eb506` | Older audit branch; origin at `34f30a6`. No active WIP observed. |
| `demo/catalogue-seed` | local and origin | `473fa27` | Demo seed assets; no active WIP observed. |
| `preview/search-overflow-security-headers` | local, origin/sprint-2.1 | `8a6eb4d` / `6d6e74a` | Preview branch; no active WIP observed. |
| `origin/muse/p0-fixes` | remote | `7848ccd` | P0 remediation docs; not checked out. |
| `origin/main` | remote | `b369412` | Integration base; do not modify. |

No other branch was checked out or modified during this inventory.

## Conflict risk

- The working tree is shared with another agent's uncommitted changes. A
  `git add -A`, `git stash`, `git reset`, or a broad checkout could capture or
  destroy that work.
- This mission must stage only explicit paths:
  `git add docs/DECISION_CLOSURE_REPORT.md ...` and the i18n/CI files.
- If a merge/rebase/checkout conflict appears, stop and report; do not resolve
  it by discarding the other agent's work.
- The migration-36 backfill is the highest-risk item because it changes
  financial records and could be mistaken for a harmless migration fix.

## Recommendations

1. **Preserve the WIP** until the owner or the other agent decides what to do
   with it.
2. **Do not merge `codex/logistics-wip`** or the uncommitted degradation as a
   substitute for applying migrations 28–71.
3. **Review the migration-36 backfill with owner/finance** before any use. It
   invents proof fields for two paid settlements; that is a business decision,
   not a code cleanup.
4. **Review the vendor reviews page** for localization, tests, navigation, and
   the migration-54 dependency before merging.
5. Keep this mission's docs/CI changes separate from the WIP and commit only
   explicit paths.

## Evidence

```powershell
git status --short --branch
git branch -a -vv
git log --oneline --decorate --all -15
git show --stat --oneline codex/logistics-wip
git diff --stat
git diff -- <each WIP file>
```

Observed on 2026-11-24. Sizes are from `Get-ChildItem`; diff counts are from
`git diff --stat`.
