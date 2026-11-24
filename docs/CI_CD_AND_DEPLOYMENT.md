# Gifto — CI/CD & Deployment

- **Audit date:** 2026-11-24
- **Worktree:** `~/workspace/gifto-master-audit`, HEAD `54c780b`
- **Sources:** specialist CI/CD report (`/tmp/gifto-audit/cicd.md`); public GitHub API (unauthenticated) for CI-run status; live hosted verification (`DATABASE_AND_MIGRATIONS.md` §2).
- **Access limits:** no Vercel access, no hosted Supabase dashboard access, no GitHub token. Branch protection and production deploy state are therefore Unknown, stated as such.

## 1. CI — exactly one workflow

`.github/workflows/ci.yml` ("CI") is the only workflow in the repo. Triggers: push to any branch, and any PR. Three jobs, **no secrets used**:

| Job | Steps | Notes |
|---|---|---|
| `app` | `npm ci` → lint → typecheck → `check:i18n` → Vitest → production build | Node 24. Build needs only `NEXT_PUBLIC_SITE_URL` in CI; no Supabase credentials at build time. |
| `security-headers` | Playwright security-header lane only | Builds the production server against a loopback Supabase stub (`tests/supabase-stub.mjs`, port 54329) that answers reads with empty results, plus placeholder keys. The only Playwright lane in CI. |
| `rls` | All RLS suites via `scripts/run-rls-suites.sh` | Disposable `supabase/postgres:17.11.0.003` image ("known-good" tag; 17.6.1.106 segfaults on denied EXECUTE). 18 suites, 71 migrations applied fresh per suite. |

### 1.1 i18n wiring — RESOLVED (verified)

The open Phase 2 question ("unclear whether 3b — wire `check:i18n` into CI — was actually committed") is resolved: **`63a27e3` ("fix(ci): require both locale files in the i18n key guard") is an ancestor of HEAD, and `ci.yml:42` runs `npm run check:i18n` in the `app` job on every push/PR.** The script fails (exit 1) on a missing/invalid/mismatched `messages/ar.json` (648 keys each, 788 translator call sites). The Jobs API shows the step `success`. Before the fix the script read only `messages/en.json`, so a missing `ar.json` passed silently — the gap was in the script, not the wiring.

### 1.2 CI status (public API, unauthenticated)

All 10 runs in the returned window are `success`, including the latest run **45284623044 on HEAD `54c780b`** (2026-11-23 22:58 UTC, all 3 jobs green).

### 1.3 What is NOT in CI

- Full Playwright E2E — default lane (51 tests), admin lane (57 tests), and live/guard lanes do not run; only the 4-test security-headers lane does.
- `preflight:deploy` — manual script, needs a hosted service key.
- The 13 node:test suites (preflight + demo-target-guard) — no npm script wires them into CI.
- The two concurrency runners (FIN-001, H-01) and the C1 rehearsal — scripts only.
- Migration lint / hosted-state diff — no drift check exists anywhere.
- Secret scanning, dependency scanning (`npm audit`), SAST — none wired. (Secret scan 0 matches at `c5c2bdf` was a one-off manual check, not a gate.)
- Backup drill — never run anywhere.

### 1.4 Branch protection — Unknown

The branch-protection endpoint needs auth (401 unauthenticated). Whether "all required to pass" is enforced is therefore **intent, not verifiable enforcement**. An owner with access should confirm: required status checks on `main`, required reviews, and whether force-push / direct-push to `main` is blocked. PR #1 was merged by the owner himself, which is consistent with protection existing — but that is inference, not verification.

## 2. Deployment — Vercel (dashboard-managed)

- `vercel.json` contains only the `*/5` mail-outbox cron (`CRON_SECRET` fail-closed). **All build/deploy config lives in the Vercel dashboard** — there is no deployment configuration in the repo to audit.
- **Production deployment state: UNKNOWN.** `gifto-marketplace.vercel.app` returns HTTP 200 with correct security headers and no commit/version marker, so the deployed commit cannot be verified from outside. Prior docs inferred the deployed app was newer than the database (post-migration-47 UI publicly visible while probes showed hosted at migration 27); that inference is now moot for the database side (28–71 applied), but the deployed commit itself remains unverifiable without Vercel access.
- **No staging environment exists.** Production is the first hosted target. There is no staging Supabase project, no staging Vercel project, and no staging deploy sequence that has ever run. The staging rehearsal doc (`docs/DEPLOYMENT_PREFLIGHT_AND_STAGING_REHEARSAL.md`) is range-stale (28–66) and predates migrations 67–71 and the migration-36 backfill dispute.
- **Migration 67 ordering hazard (verified in its header):** migration 67 must be applied BEFORE the app code that reads `app_settings` is deployed — the app fail-opens if `app_settings` is absent. The hosted 28–71 run satisfied this; any future staging/production sequence must preserve the ordering, and the manual preflight (`scripts/check-deployment-preflight.mjs`) should be re-run against current hosted state (it was failing before the run because migration 39 was absent).

## 3. Environment variables (names only — no values read or recorded)

| Variable | Where needed | State |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Build (CI) | Only build-time var needed in CI |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Runtime | Owner's local `.env.local` is reported to point at hosted production — see the E2E risk in `TESTING_AND_QUALITY.md` §5 |
| `SUPABASE_SERVICE_ROLE_KEY` | Runtime (service-role client, preflight) | Hosted service key; preflight needs it and is manual |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | Runtime (mail) | Provider-agnostic; Brevo values documented in `docs/BREVO_SMTP_SETUP.md`; **no account/credentials exist yet** |
| `CRON_SECRET` | Runtime (mail-outbox cron) | Fail-closed (503 when unset, 401 on wrong secret) |
| `SENTRY_DSN` (+ edge/server DSNs) | Runtime (monitoring) | **Unset** — Sentry SDK is a no-op without DSNs |
| `GIFTO_ENVIRONMENT` | Runtime | Security-relevant (demo containment); demo/staging/production |
| `GIFTO_DEMO_ALLOW_EMAIL` / `GIFTO_DEMO_ALLOW_PRODUCTION_PROJECT` | Demo scripts | Opt-in flags; demo scripts refuse non-demo targets without them |

Sentry is a no-op without DSNs. UptimeRobot monitors are documented (`docs/monitoring/UPTIME_ROBOT.md`) but **not created** in any dashboard. No monitor or alert has ever fired.

## 4. Gaps & risks (ranked)

1. **No staging environment** — production is the first hosted target; every deploy is effectively a production deploy. Highest structural risk.
2. **Production deploy commit unverifiable** — no version marker; add a commit SHA / build marker to the deployed app (e.g. a `/api/version` or footer build id) so "what is live" is answerable.
3. **Branch protection unverified** — confirm with owner access; do not assume PR checks are enforced.
4. **No hosted-state drift guard** — the migration-36/42 dispute happened because nothing checks repo-vs-hosted continuously. Add a migration-lint / hosted-state diff to CI or to the preflight, and a runtime migration-version check so future drift is not silent.
5. **Playwright lanes not in CI** — browser regressions since the owner's 2026-11-23 8/8 run would not be caught automatically. At minimum run `--list` in CI to catch spec drift.
6. **Preflight is manual and stale** — re-run against current hosted state; refresh the staging rehearsal doc from 28–66 to 28–71 and add a production cutover checklist (maintenance window, backup snapshot, verification queries, rollback decision point).
7. **No backup/PITR drill** — the script exists (`scripts/backup-drill.sh`, restore into disposable DB + count compare) but the drill has never run and hosted backup state is Unknown.
8. **Cosmetic doc drift** — README.md and `docs/HOSTED_STATE.md` still say 17 RLS suites / 66 migrations / 774 i18n calls vs 18 / 71 / 788 at HEAD. Mechanical fix, but the pattern (counts rot within days) is why counts in docs should be dated or delegated.
