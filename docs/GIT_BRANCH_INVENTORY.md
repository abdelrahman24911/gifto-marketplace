# Gifto — Git Branch Inventory & PRs

- **Audit date:** 2026-11-24
- **Worktree:** `~/workspace/gifto-master-audit`, HEAD `54c780b`
- **Source:** specialist branch report (`/tmp/gifto-audit/branches.md`); read-only `git` commands against `~/workspace/gifto-build` (log, diff, ls-tree, branch -a). Remote refs as of last fetch 2026-11-23 23:00 UTC — no fetch was run in this audit.
- **Rules observed:** no branch was checked out, switched, pushed, merged, deleted, or reset anywhere. Local-only branches on the owner's machine are recorded as unverifiable, never invented.

## 1. Inventory — 9 distinct branch names

| Branch | HEAD | Ahead / behind main | Status |
|---|---|---|---|
| `main` | `b369412` | — (tip) | Current main; PR #1 merged 2026-11-23 02:33 EET |
| `muse/decision-closure-brevo` | `54c780b` | 58 ahead / 0 behind | **Holds unique work** (see §2); no PR ever; clean fast-forward candidate (merge-base = main tip) |
| `muse/gifto-autonomous-improvement` (local) | `17f6002` | 0 unique commits vs `54c780b` | **Verified ancestor of `54c780b`**; fully contained in decision-closure-brevo |
| `audit/master-project-audit` (this branch) | `54c780b` | 0 unique commits | Audit-docs branch; same HEAD as decision-closure-brevo |
| `muse/p0-fixes` (origin `7848ccd`; local `e4586b1`) | `7848ccd` | 0 ahead (merged) | Fully merged via PR #1; local copy is 3 commits behind origin (stale, not divergent) |
| `audit/phase-2-refunds-orders-seo` | `34f30a6` | 0 ahead (merged) | Fully merged (base of the P0 work) |
| `demo/catalogue-seed` | `473fa27` | 1 ahead / 85 behind | **Holds unique work** (see §3); demo-only; leave unmerged |
| `preview/search-overflow-security-headers` | `6d6e74a` | 0 ahead (merged) | Fully merged |
| `sprint-2.1/catalogue-readiness` | `8a6eb4d` | 0 ahead (merged) | Fully merged |

**Totals: 9 distinct branch names (4 local, 7 remote-tracking + `origin/HEAD`); 0 tags; 0 stashes; 6 of 9 fully merged into main; 3 lines hold unmerged work; 2 branches hold unique work; 2 branches have zero unique commits.**

## 2. `muse/decision-closure-brevo` @ `54c780b` — the line to merge

- 58 commits ahead of main, 0 behind; 185 files changed, +13,690/−781 vs main.
- Contains all Phase 2 work (mail-outbox worker, review stars, BreadcrumbList, LIKE escaping, 3a, i18n CI fix) plus the decision-closure docs (Brevo setup, i18n CI audit, hosted-courier investigation, decision-closure report, WIP inventory) and **two WIP preservation commits that must be scrutinised before merge** (see §4).
- Merge-base is the main tip, so it is a clean fast-forward candidate — but it must **not** be fast-forwarded or merged as-is. It needs a PR with CI green, and the two WIP commits resolved first (roadmap §5).
- No PR has ever been opened for it.

## 3. `demo/catalogue-seed` @ `473fa27` — demo-only, leave unmerged

- 1 commit ahead / 85 behind main; 170 files, +28,620 lines; only 3 files overlap with main's evolution.
- It is the source of the demo data (6 vendors, 36 products, demo accounts) and of the two paid settlements (synthetic fixtures). It is demo-only by design and must **never** be merged into main. Keep it as the seed reference.

## 4. The two WIP preservation commits (scrutiny)

### `dc5a59e` — "wip(admin): preserve hosted-schema degradation changes" (9 files, +319/−?)

Strips columns the author believed hosted lacked and adds PGRST205 "waiting for migration 54/64" warnings. Hosted verification in this audit proves the premise false — **all 15 degraded columns/tables are present on hosted**. The commit also bundles genuine new work: a new `src/app/vendor/reviews/page.tsx` (+282 lines) plus vendor nav entries.

- **Disposition: preserve as evidence; split apart; never merge as-is.** Extract the vendor-reviews page + nav entries into their own change; revert the degradations (vendor/orders courier columns, admin/settlements proof fields hard-coded null; re-check admin/orders and admin/refunds for the same pattern).
- Correction: `dc5a59e` never touched `admin/logistics/page.tsx` — its courier degradation is in `vendor/orders/page.tsx`; only `admin/logistics` was restored by fix 3a.

### `a876e85` — "wip(db): add legacy payout-proof backfill" (+16 lines)

Inserts a `LEGACY-<id>` backfill UPDATE into already-applied migration 36. Semantics are sound as SQL, but as an edit to an applied migration file it will never execute on hosted — and hosted verification proves it **already executed** as part of the 28–71 run (the applied statement matches the file including the backfill).

- **Disposition: preserve as evidence; the backfill must move to a new migration if a correction is needed, and the file edit must be reverted once the owner decides the forward correction.** See `FINANCIAL_INTEGRITY.md` §5. C1 and its rollback are both dead on hosted.

## 5. PR & CI history (public GitHub API, unauthenticated)

- GitHub API reachable unauthenticated (HTTP 200). **Exactly 1 PR ever:** PR #1, merged 2026-11-22 via true merge commit `b0b2fb1` (parents `5aee211` + `7848ccd`). It merged `muse/p0-fixes` into main (`5aee211..b369412`).
- Last 10 CI runs in the returned window: all `completed/success`, including the latest run on HEAD `54c780b` (see `CI_CD_AND_DEPLOYMENT.md`).
- Branch protection: **Unknown** — the endpoint needs auth (401). "All required to pass" is intent, not verifiable enforcement.

## 6. Unverifiable branches (recorded, not invented)

- **`codex/logistics-wip` @ `b71aa11`** (local-only on the owner's machine): does not exist in any checkout available here. Its described diff (removes 3 courier columns, `shipped_at` filter, zero-UUID search) is consistent with the 2026-11-23 handover record, but cannot be verified here. Its degradation *content* now exists in this tip as committed `dc5a59e` — which is verifiable and is what this audit scrutinises instead.
- **Other agents' uncommitted WIP** on the owner's machine: not available here; recorded as unverifiable. The audit branch itself is clean (`git status --porcelain` empty at setup).

## 7. Merge roadmap (proposed, not executed)

1. ~~Resolve hosted state~~ — **done in this audit** (migrations 1–71 applied, zero drift).
2. Extract the vendor-reviews page + nav entries out of `dc5a59e` into their own change; revert the degradations; re-run full gates (lint, typecheck, Vitest, build, RLS, i18n).
3. Owner/finance decision on the forward correction for the two LEGACY settlements; move any needed backfill/correction to a **new migration**; revert the `a876e85` file edit in the same commit as the decision.
4. Re-run gates on the cleaned branch; open a PR from `muse/decision-closure-brevo` to `main` (merge commit, **no squash** — the 58-commit history, including the WIP preservation commits, is evidence).
5. Merge with CI green; then delete redundant local branches (`muse/p0-fixes` local stale copy, `muse/gifto-autonomous-improvement` local — both fully contained). Leave `demo/catalogue-seed` unmerged, permanently.
6. No current doc describes this merge process (`docs/POST_MERGE_READINESS.md` is historical, 2026-11-20) — write one as part of step 4.
