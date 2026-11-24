# Gifto — Launch Readiness

- **Audit date:** 2026-11-24
- **Worktree:** `~/workspace/gifto-master-audit`, HEAD `54c780b`
- **Verdict: NOT READY for public launch. CONDITIONALLY READY for closed pilot** — subject to the six conditions in §1. This document is the go/no-go checklist for both gates. Every item cites its evidence document.

## 1. Closed-pilot gate — six conditions (ALL must hold)

| # | Condition | Evidence | Status |
|---|---|---|---|
| 1 | **Revert the `dc5a59e` degradation** (vendor/orders courier columns, admin/settlements proof fields; re-check admin/orders and admin/refunds), extract the genuine new work inside it (vendor reviews page + nav entries) into its own change, and re-run the full gates. Do not merge `dc5a59e` as-is. | `DATABASE_AND_MIGRATIONS.md` §5; `GIT_BRANCH_INVENTORY.md` §4 | **NOT DONE** — degradation live at HEAD |
| 2 | **Decide the forward correction for the two LEGACY-proof settlements** (new owner decision — C1 and its rollback are both dead on hosted) or document explicit acceptance of the fabricated proof as the record. Do not run C1 or its rollback against hosted. | `FINANCIAL_INTEGRITY.md` §5; `DATABASE_AND_MIGRATIONS.md` §4 | **NOT DONE** — no decision recorded; D-11 still only proposed |
| 3 | **Brevo SMTP live + a real send verified** (account, sender/domain, DNS, credentials via secure vault only; Supabase Auth SMTP configured separately). | `PRODUCT_FEATURE_MATRIX.md` C-35; `DOCUMENTATION_HEALTH.md` §3 (Brevo doc verified) | **NOT DONE** — Brevo decided 2026-11-23; no account, sender, or send verified |
| 4 | **Monitoring live** — Sentry DSN set and an alert verified; UptimeRobot monitors created and verified (approved 2026-11-20). | `PRODUCT_FEATURE_MATRIX.md` A-25; `CI_CD_AND_DEPLOYMENT.md` §3 | **NOT DONE** — DSN unset, monitors not created, no alert ever fired |
| 5 | **Merge the 58-commit line via PR with CI green** (merge commit, no squash), after conditions 1–2 are resolved on the branch. | `GIT_BRANCH_INVENTORY.md` §2, §7 | **NOT DONE** — no PR ever opened for `muse/decision-closure-brevo` |
| 6 | **P1 security fixes or accepted risk, recorded in writing** — auth rate-limit bypass (P1-1), signed-in checkout fail-open (P1-2), staff PII masking (P1-3), staff-invite-before-acceptance (P1-4). | `SECURITY_AND_RLS.md` §3 | **NOT DONE** — all four open |

## 2. What is already satisfied for the pilot

- **Hosted schema verified live:** migrations 1–71 applied, courier columns present, zero drift, demo orders disabled (`DATABASE_AND_MIGRATIONS.md` §2). The single biggest open question of the last three days is closed.
- **All runnable gates green, re-run in this audit:** lint, typecheck, Vitest 697/697 (78 files), build 53/53, check:i18n pass, RLS 18/18, FIN-001 + H-01 concurrency pass, C1 rehearsal pass on disposable DB, node:test 13/13 (`TESTING_AND_QUALITY.md` §1).
- **CI green on HEAD:** run 45284623044 on `54c780b`, all 3 jobs green (`CI_CD_AND_DEPLOYMENT.md` §1.2).
- **Money machinery:** idempotent checkout, price-consent, concurrency-safe mark-paid, clawbacks, void-restore, explicit cancelled-refund approval (TEST 14f).
- **Demo containment load-bearing in code** and confirmed on hosted (`demo_orders_allowed = false`).
- **Mail outbox + worker + caps implemented** (needs only SMTP configuration to deliver).
- **100-feature inventory complete:** 4 DONE, 79 IMPLEMENTED, 11 PARTIAL, 2 BLOCKED, 4 NOT STARTED (`PRODUCT_FEATURE_MATRIX.md`).

## 3. Public-launch gate — additional blockers (ALL must hold, on top of §1)

| # | Blocker | Evidence | Status |
|---|---|---|---|
| P-1 | **Staging environment exists and the staging gate passes:** migrations in order, smoke test, monitoring alert verified, backup restore drill. | `CI_CD_AND_DEPLOYMENT.md` §2, §4 | **NOT DONE** — no staging exists; production is the first hosted target |
| P-2 | **Backup / PITR restore drill run and documented** (RTO/RPO recorded; runbook written). | `DOCUMENTATION_HEALTH.md` §6 | **NOT DONE** — script exists, drill never run, hosted backup state Unknown |
| P-3 | **Branch protection verified** (required checks, required reviews, no direct push to `main`). | `CI_CD_AND_DEPLOYMENT.md` §1.4 | **UNKNOWN** — endpoint needs auth |
| P-4 | **Production deployment commit verifiable** (commit SHA / build marker on the deployed app). | `CI_CD_AND_DEPLOYMENT.md` §2 | **NOT DONE** — no version marker; HTTP 200 only |
| P-5 | **Legal pages finalised** — six pages with draft notices replaced by approved content with real company/legal details; final legal approval is an external requirement. | `PRODUCT_FEATURE_MATRIX.md` C-34; `UX_PERFORMANCE_AND_I18N.md` §3.4 | **NOT DONE** — all six pages still draft |
| P-6 | **SEO indexing flip only after hosted verification** — hosted is now verified, so this is an owner decision, not a technical block. | `PRODUCT_FEATURE_MATRIX.md` C-38 | Owner decision pending |
| P-7 | **P1 security items fixed** (not merely accepted) — P1-1..P1-4. | `SECURITY_AND_RLS.md` §3 | Open |
| P-8 | **R-01 return-after-payout path fixed and tested** (physical return can never complete after payout today). | `FINANCIAL_INTEGRITY.md` §3 | Open |
| P-9 | **COD cash ledger + payout-proof capture + reconciliation** (B-03/A-16/B-08) in place before scaling past pilot. | `FINANCIAL_INTEGRITY.md` §3, §7 | Open |
| P-10 | **Performance measured** — Lighthouse/CWV on the deployed build; homepage preview fan-out (500 rows) and vendor-analytics caps (20k rows) addressed or accepted with numbers. | `UX_PERFORMANCE_AND_I18N.md` §1 | **NOT DONE** — no timings exist anywhere |
| P-11 | **Playwright lanes run in CI** (or at minimum `--list`) + wishlist-restore unit test (T-01) + default-lane hosted-URL refusal (T-06). | `TESTING_AND_QUALITY.md` §7 | Open |
| P-12 | **Arabic storefront gaps closed or explicitly deferred** — auth forms, pagination, legal pages, navigation-guard dialog; dashboards English-only decision re-confirmed for Arabic-first vendors. | `UX_PERFORMANCE_AND_I18N.md` §3–§4 | Open |
| P-13 | **F-01 404 empty DOM** — decided: accept (SEO impact limited, Googlebot executes JS) or fund the root-layout restructure. No blind re-attempt. | `UX_PERFORMANCE_AND_I18N.md` §1.4 | Open (decision) |
| P-14 | **GitHub PAT rotation** — both PATs pasted in chat on 2026-11-20 must be revoked/rotated. | Standing commitment | Open |
| P-15 | **Plant Pot restore** — the deleted Nile Blossoms demo product restored (re-run demo seed with the Batch 4 guard, or re-add by hand) or confirmed with the vendor. | `PRODUCT_FEATURE_MATRIX.md` V-08 | Open (data issue) |

## 4. Owner decisions still outstanding

| Decision | Consequence if undecided | Status |
|---|---|---|
| **D-11 / forward correction** for the two LEGACY settlements (forward correction vs explicit acceptance) | Blocks pilot condition 2; every migration-36 doc stays suspect | **Open — new, most urgent** |
| R-04 coverage fail-open policy (signed-in checkout quota failure) | P1-2 stays open; pilot condition 6 needs an accepted-risk record at minimum | Open since 2026-11-20 |
| F-04 refund window at open vs resolve | Refund window stays at delivery (current deliberate policy) | Open |
| CAPTCHA on signup + Supabase Auth dashboard limits check | P1-1 stays open | Open |
| Commission % | Never invented; per-vendor agreed rate only | Open by design (per-shop) |
| SEO indexing flag | Flip waits (now unblocked technically) | Open |
| Legal approval + real company details | P-5 stays open | External requirement |
| Live tracking / search threshold / settlement-courier-date policies (the three decision-closure items) | V-14/C-37/C-04 policy gaps stay open | Open — no owner decision recorded |
| Delivery-date enforcement + same-day rules + return-courier charge as a financial charge | C-15/C-22/B-06 stay PARTIAL | Open |
| Vendor-dashboard localisation (before or after pilot) | Dashboards stay English-only | Open |
| Brevo sending domain / verified sender address + credentials (secure vault only) | Pilot condition 3 stays open | In progress (decided 2026-11-23) |

## 5. Staging gate (before production — from the owner's 2026-11-23 plan, still applicable)

1. Migrations applied in order on staging (28–71 sequence preserved; migration 67 before app code).
2. Smoke test on staging (checkout, vendor confirm/ship, refund, settlement, mail outbox, banners).
3. Monitoring alert verified on staging (Sentry error + UptimeRobot down-check fire and are received).
4. Backup restore drill (restore into disposable DB + count compare; RTO/RPO recorded).
5. Go/no-go recorded in writing before any production cutover.

## 6. Pilot operating constraints (recommended)

- **Tightly-controlled pilot only:** a small number of real vendors, all onboarded manually (V-02 self-registration is deliberately absent); demo vendors must not accept new orders in production (demo containment is in code and verified on hosted, but confirm operationally).
- **Cash discipline:** COD cash is untracked (B-03) — reconcile manually every Sunday until the ledger exists; do not scale order volume past what manual reconciliation can cover.
- **Email:** until Brevo is verified, no order/status/refund/support email delivers — pilot communications need a manual fallback (phone/WhatsApp) for order confirmations.
- **No new paid settlements without payout proof attached** — the LEGACY precedent must not become the norm; proof capture (P-9) is a launch condition, not a nice-to-have.
- **Freeze rule:** no further WIP-preservation commits into migration files or degradation commits onto the merge line; the branch merges only after §1 conditions 1–2 are resolved and gates re-run.
