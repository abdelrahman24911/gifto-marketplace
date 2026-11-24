# Gifto — Testing & Quality

- **Audit date:** 2026-11-24
- **Worktree:** `~/workspace/gifto-master-audit`, HEAD `54c780b`
- **Source:** specialist testing report (`/tmp/gifto-audit/testing.md`); gates **re-run by the auditor in this worktree** — no tracked file was modified (`git status --porcelain` clean after all runs; only git-ignored `node_modules/` and `.next/` were written). No hosted Supabase/Vercel touched. Playwright was **not executed** and Chromium was **not downloaded**, per mission rules.
- **Environment:** Node v24.22.1, npm 10.9.4; `npm ci` run once (497 packages, ~32 s). RLS run used a fresh disposable PostgreSQL 16.15 (`initdb` in `/tmp/gifto-rls-pg`, port 54399, stopped and deleted after; C1 rehearsal workdir also removed).

## 1. Gates — re-run in this audit (all pass, numbers identical to prior claims)

| Gate | Command | Result (this audit) | Prior claim | Match? |
|---|---|---|---|---|
| Lint | `npm run lint` | **PASS**, exit 0, 0 warnings/errors, ~31 s | PASS | ✅ |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS**, exit 0, ~25 s | PASS | ✅ |
| Vitest | `npm test` | **697 passed / 697, 78 files, 0 failed, 0 skipped**, 19.3 s | 697/697 (78 files) at `8c90221` | ✅ exact |
| Production build | `npm run build` | **PASS**, exit 0, compiled 38.7 s; **53/53 static pages**; postbuild Tailwind check OK | 53/53 static | ✅ exact |
| i18n keys | `npm run check:i18n` | **PASS** — 788 translator calls, all keys present; en/ar share 648 keys, ~0.3 s | 788 keys | ✅ (keys corrected: 648, see §4) |
| RLS suites | `scripts/run-rls-suites.sh` on disposable local Postgres 16.15 | **18/18 PASS**, 0 failed, ~71 s | 18/18 | ✅ exact |
| Settlement concurrency (FIN-001) | `node scripts/run-settlement-concurrency.mjs` | **PASS** — exactly one of two concurrent `mark_settlement_paid()` calls succeeded; other raised "This settlement is already paid." (23514); settlement paid once, payout proof recorded | PASS | ✅ |
| Parent-status concurrency (H-01) | `node scripts/run-parent-status-concurrency.mjs` | **PASS** — concurrent suborder transitions derive correct parent status; rls_orders / rls_order_audit / rls_commissions re-run clean | PASS | ✅ |
| C1 rehearsal | `bash scripts/rehearse-c1.sh` | **ALL CHECKS PASSED** (exit 0) — migrations 1–27 + fixtures, C1 applies, C1 re-run no-op, migrations 36–67 clean, negative/rollback/empty variants pass | ALL CHECKS PASSED | ✅ — **but moot on hosted** (C1 dead; see `FINANCIAL_INTEGRITY.md` §5) |
| node:test scripts | `node --test scripts/check-deployment-preflight.test.mjs scripts/demo-target-guard.test.mjs` | **13/13 PASS** (preflight 4 + demo-target-guard 9) | 13/13 | ✅ exact |
| Playwright (default lane) | **NOT RUN** | `--list` only: **51 tests in 9 files** (3 projects) | 8/8 browser pass on owner's machine only | Not re-verified — §5 |
| Playwright (admin lane) | **NOT RUN** | `--list` only: **57 tests in 8 files** (1 project) | 8/8 (owner machine) | Not re-verified — §5 |
| Playwright (security lane) | **NOT RUN** | Config exists; 4 tests in `security-headers.spec.ts` | — | Not re-verified |

**Bottom line:** every gate this audit could run locally passes, with numbers identical to the prior claims. The suite is unusually strong for a pre-launch codebase at the unit/SQL layer. The gaps are all at the browser/E2E and hosted-verification layers, which this environment cannot run — and which no local pass can substitute for.

**Caveat on the RLS run:** plain PostgreSQL 16.15 was used; CI uses `public.ecr.aws/supabase/postgres:17.11.0.003`. The runner's auth-emulation path was therefore exercised instead of the Supabase image's native `auth` schema. The result is identical (18/18), but the pass proves the SQL against PG 16.15 + emulation, not against the Supabase 17.11 image CI uses.

## 2. Test inventory

### 2.1 Unit tests — Vitest (78 files, 697 tests)

- Config: `vitest.config.ts` — environment `node`, alias `@` → `src/`, include `src/**/*.test.ts` only. **No coverage configuration** (no `coverage:` block, no thresholds, no coverage script) — coverage is unmeasured.
- Scope: 78 files under `src/`; 70 non-test `src/lib/*.ts` modules vs 61 `src/lib/*.test.ts` files (9 lib modules have no colocated test — §6). Largest: `mail.test.ts` (45), `vendor-settings.test.ts` (30), `occasions.test.ts` (29), `guest-order.test.ts` (29), `finance.test.ts` (25).
- All tests are pure-logic / mocked-Supabase (node environment, no real DB, no network). They prove helper behaviour, not integration behaviour.

### 2.2 RLS / SQL tests — `supabase/tests/` (18 suites)

The runner discovers `supabase/tests/*_test.sql` (18 files) and for **each suite** drops `public` and re-applies all 71 migrations + `storage_stub.sql` + `test_helpers.sql` (test-only `gifto_test.*` order helpers, SECURITY DEFINER, never for hosted). Suites are destructive by design and refuse to run unless `gifto.rls_test_disposable = 'yes'` is set — a good guard. Assertions are psql `RAISE`-on-failure (no pgTAP); any failure aborts the suite non-zero. Per-file TEST inventory: foundation (unnumbered), catalog 1–22, commissions 1–23, delivery coverage 1–6, demo containment 1–8, gift-shopper 1–10, guest orders 1–23 (+lettered), hardening (unnumbered), inventory 1–6, occasions 1–22, onboarding 1–14, order audit 1–11, orders 1–21, product reviews 1–8, refunds 1–20 (incl. **TEST 14f**, the N-02 fix), vendor dashboard 1–21, rate limits 1–4, plus the two concurrency suites. Total: **469 `TEST … PASSED` markers** across 17,294 lines.

**Storage caveat:** suites use `storage_stub.sql` — storage RLS is tested against a stub, not real Supabase Storage.

### 2.3 E2E — Playwright (17 spec files; NOT executed in this audit)

| Lane / config | Spec files | Tests listed |
|---|---|---|
| Default `playwright.config.ts` (testDir `tests/`) | 9 files | **51 tests** across 3 projects (chromium-desktop, chromium-mobile, local-guard) |
| Admin `playwright.admin.config.ts` (testDir `e2e/admin/`) | 8 files | **57 tests** in 1 project (local-admin) |
| Security `playwright.security.config.ts` | `tests/security-headers.spec.ts` only | 4 tests |

**The "8/8 browser pass" resolves exactly:** `mission-browser-pass.spec.ts` (5 tests) + `environment-banner.spec.ts` (3 tests) = 8 tests, all in the admin lane, reported passed 2026-11-23 on the owner's machine (Playwright Chromium 1254). It is a count of tests, not of "items" — and it was **not re-run here**.

### 2.4 Security tests

- `tests/security-headers.spec.ts` (4 tests) + dedicated config: production server against a loopback Supabase stub (port 54329) answering reads with empty results. Also wired as a CI job.
- `tests/read-only-guard.spec.ts` + `tests/global-setup.ts`: the default lane's global setup statically scans all specs and **fails the run** if any spec imports `@playwright/test`/`playwright` directly or uses `page.request`/`context.request` — enforcing the guarded fixture that aborts every non-GET/HEAD request at the browser-route level. A genuine write-protection mechanism for the default lane.
- Rate-limit coverage at two levels: Vitest `rate-limit.test.ts` (15 tests) and SQL `rate_limits_test.sql`.
- No dependency-vulnerability scan, no SAST/secret-scan step in CI.

### 2.5 Financial tests

- Unit: `finance.test.ts` (25), `money.test.ts` (16), `admin/settlements/actions.test.ts`, `vendor/finance/page.test.ts`, `refunds.test.ts` (7), `admin/refunds/actions.test.ts`, `vendor/refunds/actions.test.ts`.
- SQL: `rls_commissions_test.sql` (TEST 1–23), `rls_refunds_test.sql` (TEST 1–20 + sub-tests), concurrency `mark_settlement_paid` runner (FIN-001), `rehearse-c1.sh` (C1 — ALL CHECKS PASSED on disposable data; moot on hosted).
- Migration chain exercised implicitly: every RLS suite re-applies migrations 1–71 fresh (18× in this audit's run). **No dedicated migration test file; no rollback test wired into CI** (rollback 71 was verified manually in the mission).

### 2.6 i18n tests

`npm run check:i18n` (`scripts/check-i18n-keys.mjs`): static check of every `t()`/`t.rich()` call in `src/` against `messages/en.json`, requiring `messages/ar.json` to share the key set. **Result: PASS — 788 translator calls, 648 shared keys.** Wired into CI (`.github/workflows/ci.yml`, app job) — this resolves the earlier open question (Phase 2 report, "unclear whether 3b was committed"): **yes, `check:i18n` runs in CI.** Limitation: it checks key *presence*, not translation quality, RTL rendering, or runtime locale switching; Arabic copy is never asserted in any Vitest or Playwright test (no Arabic-locale E2E spec exists).

### 2.7 Build tests

`npm run build` (Next 16.4.2, `--webpack`) + `postbuild` hook `scripts/verify-tailwind-css.mjs` (fails the build if compiled Tailwind utilities/theme tokens are absent). This audit: compiled in 38.7 s, "Generating static pages using 3 workers (53/53)", Tailwind OK. Route table: **75 routes** — 74 dynamic + 1 static (`/robots.txt`). The "53/53 static pages" figure is the prerender count, not the route-table count; the app is almost entirely dynamic, so the build proves compilation, not page correctness. Build needs only `NEXT_PUBLIC_SITE_URL` in CI.

## 3. Regression coverage vs known bug history

| Known bug / fix | Regression test present? | Assessment |
|---|---|---|
| Wishlist restore drops all items (`listWishlistItems` embedded protected `vendors` table; fixed to resolve from `public_vendors`, `wishlist/actions.ts:68`) | **Partial.** No unit test covers `listWishlistItems` or the `public_vendors` resolution — `wishlist.test.ts` (10 tests) covers only pure helpers. Only cover is E2E `mission-browser-pass.spec.ts` (admin lane, not run in CI). | **The exact regression that silently dropped items has no fast, CI-run regression test.** (T-01) |
| F-02 support page load error (migration 69 `replied_by` FK, PGRST201) | **Yes, unit-level.** `support-requests.test.ts:52` documents the two-FK ambiguity; +2 regression tests. | Covered. |
| F-03 `notifyOrderPlaced` could throw and fail checkout | **Yes.** `mail.test.ts:1117` — "notifyOrderPlaced never breaks checkout". | Covered. |
| N-02 cancelled-suborder refund approval (migration 71) | **Yes, SQL-level.** RLS `rls_refunds_test.sql` **TEST 14f**; re-verified by this audit's 18/18 run. | Covered. |
| LIKE escaping in admin logistics search (3a) | **Yes.** `like-pattern.test.ts` (4) + `logistics-search.test.ts` (8), incl. SQL-LIKE matcher proving `%`/`_` match literally. | Covered. |
| Demo containment | **Yes, three levels.** `demo-containment.test.ts` (5), RLS `rls_demo_containment_test.sql` (TEST 1–8), `demo-target-guard.test.mjs` (9 node:test). | Covered. |
| Mail outbox 5-attempt / 2-requeue caps | **Yes.** `mail.test.ts` terminal-failure tests; `api/cron/mail-outbox/route.test.ts` (5). | Covered. |
| Product delete requires typing exact name (Plant Pot incident) | **Yes, unit-level.** `confirm-delete.test.ts` (5). No E2E test exercises the delete flow end-to-end. | Covered at unit level only. |
| Review stars, BreadcrumbList JSON-LD | Unit: `product-json-ld.test.ts`, `seo-json-ld.test.ts`; E2E: `tests/seo.spec.ts`. | Covered. |
| F-01 404 empty DOM | **No test.** No safe small fix; none possible without a fix. | Open, known. |
| F-04 refund window at open, not resolve | Deliberate policy; no test (owner decision pending). | Open by decision. |

## 4. What the suite proves vs what it does not prove

**Proves (verified this audit):** TypeScript compiles clean; lint clean; 697 unit assertions on pure helpers pass; i18n keys are complete; the production build compiles and prerenders 53/53 pages with Tailwind intact; all 71 migrations apply cleanly from scratch 18+ times; RLS policies behave as specified across 18 SQL suites on a disposable database; settlement payment is atomic under concurrency; parent-order status derivation is correct under concurrency; the C1 correction is safe and idempotent on disposable data (moot on hosted); deployment/demo-target guards refuse unsafe targets.

**Does NOT prove:**
- **Production behaviour.** Every DB-backed result above was obtained against a fresh disposable database with synthetic fixtures (or, for Vitest, mocks). Hosted *schema* is now verified (`DATABASE_AND_MIGRATIONS.md` §2), but hosted *behaviour* — real orders, real sends, real RLS enforcement through hosted PostgREST/Auth — still has no automated proof.
- **Browser behaviour in this environment.** Playwright was not executed here. The 8/8 browser pass is a single owner-machine run (2026-11-23); it has not been repeated since, and the admin lane does not run in CI, so browser regressions since then would not be caught automatically.
- **Real email, real payments, real delivery.** Mail tests use mocks; no real SMTP send is verified (Brevo not yet configured/verified). COD cash handling, settlement remittance, and courier handover have unit/SQL cover but no end-to-end proof against real actors.
- **Performance, accessibility, visual correctness.** No load test, no Lighthouse/a11y audit, no visual regression test, no Arabic-locale or RTL test exists.
- **Storage RLS against real Supabase Storage.** The RLS suites use `storage_stub.sql`; real storage policies are untested.

## 5. Test configuration & environment risk

- **Default Playwright lane reads `.env.local`** (`loadLocalPublicEnv()` reads `NEXT_PUBLIC_SUPABASE_URL` from `.env.local` if the env var is unset). The owner's `.env.local` is reported to point at **hosted production Supabase**. The read-only guard (route-level abort of non-GET/HEAD + static import scan) is the only thing standing between the default lane and hosted writes, and it only guards *browser* requests made through the fixture — server-side actions in the app under test could still write if the app server itself is pointed at hosted. **Risk: Medium, mitigated but real** (T-06). The admin lane is safer: `e2e/admin/start-server.mjs` explicitly overrides the Supabase URL/anon key with local-stack values, and `e2e/admin/local-supabase.mjs` drives the Supabase CLI for a local stack.
- **No `.env.local` exists in this worktree** (only `.env.example`, names-only) — verified. Nothing in the audit run could reach hosted state.
- **Admin lane seeding:** `e2e/admin/global-setup.ts` seeds admin/vendor/customer users and resets fixtures via `fixture-admin.ts` against the local Supabase; `global-teardown.ts` cleans up. Requires Docker + Supabase CLI locally.
- **Retries:** all Playwright configs set `retries: 0` and `forbidOnly: true`. No `test.only` anywhere in `src/`, `tests/`, `e2e/` (grep clean). Conditional skips exist only in E2E specs (environment-dependent). No flaky-test markers, no retry-on-failure, no quarantine list.
- **`dashboard-mobile.spec.ts` login-quota limitation (verified in code):** the spec signs in per test as admin and vendor owner at a Pixel 7 viewport (9 tests, each calling the file-local `login()` helper that POSTs to `/login`). The mission report states the older spec "cannot pass as a whole" (10-per-account local login quota at test 11); at HEAD the file has 9 tests, so the quota arithmetic has changed, but the underlying fragility remains: **per-test sign-in against a 10-login-per-account quota is quota-sensitive by construction**; adding 2 more login tests would re-trigger it. The admin lane runs `workers: 1, fullyParallel: false`, which serialises the logins. No shared-session fixture exists (T-03).

## 6. Untested / thinly tested areas

1. **No coverage measurement** — no coverage block in `vitest.config.ts`, no threshold, no report.
2. **`src/lib` modules with no colocated test (9 of 70):** `breadcrumb-json-ld.ts`, `gift-options-store.ts`, `guest-client.ts` (idempotency retry logic — only a comment documents it), `indexing.ts`, `order-status-reasons.ts`, `order-vendors.server.ts`, `organization-json-ld.ts`, `support-content.ts`, `vendor.ts`, `wishlist-store.ts`. Plus `src/app/admin/actions.ts`, `src/app/admin/nav.ts`, `src/app/vendor/nav.ts` (route/nav code, lower risk).
3. **No E2E for the core money path:** no Playwright spec exercises guest checkout end-to-end, vendor confirm/ship, refund approval, or settlement marking in the browser — verified manually on the owner's machine during the mission, not encoded as specs.
4. **No E2E for Arabic locale** (all specs run the default locale); no mobile E2E except dashboard-mobile + the Pixel 7 project in the default lane.
5. **Migration/rollback tests:** no dedicated migration test file; rollback verification is manual. Migration 36 legacy backfill and migration 42 courier schema have no targeted test beyond the full-chain apply.
6. **Security:** no dependency audit (`npm audit` not in CI), no secret scan in CI, no SAST; the security-headers lane is the only automated security gate.
7. **Concurrency runners and C1 rehearsal are not in CI** — scripts only; a regression in `mark_settlement_paid` atomicity would not be caught by a PR check.

## 7. Findings & recommendations (for the roadmap)

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| T-01 | Wishlist-restore regression has no CI-run unit test (only an admin-lane E2E test that never runs in CI) | Medium | Add a Vitest test for `listWishlistItems` asserting vendor resolution via `public_vendors` (mocked Supabase), pinning the exact failure mode. |
| T-02 | Default + admin Playwright lanes do not run in CI; only security-headers does | Medium | Add a CI job for the default lane (loopback stub where possible) and, if a local-Supabase service is feasible in CI, the admin lane; at minimum run `--list` in CI to catch spec drift. |
| T-03 | `dashboard-mobile.spec.ts` signs in per test against a 10-login/account quota | Low–Medium | Share one authenticated session per role via Playwright storage-state fixture instead of logging in per test. |
| T-04 | No coverage config or thresholds | Low–Medium | Enable Vitest coverage (v8) with a modest threshold and fail CI below it. |
| T-05 | RLS/concurrency/C1 scripts not in CI | Low–Medium | Add the two concurrency runners and `rehearse-c1.sh` (disposable-DB guard already exists) to the `rls` CI job. Note: C1 itself is dead on hosted — the rehearsal's value is now as a regression guard for the correction pattern, not as a prelude to running C1. |
| T-06 | Default E2E lane reads `.env.local` and the owner's points at hosted production; read-only guard is browser-route-level only | Medium | Make the default lane refuse to start when `NEXT_PUBLIC_SUPABASE_URL` is non-local (like the admin lane's explicit local override). |
| T-07 | No `npm audit` / secret scan / SAST in CI | Low | Add `npm audit --audit-level=high` (or OSV) and a secret scan (e.g. gitleaks) to CI. |
| T-08 | No Arabic/RTL, a11y, performance, or visual tests | Low (pre-launch) | Add at least one Arabic-locale smoke spec and an a11y spot-check before public launch. |
