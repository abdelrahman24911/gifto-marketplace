# Gifto Marketplace — Consolidated Analysis of the 13 Audit Documents and Execution Plan

- **Status:** Analysis complete. Phase 1 containment, P1-3 vendor PII masking, and P1-4 pending vendor invitations are implemented in the working tree (uncommitted). Phase 2+ owner decisions and P1-1/P1-2 remain pending. Migration 72 and its rollback were added locally but not applied to any hosted database; no CI config, environment value, branch, or hosted record was modified.
- **Date:** 2026-11-24
- **Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`
- **Remote:** `https://github.com/abdelrahman24911/gifto-marketplace.git`
- **Branch / HEAD:** `muse/decision-closure-brevo` at `54c780b`
- **Baseline:** `main` at `b369412`; branch is 58 ahead and 0 behind; merge-base is the `main` tip.
- **Scope:** Consolidate the 13 Muse audit documents, verify what is verifiable in this clone, identify contradictions, and produce one execution plan with owner decisions and acceptance criteria.
- **Deliverable mapping:** Part I replaces `THIRTEEN_DOCUMENTS_ANALYSIS.md`; Part II replaces `CONSOLIDATED_EXECUTION_PLAN.md`; Part III replaces `OWNER_DECISIONS_REQUIRED.md`. The owner requested all three in one file.

## How to read this document

Evidence labels used throughout:

| Label | Meaning |
|---|---|
| **VERIFIED HERE** | Checked directly in this clone at `54c780b` during this analysis (file content, git objects, a local command). |
| **DOC CLAIM** | Asserted by one or more source documents, usually about hosted Supabase, Vercel, GitHub settings, email, or monitoring. Not independently verified from this environment. |
| **CORRECTED** | A source claim contradicted by repository evidence in this clone. |
| **STALE** | A pre-existing document that predates the current branch state and should not be treated as current. |

Critical distinction: the source documents describe a live hosted verification performed on 2026-11-24. This environment has no hosted Supabase, Vercel, GitHub-settings, email, or monitoring access. Hosted facts are therefore recorded as **DOC CLAIM**, not as verified facts. They may well be correct; the plan must not depend on them until the owner supplies the evidence snapshot.

Safety boundaries observed by this analysis:

- No migration, correction script (including C1), or SQL was run against any hosted database.
- No production or staging environment was touched.
- No secret or environment value was read or printed. `.env.local` existence was checked with `Test-Path` only.
- No branch was switched, deleted, reset, rebased, or merged.
- No hosted migration, workflow, or hosted configuration was edited. Migration 72 was added locally and has not been applied. Phase 1, P1-3, and P1-4 source/test changes are listed in the implementation update below.
- No dependency installation, browser download, or Playwright browser run was performed; only `--list` was used to validate the E2E guard.

## Implementation update (working tree, uncommitted)

After the analysis was accepted, Phase 1 containment, P1-3 vendor PII masking, and P1-4 pending vendor invitations were implemented locally. Nothing was committed, pushed, or applied to any hosted environment.

| Item | Status | Evidence |
|---|---|---|
| E2E hosted-target guard | Implemented; blocks the current `.env.local` target | New `tests/assert-local-e2e-target.ts`; wired into `playwright.config.ts:67` and `tests/global-setup.ts`; with a loopback override, `--list` succeeds (51 tests, 9 files); with the existing `.env.local`, the lane exits 1 because it points at a non-local Supabase host; a deliberately hosted URL also exits 1 |
| Vendor orders list degradation | Reverted | `src/app/vendor/orders/page.tsx:145` selects courier, tracking, handover, gift, and delivery fields; rendering restored around lines 417–486 |
| Admin settlements list degradation | Reverted | `src/app/admin/settlements/page.tsx:127,183,192-195` selects and maps proof and clawback fields |
| Admin orders list degradation | Reverted | `src/app/admin/orders/page.tsx:121,445` restores `commission_clawbacks` |
| Admin refunds list degradation | Reverted | `src/app/admin/refunds/page.tsx:122` restores inspection fields used at lines 545–565 |
| Vendor reviews page and nav | Preserved | `src/app/vendor/reviews/page.tsx` remains 282 lines; Logistics and Reviews links remain in `src/app/vendor/nav.ts` |
| Admin reviews/refusals PGRST205 banners | Pending | Phase 1-04 waits for hosted confirmation that migrations 54 and 64 are applied |
| P1-3 vendor PII masking | Implemented; display-level | New `src/lib/vendor-pii.ts` plus 5 tests; `VendorSession.canViewCustomerPii`; vendor order/refund/overview lists mask name and phone, and the order list drops street address; detail pages show full contact to owner/manager/platform admin and masked contact to staff; staff notices updated |
| P1-4 vendor staff invitations | Implemented; local only; migration 72 unapplied | New `vendor_invitations` table, owner/admin RLS, `list_my_vendor_invitations`, and `accept_vendor_invitation`; staff actions create a pending invitation and never insert `vendor_members`; existing accounts get a `staff_invited` notice and accept from `/account/invitations`; new accounts get a `generateLink` invite redirecting to `/auth/accept-invite?next=/account/invitations`; acceptance creates the membership only after email confirmation; 10 new action tests and updated mail tests; RLS suite written but not executed (no Docker/local Postgres); hosted email-confirmation setting unverified |
| Gates | PASS (static); E2E list rerun | Typecheck, lint, Vitest 712/712 (81 files), build 55/55 static pages including `/[locale]/account/invitations`, i18n 788/648; loopback Playwright `--list` passes (51 tests, 9 files) and `git diff --check` exits 0 (CRLF normalization warnings only); browser E2E not run |
| Commit/push/hosted writes | None | Working tree only; no commit, no push, no SQL |

Guard verification found that the existing `.env.local` resolves to a non-local Supabase host (the production project). The default Playwright lane now refuses to start in the unmodified environment. This is the intended protection: before this change, the lane would have used the production project. To run the lane locally, set `NEXT_PUBLIC_SUPABASE_URL` to a loopback stack. No environment value was changed.

P1-3 is a display-level fix. The database RLS policies were not changed, so vendor members can still read customer fields directly through Supabase; closing that residual requires a policy or column-privilege change plus hosted verification.

Remaining work is owner-gated or later-phase: D-11 and the financial correction, P1-1/P1-2, P1-4 hosted apply and RLS verification, hosted Brevo configuration and monitoring, staging/backup evidence, and the final PR merge.

---

# Part I — Analysis

## 1. Executive verdict

The 13 documents are unusually strong audit material: specific, evidence-oriented, and self-aware about uncertainty. They agree on the core verdict:

| Verdict | Score |
|---|---|
| **NOT READY for public launch** | **75 / 100** |
| **CONDITIONALLY READY for a closed pilot**, subject to six conditions | |

The six pilot conditions, consolidated:

1. Revert the live `dc5a59e` degradation, preserve its genuine new work, and re-run the gates.
2. Decide and implement a forward correction for the two `LEGACY-` paid settlements, or explicitly accept the fabricated proof as the record.
3. Make Brevo SMTP live and verify a real send.
4. Make monitoring live: Sentry DSN plus a verified alert, and UptimeRobot monitors.
5. Merge the 58-commit line through a PR with CI green, using a merge commit and no squash.
6. Fix the four P1 security findings or record a written risk acceptance.

The three findings that dominate the score:

1. **The migration-36 backfill is committed and, per the documents, already executed on hosted.** C1 is dead on hosted; only a new forward correction or a backup/PITR restore can change the two paid settlements. This is both a financial-integrity issue and a decision-record issue.
2. **The `dc5a59e` degradation is live at HEAD.** Vendor and admin list surfaces hide data that the database records. The degradation is broader than several documents state: it also touches admin orders, admin refunds, admin reviews, and price-consent refusals. Detail pages remain intact.
3. **There is no staging environment, no backup/PITR drill, and no verifiable production deployment commit.** These are the structural reasons the public verdict remains NOT READY even though every runnable code gate is green.

What this analysis adds:

- The documents are directionally accurate about the repository, but several high-consequence specifics are wrong or stale: the scope of `dc5a59e`, the claim that `admin/logistics` was restored by `ec7d3bf`, the existence of `.env.local`, the branch inventory, the location of the supporting docs, and the reuse of the `R-04` identifier for two different risks.
- The hosted claims cannot be independently reproduced here. They should be treated as owner-supplied evidence, not as settled facts.
- The branch is in a good position to become the merge candidate, but only after containment and a recorded financial decision. It should not be merged as-is.

## 2. Source-document register

| # | Document | Role | Verdict | Key caveat or correction |
|---|---|---|---|---|
| 1 | `docs/MASTER_PROJECT_AUDIT.md` | Executive synthesis, scorecard, six pilot conditions | Strong; use as the primary narrative | Hosted verification is a DOC CLAIM here; the `admin/logistics` restoration claim is CORRECTED; supporting docs are in `docs/`, not `docs/audit/` |
| 2 | `docs/PRODUCT_FEATURE_MATRIX.md` | 100-feature inventory and status | Good inventory; use | Hosted-dependent statuses are DOC CLAIMS; V-14 PARTIAL is correct because the list UI hides courier data while the detail page shows it |
| 3 | `docs/ARCHITECTURE_AND_CODEBASE.md` | Stack, structure, module health, drift risks | Accurate; use | Counts and `force-dynamic` verified; no `middleware.ts`; `src/proxy.ts` exists |
| 4 | `docs/DATABASE_AND_MIGRATIONS.md` | Migration inventory, hosted verification, migration 36/42 | Best hosted evidence source | 71/55/18 counts verified; backfill is at lines 48–62, not 50–61; hosted claims are DOC CLAIMS here |
| 5 | `docs/FINANCIAL_INTEGRITY.md` | Money model, R-01–R-12, C1/backfill analysis | Deepest financial analysis; use | Hosted figures are DOC CLAIMS; `R-04` collides with a different R-04 in security/launch docs |
| 6 | `docs/SECURITY_AND_RLS.md` | Security findings, RLS coverage, P1 list | Specific and actionable; use | P0 closure depends on the hosted claim; Auth-dashboard, MFA, and Sentry items are UNVERIFIED here |
| 7 | `docs/GIT_BRANCH_INVENTORY.md` | Branch and PR inventory | STALE in this clone | Branch names, merge status, and `codex/logistics-wip` availability do not match this worktree |
| 8 | `docs/CI_CD_AND_DEPLOYMENT.md` | CI workflow, deployment state, env-var inventory | Accurate for CI; deployment unverifiable | CI run 45284623044 was previously verified green; no staging; branch protection and deploy commit remain unknown |
| 9 | `docs/TESTING_AND_QUALITY.md` | Gate re-runs, test inventory, gaps | Strong; use | Playwright was not run in the audit; 17 spec files exist but only the owner's 8/8 browser pass is reported |
| 10 | `docs/UX_PERFORMANCE_AND_I18N.md` | UX, performance, i18n | Good; use | i18n corrected to 648 keys / 788 calls; no Lighthouse/CWV timings exist anywhere |
| 11 | `docs/DOCUMENTATION_HEALTH.md` | 60-doc inventory, contradictions | Good contradiction inventory | Misses `.env.local`, the `admin/logistics` correction, and the `docs/audit/` path error |
| 12 | `docs/LAUNCH_READINESS.md` | Pilot vs public checklists, owner decisions | Use as the go/no-go checklist | Overlaps the master audit; hosted, legal, and external items remain unverified |
| 13 | `docs/MASTER_ROADMAP.md` | Phases 0–7 with task IDs and acceptance | Best planning base; use | Some tasks are superseded by the backfill and degradation; rebase after Phase 0 |

## 3. Document-by-document notes

### 3.1 `MASTER_PROJECT_AUDIT.md`

- Correctly identifies the three findings that matter: the migration-36 backfill, the live `dc5a59e` degradation, and the missing staging/backup/deploy evidence.
- The six pilot conditions are a sound gate. Use them as the program-level definition of “pilot-ready”.
- **CORRECTED:** it says only `admin/logistics` was restored (fix 3a, `ec7d3bf`). `ec7d3bf` is a LIKE-escaping fix, not a restoration. `dc5a59e` never touched `admin/logistics`, and that page is intact at HEAD (`src/app/admin/logistics/page.tsx:64` selects `courier_name`, `tracking_ref`, `handed_over_at`).
- **CORRECTED:** it says the supporting documents are in `docs/audit/`. In this clone all 13 are untracked files directly under `docs/`.
- The hosted verification table is a DOC CLAIM here. It is the single most important evidence to obtain from the owner before financial work starts.

### 3.2 `PRODUCT_FEATURE_MATRIX.md`

- The 100-feature inventory is useful and internally consistent: 4 DONE, 79 IMPLEMENTED, 11 PARTIAL, 2 BLOCKED, 4 NOT STARTED.
- V-14 (courier handover) is correctly PARTIAL: the hosted schema is claimed live, the vendor detail page shows courier fields, but the vendor list hides them because of `dc5a59e`.
- V-08 (Plant Pot) is a live-data issue, not a code defect. The product was deleted from the Nile Blossoms demo catalogue and has not been restored.
- Feature statuses that depend on hosted state cannot be re-verified here.

### 3.3 `ARCHITECTURE_AND_CODEBASE.md`

- Verified counts: 417 files under `src/`; `database.types.ts` is 2,516 lines; `mail.ts` is 1,146; `catalog.ts` is 1,011.
- Verified rendering model: the root layout declares `export const dynamic = "force-dynamic"` at `src/app/layout.tsx:89`.
- Verified request pipeline: there is no `src/middleware.ts`; `src/proxy.ts` exists and is the request-pipeline entry point described by the document.
- The structural risks are credible: hand-written database types, two god modules, and duplicated guest/signed-in order-detail paths.
- The document is a reliable architecture map; it does not need correction beyond the counts already checked.

### 3.4 `DATABASE_AND_MIGRATIONS.md`

- Verified counts: 71 forward migrations, 55 rollbacks, 18 RLS suites.
- Verified file state: the `a876e85` backfill is present at `supabase/migrations/00000000000036_payout_proof.sql:48-62`. It sets `paid_amount_minor = total_minor`, `transfer_method = 'other'`, `transfer_reference = 'LEGACY-' || substr(id::text, 1, 8)`, and a proof note for paid rows lacking proof, before the proof CHECK.
- **Minor correction:** the document cites lines 50–61; the executable block is lines 52–62 with its comment at 48–51. Cite 48–62.
- Hosted claims — all 71 versions applied, zero real drift, courier columns present, the backfill executed, two `LEGACY-` paid settlements — are DOC CLAIMS here.
- The claim that C1 is dead on hosted is logically consistent with the hosted claim, but it cannot be independently confirmed from this environment. Do not run C1 or its rollback.

### 3.5 `FINANCIAL_INTEGRITY.md`

- The strongest financial analysis in the set. It correctly separates the two paid settlements from the four owner-confirmed test orders and documents the C1 preconditions in detail.
- R-01 (physical return can never complete after payout), R-02 (migration-36/C1 ordering trap), and R-03 (fabricated proof with no flag column) are the high-severity money findings.
- **CORRECTED identifier collision:** in this document, `R-04` means “paid settlements are irreversible in-app”. In `SECURITY_AND_RLS.md` and `LAUNCH_READINESS.md`, `R-04` means the signed-in checkout quota fail-open decision (security P1-2). Use explicit names in tickets: “FIN R-04 paid irreversibility” and “SEC R-04 / P1-2 checkout fail-closed”.
- The hosted figures (two settlements, EGP 7,852.60, 11 lines) are DOC CLAIMS here.
- The recommendation is sound: do not run C1; record D-11; implement any correction as a new migration, never another edit that is expected to execute.

### 3.6 `SECURITY_AND_RLS.md`

- The P1 list is specific and matches the pilot conditions:
  - P1-1: app-level auth rate limiting is bypassable; Supabase Auth dashboard limits are unverified.
  - P1-2: signed-in checkout proceeds when the quota service is unavailable (fail-open); guests are blocked.
  - P1-3: vendor staff can read full customer PII; masking exists only in the admin orders list.
  - P1-4: vendor staff invites grant membership immediately, before acceptance or delivery.
- The P0 is closed only if the hosted migration claim is true. The residual finding is real regardless: the app has no runtime migration-version check, so future drift would be silent.
- P2/P3 findings are useful backlog items, but they are not pilot blockers by themselves.
- Dashboard-dependent items — Supabase Auth limits, MFA status, Sentry configuration — are UNVERIFIED here.
- P1-3 and P1-4 are code-level and credible; they should be fixed together because they compound each other.

### 3.7 `GIT_BRANCH_INVENTORY.md`

- **STALE in this clone.** Do not use its branch list or merge status as operational truth.
- Verified local state: 7 local branches; 7 remote heads (excluding `origin/HEAD`).
- Verified unique local work:
  - `codex/logistics-wip` at `b71aa11`, 7 behind HEAD, one obsolete admin-logistics degradation commit, not on the remote. It is present in this clone, contrary to the audit worktree note.
  - `muse/gifto-autonomous-improvement` at `8c90221`, fully contained in HEAD.
  - `audit/phase-2-refunds-orders-seo` at `25eb506`, 3 unpushed docs/CI-only commits ahead of its remote.
  - `demo/catalogue-seed` at `473fa27`, 1 ahead / 85 behind main; demo-only, never merge.
  - One stash: `stash@{0}` on `audit/phase-2-refunds-orders-seo`, a docs-only settlement-atomicity report.
- `audit/master-project-audit` does not exist in this clone, even though the audit document names it as the audited branch.
- `preview/search-overflow-security-headers` local and remote refs diverge, but both lines are fully merged.
- No branch deletion, reset, or rewrite should be based on this document. Phase 0 should produce a fresh inventory.

### 3.8 `CI_CD_AND_DEPLOYMENT.md`

- One workflow, three jobs, all green on HEAD per the previously verified GitHub run `45284623044` (2026-11-23 22:58 UTC). Not re-queried in this pass.
- `check:i18n` is wired into CI. This resolves the open Phase 2 question.
- No staging environment exists. Production is the first hosted target.
- The production deployment commit is unverifiable: the app returns HTTP 200 with correct headers but no commit/version marker.
- Branch protection is unknown (the endpoint requires authentication).
- Migration 67 ordering hazard is real: migration 67 must be applied before app code that reads `app_settings`, because the app fail-opens when the table is absent.
- Environment-variable names are documented; no values are present in the repository.

### 3.9 `TESTING_AND_QUALITY.md`

- The reported gate results are strong: lint PASS, typecheck PASS, Vitest 697/697 across 78 files, build PASS, i18n PASS, RLS 18/18, FIN-001 and H-01 concurrency PASS, C1 rehearsal PASS on a disposable database, node:test 13/13.
- Verified here: 78 Vitest files; 18 RLS suites; 17 Playwright spec files (8 under `e2e/`, 9 under `tests/`).
- Playwright was not run in the audit. The 8/8 browser pass is the owner's 2026-11-23 machine run, not a CI result.
- The `.env.local` caveat is correct and important: `.env.local` exists in this clone. Its contents were not read. The default Playwright lane is reported to read it and may target hosted. Do not run Playwright until the hosted-URL guard exists.
- Playwright is not in CI. The roadmap tasks for `--list`, a default-lane hosted-URL refusal, and storage-state reuse remain open.

### 3.10 `UX_PERFORMANCE_AND_I18N.md`

- Verified here: `node scripts/check-i18n-keys.mjs` returns OK with 788 translator calls, 648 shared keys. The older “788 keys” phrasing is wrong; it is 788 calls / 648 keys.
- No Lighthouse or Core Web Vitals timings exist anywhere. Performance statements are structural, not measured.
- The storefront is largely localized; auth forms, legal pages, and dashboards are English-only.
- F-01 (empty DOM on 404) is still present by construction. The document recommends either accepting it or funding a root-layout restructure; no blind retry.
- The homepage preview fan-out (up to 500 rows) and vendor analytics (up to 20k rows) are the main structural performance risks.

### 3.11 `DOCUMENTATION_HEALTH.md`

- The inventory is useful: 60 documents, 13 current, 11 stale-in-part, 25 self-flagged historical.
- Its #1 contradiction is correct and is the top issue in this consolidation: the committed and executed migration-36 backfill contradicts the owner-selected C1 path.
- **Gaps:** it does not catch the `.env.local` existence, the `admin/logistics` “restored” error, or the `docs/audit/` path mismatch.
- The recommendation to keep `DECISIONS.md`, `HOSTED_STATE.md`, `BREVO_SMTP_SETUP.md`, `I18N_CI_AUDIT.md`, and `MUSE_TEST_RESULTS.md` as living sources is sound, but each needs the corrections in this document.

### 3.12 `LAUNCH_READINESS.md`

- The P-1–P-15 public-launch checklist is the best go/no-go list in the set. Use it as the final gate.
- The owner-decision table is more complete than several other documents; it includes D-11, R-04, F-04, CAPTCHA/Auth limits, commission rate, SEO, legal, decision-closure items, delivery/same-day/return-courier, dashboard localization, and Brevo.
- The pilot operating constraints are practical: manual vendor onboarding, manual COD reconciliation, manual email fallback until Brevo is live, no new paid settlements without proof, and a freeze on further WIP-preservation commits.
- Hosted, legal, and external items remain unverified.

### 3.13 `MASTER_ROADMAP.md`

- The best planning base: Phases 0–7, task IDs, priorities, dependencies, affected files, risks, acceptance criteria, owner-approval flags, and autonomous flags.
- Several tasks are now superseded or need rebasing:
  - The C1 rehearsal is moot on hosted if the backfill ran; it remains useful only as a disposable-DB regression pattern.
  - The degradation revert is not a single task; it is a hand-revert of several files plus preservation of genuine work.
  - The migration-36 file-hygiene decision depends on D-11.
- The sequencing notes are still valid: Phase 0 first; Phases 1 and 2 can run in parallel once Phase 0 lands; Phase 3 is mostly owner-side and should start early; Phase 4 needs owner project access; the staging gate is the last gate before production.

## 4. Cross-document contradictions and corrections

| ID | Issue | Where it appears | What is actually true | Severity | Resolution |
|---|---|---|---|---|---|
| C-01 | Migration/RLS/i18n counts disagree: 66 migrations, 17 suites, 774 calls vs 71, 18, 788/648 | `README.md`, `docs/HOSTED_STATE.md` vs the audit set | 71 migrations, 55 rollbacks, 18 RLS suites, 788 calls / 648 keys verified here | Medium | Refresh stale docs in the Phase 5 docs pass; do not duplicate counts in README |
| C-02 | C1 was “selected” while a backfill was committed and executed | `FINANCIAL_INTEGRITY.md`, `DATABASE_AND_MIGRATIONS.md`, `MIGRATION_36_FINANCIAL_RECONCILIATION.md`, `DEMO_CONTAINMENT...` | The backfill is in migration 36 at HEAD; the hosted execution is a DOC CLAIM; C1 cannot run if that claim is true | Critical | D-11; new forward correction; do not run C1 |
| C-03 | “Migration 36 fails as written” | Older decision/closure docs | The committed backfill removes the failure mode; the file is self-consistent as SQL | High | Mark the older statement superseded; update in the same commit as D-11 |
| C-04 | The backfill is described as uncommitted WIP | `AGENT_WIP_INVENTORY.md`, `HOSTED_COURIER_SCHEMA_INVESTIGATION.md` | It is committed in `a876e85` and present at HEAD | High | Correct the inventory; add a banner to the migration file only after D-11 |
| C-05 | “Vendor/admin cannot see courier or proof data” | Several summaries | Only list surfaces are degraded; detail pages still show courier, gift, delivery, proof, and inspection fields | High | Revert the list degradations; verify detail pages stay intact |
| C-06 | `admin/logistics` was “restored” by `ec7d3bf` | `MASTER_PROJECT_AUDIT.md:67` | `dc5a59e` never touched `admin/logistics`; `ec7d3bf` only hardens LIKE escaping; the page is intact at HEAD | Medium | Correct the audit; no restoration work is needed for this page |
| C-07 | `.env.local` does not exist | Older testing notes | `.env.local` exists; contents not read | High | Add the hosted-URL guard before any Playwright run |
| C-08 | SMTP is undecided and the mail worker is missing | `MUSE_PRODUCTION_BLOCKERS.md` | Brevo was chosen 2026-11-23; the outbox worker exists; no account or real send is verified | Medium | Refresh the blockers doc; Phase 4 tracks the real send |
| C-09 | Branch inventory and merge status | `GIT_BRANCH_INVENTORY.md` | 7 local branches, 7 remote heads, codex present locally, audit branch absent, 3 unpushed commits, one stash | Medium | Fresh inventory in Phase 0; no destructive branch action |
| C-10 | Supporting docs are in `docs/audit/` | `MASTER_PROJECT_AUDIT.md:92` | All 13 are untracked in `docs/` root | Low | Move or re-link in the docs pass |
| C-11 | `R-04` means two different things | `FINANCIAL_INTEGRITY.md` vs `SECURITY_AND_RLS.md` / `LAUNCH_READINESS.md` | FIN R-04 = paid irreversibility; SEC R-04 = checkout fail-open decision | Medium | Use explicit names in every ticket and decision record |
| C-12 | Hosted state is presented as verified | Audit set | Not reproducible from this environment; DOC CLAIM here | High for planning | Owner supplies a read-only evidence snapshot before Phase 2 |
| C-13 | “788 keys” vs 648 keys | Older i18n notes | 788 calls across 648 shared keys | Low | Use calls/keys terminology |
| C-14 | Backfill line numbers 50–61 | `DATABASE_AND_MIGRATIONS.md` | Comment 48–51, executable block 52–62; cite 48–62 | Low | Fix citations |
| C-15 | Playwright “17 specs” vs “not run” | Testing docs | 17 spec files exist (8 `e2e/`, 9 `tests/`); only the owner's 8/8 browser pass is reported | Low | Keep the distinction between files, tests, and run evidence |

## 5. Verified repository baseline

Everything in this table was checked in this clone at `54c780b` unless marked otherwise.

| Fact | Value | Evidence |
|---|---|---|
| Branch / HEAD | `muse/decision-closure-brevo` at `54c780b` | `git rev-parse`, `git status` |
| Main / divergence | `b369412`; 58 ahead, 0 behind | `git rev-list --left-right --count main...HEAD` |
| Working tree at analysis start | 13 source audit docs plus this analysis file; no tracked modifications | `git status --porcelain=v1` |
| Working tree now | Phase 1 changes in 6 tracked files plus 2 new files (`tests/assert-local-e2e-target.ts`, this analysis); uncommitted | `git status --porcelain=v1` |
| Whitespace check | Clean | `git diff --check` exit 0 |
| Forward migrations | 71 | `supabase/migrations/*.sql` count |
| Rollbacks | 55 | `supabase/rollbacks/*.sql` count |
| RLS suites | 18 | `supabase/tests/*_test.sql` count |
| Vitest files | 78 | `src/**/*.test.ts(x)` count |
| Playwright spec files | 17 (8 `e2e/`, 9 `tests/`) | recursive spec count |
| `src/` files | 417 | recursive file count |
| `database.types.ts` | 2,516 lines | line count |
| `mail.ts` | 1,146 lines | line count |
| `catalog.ts` | 1,011 lines | line count |
| i18n | 788 translator calls, 648 shared keys | `node scripts/check-i18n-keys.mjs` |
| Root rendering | `force-dynamic` | `src/app/layout.tsx:89` |
| Middleware | No `src/middleware.ts`; `src/proxy.ts` exists | `Test-Path` |
| `.env.local` | Exists; contents not read | `Test-Path .env.local` |
| Migration-36 backfill | Present at lines 48–62 | file read |
| `dc5a59e` | 9 files changed; 319 insertions, 47 deletions | `git show --stat` |
| Vendor orders list | Restored: select includes courier, tracking, handover, gift, and delivery fields | `src/app/vendor/orders/page.tsx:144` |
| Vendor order detail | Select includes courier, gift, and delivery fields | `src/app/vendor/orders/[id]/page.tsx:47` |
| Admin settlements list | Restored: proof and clawback fields selected and mapped | `src/app/admin/settlements/page.tsx:127,183,192-195` |
| Admin settlement detail | Proof and clawback fields still selected and rendered | `src/app/admin/settlements/[id]/page.tsx:145,167-170` |
| Admin orders list | Restored: `commission_clawbacks` selected and passed to the note helper | `src/app/admin/orders/page.tsx:121,445` |
| Admin refunds list | Restored: inspection fields selected and still rendered | `src/app/admin/refunds/page.tsx:122,545-565` |
| Admin logistics | Intact; courier fields selected and rendered | `src/app/admin/logistics/page.tsx:64` |
| Vendor reviews | New 282-line page from `dc5a59e` | `src/app/vendor/reviews/page.tsx` |
| Vendor nav | Adds Logistics and Reviews links | `src/app/vendor/nav.ts` |
| Local branches | 7 | `git branch -vv` |
| Remote heads | 7 excluding `origin/HEAD` | `git branch -r` |
| Stash | One docs-only stash on the audit branch | `git stash list` |
| CI | 3 jobs; run 45284623044 green on HEAD (prior verification) | `.github/workflows/ci.yml`; GitHub API result from the audit |
| Hosted state | Not verified here | DOC CLAIM only |

## 6. Risk register

### 6.1 P0 — resolve before the branch merges or the pilot starts

| ID | Risk | Evidence | Impact | Phase |
|---|---|---|---|---|
| P0-1 | The two paid settlements carry fabricated `LEGACY-` proof, and C1 is dead on hosted | File backfill VERIFIED; hosted execution DOC CLAIM | False payout attestation on the money record; decision-record integrity | 0, 2 |
| P0-2 | `dc5a59e` degradation is live at HEAD | VERIFIED in five list surfaces | Pilot ships a UI that hides courier, proof, inspection, and clawback data that the database records | 1 |
| P0-3 | Playwright can target hosted because `.env.local` exists | VERIFIED existence; lane behavior DOC CLAIM | Test or fixture writes against a real project; data and quota damage | 1 |
| P0-4 | The decision log omits D-11, C1, Brevo, and the decision-closure items | `docs/DECISIONS.md` inspected in the audit | The branch contradicts its own record; future work cannot tell what was approved | 0 |
| P0-5 | No staging, no backup/PITR drill, no verifiable deploy commit | DOC CLAIM / external | Production is the first target; rollback and recovery are unproven | 0, 5 |

### 6.2 P1 — required before public launch; pilot may proceed only with written acceptance

| ID | Risk | Evidence | Impact | Phase |
|---|---|---|---|---|
| P1-1 | Auth rate limiting is bypassable; Supabase Auth limits unverified | Security doc; dashboard UNVERIFIED | Credential stuffing and signup abuse | 3 |
| P1-2 | Signed-in checkout fails open when the quota service is down | Security doc; code path | Unlimited orders, inventory exhaustion, fake COD | 3 |
| P1-3 | Vendor staff can read full customer PII | Security doc; masking only in admin orders | Privacy breach; shared staff accounts | 3 |
| P1-4 | Vendor staff invites grant membership before acceptance | Security doc; code path | Silent privilege grant to an existing account | 3 |
| P1-5 | Physical return can never complete after payout (FIN R-01) | Financial doc | Customer refund dead-end; manual exception only | 2 |
| P1-6 | Refund window opens at delivery, not resolve (F-04) | Financial doc | Policy mismatch; owner decision pending | 2 |
| P1-7 | Brevo is not live; no real send verified | CI/CD and launch docs | No order, status, refund, or support email | 4 |
| P1-8 | Sentry and UptimeRobot are not live | Launch docs | Blind to errors and downtime | 4 |
| P1-9 | No runtime migration-version check | Security doc residual | Future hosted drift is silent | 3 or 5 |
| P1-10 | Legal pages are drafts; SEO flip not done | Launch docs | Public launch trust and indexing gaps | 6 |

### 6.3 P2 — should fix before scale

- Documentation drift and duplicate counts.
- Dashboard localization (English-only by design or gap).
- Performance unmeasured: homepage preview fan-out, vendor analytics caps, no Lighthouse/CWV.
- F-01 404 empty DOM.
- No COD cash ledger or settlement reconciliation beyond UI arithmetic.
- No admin audit trail for mutations; silent email failures.
- No storage-policy tests, server-action authorization tests, CSRF negative test, or zod validation.
- Plant Pot still unrestored.
- GitHub PAT rotation still outstanding.

## 7. What is genuinely complete versus open

### 7.1 Complete or effectively complete

Per the source documents (database and hosted claims are not re-verified here):

- The 71-migration chain applies cleanly from scratch on a disposable database; 18 RLS suites pass 18/18.
- Money-path RPCs use row locks; FIN-001 settlement atomicity passes under concurrency.
- RLS is enabled on all 40 public tables; no `using(true)` policy; guest tokens are 256-bit, hashed, expiring, and single-use.
- Magic-byte upload validation covers all three upload surfaces.
- The i18n key guard is in CI; 788 calls / 648 keys are consistent.
- Review stars, BreadcrumbList, the mail-outbox retry worker, and LIKE escaping have landed.
- CI is green on HEAD; the 58-commit line is a clean fast-forward candidate against main.
- The vendor reviews page and its nav entry are genuine new work that should survive the degradation revert.
- Detail pages for vendor orders and admin settlements still expose the data the list pages hide.

### 7.2 Open or blocked

- D-11 and the financial correction.
- The `dc5a59e` revert and preservation of genuine work.
- The four P1 security fixes or written acceptance.
- Brevo account, domain, DNS, credentials, and a real send.
- Sentry, UptimeRobot, and outbox alerting.
- Staging, backup/PITR drill, branch protection, and deploy marker.
- Legal approval, SEO flip, dashboard localization, delivery/same-day/return-courier rules.
- Plant Pot restoration and GitHub PAT rotation.
- Documentation refresh and branch/stash cleanup.

---

# Part II — Consolidated Execution Plan

## 8. Guardrails

These apply to every task:

1. **No hosted writes without explicit owner approval.** No C1, no rollback, no migration application, no data correction, no settlement mutation.
2. **No edits to applied migrations that are expected to execute.** Any correction is a new migration. File-hygiene edits are documentation-only and must be recorded as an intentional divergence.
3. **No branch rewrite.** No reset, rebase, force-push, or deletion without a written owner decision.
4. **No secrets in the repository or in chat.** Environment values go into the hosting provider's secret store.
5. **No Playwright run until the hosted-URL guard is merged.** `.env.local` exists.
6. **Every task has a machine-checkable acceptance criterion.** “Works” is not acceptance.
7. **Merge only by PR, with CI green, using a merge commit and no squash.**
8. **Freeze rule:** no further WIP-preservation commits into migration files or degradation commits onto the merge line.

## 9. Sequence and dependencies

```
Phase 0 (decisions + evidence + freeze)
   |
   +--> Phase 1 (containment: guard + degradation revert + gates)
   |       |
   |       +--> Phase 2 (financial correction + R-01/F-04)
   |       +--> Phase 3 (security P1s)
   |       +--> Phase 4 (Brevo + monitoring)   [owner-side, start early]
   |
   +--> Phase 5 (staging, backup, deploy evidence, CI hardening)
           |
           +--> Phase 6 (legal, SEO, localization, policy, Plant Pot)
                   |
                   +--> Phase 7 (merge, deploy, verify, cleanup)
```

Parallelization:

- Phase 0 is a hard gate for Phases 1, 2, 5, and 7.
- Phase 1 is a hard gate for Phase 7.
- Phases 2, 3, and 4 can run in parallel after Phase 0; they touch different areas.
- Phase 4 is owner-heavy and has the longest lead time; start it on day 1.
- Phase 5 should start as soon as Phase 0 is underway; it needs owner project access.
- Phase 6 can start before Phase 5 finishes, but the SEO flip and public go/no-go wait for Phase 5.

## 10. Phase 0 — Decisions, evidence, and freeze

**Goal:** remove ambiguity before any code or data change.

| ID | Task | Priority | Owner / approval | Acceptance |
|---|---|---|---|---|
| 0-01 | Record D-11: choose a new forward correction, explicit acceptance of the `LEGACY-` proof, or a backup/PITR restore | P0 | Owner + finance | Written decision with rationale, evidence, and consequences in `docs/DECISIONS.md` |
| 0-02 | Record the remaining decisions: SEC R-04/P1-2, F-04, CAPTCHA/Auth limits, SEO, localization, decision-closure items, delivery/same-day/return-courier, Brevo, legal, Plant Pot, branch/stash disposition | P0 | Owner | Each is decided or explicitly deferred with a date and owner |
| 0-03 | Capture a read-only hosted evidence snapshot: migration versions, policy counts, the two settlements, courier columns, demo flag, backup/PITR status | P0 | Owner or owner-authorized operator | Snapshot stored outside the repo; no secrets; matches the claims in the audit or records the differences |
| 0-04 | Freeze: no hosted writes, no new migration-file WIP, no degradation commits, no branch rewrite until Phase 1 exits | P0 | Owner + maintainers | Freeze note in the repo; all contributors acknowledge |
| 0-05 | Produce a fresh branch and stash inventory with dispositions | P1 | Maintainer | Table of branch, tip, ahead/behind, unique work, owner, action |
| 0-06 | Confirm merge policy: PR, merge commit, no squash, CI green, post-merge verification | P1 | Owner | Policy recorded; PR template updated if needed |

**Exit criteria:** D-11 and the pilot-blocking decisions are written; the hosted evidence snapshot exists; the freeze is acknowledged; no hosted record has been changed.

## 11. Phase 1 — Containment

**Goal:** stop shipping a UI that hides real data, and make E2E safe.

| ID | Task | Priority | Depends | Acceptance |
|---|---|---|---|---|
| 1-01 | Add a hosted-URL guard to the default Playwright lane and global setup; fail unless the target is localhost/127.0.0.1, with an explicit opt-in for non-production remote targets | P0 | 0-04 | `npx playwright test` against a hosted URL exits with a clear error before any test runs; local lane still starts |
| 1-02 | Revert the `dc5a59e` degradations by hand, preserving the genuine work | P0 | 0-04 | List surfaces match their detail pages; vendor reviews, nav links, and mobile route coverage survive |
| 1-03 | Verify list/detail parity for courier, gift/delivery, proof, clawback, and inspection data | P0 | 1-02 | Manual checklist plus targeted tests; no field is selected but never rendered, or rendered but never selected |
| 1-04 | Remove the PGRST205 banners in admin reviews and price-consent refusals only after hosted migrations 54 and 64 are confirmed applied | P1 | 0-03, 1-02 | Banners gone; normal error states remain; evidence recorded |
| 1-05 | Re-run the full gate set and record results | P0 | 1-01..1-04 | Lint, typecheck, Vitest, build, i18n, RLS, and concurrency all green; results dated with commit |
| 1-06 | Add a regression note: no future degradation commits on the merge line | P1 | 1-02 | Note in the PR template or contributor guide |

Status: 1-01, 1-02, 3-03 (P1-3), and 3-04 (P1-4) are implemented in the working tree. 1-04 remains pending hosted confirmation. 1-03 and 1-05 were verified with typecheck, lint, unit tests, build, i18n, and both Playwright `--list` runs before P1-4.

### 11.1 Degradation revert map

`dc5a59e` changed 9 files. Revert only the degradation hunks; do not revert the whole commit.

| File | What `dc5a59e` did | Required action | Preserve |
|---|---|---|---|
| `src/app/vendor/orders/page.tsx` | Removed courier fields from the select and removed courier, gift-wrap, gift-message, preferred-delivery-date, and delivery-time-note rendering | Restore the select and JSX blocks | The rest of the list page |
| `src/app/admin/settlements/page.tsx` | Removed proof and clawback fields from the select; forced `clawback_minor` to 0 and proof fields to null | Restore the select and the record mapping | The list layout |
| `src/app/admin/orders/page.tsx` | Removed `commission_clawbacks` from the select and passed `[]` to `returnedCommissionNote` | Restore the select and the real clawback array | The list layout |
| `src/app/admin/refunds/page.tsx` | Removed inspection fields from the select while the type and render still use them | Restore `receipt_note`, `inspection_condition`, `return_courier_paid_by`, `inspection_condition_previous`, `inspection_corrected_by`, and `inspection_corrected_at` | The list layout |
| `src/app/admin/reviews/page.tsx` | Added a PGRST205 “waiting for migration 54” banner | Remove after hosted confirmation | Normal error handling |
| `src/app/admin/price-consent-refusals/page.tsx` | Added a PGRST205 “waiting for migration 64” banner | Remove after hosted confirmation | Normal error handling |
| `src/app/vendor/reviews/page.tsx` | Added a genuine 282-line reviews page | Keep | Entire page |
| `src/app/vendor/nav.ts` | Added Logistics and Reviews links | Keep | Both links; Logistics is useful after the list is restored |
| `e2e/admin/dashboard-mobile.spec.ts` | Added `/admin/price-consent-refusals` and `/vendor/reviews` to the mobile route checks | Keep | Both route checks |

Recommended mechanics: use `git revert --no-commit dc5a59e`, then restore the three genuine artifacts from `dc5a59e` (vendor reviews page, nav entries, mobile route checks), inspect the diff, and commit as one revert-plus-preservation change. Hand-reverting the hunks is equally acceptable and may be clearer. Do not revert `dc5a59e` wholesale without re-adding the preserved work.

**Exit criteria:** the degradation is gone; the reviews page and nav links are present; E2E refuses hosted targets; all gates are green; no hosted writes occurred.

## 12. Phase 2 — Financial integrity

**Goal:** make the money record honest and operable.

| ID | Task | Priority | Depends | Acceptance |
|---|---|---|---|---|
| 2-01 | Design the D-11 forward correction as a new migration: reclassify the two settlements from paid to open with a recorded reason, preserve IDs, totals, lines, commissions, and vendor links; fabricate no proof | P0 | 0-01, 0-03 | Migration reviewed by two people; local/disposable rehearsal passes; no C1 or rollback against hosted |
| 2-02 | Migration-36 file hygiene after D-11: remove the backfill block from the file and add a header comment pointing to the forward correction, or leave the file byte-identical and add a prominent warning; record the choice | P0 | 2-01 | Choice recorded; no ambiguity for future readers; intentional file-vs-applied divergence documented |
| 2-03 | Fix FIN R-01: physical return after payout must have a supported path (owner-approved correction or refund workflow) | P1 | 0-01 | Path implemented and tested; no dead-end; money invariants hold |
| 2-04 | F-04: implement the owner's refund-window decision, or record that the current delivery-based window is retained | P1 | 0-02 | Decision recorded; tests reflect the chosen policy |
| 2-05 | COD cash ledger and settlement reconciliation: design and build the minimum viable ledger before scaling past pilot; use manual Sunday reconciliation until then | P1 | 0-02 | Ledger records cash collected and settled; reconciliation report exists; pilot constraint documented |
| 2-06 | Verify the clawback direct-repayment flow and outstanding-clawback visibility end to end | P1 | 1-02 | Test covers outstanding, applied, and direct-repayment states; admin page shows the real data |
| 2-07 | Add a “no new paid settlement without proof” guardrail to the runbook and UI copy | P1 | 2-01 | Runbook updated; UI or docs state the rule |

**Exit criteria:** D-11 is implemented or explicitly accepted; the money invariants pass; the two settlements have an honest, documented state; no C1 or rollback was run.

## 13. Phase 3 — Security P1 closure

**Goal:** close or formally accept the four pilot-blocking P1s.

| ID | Task | Priority | Depends | Acceptance |
|---|---|---|---|---|
| 3-01 | P1-1: verify Supabase Auth limits, JWT expiry, password policy, and MFA status; decide CAPTCHA (Supabase built-in, third-party, or none with compensating controls); record the result | P1 | 0-02 | Dashboard evidence recorded; CAPTCHA decision written; bypass risk documented |
| 3-02 | P1-2: fail closed for signed-in checkout when the quota service is unavailable; return a clear retry message | P1 | 0-02 | Quota-service failure blocks checkout for guests and signed-in users; test covers the degraded path |
| 3-03 | P1-3: mask customer PII in vendor list views; gate full contact to owner/manager | P1 | 1-02 | Staff sees masked contact; owner/manager sees full contact; test asserts both |
| 3-04 | P1-4: add invite status and an acceptance step; membership becomes effective only on acceptance | P1 | — | Invitee must accept; no silent membership; test covers existing and new accounts |
| 3-05 | Add regression tests: staff-vs-manager PII, invite acceptance, checkout quota failure, auth quota fail-closed | P1 | 3-01..3-04 | Tests fail on the old behavior and pass on the new behavior |
| 3-06 | If any P1 is deferred, record a written risk acceptance with owner, scope, and expiry | P1 | 0-02 | Acceptance recorded in `docs/DECISIONS.md`; pilot condition 6 satisfied |

Status: 3-03 (P1-3) and 3-04 (P1-4) are implemented in the working tree. 3-01 and 3-02 remain pending; 3-05 is covered locally by `src/lib/vendor-pii.test.ts`, `src/app/vendor/settings/staff/actions.test.ts`, and `src/app/[locale]/(storefront)/account/invitations/actions.test.ts`, with the new SQL suite still unexecuted.

**Exit criteria:** all four P1s are fixed or accepted in writing; tests cover the fixed paths; dashboard evidence is attached.

## 14. Phase 4 — Notifications and monitoring

**Goal:** make the pilot observable and communicable.

| ID | Task | Priority | Depends | Acceptance |
|---|---|---|---|---|
| 4-01 | Brevo: create the account, verify the sender/domain, add SPF/DKIM/DMARC, store SMTP credentials in the hosting secret store, and send a real test email through the app | P1 | 0-02 | A real email arrives; logs show success; no secret in the repo |
| 4-02 | Configure Supabase Auth SMTP separately with the same verified sender | P1 | 4-01 | Auth recovery/invite email arrives; settings documented |
| 4-03 | Sentry: set the DSN, deploy, trigger a test error, and verify the alert arrives | P1 | 5-01 or a preview deploy | Event visible; alert received; DSN not committed |
| 4-04 | UptimeRobot: create monitors for the storefront, admin, and API health endpoints; verify a down alert | P1 | 5-01 or a preview deploy | Monitor green; test down alert received |
| 4-05 | Add outbox backlog and terminal-failure alerting (P2-8) | P2 | 4-01 | Alert fires on backlog or terminal failure; runbook documents response |
| 4-06 | Update the pilot communication fallback: phone/WhatsApp until email is verified | P1 | 4-01 | Runbook states the fallback and the cutover condition |

**Exit criteria:** a real email is received; Sentry and UptimeRobot alerts are verified; the pilot fallback is documented.

## 15. Phase 5 — Release engineering and QA

**Goal:** make deployment and recovery evidenced, not assumed.

| ID | Task | Priority | Depends | Acceptance |
|---|---|---|---|---|
| 5-01 | Create a staging Supabase/Vercel environment, or record a written pilot exception with compensating controls | P1 | 0-02 | Staging exists and applies migrations 28–71 in order, with 67 before app code; or exception recorded |
| 5-02 | Backup/PITR drill: restore into a disposable database, compare counts, record RTO/RPO | P1 | 5-01 or owner access | Restore succeeds; comparison documented; runbook exists |
| 5-03 | Verify branch protection and add a deploy commit/version marker | P1 | Owner GitHub access | Protection confirmed; deployed app shows a commit SHA or build marker |
| 5-04 | Playwright in CI: at minimum `--list` on every PR, plus the default safe lane where feasible; keep the hosted-URL refusal | P1 | 1-01 | CI runs the lane; spec drift is caught; no hosted target |
| 5-05 | Full gate re-run and docs refresh: README, `HOSTED_STATE.md`, `DECISIONS.md`, `MUSE_PRODUCTION_BLOCKERS.md`, `AGENT_WIP_INVENTORY.md`, `GIT_BRANCH_INVENTORY.md` | P1 | 1-05 | Gates green; stale counts and claims corrected; docs point to this analysis |
| 5-06 | Rotate the two GitHub PATs exposed on 2026-11-20; store new credentials in the vault | P1 | Owner | Old tokens revoked; new tokens not in chat or repo |
| 5-07 | Re-run the owner's 8/8 browser pass after the degradation revert and any checkout/order change | P1 | 1-02, owner machine | Pass recorded with date and commit; failures filed |

**Exit criteria:** staging or a written exception; backup drill evidence; branch protection and deploy marker verified; Playwright guarded and in CI; docs refreshed; PATs rotated.

## 16. Phase 6 — Product, policy, and UX closure

**Goal:** close the remaining public-launch and pilot-experience gaps.

| ID | Task | Priority | Depends | Acceptance |
|---|---|---|---|---|
| 6-01 | Legal pages: replace drafts with approved content, real company details, and final legal approval | P1 | Owner + legal | Six pages approved; draft notices removed |
| 6-02 | SEO indexing flip: after hosted verification and performance measurement, flip indexing and verify crawl | P1 | 5-05, 6-06 | Flip recorded with date; crawl verified |
| 6-03 | Dashboard localization: decide before or after pilot; implement Arabic or record the English-only decision | P1 | 0-02 | Decision recorded; if implemented, Arabic smoke spec passes |
| 6-04 | Delivery-date enforcement, same-day rules, and return-courier charge: decide and implement the owner's policy | P1 | 0-02 | Rules enforced server-side or explicitly deferred; tests reflect them |
| 6-05 | Decision-closure items: live tracking, search similarity threshold/Arabic fuzzy proof, settlement reconciliation/courier date | P1 | 0-02 | Each decided or deferred with a date; docs updated |
| 6-06 | Performance: Lighthouse/CWV on the deployed build; address or accept the homepage preview fan-out and vendor analytics caps with numbers | P2 | 5-01 | Measurements recorded; accepted risks documented |
| 6-07 | F-01 404 empty DOM: accept with rationale or fund the root-layout restructure | P2 | 0-02 | Decision recorded; no blind retry |
| 6-08 | Plant Pot: restore the Nile Blossoms product with the Batch 4 guard, re-add by hand, or confirm with the vendor | P2 | Owner | Product live again or vendor confirms removal |
| 6-09 | Arabic storefront gaps: auth forms, pagination, legal pages, navigation-guard dialog | P2 | 6-03 | Gaps closed or explicitly deferred |

**Exit criteria:** legal approval; SEO flip and crawl verified; localization and policy decisions recorded; performance measured; Plant Pot resolved.

## 17. Phase 7 — Merge, deploy, and verify

**Goal:** land the 58-commit line deliberately and prove it is live.

| ID | Task | Priority | Depends | Acceptance |
|---|---|---|---|---|
| 7-01 | Open the PR from `muse/decision-closure-brevo` to `main`; require CI green and owner approval | P1 | Phases 0–5 | PR approved; CI green; no unresolved P0 |
| 7-02 | Merge with a merge commit; do not squash | P1 | 7-01 | Merge commit on `main`; history preserved |
| 7-03 | Deploy and verify: commit marker, smoke test, checkout, vendor status, refund, settlement, mail outbox, banners | P1 | 7-02 | Smoke evidence recorded; commit marker matches |
| 7-04 | Post-merge cleanup: archive or delete obsolete branches and stash only with written owner approval | P2 | 7-02 | Dispositions recorded; no unique work lost |
| 7-05 | Pilot report and go/no-go: collect vendor/customer feedback, measure volume vs manual reconciliation capacity, re-run the scorecard | P1 | 7-03 | Written report; go/no-go recorded; no silent flip |

**Exit criteria:** merged, deployed, smoke-verified, pilot report written, cleanup approved.

## 18. Suggested first ten working days

This is a scheduling suggestion, not a commitment.

| Day | Work |
|---|---|
| 1 | 0-01 D-11 decision; 0-02 decision log; 4-01 Brevo account/domain start |
| 2 | 0-03 hosted evidence snapshot; 0-04 freeze; 0-05 branch inventory; 4-02 Auth SMTP |
| 3 | 1-01 E2E guard; 1-02 degradation revert; 4-03 Sentry setup |
| 4 | 1-02 finish; 1-03 parity checks; 4-04 UptimeRobot |
| 5 | 1-04 banners; 1-05 gates; 1-06 regression note |
| 6 | 2-01 correction design; 3-01 Auth limits/CAPTCHA; 5-01 staging start |
| 7 | 2-01 local rehearsal; 3-02 checkout fail-closed; 5-02 backup drill |
| 8 | 2-02 migration hygiene; 3-03 PII masking; 5-03 branch protection/deploy marker |
| 9 | 2-03 R-01; 3-04 invite acceptance; 5-04 Playwright CI |
| 10 | 2-04 F-04; 3-05 tests; 5-05 docs refresh; review with owner |

Owner-side work (Brevo, Sentry, UptimeRobot, GitHub settings, legal, Plant Pot) should start on day 1 because it has the longest lead time and no code dependency.

## 19. Gate matrix

| Gate | Command or evidence | Current | Pilot requirement | Public requirement |
|---|---|---|---|---|
| Lint | `npm run lint` | PASS per audit | PASS | PASS |
| Typecheck | `npm run typecheck` | PASS per audit | PASS | PASS |
| Unit tests | `npm run test` (Vitest) | 712/712, 81 files verified here | PASS | PASS |
| Build | `npm run build` | PASS, 55/55 static pages verified here | PASS | PASS |
| i18n | `node scripts/check-i18n-keys.mjs` | PASS, 788/648 verified here | PASS | PASS |
| RLS | `scripts/run-rls-suites.sh` | 18/18 prior audit; 19th suite (`rls_vendor_invitations_test.sql`) written but unexecuted | PASS | PASS |
| Concurrency | FIN-001, H-01 runners | PASS per audit | PASS | PASS |
| Playwright | `npx playwright test` | Not rerun after P1-4; guard was list-validated on loopback before P1-4 | Guarded lane or owner 8/8 pass | CI lane plus owner pass |
| CI | GitHub Actions | Green on HEAD (prior) | Green | Green |
| Hosted drift | Read-only comparison | DOC CLAIM: zero drift | Evidence snapshot | Evidence snapshot |
| Email | Real send | Local Brevo relay accepted one test (2026-11-24); inbox/DNS/hosted unverified | Brevo real send | Brevo real send |
| Monitoring | Sentry + UptimeRobot | Not verified | Alert verified | Alert verified |
| Backup | PITR restore drill | Not done | Exception or drill | Drill |
| Deploy marker | Commit SHA/build marker | Not present | Optional for pilot | Required |
| P1 security | P1-1..P1-4 | P1-3 and P1-4 implemented locally; P1-1/P1-2 open; migration 72 unapplied | Fixed or written acceptance | Fixed |
| D-11 | Decision + correction | Open | Decided; correction planned or applied | Applied |

---

# Part III — Owner Decisions Required

## 20. Decision table

| ID | Decision | Options | Recommendation | Blocks | Target |
|---|---|---|---|---|---|
| D-11 | What happens to the two `LEGACY-` paid settlements? | A. New forward correction (paid → open, reason recorded, no fabricated proof); B. Explicitly accept the `LEGACY-` proof as the record and document it; C. Backup/PITR restore | **A**, if the owner confirms both rows are synthetic demo fixtures. It matches C1's intent and removes the false attestation. Choose B only with a written acceptance and a visible flag; choose C only if hosted backup is verified and the disruption is acceptable | Financial sign-off, migration-36 docs, pilot condition 2 | Day 1 |
| SEC R-04 / P1-2 | Signed-in checkout when the quota service is unavailable | A. Fail closed for signed-in users; B. Keep fail-open with compensating controls; C. Disable checkout during the outage | **A**. Fail closed with a clear retry message; guests already fail closed | P1-2 closure, pilot condition 6 | Day 1 |
| F-04 | Refund window opens at delivery or at resolve? | A. Keep delivery-based; B. Move to resolve-based; C. Fixed N days from delivery | **A** unless policy requires otherwise. Document the choice and test it | Refund policy, P1-6 | Day 1 |
| P1-1 | CAPTCHA and Supabase Auth limits | A. Verify limits and enable Supabase CAPTCHA; B. Third-party CAPTCHA; C. No CAPTCHA with compensating controls | **A** before public launch. At minimum, record the dashboard limits now | P1-1 closure | Day 6 |
| SEO | Flip indexing to public? | A. Flip after legal and performance gates; B. Keep noindex through pilot | **A** after Phase 5/6 evidence. Do not flip silently | Public launch, P-6 | Phase 6 |
| Localization | Vendor/admin dashboards in Arabic? | A. Before pilot; B. After pilot; C. English-only by design | **B or C** for pilot; decide before public launch. Record the choice | P-12, Arabic-first vendors | Phase 6 |
| Tracking | Live courier tracking integration? | A. Integrate a courier API; B. Manual tracking references only | **B** for pilot; revisit after volume justifies integration | V-14, decision-closure item | Phase 6 |
| Search | Search similarity threshold / Arabic fuzzy proof | A. Keep current threshold and add an Arabic fixture; B. Tune the threshold; C. Add fuzzy matching | **A** for pilot; measure before tuning | C-37, search quality | Phase 6 |
| Settlement | Reconciliation beyond UI arithmetic / courier date | A. Build a COD ledger and reconciliation report; B. Manual reconciliation only | **A** before scaling past pilot; manual Sunday reconciliation until then | P-9, financial control | Phase 2/6 |
| Delivery | Delivery-date enforcement and same-day rules | A. Enforce server-side; B. Keep UI-only; C. Remove the preference | **A** if the owner wants the promise; otherwise **B** with clear copy | C-15/C-22 | Phase 6 |
| Return courier | Return-courier charge as a financial charge | A. Financialize it; B. Keep it as policy/copy only | **A** before scale; **B** for pilot with manual handling | B-06 | Phase 6 |
| Brevo | Sending domain, verified sender, credentials | A. Owner creates Brevo account, verifies domain, stores credentials in Vercel; B. Defer email | **A** now; it is a pilot condition. Configure Supabase Auth SMTP separately | Pilot condition 3, P1-7 | Day 1 |
| Legal | Six legal pages and company details | A. Legal review and approval; B. Launch with drafts | **A** before public launch. Pilot may use clearly marked drafts if the owner accepts | P-5, public launch | Phase 6 |
| Plant Pot | Restore the deleted Nile Blossoms product? | A. Re-run demo seed with the Batch 4 guard; B. Re-add by hand; C. Vendor confirms removal | **A or B** before pilot; **C** only with vendor confirmation | V-08, P-15 | Phase 6 |
| Branches | Disposition of `codex/logistics-wip`, `audit/phase-2...`, `demo/catalogue-seed`, `muse/gifto-autonomous-improvement`, preview refs, and the stash | A. Keep until merge + audit; B. Archive; C. Delete after confirming contained | **A** now. No deletion until Phase 7 and a written disposition | Cleanup, audit trail | Phase 7 |
| Merge | Approve the 58-commit merge? | A. Merge after Phases 0–5 with a merge commit; B. Hold | **A** after conditions 1–2 and CI are satisfied. No squash | Public launch, pilot | Phase 7 |
| GitHub PAT | Rotate the two PATs exposed on 2026-11-20 | A. Revoke and rotate now; B. Defer | **A** immediately. Store new tokens in the vault only | Security hygiene, P-14 | Day 1 |

## 21. Decision record template

Paste this into `docs/DECISIONS.md` for each decision:

```markdown
## D-XX — <short title>

- **Date:** YYYY-MM-DD
- **Owner:** <name/role>
- **Status:** Decided / Deferred until YYYY-MM-DD
- **Context:** <the problem and why it matters>
- **Options considered:**
  1. <option> — <consequence>
  2. <option> — <consequence>
- **Decision:** <the chosen option, in one sentence>
- **Rationale:** <why this option>
- **Evidence:** <links to read-only queries, snapshots, or files>
- **Consequences:** <what changes; what is now out of scope>
- **Follow-up:** <tasks, owners, dates>
```

For D-11 specifically, include:

- Whether the two rows are confirmed synthetic fixtures.
- Whether the `LEGACY-` proof is accepted or corrected.
- The exact correction mechanism (new migration name, or restore method).
- The migration-36 file-hygiene choice.
- Who applies and who verifies (two-person rule).
- The rollback/abort criteria.

## 22. Owner sign-off checklist

- [ ] D-11 recorded; forward correction approved or acceptance documented.
- [ ] SEC R-04 / P1-2 fail-closed checkout approved.
- [ ] F-04 refund-window policy recorded.
- [ ] CAPTCHA/Auth-limits decision recorded.
- [ ] SEO, localization, tracking, search, settlement, delivery, and return-courier decisions recorded or explicitly deferred with dates.
- [ ] Brevo account, sender/domain, DNS, and credentials approved and stored securely.
- [ ] Legal pages approved.
- [ ] Plant Pot disposition confirmed.
- [ ] Branch/stash disposition approved; no deletion before Phase 7.
- [ ] Merge approved: PR, merge commit, no squash, CI green.
- [ ] GitHub PATs rotated.
- [ ] P1 security fixes or written risk acceptance approved.
- [ ] Hosted evidence snapshot supplied.
- [ ] Staging or pilot exception approved.
- [ ] Backup/PITR drill scheduled.
- [ ] Pilot go/no-go owner named.

---

# Appendices

## Appendix A — Evidence commands used

Read-only commands used in this analysis:

```powershell
git status --porcelain=v1
git rev-parse --short HEAD
git rev-list --left-right --count main...HEAD
git branch -vv
git branch -r
git stash list
git show --stat --oneline dc5a59e
git show --stat --oneline a876e85
git show --format= --unified=2 dc5a59e -- <paths>
git diff --check
node scripts/check-i18n-keys.mjs
```

File checks:

- `supabase/migrations/00000000000036_payout_proof.sql:48-62`
- `src/app/vendor/orders/page.tsx:144`
- `src/app/vendor/orders/[id]/page.tsx:47`
- `src/app/admin/settlements/page.tsx:183,192-195`
- `src/app/admin/settlements/[id]/page.tsx:145,167-170`
- `src/app/admin/orders/page.tsx:121`
- `src/app/admin/refunds/page.tsx:56-65,122,545-565`
- `src/app/admin/logistics/page.tsx:64`
- `src/app/layout.tsx:89`
- `src/app/vendor/reviews/page.tsx`
- `src/app/vendor/nav.ts`

Counts:

- 71 migrations, 55 rollbacks, 18 RLS suites, 78 Vitest files, 17 Playwright spec files, 417 `src/` files.
- 2,516 / 1,146 / 1,011 lines for the three large modules.

## Appendix B — Degradation map at a glance

The four list degradations below were reverted in the working tree during Phase 1. The PGRST205 banners remain until hosted migrations 54 and 64 are confirmed.

| Surface | Data hidden before Phase 1 | Detail page intact? | Source |
|---|---|---|---|
| Vendor orders list | Courier, tracking, handover time, gift wrap/message, preferred delivery date/time | Yes | `dc5a59e`; `src/app/vendor/orders/[id]/page.tsx:47` |
| Admin settlements list | Paid amount, transfer method/reference, proof note, clawback | Yes | `dc5a59e`; `src/app/admin/settlements/[id]/page.tsx:145` |
| Admin orders list | Commission clawbacks in the returned-commission note | Yes | `dc5a59e`; select at `src/app/admin/orders/page.tsx:121` |
| Admin refunds list | Receipt note, inspection condition, return courier payer, inspection correction history | Yes, in the type and render, but the list select omits the fields | `dc5a59e`; `src/app/admin/refunds/page.tsx:122,545-565` |
| Admin reviews | PGRST205 “waiting for migration 54” banner | Not applicable | `dc5a59e` |
| Admin price-consent refusals | PGRST205 “waiting for migration 64” banner | Not applicable | `dc5a59e` |
| Admin logistics | Nothing; intact | Yes | `src/app/admin/logistics/page.tsx:64`; `ec7d3bf` is LIKE escaping only |

## Appendix C — Severity definitions

| Severity | Definition |
|---|---|
| P0 | Blocks merge or pilot; money, data integrity, or safety; must be fixed or explicitly accepted by the owner before proceeding |
| P1 | Must fix before public launch; pilot may proceed only with a written, scoped risk acceptance |
| P2 | Should fix before scale; does not block pilot |
| P3 | Polish, debt, or low-risk hardening |

## Appendix D — Source documents

The 13 documents analyzed, all untracked at `docs/` in this clone:

1. `ARCHITECTURE_AND_CODEBASE.md`
2. `CI_CD_AND_DEPLOYMENT.md`
3. `DATABASE_AND_MIGRATIONS.md`
4. `DOCUMENTATION_HEALTH.md`
5. `FINANCIAL_INTEGRITY.md`
6. `GIT_BRANCH_INVENTORY.md`
7. `LAUNCH_READINESS.md`
8. `MASTER_PROJECT_AUDIT.md`
9. `MASTER_ROADMAP.md`
10. `PRODUCT_FEATURE_MATRIX.md`
11. `SECURITY_AND_RLS.md`
12. `TESTING_AND_QUALITY.md`
13. `UX_PERFORMANCE_AND_I18N.md`

This consolidation does not replace the source evidence. It records what is verified, what is claimed, what is contradicted, and what the owner must decide before the branch can merge.
