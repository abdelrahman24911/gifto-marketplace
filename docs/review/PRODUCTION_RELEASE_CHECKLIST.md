# Gifto — Production Release Checklist

Date: 2026-11-09
Current state: Production Supabase already has migrations 20–24 applied. Production app still runs the old deployment from HEAD `d64dae5`. The local working tree contains the compatibility fixes and has passed local checks.

> Do not deploy, apply migrations, change Vercel settings, or mutate Production without explicit owner approval. The checklist below is a gate, not an instruction to execute.

## 1. Release decision

- [ ] Owner approves this release and the target deployment time.
- [ ] Release owner confirms Production database is at migrations 1–24 and no migration is pending.
- [ ] Release owner accepts the known database risks in `REMAINING_DATABASE_RISKS.md`.
- [ ] Release owner confirms the manager-media policy decision: keep app owner-only, or approve a future migration to align manager branding.
- [ ] No rollback of migrations 20 or 23 is planned; both are data-destructive in this project.

## 2. Code gate

Run from the repository root and keep the output:

- [ ] `npm ci` (or the project’s approved install command).
- [ ] `npm run typecheck` → passes.
- [ ] `npm run lint` → passes with no errors.
- [ ] `npm test` → all unit tests pass. Current local result: 17 files, 142 tests.
- [ ] `npm run build` → passes. Current local result: Next.js 16.4.2 webpack build and Tailwind verification pass.
- [ ] Review `git diff` and `git status`; confirm no `.env.local`, secret, generated build, or unrelated file is included.
- [ ] Confirm the release contains migrations 20–24 and the post-migration code changes.
- [ ] Confirm `docs/review/POST_MIGRATION_COMPATIBILITY_AUDIT.md` findings are resolved or accepted.

`npm test -- --runInBand` is not supported by this Vitest version. Use `npm test`.

## 3. Database gate

- [ ] Verify remote migration history has 24 rows, including versions 20–24.
- [ ] Verify `public_vendors` returns the 13 approved public columns and does **not** expose `address_line`.
- [ ] Verify anonymous `public_vendors` reads succeed and anonymous support reads fail.
- [ ] Verify `vendor-media` is public-read, 5 MB, and contains only intended public branding objects.
- [ ] Verify `order_vendors_vendor_created_idx` exists.
- [ ] Confirm current vendor rows have valid `working_hours` JSON and prep-time ranges.
- [ ] Run the SQL/RLS suites on a disposable database. These are **NOT RUN** today. Minimum release set:
  - `supabase/tests/rls_vendor_dashboard_test.sql`
  - the order/money/state-machine suites in `supabase/tests/`
- [ ] If the RLS suites cannot run, record the gap and obtain explicit owner acceptance; do not call RLS “verified.”

## 4. Backup and restore

- [ ] Confirm the Supabase plan’s backup/PITR status. No managed backup/PITR is currently proven.
- [ ] Take an owner-approved backup or snapshot before any further database change.
- [ ] Test restore in a disposable environment at least once before relying on it.
- [ ] Record the backup identifier and retention window.

## 5. Deployment order

The database is already ahead of the app. The remaining step is the app deployment:

1. Deploy the approved code to Vercel.
2. Keep the previous deployment available for app-level rollback.
3. Do not apply a new migration as part of this deployment unless it has its own approved release and backup.

Do not deploy code to a database still at migrations 1–19. That combination breaks the public shop projection and vendor settings/analytics/support pages.

## 6. Post-deploy smoke test

Public:

- [ ] `/` returns 200 and shop rails render.
- [ ] `/shops` returns 200 and shows active shops.
- [ ] `/shops/<active-slug>` returns 200; opening hours/prep time render when set; private address is absent.
- [ ] Product detail page loads; cart add works.
- [ ] Guest checkout completes; `/orders/<id>` confirmation is accessible only in the same browser with the HttpOnly token cookie.
- [ ] A signed-in customer sees shop names on `/account/orders` and `/account/orders/<id>`.

Vendor:

- [ ] Owner can save name, description, contact, location, private address, hours, and prep time.
- [ ] Manager sees settings read-only and cannot save profile or branding.
- [ ] Owner can upload/remove logo and cover; public shop updates.
- [ ] Pause and resume orders work; checkout rejects a paused shop with a clear message.
- [ ] Order status transitions work; delivered commission appears in finance.
- [ ] Analytics loads for 7d/30d/90d/all; all-time cap notice is correct.
- [ ] Support request submits and appears in Recent requests.

Admin:

- [ ] `/admin` counts and attention list agree.
- [ ] `/admin/orders` filters, pagination, and totals agree.
- [ ] `/admin/settlements` loads exact/incomplete state correctly; open/paid/voided sections render.
- [ ] `/admin/support` counts, filter, and status update work.

Security:

- [ ] Anonymous requests cannot read support requests, orders, commission entries, settlements, or base `vendors` rows.
- [ ] A signed-in non-member cannot read another shop’s dashboard data.
- [ ] No service-role key or private address appears in public HTML or client bundles.

## 7. Rollback plan

- App-only rollback: restore the previous Vercel deployment. Note that the old app will again show generic “Shop” labels in order history after migration 20; this is degraded but not data-destructive.
- Database rollback: do not roll back migrations 20 or 23 without a backup and an explicit data-loss decision. Prefer fixing forward.
- If checkout pause or vendor settings break, disable the affected UI path or revert the app; do not weaken RLS as a workaround.

## 8. Release blockers / accepted risks

Must be resolved or explicitly accepted by the owner:

- [ ] SQL/RLS suites not run.
- [ ] No verified backup/PITR.
- [ ] Manager-media policy mismatch.
- [ ] Support rate-limit race.
- [ ] Returns vs. settlement race.
- [ ] Admin vendor list / support list scale limits.
- [ ] No CI, staging, error tracking, or alerts.

## 9. Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| Product owner | | Approve / reject | |
| Engineering | | Code gate passed | |
| Database | | DB gate / backup passed | |
| Release operator | | Deployed and smoke-tested | |
