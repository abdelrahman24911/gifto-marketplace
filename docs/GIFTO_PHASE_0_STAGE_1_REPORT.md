> **HISTORICAL — 2026-11-20 (P0-08).** Dated snapshot of a past verification (see the date in the file). Its numbers and hosted-state claims were true when written and are not current. Current state: `README.md`, `docs/HOSTED_STATE.md` (single hosted-state table), `docs/DECISIONS.md`. Kept as a record; its findings were not edited.

# Gifto Marketplace — Phase 0 Stage 1 Report

**Date:** 2026-11-08
**Mode:** Read-only investigation. No files, DB, deployment, or git state were changed during Stage 1.
**Verification:** C = confirmed by inspection; A = confirmed absence; D = documented only; N = not verified (hosted); R = not run (tests/build).

**Verdict: NOT READY for production.** P0: 1, P1: 3, P2: 9, P3: 8. No silent data-loss defect was found in forward migrations 20–24. The release blocker is state mismatch: working-tree code expects migrations that are untracked and not verified on the hosted project, with no staging/backup/rollback gate.

**Scope note:** This report covers release mechanics for migrations 20–24. It does not re-audit the product/security findings already recorded in `docs/GIFTO_PRE_LAUNCH_AUDIT.md`; those remain valid and are carried in §10.

---

## 1. Git safety report

**State:** `main` @ `d64dae573c2b791667c21d4afb97bf9fb23709f8`; `origin/main` identical; 0 ahead/0 behind; remote `https://github.com/abdelrahman24911/gifto-marketplace.git`; no FL Tase3 remote found.

**Working tree:** dirty — 10 modified, 38 untracked. No commits, pushes, pulls, stashes, checkouts, rebases, cleans, installs, or file edits during Stage 1.

**Modified (10):**
- `package.json`
- `src/app/admin/page.tsx`
- `src/app/shops/[slug]/page.tsx`
- `src/app/shops/[slug]/[productSlug]/page.tsx`
- `src/app/vendor/vendor-shell.tsx`
- `src/components/product-image.tsx`
- `src/components/shop-card.tsx`
- `src/lib/catalog.ts`
- `src/lib/guest-order.ts`
- `src/lib/supabase/database.types.ts`

**Untracked (38):** migrations 20–24; rollbacks 20–24; `supabase/tests/rls_vendor_dashboard_test.sql`; vendor support/analytics/settings routes; `shop-cover.tsx`; `shop-logo.tsx`; support/vendor libs and tests; `scripts/backfill-vendor-media.mjs`; four dashboard docs.

**Ignored but present:** `.env.local` (`.gitignore:45`); `supabase/.temp/` (`supabase/.gitignore:3`) including credential-bearing `pooler-url`; `.vercel/` (`.gitignore:44`). Secret values were not read/printed. No tracked secret patterns found. Only `.env.example` is a tracked env file.

**REL-003 — P2 — C**
- Evidence: `git status`; `.github/` absent; `package.json:5-17`.
- Impact: unreviewed/unreproducible deployment.
- Remediation: commit in logical PRs; require CI; tag releases.
- Acceptance: clean tree at release; CI green on tagged commit.

**SEC-009 — P3 — C**
- Evidence: ignored `.env.local` and `supabase/.temp/pooler-url`.
- Impact: local/archive credential exposure.
- Remediation: keep ignored, restrict access, rotate if shared.
- Acceptance: no secret files in commits/artifacts; secret scan green.

---

## 2. Migration 20–24 inventory

| Migration | Objects | App references | Rollback | Idempotency | Risk |
|---|---|---|---|---|---|
| `20_vendor_profile_privacy` | Drops `"vendors: public read active"` (`:20`); adds `cover_path`, private `address_line`, `working_hours`, `prep_time_*` (`:25-34`); validator (`:58-117`); view (`:137-155`) | `src/lib/catalog.ts:53-54,66-67,88,185-202`; `src/app/shops/[slug]/page.tsx`; settings page | `rollbacks/20:17-75`: guards 21/22/23; restores pre-20 view; restores broad read; drops columns | Mostly guarded (`if not exists`, `drop policy if exists`, `create or replace`) | MIG-001, MIG-004, MIG-006, MIG-007 |
| `21_vendor_media` | Public `vendor-media` bucket 5MB/MIME (`:14-22`); public read (`:24-28`); manager insert/update/delete (`:30-83`) | `src/components/shop-logo.tsx`, `shop-cover.tsx`, `branding-upload.tsx`, `src/app/vendor/settings/actions.ts:5,299,349` | `rollbacks/21:11-27`: refuses if objects exist; drops policies/bucket | Policies idempotent; bucket `on conflict do nothing` | SEC-001, MIG-005, MIG-009 |
| `22_vendor_pause_checkout` | Adds `is_accepting_orders` (`:13-17`); view (`:19-38`); replaces `_create_order` (`:40-322`) | `src/app/shops/[slug]/[productSlug]/page.tsx:21,128`; settings page/actions; `src/lib/catalog.ts` | `rollbacks/22:11-304`: refuses if 23 not rolled back; restores pre-22 function; drops column | `if not exists`; function replace | Code lockstep; lock order verified safe |
| `23_vendor_support_requests` | Enum/table/indexes (`:12-43`); rate-limit trigger (`:45-81`); RLS (`:83-108`); grants (`:110-114`) | `src/app/vendor/support/*`, `src/app/admin/support/*` | `rollbacks/23:7-18`: refuses if history; drops table/function/type | **Not idempotent** (`create type/table/index/trigger`) | MIG-002, SEC-004 |
| `24_analytics_scale` | Index `(vendor_id, created_at desc) include (...)` (`:10-12`) | `src/app/vendor/analytics/page.tsx:84-102`; `src/lib/vendor-analytics.ts:34-37` | `rollbacks/24:7`: drops index only | **Not idempotent/non-concurrent** | MIG-003 |

**Forward safety:** no forward migration performs `DELETE`/`UPDATE` of business data. Migration 22 lock order is product rows by id, then distinct vendor rows by id (`:182-237`); pause check is authoritative and deadlock-safe. Migration 20/22 views reapply grants. Migration 23 insert grants are column-limited (`:110-114`). Migration 24 changes no visibility/grants.

**Rollback order:** `24 -> 23 -> 22 -> 21 -> 20`. Rollback 20 is the only data-dropping rollback; 23/21 refuse on data/objects; 22 drops pause state but keeps historical orders; 24 drops only the index. No silent data-loss defect in forward migrations.

**MIG-001 — P2 — C**
- Evidence: `00000000000020...:20`; `src/app/account/orders/page.tsx:19,95-101`; `src/app/account/orders/[id]/page.tsx:40,121-130`.
- Impact: after migration 20, authenticated customers lose base-vendor reads; order-history shop names/links degrade to `"Shop"`/null; no crash.
- Remediation: privacy-safe RPC or vendor-name snapshot.
- Acceptance: signed-in customer sees historical vendor name/slug after migration 20; outsider still cannot read base `vendors`.

**MIG-002 — P2 — C**
- Evidence: `00000000000023...:12,18,38-47,79-81`.
- Impact: partial apply leaves type/table/trigger drift; retry is not deterministic.
- Remediation: guard type/table/index/trigger with `if not exists`/`drop trigger if exists` or a `DO` block that raises on incompatible state.
- Acceptance: re-run on fresh/partial DB is deterministic; test covers partial apply.

**MIG-003 — P2 — C**
- Evidence: `00000000000024...:10-12`.
- Impact: re-run fails; index build can lock writes.
- Remediation: `create index if not exists`; assess `CONCURRENTLY` outside transaction or document lock budget.
- Acceptance: re-run safe; lock window measured/accepted.

**MIG-004 — P2 — C**
- Evidence: `rollbacks/20:14-15,57-62,64-75`.
- Impact: temporary privacy regression; profile data lost if not exported.
- Remediation: export columns; restore broad policy only for coordinated old-code window; prefer privacy-safe order-history RPC so rollback can keep policy closed.
- Acceptance: export verified; broad policy not left in place; rollback rehearsal includes this.

**MIG-005 — P2 — C**
- Evidence: `00000000000021...:14-22`.
- Impact: existing bucket with wrong `public`/size/MIME config is silently retained.
- Remediation: `do update` or verify-and-raise block.
- Acceptance: bucket config asserted after migration; test covers pre-existing wrong config.

**MIG-006 — P3 — C**
- Evidence: `src/app/vendor/settings/page.tsx:16-34`; `00000000000020...:25-34`.
- Impact: UI says street address/working hours/prep times still need new columns; only `cover_path` is wired.
- Remediation: update copy or add forms per owner decision.
- Acceptance: no stale “needs new columns” copy for existing columns.

**MIG-007 — P3 — C**
- Evidence: `00000000000020...:137-152`.
- Impact: security-definer view lacks `security_barrier`; defense-in-depth gap, no confirmed exploit.
- Remediation: evaluate `security_barrier`/`security_invoker` with app behavior.
- Acceptance: view semantics tested; no RLS bypass beyond active-vendor public fields.

**MIG-008 — P3 — C**
- Evidence: `src/lib/supabase/database.types.ts:53,102-107,365,875-885`; `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:322`.
- Impact: hand-maintained types can drift from schema.
- Remediation: regenerate from staging after apply; diff review.
- Acceptance: generated types match staging schema; regeneration documented/CI-checked.

**MIG-009 — P3 — C**
- Evidence: `scripts/backfill-vendor-media.mjs` copies but leaves originals; `src/app/vendor/settings/actions.ts:298-299` deletes only from `vendor-media`.
- Impact: stale public legacy `product-images` objects remain.
- Remediation: run dry-run/apply with verification; add cleanup/retention for originals.
- Acceptance: no orphaned public legacy objects after backfill; rollback path documented.

---

## 3. Local vs hosted state

**Local:** migrations 20–24 and rollbacks exist only as untracked files. **Hosted:** not verified.

Docs conflict:
- `README.md:64`: hosted migrations 1–19.
- `docs/STATUS_REPORT.md:5,7`: migrations 1–13 at stale `357891e`.
- `docs/VENDOR_DASHBOARD_BACKEND_IMPLEMENTATION.md:5`: implemented/validated local/disposable only; nothing hosted.
- Implementation validation (`:60-67`): typecheck/lint/99 tests pass; disposable container applied 20–24; 16 RLS groups pass; rollbacks 24→20 executed and re-applied. **Documented only**, not independently verified.
- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:34`: proposal “not applied” (stale).

**Access:** Supabase CLI `2.120.0`; no `SUPABASE_ACCESS_TOKEN`/`SUPABASE_DB_PASSWORD`/`DATABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` env set. `.temp` is linked to `gifto`; ref matches README (`hqusykdyjpruysxezsrn`). No hosted command run to avoid `.temp` writes/network/secret exposure. Need owner-provided `supabase migration list --linked` output or read-only SQL against `supabase_migrations.schema_migrations`.

**DB-001 — P0 — C/N**
- Evidence: `git status`; `README.md:64`; `IMPLEMENTATION.md:5`; app refs above.
- Impact: deploy code first → 500s on shops/settings/support/admin; apply DB first without code → order-history/UI regressions; no reproducible release.
- Remediation: commit/review, verify hosted, stage, backup, deploy in lockstep.
- Acceptance: hosted migration list verified; staging green; release manifest ties commit + migration versions.

**REL-001 — P1 — C/N**
- Evidence: `docs/GIFTO_PRE_LAUNCH_AUDIT.md:289`; docs conflict.
- Impact: migration/code mismatch.
- Remediation: release manifest + lockstep runbook.
- Acceptance: one approved release record with commit, migration versions, backup ID, rollback owner.

**REL-002 — P1 — C/A**
- Evidence: `docs/GIFTO_PRE_LAUNCH_AUDIT.md:290`; `docs/LAUNCH_READINESS_PLAN_REVIEW.md:124`; `docs/NEXT_PHASE_PLAN.md:92`.
- Impact: production schema/rollback behavior unknown; data-loss exposure; backup/PITR posture undocumented.
- Remediation: staging Supabase/Vercel; apply 1–24; run 9 suites; rehearse rollback; define backup/PITR/restore.
- Acceptance: staging verification recorded; restore test passed; rollback rehearsal recorded.

**SEC-001 — P1 — C**
- Evidence: `00000000000021_vendor_media.sql:14-28` (public `vendor-media`); `00000000000009_product_image_upload.sql:9-27` (public `product-images`); `GIFTO_PRE_LAUNCH_AUDIT.md:262`.
- Impact: anyone with paths can read draft product/branding media; vendor media remains public after suspension.
- Remediation: private buckets + signed URLs, or status-aware SELECT policies; add storage tests; backfill.
- Acceptance: unauthenticated user cannot read non-public media; public storefront still renders; storage tests green. **Owner decision required (P1 release gate).**

**QA-001 — P2 — C/A**
- Evidence: `.github/` absent; `package.json:5-17`; `supabase/tests/rls_vendor_dashboard_test.sql` untracked; README `:85,122,419` says eight suites.
- Impact: regressions/migration issues not caught; suite can be lost.
- Remediation: track suite; add `test:db` runner; add CI jobs.
- Acceptance: PR runs lint/typecheck/unit + disposable Postgres 1–24 + 9 suites; required check.

---

## 4. Deployment and data-loss risk

**Correct order:**
1. Freeze; commit/review in logical PRs; verify hosted migration list.
2. Staging: apply 1–24; run 9 RLS suites; run app smoke; dry-run media backfill; rehearse rollback 24→20; reapply; run suites again.
3. Production: full DB backup + storage export; confirm restore; maintenance window; apply 20–24 in order; verify `schema_migrations`; deploy app in same window.
4. Smoke: storefront, product page, vendor settings upload/pause, signed-in + guest checkout, account order history, vendor/admin support, analytics, admin orders.
5. Monitor; keep rollback owner/runbook ready.

**Do not:** deploy code before DB (missing columns/tables → 500s); apply DB long before code (privacy/order-history/media regressions); run rollback 20 without export; rollback 23 with history; rollback 21 with objects; leave broad vendor read policy in place.

**Rollback:** code first for UI-dependent features (pause/support/media), then DB 24→23→22→21→20. Export `support_requests`, vendor-media objects, and migration-20 columns first. Rollback 20 restores broad read; treat as a short coordinated window only. Rollback 22 keeps historical orders. Rollback 24 is independent.

**REL-004 — P2 — C/A**
- Evidence: no Sentry/OTel/uptime config; `GIFTO_PRE_LAUNCH_AUDIT.md:292`.
- Impact: blind incidents.
- Remediation: error tracking, structured logs, uptime/DB alerts.
- Acceptance: alert routes tested; on-call owner named.

**SEC-003 — P2 — C/A**
- Evidence: `next.config.ts:21-31`; `GIFTO_PRE_LAUNCH_AUDIT.md:264`.
- Impact: weaker XSS/clickjacking hardening.
- Remediation: global security headers; CSP report-only first.
- Acceptance: headers present on all routes; CSP report-only clean before enforce.

**REL-006 — P3 — C**
- Evidence: `src/lib/supabase/client.ts:14-15`, `server.ts:17-18`, `src/proxy.ts:22-23` use non-null env; `service.ts:19` validates only service key.
- Impact: misconfiguration surfaces at runtime.
- Remediation: shared startup env validator.
- Acceptance: missing/invalid env fails fast with safe message; build/test covers.

**SEC-004 — P3 — C**
- Evidence: `00000000000023...:52-81`.
- Impact: concurrent requests can exceed 5/15min.
- Remediation: advisory lock or dedicated rate-limit table.
- Acceptance: concurrency test proves limit.

---

## 5. CI proposal

**Create `.github/workflows/ci.yml`:** on PR/push to `main`; Node pinned (match `.nvmrc`); `npm ci`; `npm run lint`; `npm run typecheck`; `npm test`; `npm run build`. Cache npm. No secrets.

**Create `.github/workflows/db-tests.yml`:** Linux job with `supabase/postgres:17.11.0.003` (avoid `17.6.1.106` per README); apply migrations 1–24; load `supabase/seed.sql` if needed; load `storage_stub.sql` as `supabase_admin`; `SET gifto.rls_test_disposable='yes'`; run all 9 RLS suites; rollback 24→20; reapply; rerun suites. No hosted credentials.

**Create `scripts/db-test.mjs`:** cross-platform Node wrapper to start/stop disposable container, wait for readiness, apply migrations, run suites, rollback/reapply, exit non-zero on failure. Add `"test:db": "node scripts/db-test.mjs"` to `package.json`.

**Acceptance:** CI required on `main`; DB job completes under target (~15 min); failures name migration/test; no production secrets; logs retained.

---

## 6. DB testing proposal

- Track `supabase/tests/rls_vendor_dashboard_test.sql` (16 groups, 718 lines) and `storage_stub.sql`.
- Add tests: migration 23 partial apply/retry; migration 24 re-run; bucket pre-existing wrong config; account order history after migration 20; rollback 20 export/guard; support rate-limit concurrency (best-effort).
- Local Windows: Docker + `psql`; image `17.11.0.003`; `SET gifto.rls_test_disposable='yes'`; storage stub as `supabase_admin`; never point at hosted.
- Acceptance: `npm run test:db` is the single local/CI entry point; fresh schema 1–24 + seed + 9 suites pass; rollback/reapply pass; destructive guard enforced.

---

## 7. Release checklist

**Pre-flight:** owner approval; freeze; clean tree; CI green; hosted migration list verified; staging 1–24 + 9 suites; rollback rehearsal; backup/restore verified; storage export; media backfill dry-run; support queue export plan; env validation; Node runtime pinned; docs updated.

**Migration:** maintenance window; backup ID recorded; apply 20→24; verify `supabase_migrations.schema_migrations`; smoke SQL (`public_vendors`, `is_accepting_orders`, support table, index); check locks/errors.

**Deploy/smoke:** Vercel production deploy; storefront/shop/product; vendor settings logo/cover/pause; signed-in + guest checkout; account order history; vendor/admin support; analytics; admin orders; paused-vendor checkout rejection; media URLs.

**Rollback:** code first for affected UI; export support/media/profile data; 24→23→22→21→20; verify old code; restore privacy policy after window; post-mortem.

**Post-launch:** error/uptime/DB alerts; support queue; analytics index performance; media access review; backup schedule.

---

## 8. Ordered Stage 2 tasks/dependencies

| # | Task | Depends on | Acceptance |
|---|---|---|---|
| 1 | Owner approval + release manifest (commit, migrations, backup ID, rollback owner) | — | Signed manifest |
| 2 | Track/review migrations 20–24, rollbacks, 9th RLS suite | 1 | Clean tree; PR reviewed |
| 3 | Fix migration idempotency/lock (23, 24; bucket config 21) | 2 | Re-run/partial-apply tests pass |
| 4 | Fix order-history vendor names (RPC or snapshot) | 2 | Signed-in order history shows names; outsider denied |
| 5 | Fix rollback 20 privacy/export; add export procedure | 2,4 | Rehearsal passes; broad policy not permanent |
| 6 | Add `test:db` runner + CI workflows | 2–5 | CI required; 9 suites green |
| 7 | Add env validation + Node pin | 2 | Fail-fast config; CI/Vercel same runtime |
| 8 | Reconcile docs/test counts/hosted state | 2 | README/STATUS/IMPLEMENTATION/GAPS consistent |
| 9 | Staging apply + 9 suites + rollback rehearsal | 3–8 | Recorded staging evidence |
| 10 | Backup/PITR + release runbook | 1,9 | Restore test + runbook approved |
| 11 | SEC-001 media privacy decision/fix | 1 | Owner decision; storage tests; unauthenticated access blocked |
| 12 | Observability + security headers | 1 | Alerts/headers tested |
| 13 | Production lockstep release + smoke + monitor | 9–12 | Smoke green; rollback ready |

Parallelizable: 3, 4, 5, 7, 8 after task 2; 11/12 can run in parallel but are launch gates.

---

## 9. Exact Stage 2 files

**Assumption:** hosted has not applied 20–24. If it has, create forward migration `25` instead of editing 21/23/24.

**Create:**
- `.github/workflows/ci.yml`
- `.github/workflows/db-tests.yml`
- `scripts/db-test.mjs`
- `docs/RELEASE_RUNBOOK.md`
- `supabase/migrations/00000000000025_order_history_vendor_summaries.sql` (if RPC option chosen)
- `supabase/rollbacks/00000000000025_order_history_vendor_summaries_rollback.sql`
- `src/lib/env.ts` (or `src/lib/supabase/env.ts`)
- `.nvmrc` (or `package.json` `engines`)

**Modify:**
- `package.json` — `test:db`, `engines`, optional `test:ci`
- `supabase/migrations/00000000000021_vendor_media.sql` — bucket config reconciliation
- `supabase/migrations/00000000000023_vendor_support_requests.sql` — idempotent guards, advisory lock
- `supabase/migrations/00000000000024_analytics_scale.sql` — `if not exists`, lock note
- `supabase/rollbacks/00000000000020_vendor_profile_privacy_rollback.sql` — export guard/policy strategy
- `supabase/tests/rls_vendor_dashboard_test.sql` — track + new tests
- `src/app/account/orders/page.tsx`, `src/app/account/orders/[id]/page.tsx` — order-history vendor summaries
- `src/lib/supabase/database.types.ts` — regenerate/update
- `src/app/vendor/settings/page.tsx` — remove stale future copy
- `src/lib/supabase/client.ts`, `server.ts`, `service.ts`, `src/proxy.ts` — env validation
- `README.md`, `docs/STATUS_REPORT.md`, `docs/VENDOR_DASHBOARD_BACKEND_IMPLEMENTATION.md`, `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md`, `docs/VENDOR_DASHBOARD_BACKEND_SECURITY_AUDIT.md` — reconcile state/findings
- `next.config.ts` — global security headers (if SEC-003 included)

**SEC-001 only if owner chooses private/signed media:** `src/components/shop-logo.tsx`, `shop-cover.tsx`, `product-image.tsx`, `src/app/vendor/settings/branding-upload.tsx`, `src/lib/catalog.ts`, plus a media migration. Otherwise keep as documented P1 gate.

**Do not modify** migrations 20/22 unless review finds a defect; their forward SQL is safe. Do not modify rollback 22/23/24 except tests; their guards are sound.

---

## 10. Unresolved risks/questions

1. **Hosted state:** exactly which migrations are applied? Need `supabase migration list --linked` or read-only SQL. If 20–24 already applied, editing them is unsafe.
2. **Staging:** does one exist (`docs/NEXT_PHASE_PLAN.md:92`)? Need URL/access and migration policy.
3. **Backup/PITR:** free tier has no PITR (`docs/LAUNCH_READINESS_PLAN_REVIEW.md:124`); need backup/restore plan and owner sign-off.
4. **Rollback privacy:** restore broad vendor read for old code, or keep closed and use RPC? Owner decision.
5. **Order-history strategy:** RPC vs vendor-name snapshot; snapshot is more durable but larger change.
6. **SEC-001 media:** private/signed vs public/status-aware; P1 launch gate.
7. **Support retention/export:** rollback 23 blocks on history; need export/retention procedure.
8. **Node runtime:** pin 20/22? No `.nvmrc`/`engines` currently.
9. **Monitoring provider/budget:** Sentry/OTel/uptime/DB alerts.
10. **CSP/headers:** report-only vs enforce.
11. **Out-of-scope pre-launch blockers:** returns/refunds (`OPS-001`), guest recovery (`CHK-002`), price consent (`CHK-001`), legal pages (`OPS-003`), notifications (`OPS-002`), settlement races (`FIN-001/002`). These remain in `docs/GIFTO_PRE_LAUNCH_AUDIT.md` and are not re-audited here.
12. **Verification limits:** no tests/build/lint/typecheck/Docker/hosted commands run; implementation-doc claims are documented only. `rg` unavailable; `Select-String`/grep used.

**Stage 1 conclusion:** Forward migrations are non-destructive and migration 22’s lock order is sound, but release readiness is blocked by untracked/unverified migration state, no staging/backup/rollback gate, public media exposure, and missing CI/DB automation. Do not deploy until DB-001, REL-001, REL-002, SEC-001, and QA-001 are closed or explicitly risk-accepted.

**No files were created, modified, or deleted during the Stage 1 investigation. This report file was created afterward at the owner’s request.**
