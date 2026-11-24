# Gifto — Documentation Health

- **Audit date:** 2026-11-24
- **Worktree:** `~/workspace/gifto-master-audit`, HEAD `54c780b`
- **Source:** specialist documentation report (`/tmp/gifto-audit/docs-health.md`, 60 files inventoried). Method: read-only file reads + read-only `git log`/`git show`/`git rev-list`/`git ls-files` + one read-only run of `node scripts/check-i18n-keys.mjs`. No files modified, no hosted access at the time that report was written.
- **Coordinator update:** that report recorded hosted state as Unknown. **Hosted verification in this audit supersedes those caveats** (see `DATABASE_AND_MIGRATIONS.md` §2): migrations 1–71 applied, courier columns present, zero drift, the migration-36 backfill executed on hosted. Where the specialist report says "Unknown (no hosted access)", the live result is now given in brackets.

## 1. Executive summary

The documentation set is large (60 files) and unusually self-aware: 25 files already carry `SUPERSEDED`/`HISTORICAL` banners from the 2026-11-20 P0-08 cleanup — good hygiene. The five newest reports (2026-11-24, `a52ebc3`) are mostly accurate against the code — the i18n and Brevo claims verify cleanly — but the audit tip itself (`54c780b`) has **overtaken the newest docs**: the two commits on top of `a52ebc3` (`dc5a59e`, `a876e85`) committed the very agent WIP that `docs/AGENT_WIP_INVENTORY.md` describes as uncommitted and unmergeable, including a migration-36 legacy payout-proof backfill that directly contradicts the C1-reclassification recommendation — and hosted verification now proves **that backfill actually executed on hosted**. That is the single most important documentation contradiction in the repo.

**Counts (specialist classification of the 60 inventoried files):**

| Classification | Count |
|---|---|
| Current (accurate at this tip, or accurate as of its stated HEAD/date) | 13 |
| Current but stale in part (outdated counts, ranges, or superseded-by-later-events rows) | 11 |
| Historical / superseded (self-flagged with a banner, kept as record) | 25 |
| Contradictory (asserts something another doc or the tip contradicts) | 6 docs involved in the contradictions in §4 |
| Duplicate / near-duplicate content | 5 clusters (§5) |
| Missing operational instructions (gaps, §6) | 5 gaps |

Companion facts at this tip (verified): 71 forward migrations, 18 RLS suites, 78 Vitest files under `src/`, 55 rollback files.

## 2. Inventory (condensed)

### 2.1 `docs/` root (33 files)

| File | Lines | Last commit | Class |
|---|---|---|---|
| `AGENT_WIP_INVENTORY.md` | 140 | 2026-11-24 `a52ebc3` | **X** — stale at this tip (§4.2) |
| `BREVO_SMTP_SETUP.md` | 203 | 2026-11-24 `a52ebc3` | **C** — verified, current |
| `DECISIONS.md` | 223 | 2026-11-22 `d4e6e0e` | **C\*** — missing Brevo + closure decisions (§3) |
| `DECISION_CLOSURE_REPORT.md` | 425 | 2026-11-24 `a52ebc3` | **C\*** — migration-36 blocker claim overtaken by backfill (§4.1) |
| `DEMO_CONTAINMENT_AND_FINANCIAL_RECONCILIATION_PLAN.md` | 1289 | 2026-11-23 `b369412` | **C\*** — range 28–66; C1 now contradicted by committed + executed backfill |
| `DEMO_DATA_GUIDE.md` | 238 | 2026-11-23 `7905bf0` | **C** |
| `DEMO_SEPARATION_CHECKLIST.md` | 208 | 2026-11-23 `7905bf0` | **C** |
| `DEPLOYMENT_PREFLIGHT_AND_STAGING_REHEARSAL.md` | 186 | 2026-11-23 `b369412` | **C\*** — range 28–66, "17 suites" |
| `GIFTO_PHASE_0_STAGE_1_REPORT.md` | 313 | 2026-11-20 `3630be3` | **H** (self-flagged) |
| `GIFTO_PRE_LAUNCH_AUDIT.md` | 545 | 2026-11-20 `3630be3` | **S** (self-flagged) |
| `HOSTED_COURIER_SCHEMA_INVESTIGATION.md` | 201 | 2026-11-24 `a52ebc3` | **C\*** — range 28–66; "36 fails" overtaken; hosted dispute now **resolved live** (columns present) |
| `HOSTED_STATE.md` | 378 | 2026-11-22 `7848ccd` | **C\*** — counts stale: 66/17 vs 71/18; monitoring row contradicts recorded approval (§3) |
| `I18N_CI_AUDIT.md` | 137 | 2026-11-24 `a52ebc3` | **C** — all claims verified |
| `IMPLEMENTATION_REVIEW.md` | 79 | 2026-11-20 `3630be3` | **S** |
| `LAUNCH_READINESS_PLAN_REVIEW.md` | 267 | 2026-11-20 `3630be3` | **H** |
| `MIGRATION_36_FINANCIAL_RECONCILIATION.md` | 502 | 2026-11-23 `b369412` | **C\*** — evidence verified; recommendation contradicted by committed + executed backfill (§4.1) |
| `MUSE_IMPLEMENTATION_SUMMARY.md` | 169 | 2026-11-23 `dc37ff0` | **C\*** — accurate at `c5c2bdf`; post-pilot work not reflected |
| `MUSE_MISSION_REPORT.md` | 668 | 2026-11-23 `17f6002` | **C\*/D** — verbatim duplicate of the four MUSE reports; "all findings current" now stale |
| `MUSE_NEXT_ACTIONS.md` | 110 | 2026-11-23 `dc37ff0` | **C\*** — items 1, 12 stale (Brevo decided; worker done) |
| `MUSE_PRODUCTION_BLOCKERS.md` | 63 | 2026-11-23 `dc37ff0` | **C\*** — SMTP + mail-worker rows stale |
| `MUSE_TEST_RESULTS.md` | 453 | 2026-11-23 `8c90221` | **C** — most current test record |
| `NEXT_PHASE_PLAN.md` | 96 | 2026-11-20 `3630be3` | **H** |
| `OWNER_DECISIONS_BRIEF.md` | 115 | 2026-11-20 `3630be3` | **S** |
| `PHASE_2A_MANAGED_VENDOR_ONBOARDING.md` | 168 | 2026-11-20 `3630be3` | **C\*** — unflagged, 2026-11-20; currency unassessed |
| `PHASE_2_PLAN.md` | 287 | 2026-11-20 `3630be3` | **C\*** — old plan, partially annotated |
| `POST_MERGE_READINESS.md` | 102 | 2026-11-20 `3630be3` | **H** |
| `RUNBOOK_RETURNS_AND_SETTLEMENTS.md` | 288 | 2026-11-20 `ddc2d6f` | **C** — only true incident/ops runbook in the repo |
| `STAGE_B_MIGRATION_RECONCILIATION.md` | 396 | 2026-11-23 `b369412` | **C\*** — best hosted evidence as of 2026-11-22; range 28–66; §9.1 superseded by MIGRATION_36 doc. [Hosted dispute it frames is now **resolved live**: 28–71 applied.] |
| `STATUS_REPORT.md` | 146 | 2026-11-20 `3630be3` | **S** |
| `VENDOR_DASHBOARD_BACKEND_GAPS.md` | 374 | 2026-11-20 `3630be3` | **H** |
| `VENDOR_DASHBOARD_BACKEND_IMPLEMENTATION.md` | 96 | 2026-11-20 `3630be3` | **H** |
| `VENDOR_DASHBOARD_BACKEND_SECURITY_AUDIT.md` | 598 | 2026-11-20 `3630be3` | **H** |
| `settlement-payout-atomicity.md` | 87 | 2026-11-20 `36134d9` | **C\*/D** — duplicates `docs/review/SETTLEMENT_PAYOUT_ATOMICITY_FINAL_REPORT.md` |

### 2.2 `docs/launch/` (5 files + image-optimization assets)

`CATALOGUE_AND_MERCHANDISING.md` (**C\***, unflagged, oldest active doc, 2026-11-18); `CSP_ENFORCEMENT_PLAN.md` (**C**); `HOMEPAGE_04_READINESS_REPORT.md` (**H**, self-flagged); `OWNER_INPUT_CHECKLIST.md` (**C**); `SMOKE_TEST_PLAN.md` (**C**); `image-optimization/` manifest + assets (**C\***, build-artifact data).

### 2.3 `docs/monitoring/` (1 file)

`UPTIME_ROBOT.md` (**C\***) — monitors defined, **not yet created** in any dashboard; a plan, not a live state.

### 2.4 `docs/project-audit/` (8 files, all 2026-11-20 `3630be3`)

All **S** (superseded) except `DEVELOPMENT_GUIDE.md` (**C\***, the only file here without a banner; currency unassessed, likely stale in parts).

### 2.5 `docs/review/` (9 files, mostly 2026-11-20 `3630be3`)

All **H/S** except `P0_REMEDIATION_READINESS_REPORT.md` (2026-11-22 `7848ccd`, **C\***, unflagged, superseded in substance by later MUSE_* reports) and `SETTLEMENT_PAYOUT_ATOMICITY_FINAL_REPORT.md` (**C\*/D**, duplicates the root atomicity doc).

### 2.6 `README.md` (563 lines, 2026-11-22 `7848ccd`) — **C\***

Correctly delegates hosted state to `docs/HOSTED_STATE.md` ("Current hosted state is tracked in exactly one place"), but its own embedded counts are stale: "forward migrations run to 66", "Migrations 28-66 are applied locally only", "fresh database through migrations 1–66", "all 17 suites", "i18n (774 calls)" vs 788 at this tip. The 774→788 drift is real (new translator calls since 2026-11-22); the 66→71 / 17→18 drift is the migration-67–71 + reviews-suite growth.

## 3. Verification of the five recent reports (2026-11-24, `a52ebc3`)

| Doc | Verdict | Key evidence |
|---|---|---|
| `DECISION_CLOSURE_REPORT.md` | Mostly AGREE | Migration 42/38 citations check out; settlement/return-courier/delivery-date "already implemented" claims verified by file existence. **DISAGREE at this tip:** "Migration 36 is a hard blocker / fails as written" — the committed backfill removes the failure mode. "No owner decisions recorded for the three items" — AGREE (DECISIONS.md silent). |
| `HOSTED_COURIER_SCHEMA_INVESTIGATION.md` | Mostly AGREE, one overtaken claim | Migration-42 contents table verified; 2026-11-22 probe evidence correctly sourced to STAGE_B; `codex/logistics-wip` (`b71aa11`) **UNVERIFIABLE/BLOCKED** here (absent from this worktree). **DISAGREE as a description of this tip:** the backfill is not uncommitted — it is committed in `a876e85`. [Coordinator: the hosted dispute this doc frames is now **resolved live** — courier columns present.] |
| `BREVO_SMTP_SETUP.md` | AGREE (one nuance) | Mail code provider-agnostic (no "brevo" string in `mail.ts`); relay `smtp-relay.brevo.com:587`, 300/day free, SMTP key ≠ API key confirmed against Brevo's own pages. Nuance: SMTP login is not always the account email — for some accounts it is a generated `[ID]@smtp-brevo.com` address. No live send verified anywhere — the doc correctly says so. |
| `I18N_CI_AUDIT.md` | AGREE on every checkable claim | `ci.yml:37-41` runs `check:i18n`; pre-fix script read only `en.json`; live run: 788 calls, 648/648 keys identical; fail modes verified as code. |
| `AGENT_WIP_INVENTORY.md` | DISAGREE on most state claims at this tip | Written on `muse/decision-closure-brevo` @ `8c90221` describing uncommitted WIP; at `54c780b` the branch is `audit/master-project-audit`, HEAD is `54c780b`, the WIP is **committed** (`dc5a59e`, `a876e85`), `b71aa11` absent, and the `audit/phase-2-refunds-orders-seo` claim (ahead 3, `25eb506`) is false here (at `34f30a6`, 0 ahead). Accurate as a historical snapshot of the user's machine; wrong as a description of this branch. Needs a dated correction or archival banner. |

### DECISIONS.md — D-06–D-10 reflected in code?

| Decision | Reflected in code? |
|---|---|
| D-06 delivery free through launch; later flat fee per shop, paid by customer, kept by delivering vendor; review after 100 orders | **YES for the free part** (`delivery_fee_minor = 0` hardcoded in checkout RPCs). The "later flat fee" and "review after 100 orders" have no code, no counter, no trigger — correctly unimplemented, but also un-tracked. |
| D-07 no subscription at launch; commission-only | **YES** — no subscription tables anywhere. |
| D-08 vendor holds COD cash; weekly Sunday remittance; mark-paid attests receipt + bank reference; post-payout refund via clawback/next settlement or direct repayment | **PARTLY** — proof + clawback/direct-repayment in code. **Weekly Sunday cadence has no enforcement**: no scheduler, no reminder, no "prior week" batching — only UI copy. Cadence is a human process, not a system rule; the doc does not say that explicitly. |
| D-09 7-day return window; admin approves, vendor inspects; courier payer rule; manual restock; suborder-level; customer can cancel own case | **YES** — 7-day window in migration 35; inspection + payer in migration 52; cancel path in migration 45. |
| D-10 migration 30 forward-only, no rollback | **YES** — header + no rollback file. |
| D-01–D-05 | **YES as documented** (not re-audited line-by-line). |
| **Missing from DECISIONS.md** | **GAP:** no entry for Brevo SMTP choice (decided 2026-11-23), the three decision-closure items, or the C1 selection (recorded only in MIGRATION_36 §1.5 and DEMO_CONTAINMENT §1.5 as "Owner has selected C1"). The log that claims to be the decision record is missing the three most recent owner decisions. |

### HOSTED_STATE.md — the "single source of truth" is behind the best evidence

- Honest about its limits (every hosted row marked UNVERIFIED, observation date 2026-11-20) — correct discipline, keep it.
- Stale counts: 66 migrations / 17 suites (tip: 71 / 18); migrations 67–71 absent from its table entirely.
- Migration-42 row ("Not applied, UNVERIFIED") predates the STAGE_B probes that upgraded the claim to OBSERVED-at-27; it does not cite STAGE_B. [Coordinator: now superseded again — **hosted verified live at 71, columns present**.] A reader of HOSTED_STATE.md alone would not learn the probe results, nor that two paid settlements carry LEGACY proof.
- Monitoring row says Sentry+UptimeRobot "Muse-recommended only; no separate explicit owner approval was recorded" — **contradicted** by the recorded 2026-11-20 owner approval ("monitoring Sentry + UptimeRobot APPROVED") and by `MUSE_PRODUCTION_BLOCKERS.md` ("approved 2026-11-20, never wired"). The row was written before the approval was recorded and never updated. Agree the monitors are still not created.
- Still accurate: staging does not exist, backups/PITR unverified, Auth dashboard settings unverified, SMTP open/blocked, legal pages draft, PAT rotation open.

## 4. Top contradictions (ranked)

### #1 — The migration-36 backfill: invented payout proof committed AND executed, contradicting the owner-selected C1 path (HIGHEST SEVERITY)

- **For the backfill:** `supabase/migrations/00000000000036_payout_proof.sql:50-61` at tip `54c780b`, committed as `a876e85`. Sets `paid_amount_minor = total_minor`, `transfer_method = 'other'`, `transfer_reference = 'LEGACY-' || substr(id::text, 1, 8)` on paid settlements lacking proof, before the CHECK.
- **Against it:** `docs/MIGRATION_36_FINANCIAL_RECONCILIATION.md` §1.6–1.7 ("C1 … reclassify … fabricate no proof"; "A false paid attestation is the actual defect"); `docs/DEMO_CONTAINMENT…` §1.5–1.6 ("Owner has selected C1 … It fabricates no proof"); `docs/HOSTED_COURIER_SCHEMA_INVESTIGATION.md` ("Do not merge an invented backfill"); `docs/AGENT_WIP_INVENTORY.md` ("Do not merge without owner/finance approval"); `docs/DECISION_CLOSURE_REPORT.md` ("Blocked … Do not merge an invented backfill").
- **Coordinator escalation:** hosted verification proves the backfill **ran** — the two settlements carry the exact LEGACY proof and the applied v36 statement matches the file including the backfill. The docs that say "migration 36 fails as written" are now false of both the file and hosted, and the docs that say "C1 is the selected path" are now false of the branch *and* of hosted. **Both sides cannot be true; the branch state, the decision record, and hosted have diverged with no owner decision recorded for the change.** The `wip:` prefix signals the author knew this was not final — but a `wip:` commit inside a migration file on a branch is still a committed migration change, and on hosted it is now a live record.
- **What must happen:** owner/finance must explicitly choose C1 (now only achievable as a new forward correction) or the backfill, and the losing artifact must be reverted from the migration file and the docs updated in the same commit.

### #2 — `docs/AGENT_WIP_INVENTORY.md` is stale at its own tip

See §3 table. Needs a dated correction at minimum; once the WIP disposition is decided, archive it (its subject — uncommitted WIP — no longer exists on this branch). Note `54c780b` itself also committed `.impeccable.md`, `.github/copilot-instructions.md`, and a 545 KB `MUSE_MISSION_REPORT.pdf` at the repo root — none of which the inventory mentions.

### #3 — SMTP decided, but two MUSE docs still say undecided; mail worker done, but two MUSE docs still say missing

Brevo decided 2026-11-23; `BREVO_SMTP_SETUP.md` (2026-11-24) is current. `MUSE_PRODUCTION_BLOCKERS.md` ("SMTP provider + sending domain not chosen") and `MUSE_NEXT_ACTIONS.md` item 1 ("Choose the SMTP provider") are frozen at `dc37ff0` and now wrong on the decision, though still right that no send is verified. Same for the mail-outbox retry worker: DONE in `65ecefc`, still listed as missing in both docs. **Fix:** one-line dated amendments to both docs, or an archival banner pointing at BREVO_SMTP_SETUP.md and MUSE_TEST_RESULTS.md.

### #4 — Stale counts: 66 migrations / 17 suites / 774 i18n calls

`docs/HOSTED_STATE.md` and `README.md` (and `DEPLOYMENT_PREFLIGHT…` "17 suites") still state the 2026-11-22 numbers. Tip: **71 migrations, 18 suites, 788 calls** (all verified — `ls` counts + a live `check:i18n` run). Any doc that quotes a count without a date is now wrong. Fix is mechanical (update numbers + date); the pattern matters: counts rot within days.

### #5 — Migration range 28–66 vs 28–71

STAGE_B, DEMO_CONTAINMENT, DEPLOYMENT_PREFLIGHT, and HOSTED_COURIER all frame the hosted problem as "migrations 28–66". Migrations 67–71 exist locally and were equally unapplied on hosted by the same evidence, but no probe ever covered them and no doc discusses their hosted status. [Coordinator: now resolved — **28–71 all applied**, verified live.] The "28–71" phrasing in the 2026-11-24 docs is correct as a *sequence to apply*; the "28–66 objects absent" phrasing is correct only as a *probe result*. The two phrasings are used interchangeably in places — they are not interchangeable.

### #6 — `docs/HOSTED_STATE.md` as "single source of truth" is behind the best evidence

See §3. Its migration-42 row predates STAGE_B; its monitoring row contradicts the recorded owner approval. A doc that declares itself the single source of truth must be the freshest doc — it is currently the stalest of the current docs (last commit 2026-11-22). [Coordinator: it is now also behind the live hosted verification in this audit.]

### #7 — `docs/MUSE_MISSION_REPORT.md` "all findings, gates, and verdicts below are current"

True at `dc37ff0` (2026-11-23). At this tip it is stale in the same ways as §4.3 (Brevo, mail worker) and it duplicates the four MUSE docs verbatim (§5). Its "current" claim needs a dated amendment or the file should be archived in favour of the four source reports + the post-pilot section of MUSE_TEST_RESULTS.md.

## 5. Duplication (5 clusters)

| Cluster | Files | Assessment |
|---|---|---|
| Mission reports | `MUSE_MISSION_REPORT.md` vs the four MUSE_*.md reports | **Verbatim duplicate** (668 lines, combined by `17f6002`). Keep the four source reports; archive the combined file or mark it as a frozen snapshot of `dc37ff0`. |
| Settlement atomicity | `settlement-payout-atomicity.md` vs `docs/review/SETTLEMENT_PAYOUT_ATOMICITY_FINAL_REPORT.md` | Near-duplicate on migration 25. Keep the review/ final report; archive or cross-reference the root one. |
| Decision logs | `DECISIONS.md` vs `docs/project-audit/DECISIONS_AND_OPEN_QUESTIONS.md` | Pre-Phase-2 overlap; the project-audit file is already SUPERSEDED-flagged. No action beyond keeping the flag. |
| Hosted-state narrative | `HOSTED_STATE.md` vs STAGE_B vs MIGRATION_36 vs DEMO_CONTAINMENT vs HOSTED_COURIER | Overlapping hosted-state evidence repeated in 5 docs with different dates/ranges (27 vs 28–66 vs 28–71). Main duplication risk: same probe results re-stated with drift. Consolidate into HOSTED_STATE.md as the single table and have the others cite it by date. |
| Demo data | `DEMO_DATA_GUIDE.md` vs `DEMO_SEPARATION_CHECKLIST.md` vs DEMO_CONTAINMENT §7 | Counts (6 vendors / 36 products / 6 accounts) repeated in 3 docs; currently consistent. Low risk; checklist/guide should cite the guide as the count source. |
| Pre-Phase-2 audits | `GIFTO_PRE_LAUNCH_AUDIT.md` vs `project-audit/AUDIT_REPORT.md` vs `review/*` (6 historical) | Same era, overlapping findings. Already flagged; no action beyond archiving. |

## 6. Missing operational instructions (5 gaps)

| Gap | What exists | What is missing |
|---|---|---|
| **General incident runbook** | `RUNBOOK_RETURNS_AND_SETTLEMENTS.md` (returns/settlements only); `SMOKE_TEST_PLAN.md` | No runbook for: site down, Supabase outage, Vercel deploy failure/rollback, auth outage, payment/COD dispute escalation, data-corruption response. No on-call, no severity levels, no comms template. |
| **Backup / PITR restore procedure** | `scripts/backup-drill.sh` (restore into disposable DB + count compare); HOSTED_STATE.md "backup drill BLOCKED" row | No written runbook for taking/using a real backup: who runs it, where dumps live, how PITR is invoked in the Supabase dashboard, expected RTO/RPO, or evidence the drill ever ran. Backups/PITR **Unknown** (no dashboard access). |
| **Staging deploy sequence** | `DEPLOYMENT_PREFLIGHT_AND_STAGING_REHEARSAL.md` (phases 0–3, migration rehearsal) | Exists but range-stale (28–66), predates migrations 67–71 and the migration-36 backfill dispute. No production cutover checklist (maintenance window, backup snapshot, verification queries, rollback decision point) outside STAGE_B's recommendations. Needs a refresh to 28–71 + a go/no-go gate. |
| **Monitoring setup** | `UPTIME_ROBOT.md` (definitions); Sentry SDK installed, no DSN | No step-by-step "create the monitors / set the DSN / verify an alert fires" runbook with the owner-approved (2026-11-20) Sentry + UptimeRobot choice; HOSTED_STATE.md still says approval was not recorded. |
| **C1 execution runbook** | `supabase/corrections/` + `scripts/rehearse-c1.sh` + C1 described in MIGRATION_36/DEMO_CONTAINMENT docs | No single execution runbook naming the two-person application/verification step, the evidence snapshot contents, and the abort criteria. **Now entangled with the backfill contradiction (§4.1) — and C1 is dead on hosted, so the runbook cannot be written until the forward correction is decided.** |
| **Rollback procedure for 28–71** | 55 rollback files; migration 30 intentionally has none (D-10) | No doc states which of 28–71 are safely reversible, in what order, or that rollbacks 59/61–65 reintroduce gaps by design. A rollback runbook is missing. |
| **Post-merge / PR process** | `POST_MERGE_READINESS.md` (historical, 2026-11-20) | No current doc for merging `muse/gifto-autonomous-improvement` → `main`: required gates, who reviews, staging verification after merge, or the branch inventory (audit branch, `muse/decision-closure-brevo`, `codex/logistics-wip`, committed WIP in `dc5a59e`/`a876e85` not covered by any merge doc). |

SMTP setup steps are **now covered** by `BREVO_SMTP_SETUP.md` + `.env.example`; the remaining gap is execution, not documentation (no account, sender, domain, DNS, or credential exists yet; no real send verified).

## 7. Documents describing unfinished features as complete

1. **`MUSE_PRODUCTION_BLOCKERS.md`** — "All P0/P1/P2/P3/P4/P5/P6 code work on this branch is done and gated". True at `c5c2bdf` for the mission scope, but three polish items were NOT STARTED and the mail worker was missing; the sentence has no scope qualifier a new reader can see.
2. **`HOSTED_STATE.md`** — "CI: THREE-JOB CI PASSED ON PR #1 REMEDIATION COMMIT `d4e6e0e`" is presented as a current CI row, but it is a 2026-11-22 snapshot; the `app` job's i18n step has since changed (`63a27e3`), and no CI run at this tip is recorded anywhere. It reads as "CI is green" when it means "CI was green once". [Coordinator: CI at this tip is green — run 45284623044 on `54c780b`, 2026-11-23 22:58 UTC — but HOSTED_STATE.md still does not record it.]
3. **`DECISION_CLOSURE_REPORT.md`** — the "Already implemented" sections are accurate, but the report inherits `MUSE_TEST_RESULTS.md`'s table, which lists the mail worker, review stars, BreadcrumbList, and LIKE-escaping as DONE — those are **Implemented-but-unverified** at runtime (no DB was reachable; the doc itself says "Not re-run this pass: RLS suites, C1 rehearsal, Playwright"). The caveat lives in the test-results doc, not in the closure report.
4. **`DEMO_SEPARATION_CHECKLIST.md`** — does not overclaim; correctly says the isolated environment does not exist yet. No issue.
5. **`SMOKE_TEST_PLAN.md` / `UPTIME_ROBOT.md`** — plans, not completion claims. UptimeRobot monitors are **defined but not created**; nothing in the repo records that gap except HOSTED_STATE.md's row.

## 8. Sources of truth & archiving

**Keep as sources of truth (after the fixes noted):** `DECISIONS.md` (once Brevo/C1/closure added); `HOSTED_STATE.md` (once refreshed to 71/18/788 + STAGE_B cited + live verification in this audit cited); `BREVO_SMTP_SETUP.md`; `I18N_CI_AUDIT.md`; `MUSE_TEST_RESULTS.md` (keep updating it rather than creating new test reports); `RUNBOOK_RETURNS_AND_SETTLEMENTS.md`; `README.md` (strip embedded counts or date them; delegate hosted-state claims to HOSTED_STATE.md, as it already claims to).

**Archive (or banner as frozen snapshots — do not delete, they are the audit trail):** all 25 self-flagged SUPERSEDED/HISTORICAL files (consider moving them to `docs/archive/` in a future cleanup so `docs/` only holds live documents); `MUSE_MISSION_REPORT.md` (frozen snapshot of `dc37ff0`); `settlement-payout-atomicity.md` (in favour of the review/ final report); `AGENT_WIP_INVENTORY.md` (dated correction at minimum; archive once the WIP disposition is decided); STAGE_B §9.1 (already superseded by the MIGRATION_36 doc — add a banner to STAGE_B saying so).

**Do not treat as sources of truth:** `MUSE_PRODUCTION_BLOCKERS.md` and `MUSE_NEXT_ACTIONS.md` until amended for Brevo + mail worker; `HOSTED_STATE.md` until refreshed; anything quoting "28–66" as the current migration range.

**Convention to adopt (highest-value process fix):** a dated "Update (YYYY-MM-DD): …" note at the top of any frozen report when a later event changes one of its claims — and apply it to the two MUSE docs, HOSTED_STATE.md, and README.md now. The pattern in this audit is consistent: docs frozen at a HEAD (`c5c2bdf`/`dc37ff0`) keep being read as present-tense truth after the code moved on (`65ecefc`, `8134be2`, `63a27e3`, `a52ebc3`, Brevo decision, hosted 28–71 run).
