# Gifto — Hosted State (single source of truth)

**Observation date:** 2026-11-20
**Branch / HEAD at observation:** `muse/p0-fixes`, based on `audit/phase-2-refunds-orders-seo`
`34f30a61f050e41905ccf1bec982173487cda603`
**Observed by:** Muse (local clone only — no hosted Supabase, Vercel, or CI access)

> This file is the single hosted-state table for the repo (P0-01, H-17).
> Every hosted row below is **UNVERIFIED**: this session had no Supabase CLI
> login, no Vercel access, and no production credentials, and the task forbids
> accessing production credentials or mutating hosted services. Nothing in this
> table is asserted about the live project without an evidence entry saying
> how it was observed. The README's earlier hosted-state claims (migrations
> 1–27 applied, project ref `hqusykdyjpruysxezsrn`) are prior records, not
> re-verified here. Local, verifiable facts (migration files present, suite
> files present) are recorded as OBSERVED (local) and are not hosted claims.

## Hosted-state table

| Item | Expected | Observed | Evidence (command / dashboard) | Date |
|---|---|---|---|---|
| Migrations 1–24 applied on hosted Supabase | Applied | UNVERIFIED | No hosted access in this session; `supabase migration list` not run (no CLI login). README (prior record) states 1–27 are the verified hosted state. | 2026-11-20 |
| Migration 25 `00000000000025_atomic_settlement_payout.sql` applied on hosted Supabase | Applied | UNVERIFIED | No hosted access; `supabase migration list` not run. README (prior record) lists 25 among hosted migrations. | 2026-11-20 |
| Migration 26 `00000000000026_occasion_discovery.sql` applied on hosted Supabase | Applied | UNVERIFIED | No hosted access; `supabase migration list` not run. README (prior record) lists 26 among hosted migrations. | 2026-11-20 |
| Migration 27 `00000000000027_occasion_matching_rules.sql` applied on hosted Supabase | Applied | UNVERIFIED | No hosted access; `supabase migration list` not run. README (prior record) lists 27 among hosted migrations. | 2026-11-20 |
| Migration 28 `00000000000028_order_status_audit.sql` applied on hosted Supabase | Not applied (local-only per README) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. README states 28–30 are "applied locally only and have not been pushed to the hosted project" — that is a prior local claim, not a hosted observation. | 2026-11-20 |
| Migration 29 `00000000000029_delivery_coverage.sql` applied on hosted Supabase | Not applied (local-only per README) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | As migration 28. | 2026-11-20 |
| Migration 30 `00000000000030_refunds.sql` applied on hosted Supabase | Not applied (local-only per README) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | As migration 28. | 2026-11-20 |
| Migrations present locally | 30 files, 00000000000001–00000000000030 | OBSERVED (local): 30 files | `ls supabase/migrations/ \| wc -l` → 30 | 2026-11-20 |
| RLS suites present locally | 13 suites | OBSERVED (local): 13 `*_test.sql` files + `storage_stub.sql` | `ls supabase/tests/*_test.sql \| wc -l` → 13 | 2026-11-20 |
| Vercel production commit | Equals branch HEAD `34f30a6` if deployed from this branch | UNVERIFIED | No Vercel access in this session; `vercel ls` / dashboard not consulted. Do not assume production serves this HEAD. | 2026-11-20 |
| Production `is_demo` count | 0 | UNVERIFIED | No hosted database access; no read-only count query run. Nothing was deleted. | 2026-11-20 |
| Backups (Supabase) | On, with a known retention window | UNVERIFIED | No Supabase dashboard access in this session. | 2026-11-20 |
| PITR (point-in-time recovery) | On | UNVERIFIED | No Supabase dashboard access in this session. | 2026-11-20 |
| Staging Supabase project | Exists, separate from production | OPEN — does not exist as far as this session can establish | No staging project reference exists in the repo or README; no dashboard access to confirm. Treated as not existing until proven otherwise. **Staging setup task (P0-02):** owner to create a separate Supabase project (disposable data, its own project ref and keys) plus a staging Vercel environment pointing at it; a change reaches staging by deploying the branch there and a second person verifies it before any production deploy. Nothing in this repo can create the hosted staging project. | 2026-11-20 |
| Staging Vercel environment | Exists | OPEN — does not exist as far as this session can establish | No staging environment reference exists in the repo; no Vercel access to confirm. See staging Supabase task above. | 2026-11-20 |
| Monitoring (error tracking / uptime) | Live provider configured | OPEN — wired, not live (P0-02) | Sentry SDK `@sentry/nextjs` installed; `sentry.client/server/edge.config.ts` + `src/instrumentation.ts` added, all no-ops without a DSN (no DSN/key committed). UptimeRobot monitors defined in `docs/monitoring/UPTIME_ROBOT.md` (production homepage, 5-min checks) — **not yet created in the dashboard**, alert contact not yet supplied. **Provider choice (Sentry + UptimeRobot, free tiers) is Muse-recommended only; no separate explicit owner approval was recorded, so it is not an owner-approved decision.** To go live: owner creates a Sentry project and an UptimeRobot account, sets `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` in Vercel, and creates the two monitors. | 2026-11-20 |
| CI | GitHub Actions runs lint, typecheck, Vitest, and all 13 RLS suites on every push/PR | BUILT, NOT YET RUN ON GITHUB (P0-02) | `.github/workflows/ci.yml` created (app job: lint, typecheck, Vitest, build; rls job: disposable `supabase/postgres:17.11.0.003`, all migrations, `scripts/run-rls-suites.sh`). Locally verified 2026-11-20: lint pass, typecheck pass, Vitest 37 files / 357 tests pass, build pass, all 13 RLS suites pass on disposable local Postgres 16 with `scripts/auth-emulation.sql`. **The GitHub Actions run itself has not happened — this branch has not been pushed — so no run link/ID exists yet.** | 2026-11-20 |
| Backup drill | One recorded restore drill with matching row counts | BLOCKED (P0-02) | No backup dump or dashboard backup access was available in this session (no hosted access), so no restore was performed. Runnable procedure added: `scripts/backup-drill.sh <dump> <source counts>` restores into a disposable database and compares orders / order_vendors / commission_entries / settlements counts. To run: owner supplies a backup dump (or dashboard access) plus the source counts. | 2026-11-20 |

## P0-02 notes (2026-11-20)

- **Pre-existing typecheck failure fixed in this prompt:** `src/app/layout.tsx`
  used `LayoutProps<"/">`, a name that does not exist in this codebase
  (introduced in `70a4e14`); typecheck failed on the base HEAD. Fixed
  minimally to `{ children: ReactNode }` with a `ReactNode` import. Without
  this fix CI could never be green. Vitest and lint already passed on base.
- **Build required a database at build time:** `src/app/sitemap.ts` queried
  the catalog while prerendering, so `next build` failed without
  `NEXT_PUBLIC_SUPABASE_URL` and hung on a dummy URL. The sitemap is now
  `export const dynamic = "force-dynamic"` (live catalog data is generated
  per request, not baked in at build). Build now passes with only
  `NEXT_PUBLIC_SITE_URL` set. Runtime behaviour is unchanged apart from
  sitemap freshness.
- **RLS verification (first real run of the owner-reported claim):** all 13
  suites pass on disposable local Postgres 16 (2026-11-20, ~29s), after
  applying migrations 1–30 plus `storage_stub.sql` and the test-only
  `scripts/auth-emulation.sql` (emulates the Supabase platform's `auth`
  schema/roles on plain Postgres; skipped automatically where `auth.users`
  already exists, i.e. in the CI container). No suite was weakened, skipped,
  or edited. Three initial failures were gaps in the emulation itself
  (missing USAGE on the `auth` schema, `service_role` without BYPASSRLS) and
  were fixed in the emulation file only.
- **What CI still needs:** a push of this branch so GitHub Actions actually
  runs (no push was made in this session).

## What would unblock verification

- A Supabase CLI login (`supabase login`) plus the project database password,
  run read-only (`supabase migration list`, read-only `is_demo` count query),
  by the owner or an agent with hosted read access.
- Vercel dashboard / CLI read access for the production deployment commit.
- Supabase dashboard read access for backups, PITR, and staging project
  existence.

Until then, **do not deploy or pilot on an assumed hosted state**. In
particular, do not assume migrations 28–30 (refunds, order audit, delivery
coverage) exist on the hosted project — the only evidence is that they are
local files.

## Pre-existing verification failure found during P0-00 (not a hosted fact)

`npm run typecheck` fails on the base HEAD with one error, before any P0
change (P0-00 touched `docs/DECISIONS.md` only):

```
src/app/layout.tsx(67,50): error TS2304: Cannot find name 'LayoutProps'.
```

`LayoutProps` is used but never defined or imported in that file (introduced
in commit `70a4e14`, SEO phase). `npm run lint` passes; `npm run test`
(Vitest) passes — 37 files, 357 tests. The owner-reported claim that
"typecheck passes" on HEAD `34f30a6` is therefore **not verified — it fails
in a clean `npm ci` run**. This is a pre-existing finding, recorded here so
P0-02 CI is not blamed for it; it must be fixed before CI can ever be green.
**Update (P0-02, 2026-11-20): fixed** — `layout.tsx` now uses
`{ children: ReactNode }`; `npm run typecheck` passes. See "P0-02 notes"
below.
