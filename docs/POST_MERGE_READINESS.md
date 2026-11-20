> **HISTORICAL — 2026-11-20 (P0-08).** Dated snapshot of a past verification (see the date in the file). Its numbers and hosted-state claims were true when written and are not current. Current state: `README.md`, `docs/HOSTED_STATE.md` (single hosted-state table), `docs/DECISIONS.md`. Kept as a record; its findings were not edited.

# Gifto Marketplace — Post-Merge Readiness Audit

> **Historical note (2026-10-26):** this audit predates Phase 9A/9B. Migrations 1-13 are now applied to the hosted project, including migrations 8-9 and 13. See `docs/STATUS_REPORT.md` for current deployment status.

**Audit date:** 2026-10-19  
**Auditor:** OpenCode (read-only audit; no code, migration, or git mutations)  
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`  
**Audited commit:** `357891e` (`main` == `origin/main`)  
**Companion documents:** `docs/OWNER_DECISIONS_BRIEF.md`, `docs/NEXT_PHASE_PLAN.md`

---

## 1. Repository state — VERIFIED

| Check | Result | Evidence |
|---|---|---|
| Branch / remote sync | `main` in sync with `origin/main` at `357891e`; no ahead/behind | `git status -sb`, `git log origin/main` |
| Working tree | Clean except **untracked** `docs/project-audit/` (a previous third-party audit report, see §6) | `git status` |
| Reported commits exist | `d74098c` (hardening), `add89f5` (image upload), `347eda9` (Vitest), `357891e` (docs refresh) — all present on `origin/main` with the reported file sets | `git show --stat` on each |
| `npm test` | 31/31 passing (re-run this date) | `npm test` |
| `npm run typecheck` | Clean (re-run this date) | `tsc --noEmit` |
| `npm run lint` | 0 errors, 0 warnings (re-run this date) | `eslint` |
| DB suites | 107/107 assertions across 7 suites, each on a fresh schema in the disposable `gifto-rls-test` container (`public.ecr.aws/supabase/postgres:17.11.0.003`), storage stub applied once as `supabase_admin` | Suite loop re-run this date: foundation 15, onboarding 12, catalog 23, orders 25, commissions 13, inventory 9, hardening 10 |
| `npm audit` | 5 high-severity advisories remain (all via `eslint-config-next` chain) — matches the documented debt | `npm audit --audit-level=high` |

**No discrepancy** between the reported commit set and the actual repository.

## 2. Documentation discrepancies (minor, non-blocking)

1. **`docs/STATUS_REPORT.md` is one step stale on push status.** Its header says "pushed through `d74098c`; image-upload and Vitest commits pending push" — those commits (plus the docs commit itself) are in fact pushed; `main` == `origin/main`. The report was written minutes before the push.
2. **`docs/project-audit/AUDIT_REPORT.md`** (untracked) claims "3 commits ahead — not yet pushed" at `347eda9` — stale by the same reason.
3. **`README.md` line ~97** says "re-apply migrations 1–7 before each suite"; the suites now cover migrations 1–9 (the bash snippet itself copies and applies all migrations, so only the prose is stale).

None of these affect code or database behavior.

## 3. Migration readiness — container-verified; **hosted status UNVERIFIED**

### Hosted status

There is **no reliable evidence in the repository** that migrations 8–9 have been applied to the hosted Gifto project (`hqusykdyjpruysxezsrn`). The last documented hosted verification covers migrations 1–7 only (README "Verification status", `STATUS_REPORT.md`). Per audit constraints, this audit did not connect to the hosted project, run `supabase migration list`, or push anything. **Treat migrations 8–9 as NOT applied until `supabase migration list` (or the hosted dashboard's Schema diff) confirms otherwise.**

### Migration 8 — `00000000000008_security_hardening.sql`

- **Depends on:** migration 1 only (`public.profiles`, `public.vendor_members`, `public.is_platform_admin()`, `public.is_vendor_member()`). No dependency on migrations 2–7; safe to apply in isolation after migration 1.
- **Effects:** drops `public.is_vendor_staff(uuid)` (only referenced by migration-1 grants — verified by search across all migrations and `src/`); creates `protect_platform_admin_insert()` trigger on `profiles` (INSERT path; keys off `auth.uid()` because `current_user` is unreliable inside `SECURITY DEFINER`); creates `guard_vendor_last_owner()` on `vendor_members` (`BEFORE UPDATE OF role OR DELETE`; `pg_trigger_depth() > 1` lets cascading vendor/account deletions pass so admin cleanup is never orphaned).
- **Idempotency:** **not re-runnable** — bare `create trigger` (no `drop trigger if exists`). This is fine for `supabase db push` (each migration applies exactly once) but matters for manual recovery; re-running the file by hand will fail on the second trigger.
- **Remote conflict risk:** low. The hosted DB has only migrations 1–7 plus normal platform objects; the only conflict would be manual ad-hoc triggers/functions with the same names (none documented). Pre-push check: `select tgname from pg_trigger where tgname in ('profiles_protect_platform_admin_insert','vendor_members_guard_last_owner');` must return 0 rows.
- **Verification:** `rls_hardening_test.sql` — 10 assertions (admin self-provisioning denied, dropped helper gone, last-owner demotion/deletion blocked, cascade deletes unaffected, service-role bootstrap path).

### Migration 9 — `00000000000009_product_image_upload.sql`

- **Depends on:** migration 1 (`is_vendor_manager`, which covers `owner` **and** `manager` — verified in migration 1, lines 223–235), migration 4 (`public.products`), and the platform `storage` schema (`storage.buckets`, `storage.objects`, `storage.foldername()`).
- **Effects:** inserts the `product-images` bucket (public, 5 MB, jpeg/png/webp/avif) with `on conflict (id) do nothing`; creates three `storage.objects` policies (`public read`, `manager upload`, `manager delete`) using `drop policy if exists` first, so the migration is re-runnable. Policies verify **both** path segments — `{vendor_id}/{product_id}/{uuid}.{ext}` — against `products` and `is_vendor_manager`. `objects.name` is explicitly qualified because `products.name` would otherwise shadow it inside the `EXISTS` subquery (a bug found and fixed during the original implementation).
- **Hosted compatibility:** expected to work — `insert into storage.buckets` + `create policy on storage.objects` as the migration role is the standard Supabase hosted pattern, and `storage.foldername()` exists on hosted. This audit **cannot certify** it without connecting; treat first push as a verification step (see `NEXT_PHASE_PLAN.md` deployment tasks). If the hosted project already contains a manually created `product-images` bucket, the insert is skipped and the policies are replaced by name — no conflict.
- **App-layer behavior (code-reviewed):**
  - Upload: `src/app/vendor/products/[id]/images/actions.ts` — `requireVendorRole` + `canManage` (owner/manager), product must belong to the caller's vendor, ≤5 files per request, ≤8 images per product, 5 MB and MIME allowlist mirroring the bucket config, path built server-side, compensating `bucket.remove()` if a row insert fails mid-batch.
  - Delete: row first, then object (a missing object is tolerated); product delete (`src/app/vendor/products/actions.ts`) removes all of the product's storage objects.
  - Rendering: `src/components/product-image.tsx` + the gallery panel build public bucket URLs; monogram fallback on failure.
  - **Defense in depth holds:** even if the server action were bypassed, storage policies independently enforce vendor-folder ownership (tests 17A–C, 18A, 19A: staff denied, cross-vendor denied, unknown-product denied, anon denied, cross-vendor delete filtered).
- **Supabase configuration prerequisites (hosted):** none beyond a normal project — the bucket and policies are created by the migration itself; public reads use `/storage/v1/object/public/...` URLs. The app needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`; `SUPABASE_SERVICE_ROLE_KEY` is only required where `createServiceClient()` is called (currently none in request paths — the module exists for ops/bootstrapping).

### Local test-stack caveat (documented, unchanged)

`supabase start` does not produce containers on this machine; verification uses the raw `supabase/postgres:17.11.0.003` image plus `supabase/tests/storage_stub.sql` (applied **once**, as `supabase_admin`, before the suite loop). The stub must never be applied to a hosted project.

## 4. Authorization model — spot-checked, consistent

- Storage write policies use `is_vendor_manager` (owner + manager); the server action adds `canManage` on top; staff roles are read-only for images and orders (`/vendor/orders` buttons hidden, and the DB suite asserts the underlying rules).
- Platform admin: full moderation read in catalog/orders/commissions; settlement RPCs are admin-only (`42501` otherwise); admin routes are prefix-protected in `src/proxy.ts` with per-page `is_platform_admin` checks.
- Last-owner guard blocks owner self-demotion/deletion but permits cascades — verified by hardening suite.
- Commission ledger remains append-only to clients; only triggers and admin RPCs write it.

## 5. Known gaps confirmed by this audit

| Gap | Evidence | Impact |
|---|---|---|
| **No settlements UI** | `create_settlement` / `mark_settlement_paid` appear only in `database.types.ts`; no admin page or action calls them | Payout batches currently require SQL access or a service-role client — an operational blocker for real payouts |
| COD-never-collected restock | `D-05` "Still open" in `DECISIONS.md`; no automatic restock path | Inventory can drift on failed COD deliveries without manual `adjust_product_stock` |
| Browser-level E2E | Documented limitation in README; write paths covered only by DB suites | Auth-cookie-dependent flows untested end-to-end |
| npm audit: 5 highs | `npm audit --audit-level=high` | Transitive via `eslint-config-next`; dev-time only, but should be reviewed |
| Vitest pinned to v4 | v5 requires `@types/node` ≥ 22; project on v20 | Upgrade path tied to a Node types bump |
| Turbopack build broken on win32 | README; `build` pinned to `--webpack` | Dev-machine quirk only |

## 6. Housekeeping findings

- `docs/project-audit/AUDIT_REPORT.md` is an **untracked** prior audit (by "Cline") at commit `347eda9`. Its product/stack overview is accurate; its push-status line is stale. It is not committed and was not modified by this audit.
- `docs/STATUS_REPORT.md` push-status line should be refreshed at the next docs pass (see §2).
- README prose "migrations 1–7" in the suite instructions (§2 item 3) is cosmetic drift.

## 7. Readiness verdict

| Dimension | Verdict |
|---|---|
| Code / tests at `357891e` | **Ready** — independently re-verified (typecheck, lint, 31 unit tests, 107 DB assertions) |
| Migration 8–9 correctness | **Ready** — container-verified on a fresh schema, idempotency and conflict profile documented |
| Migration 8–9 hosted deployment | **Unverified** — no evidence of application; must be pushed and smoke-tested (see `NEXT_PHASE_PLAN.md`) |
| Business readiness | **Blocked on owner decisions** D-06 (delivery fee future model), D-07 (subscriptions), D-08 remainder (settlement cadence) — see `OWNER_DECISIONS_BRIEF.md` |
| Operational readiness | **Partial** — no settlements UI; COD-failure restock is manual |

**Bottom line:** the merge is sound and the next phase is deployment-first (push migrations 8–9, verify hosted, seed the first platform admin, add a minimal settlements UI), with three owner decisions needed in parallel — none of which block the deployment work.
