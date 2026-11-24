# Gifto — Master Project Audit

- **Audit date:** 2026-11-24
- **Audit version:** master-2026-11-24
- **Branch audited:** `audit/master-project-audit` (worktree `~/workspace/gifto-master-audit`), HEAD `54c780b` (`origin/muse/decision-closure-brevo` tip, 58 commits ahead of `main` @ `b369412`, 0 behind)
- **Scope:** full read-only audit — product, architecture, database/migrations, financial integrity, security/RLS, git branches, CI/CD, testing, UX/i18n, documentation, launch readiness — plus a live read-only verification of the hosted Supabase project (`hqusykdyjpruysxezsrn`, eu-central-1, PostgreSQL 17.11) via the Supabase connector.
- **Rules observed:** read-only except for these audit documents; no application source, migration, CI config, branch, or hosted record was modified; nothing was pushed, merged, or deployed.

## 1. Executive verdict

| Verdict | Score |
|---|---|
| **NOT READY for public launch** | **75 / 100** (down from 81/100 at the v10 gates, 2026-11-21) |
| **CONDITIONALLY READY for closed pilot** — subject to the six conditions in §4 | |

The score fell even though the biggest open question of the last three days was answered in the project's favour: **hosted Supabase now runs all 71 migrations, the courier columns exist, and there is zero real schema drift** (verified live, §2). That resolution is worth real points. It is outweighed by what hosted verification also proved: the two paid settlements now carry **fabricated payout proof that was actually executed on hosted** (the `a876e85` backfill ran as part of migration 36), and the `dc5a59e` degradation that hides courier and payout-proof data is **still live at HEAD**. Two "unknowns" became confirmed defects, and both sit on the money path. The codebase itself is in the best shape it has ever been — every runnable gate passes with numbers identical to prior claims — but the branch proposed for merge contains a committed financial backfill that contradicts the owner's own selected treatment, and a UI degradation that hides real hosted data.

**The single most important fact in this audit:** the owner-selected C1 correction is dead on hosted. It cannot be run, and its rollback cannot be run either. Only a new forward correction (a new owner decision) or a backup/PITR restore can change the two paid settlements now. Do not run C1 or its rollback against hosted.

## 2. What hosted verification settled (live, 2026-11-24)

Verified read-only against project `hqusykdyjpruysxezsrn` (helper allows SELECT/WITH only; no PII pulled beyond settlement aggregates). Full evidence, queries, and comparison scripts: `DATABASE_AND_MIGRATIONS.md` §2 and the raw outputs in `/tmp/gifto-audit/raw/*.json`.

| Claim | Before this audit | Now (verified live) |
|---|---|---|
| Migrations 28–71 applied on hosted | Owner claimed yes; Codex WIP implied no; audit treated as UNKNOWN | **Confirmed: all 71 versions present in `supabase_migrations.schema_migrations`, 1–71, none missing, no duplicates** |
| Courier columns (`courier_name`, `tracking_ref`, `handed_over_at`) on `order_vendors` | Disputed — workaround implied absent | **Present, all nullable; migration 42's 7-arg `set_order_vendor_status` and `order_vendors_shipped_courier_idx` also live** |
| Schema drift repo ↔ hosted | Unknown | **Zero real drift.** 41 tables (= repo exactly, incl. `public_vendors` view), 403 columns, 93/93 functions signature-matched, 49 triggers, 11 enums (38 labels), 136 indexes, 120/120 RLS+storage policies by name with 0 real definition differences, extensions match (hosted extras are Supabase platform defaults), 34/34 explicit table-grant checks pass. Every apparent diff was chased down and cleared as a parser artefact. |
| Migration statements vs repo files | Unknown | **67/71 applied statements match the current repo files exactly.** v11–13 NULL and v39 empty are recording gaps only; the objects are present. **No file was edited after hosted application.** |
| Demo orders allowed | Unknown | `app_settings.demo_orders_allowed = false` — demo orders disabled on hosted |
| The two paid settlements | Known synthetic fixtures, no proof, C1 selected | **Both confirmed paid with `LEGACY-` transfer references and the exact backfill proof note; `paid_amount = total`; 785,260 piastres total (EGP 7,852.60). The applied statements prove migration 36 ran WITH the `a876e85` backfill — i.e. the 28–71 run happened on/after 2026-11-24 00:57:31 EET.** |
| All settlements on hosted | Unknown | 4 total, all demo vendors: 2 paid (above), 1 open (269,250, Cairo Cocoa & Confections, 6 lines), 1 voided (76,200, Alexandria Toy Corner, 7 lines) |

**Why the workaround existed (most likely, inferred):** `dc5a59e` was authored against a database still at migration ≤27 and preserved at 2026-11-24 00:57:20 — about three days after migration 42 landed (2026-11-20), and minutes *before* the hosted 28–71 run made it obsolete. It removes exactly the objects from migrations 28–71 (courier 42, payout proof 36, gift fields 47/48, inspection columns 52/58/61, reviews 54, refusals 64) and its PGRST205 notices name migrations 54/64 as "waiting to be applied". All 15 degraded columns/tables it touches are verified present on hosted. Correction to an earlier claim: `dc5a59e` never touched `admin/logistics/page.tsx` — its courier degradation is in `vendor/orders/page.tsx`; the Codex logistics workaround itself lives on the local-only branch `codex/logistics-wip` (@ `b71aa11`), which is not available here and remains unverifiable.

## 3. Executive dashboard

| Area | Status | Headline |
|---|---|---|
| Product features (100 inventoried) | 4 DONE · 79 IMPLEMENTED · 11 PARTIAL · 2 BLOCKED · 4 NOT STARTED | All 11 claimed Phase 2 additions confirmed present. Hosted verification now complete for every feature (was UNKNOWN). V-14 courier handover reclassified BLOCKED → PARTIAL: hosted schema is live, but the vendor UI hides it (`dc5a59e`). |
| Architecture & codebase | Sound, with 3 structural risks | Single Next.js 16 app, 417 files under `src/`, 71 routes, fully dynamic. Hand-written `database.types.ts` (2,516 lines) is the silent-drift risk — the exact failure mode behind the courier dispute. God modules `mail.ts` (1,146) and `catalog.ts` (1,011); guest/signed-in order-detail duplication (~510 vs ~584 lines). |
| Database & migrations | **Verified live, zero drift** | 71 migrations contiguous, 38 tables, 133 policies, 55 rollbacks. Migration 36 backfill executed on hosted (see §2). Migration 42 courier schema live. |
| Financial integrity | **Highest-risk area** | Money core well-built on paper (unique active-line index, amount-equality checks, capped clawback ledgers, row locks, FIN-001 atomicity PASS). R-01 High: physical return can never complete after payout. R-02 High: migration-36/C1 ordering trap — now realised on hosted. R-03 High: backfill fabricated proof, no flag column. No COD cash ledger, no reconciliation. |
| Security & RLS | 1 P0 (closed by verification) · 4 P1 · 8 P2 · 5 P3 | RLS on all 40 public tables, 133 policies, no `using(true)`; guest tokens 256-bit SHA-256-hashed. P1s: auth rate-limit bypassable; signed-in checkout fail-open on quota failure; vendor staff see full customer PII unmasked; staff invites grant membership before acceptance. |
| Git branches | 9 names · 6 of 9 fully merged · 3 lines unmerged · 2 hold unique work | `muse/decision-closure-brevo` (58 commits, clean fast-forward candidate, no PR ever) and `demo/catalogue-seed` (1 commit, demo-only) hold unique work. Only 1 PR ever (PR #1, merged 2026-11-22). |
| CI/CD & deployment | CI green; deployment unverifiable | One workflow, 3 jobs, all green on HEAD (run 45284623044, 2026-11-23 22:58 UTC). `check:i18n` IS wired into CI (resolves the open Phase 2 question). No staging environment; production deploy commit unverifiable; branch protection unknown. |
| Testing & quality | **All runnable gates green, re-run in this audit** | Lint PASS, typecheck PASS, Vitest **697/697 (78 files)**, build PASS (53/53 static), check:i18n PASS (788 calls / 648 keys), RLS **18/18**, FIN-001 + H-01 concurrency PASS, C1 rehearsal PASS (disposable DB only — moot on hosted), node:test 13/13. Playwright NOT run here; 8/8 browser pass is the owner's 2026-11-23 machine run only. |
| UX / performance / i18n | Strong UX, unmeasured performance, partial i18n | No Lighthouse/CWV timings exist anywhere. Fully dynamic rendering; homepage blocks on slowest of 7 loads; preview fan-out 500 rows; vendor analytics up to 20k rows. i18n corrected: **648 keys / 788 calls** (not "788 keys"). Auth form + legal pages + dashboards English-only. F-01 404 empty DOM still present by construction. |
| Documentation health | 60 files; 13 current, 11 stale-in-part, 25 self-flagged historical | Top contradiction: migration-36 backfill committed vs owner-selected C1 (§5). DECISIONS.md missing Brevo + C1 + closure decisions. HOSTED_STATE.md stale (66/17/774). MUSE blockers/next-actions frozen at `dc37ff0` (SMTP undecided, mail worker missing — both now wrong). |
| Launch readiness | **NOT READY public; CONDITIONALLY READY pilot** | Conditions in §4. Public launch additionally blocked by: no staging, no backup/PITR drill, branch protection unverified, production deploy commit unverifiable, legal pages still draft, SEO flip not done. |

## 4. Conditions for a closed pilot (all must hold)

1. **Revert the `dc5a59e` degradation** (vendor/orders courier columns, admin/settlements proof fields; re-check admin/orders and admin/refunds for the same pattern), extract the genuine new work inside it (vendor reviews page + nav entries) into its own change, and re-run the full gates. Do not merge `dc5a59e` as-is.
2. **Decide the forward correction for the two LEGACY-proof settlements** (new owner decision — C1 and its rollback are both dead on hosted) or document explicit acceptance of the fabricated proof as the record. Do not run C1 or the rollback against hosted.
3. **Brevo SMTP live + a real send verified** (account, sender/domain, DNS, credentials via secure vault only; Supabase Auth SMTP configured separately).
4. **Monitoring live** — Sentry DSN set and an alert verified; UptimeRobot monitors created and verified (approved 2026-11-20).
5. **Merge the 58-commit line via PR with CI green** (merge commit, no squash), after conditions 1–2 are resolved on the branch.
6. **P1 security fixes or accepted risk, recorded in writing** — auth rate-limit bypass, signed-in checkout fail-open, staff PII masking, staff-invite-before-acceptance.

## 5. The three findings that matter most

### 5.1 The migration-36 backfill is committed AND executed — C1 is dead (Critical)
`a876e85` inserted a 16-line legacy backfill into already-written migration 36 (`transfer_reference = 'LEGACY-' || substr(id,1,8)`, `transfer_method='other'`, `paid_amount_minor = total_minor`). It contradicts `docs/MIGRATION_36_FINANCIAL_RECONCILIATION.md` ("C1: reclassify paid→open, fabricate no proof"), `docs/DEMO_CONTAINMENT…` ("Owner has selected C1"), and the "do not merge an invented backfill" warnings in three 2026-11-24 docs. Hosted verification proves the backfill ran: the two settlements carry the exact LEGACY proof, and C1's own pre-36 guard trips (`settlements_payout_proof_matches` exists, `transfer_reference` exists), so C1 would abort. The docs that say "migration 36 fails as written" are now false of both the file and hosted. **What must happen:** the owner/finance must explicitly choose between C1 (now only achievable as a new forward correction) and accepting the backfill as the record — and the losing artifact must be reverted from the migration file and the docs updated in the same commit. As an edit to an already-applied migration file, the backfill will never execute again on hosted; its only live effect is the record it already created.

### 5.2 The `dc5a59e` degradation is live at HEAD and hides real hosted data (High)
The vendor orders list has no courier references and admin/settlements hard-codes proof fields to null, while hosted holds the real data. Only `admin/logistics` was restored (fix 3a, `ec7d3bf`). The degradation bundles genuine new work — a new `src/app/vendor/reviews/page.tsx` (+282 lines) plus vendor nav entries — which must be preserved as evidence and split apart, never merged as-is. It also bundles a second preservation problem: it must be reverted before the branch merges, or the pilot will ship a vendor dashboard that cannot show courier handovers that the database already records.

### 5.3 No staging, no backup drill, no verifiable production deploy (High, launch-blocking)
There is no staging environment — production is the first hosted target. No backup/PITR restore runbook exists, the drill has never run, and hosted backup state is Unknown. The production deployment commit is unverifiable (`gifto-marketplace.vercel.app` returns HTTP 200 with correct security headers and no commit/version marker). Branch protection is Unknown (endpoint needs auth, 401). These are the structural reasons the public verdict stays NOT READY even though the code gates are green.

## 6. Scorecard (weighted, 100 points)

| Area (weight) | Score | Basis |
|---|---|---|
| Checkout & money (20) | 14 | Money core strong on paper; R-01/R-02/R-03 High; LEGACY proof live on hosted; no COD ledger; no reconciliation |
| Catalog & search (10) | 8 | Catalogue, search, occasions, gift finder implemented; trigram search threshold undecided; preview fan-out |
| Vendor operations (10) | 7 | Dashboards work; courier UI degraded at HEAD; dashboards English-only; no self-registration by design |
| Admin & finance (15) | 10 | Admin surfaces complete; settlements proof hidden at HEAD; paid settlements irreversible in-app; no reconciliation |
| Security & RLS (15) | 11 | RLS 18/18 on disposable DB; 4 P1s open; no storage-policy tests; no server-action auth tests |
| Legal / trust / localisation (10) | 7 | Six legal pages draft, English-only; auth English-only on `/ar`; dashboards English-only by design |
| Notifications & guest (10) | 6 | Mail outbox + worker + caps implemented; Brevo decided but no account, no send verified; no push/in-app |
| Release & QA (10) | 6 | Gates green; no staging; no backup drill; Playwright not in CI; branch protection unverified |
| **Total** | **75** | Down from 81: hosted verification resolved the migration dispute (+) but converted two unknowns into confirmed money-path defects (−) |

## 7. What changed since the last verified score (81/100, 2026-11-21)

- **Resolved in the project's favour:** hosted migrations 1–71 applied; courier columns present; zero schema drift; demo orders disabled; `check:i18n` confirmed wired into CI; review stars, BreadcrumbList, mail-outbox worker, LIKE escaping, and the 8/8 browser pass all landed and are confirmed present.
- **New confirmed defects:** migration-36 backfill committed and executed on hosted; `dc5a59e` degradation live at HEAD; C1 dead on hosted.
- **Unchanged blockers:** Brevo not configured; monitoring not created; no staging; no backup drill; legal pages draft; P1 security items open; F-01 404 empty DOM; F-04 refund-window policy undecided.

## 8. Supporting documents (all in `docs/audit/`)

| # | Document | Contents |
|---|---|---|
| 1 | `MASTER_PROJECT_AUDIT.md` (this file) | Executive overview, dashboard, verdict, scorecard |
| 2 | `PRODUCT_FEATURE_MATRIX.md` | 100 features: DONE / IMPLEMENTED / PARTIAL / BLOCKED / NOT STARTED |
| 3 | `ARCHITECTURE_AND_CODEBASE.md` | Stack, structure, patterns, risks, duplication |
| 4 | `DATABASE_AND_MIGRATIONS.md` | 71 migrations, hosted verification (live), drift report, migration 36/42 |
| 5 | `FINANCIAL_INTEGRITY.md` | Money model, invariants, risks R-01–R-12, settlements, C1 |
| 6 | `SECURITY_AND_RLS.md` | 18 findings (1 P0 closed, 4 P1, 8 P2, 5 P3), RLS, auth, PII |
| 7 | `GIT_BRANCH_INVENTORY.md` | 9 branches, PR history, merge plan |
| 8 | `CI_CD_AND_DEPLOYMENT.md` | CI workflow, deployment state, env vars, gaps |
| 9 | `TESTING_AND_QUALITY.md` | Gates re-run in this audit, inventory, gaps |
| 10 | `UX_PERFORMANCE_AND_I18N.md` | UX, performance (structural), i18n (648 keys / 788 calls) |
| 11 | `DOCUMENTATION_HEALTH.md` | 60 docs inventoried, contradictions, duplicates, gaps |
| 12 | `LAUNCH_READINESS.md` | Pilot vs public checklists, go/no-go gates |
| 13 | `MASTER_ROADMAP.md` | Phases 0–7, every task with priority, dependencies, acceptance criteria, owner-approval flags |

## 9. Evidence key (used throughout)

- **Verified** — checked directly against a file, git object, a live run in this audit, or a live read-only hosted query.
- **Implemented-but-unverified** — code exists; runtime behaviour was not (or could not be) exercised here.
- **Inferred** — follows from verified facts but not directly observed; flagged as such.
- **Unknown** — cannot be checked from this environment.
- **Blocked** — check was impossible (missing branch, missing access, mission rule).

## 10. What this audit did NOT do

- No application source, migration, CI config, branch, or hosted record was modified. Only `docs/audit/*.md` were created, on branch `audit/master-project-audit`.
- No Playwright execution and no Chromium download (mission rule); browser behaviour rests on the owner's 2026-11-23 machine run.
- No hosted writes of any kind; the Supabase helper refuses non-SELECT/WITH queries. No customer PII was pulled (settlement aggregates only).
- `codex/logistics-wip` (@ `b71aa11`) and other agents' uncommitted WIP on the owner's machine are not available here — recorded as unverifiable, never invented.
- No performance measurement (Lighthouse/CWV/timings) was taken; performance statements are structural.
- Arabic translation quality was not judged (needs a native reviewer).
