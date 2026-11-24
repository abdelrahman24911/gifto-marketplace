# Gifto — Architecture & Codebase

- **Audit date:** 2026-11-24
- **Worktree:** `~/workspace/gifto-master-audit`, HEAD `54c780b`
- **Source:** specialist report (`/tmp/gifto-audit/architecture.md`); key counts re-verified by the coordinator in the worktree (see §8).

## 1. Shape of the system

Gifto is a **single Next.js 16 App Router application** with no separate backend. All business logic lives in server components, server actions, and PostgreSQL (migrations, RPCs, triggers, RLS). There is no API layer between the app and Supabase beyond three API/callback routes.

| Item | Count / fact |
|---|---|
| Files under `src/` | 417 (specialist count); 415 `.ts`/`.tsx` files counted by the coordinator — the difference is non-TS assets |
| Route files | 71 (29 storefront, 19 admin, 16 vendor, 4 auth, 3 API/callback) |
| Routes (build table) | 75 — 74 dynamic + 1 static (`/robots.txt`); build prerenders 53/53 static pages |
| `src/lib` modules | ~60 modules + ~60 co-located tests; `src/lib/supabase/`: 5 files |
| `src/components` | ~55 files + `dashboard/` (8) + `home/` (4) + `ui/` (2) |
| Scripts | 17 files under `scripts/` (demo, preflight, i18n check, RLS/concurrency rehearsal, Tailwind verify) |
| Dependencies | Minimal: `next`, `react`, `next-intl`, `@supabase/*`, `nodemailer`, `@sentry/nextjs`. No heavy chart/map/date libraries — charts are hand-rolled (`src/components/bar-chart.tsx`). No unused dependency confirmed. |
| Build | `next build --webpack` (not Turbopack); reason **Unknown** — not recorded anywhere |

## 2. Rendering model — fully dynamic by design

- Root layout is async and `export const dynamic = "force-dynamic"` (`src/app/layout.tsx:89`), with the comment: "Every route here reads the auth session and/or the database, so nothing is statically prerenderable."
- `next.config.ts`: `cacheComponents: false`, with an explicit comment that the app is "fully dynamic" and partial prefetching is disabled alongside it.
- Only other `force-dynamic` segments: guest order page, the two API routes (`api/cron/mail-outbox`, `api/gift-finder`), and `sitemap.ts`.
- `generateStaticParams` exists only in `src/app/[locale]/layout.tsx` (for the two locales) — no product/category/shop page is statically generated.
- **Consequence:** no static HTML is served for any public page; first paint waits on server data on every navigation. TTFB depends entirely on Supabase latency, and there is no CDN/static fallback. This is a deliberate, documented trade-off, not a bug — but it is the dominant structural performance cost (see `UX_PERFORMANCE_AND_I18N.md` §1).
- **Only cache in the system:** the public-catalog cache — `src/lib/catalog-cache.ts` wraps public reads in `unstable_cache` with `revalidate: 60` s and tag invalidation via `revalidatePublicCatalog()` after mutations. Uncacheable results (failed reads, unknown slugs) are explicitly never stored.

## 3. Request pipeline — everything in `src/proxy.ts`

There is **no `middleware.ts`**. Auth, guards, locale, and the CSP nonce all live in `src/proxy.ts`:

- Locale routing via next-intl (`src/i18n/routing.ts`): `en` default prefix-free, `ar` under `/ar/…`, `localePrefix: "as-needed"`; `/en/…` canonical-redirects back to `/…`.
- Auth/session handling and role gating resolve through `src/lib/auth.ts` (`requireUser`, `getRequestContext`, `requirePlatformAdmin`).
- CSP nonce via `headers()` in the root layout; JSON-LD `<script>` blocks carry the nonce.
- **Risk note:** the entire edge pipeline is one file. It is coherent today, but any regression in `proxy.ts` affects auth, locale, and security headers simultaneously. There is no dedicated test for the proxy itself (only the security-headers Playwright lane, which runs in CI against a loopback stub).

## 4. Data layer — four Supabase client flavours

`src/lib/supabase/` holds five files defining four client flavours (browser client, server client, public/anon client, service-role client) plus the hand-written types file. Service-role usage exists at **16 sites** in the codebase — each one is a place where RLS is bypassed by design, and each one needs its own authorization reasoning (see `SECURITY_AND_RLS.md` §4; no server-action authorization tests exist).

### 4.1 The single biggest silent-drift risk: `database.types.ts`

`src/lib/supabase/database.types.ts` is **2,516 lines, hand-written** (verified by line count in this audit). It is not generated from the live database, and there is no drift check in CI. This is the exact failure mode behind the courier-column dispute: code and database can disagree silently, and the disagreement only surfaces at runtime as a PostgREST error (PGRST204/PGRST205).

- Hosted verification in this audit found **zero drift** between the repo migrations and hosted (see `DATABASE_AND_MIGRATIONS.md` §2) — but that was a manual, one-off comparison, not a guard.
- **Recommendation (roadmap Phase 2, A-01):** generate `database.types.ts` from the live DB in CI, or at minimum add a drift check that fails the build when the types file disagrees with the migration chain.

## 5. Module health

| Module | Size | Assessment |
|---|---|---|
| `src/lib/mail.ts` | 1,146 lines | God module: transport/config + outbox worker + all notification builders in one file. Coherent, well-tested (45 tests), but split when next touched (transport/config vs outbox worker). |
| `src/lib/catalog.ts` | 1,011 lines | God module: catalog loaders + search + sitemap. Same treatment (loaders vs search/sitemap). |
| `src/lib/catalog-cache.ts` | small | Clean caching wrapper; the only cache in the app. |
| `src/lib/money.ts` | — | Integer-piastres arithmetic, no floats; Arabic-Indic digit parsing; `formatEgp` per locale. Strong. |
| `src/lib/finance.ts` | — | Settlement net-due arithmetic, clawbacks; well-tested (25 tests). |
| `src/lib/rate-limit.ts` | — | Quota gates; the fail-closed/fail-open asymmetry is a security finding (see `SECURITY_AND_RLS.md`). |
| `src/lib/environment.ts` | — | `GIFTO_ENVIRONMENT` detection; demo/staging banner; security-relevant, not cosmetic. |
| `src/lib/demo-containment.ts` | — | Demo-order/mail guards load-bearing in code paths. |

**Duplication (largest):** the signed-in vs guest order-detail pages (~510 vs ~584 lines) duplicate order rendering and refund actions, parameterised by auth mode. Every order-page fix currently ships twice. Unify into a shared order-detail component + a single refund-action module, or accept the double maintenance cost explicitly.

**Smaller duplication:** time-bucketing logic is duplicated between `admin-metrics.ts` and `vendor-analytics.ts` — extract one shared helper when either is next touched.

**Caching inconsistency:** the product page's primary fetch bypasses the cached `catalog.ts` loaders (it fetches shop then product sequentially in `getProductPageData`). Route it through the cached loaders or document why it bypasses them.

## 6. Cross-cutting behaviours (verified in code)

1. **Mail is outbox-mediated, never direct.** No order ever fails because SMTP is down; retries are capped (5 attempts, 2 requeues) and cron-driven. But no email is ever sent synchronously — the cron + `CRON_SECRET` must be configured or the outbox silently grows. See `PRODUCT_FEATURE_MATRIX.md` C-35.
2. **Demo containment is load-bearing in code paths** (`demo-containment.ts`, `isVendorBlockedFromOrders`, `isMailBlockedInDemo`, `GIFTO_ENVIRONMENT`) — the app refuses demo-vendor orders and demo mail sends in code, not just by deployment separation. Correct, but it means the `GIFTO_ENVIRONMENT` value is security-relevant, not cosmetic. Hosted confirms `app_settings.demo_orders_allowed = false`.
3. **No TODO / FIXME / placeholder pages.** A grep over `src/` returns zero `TODO`/`FIXME` markers (verified by the coordinator). There are no placeholder pages and no dead routes found in the sampled inventory.
4. **Images:** zero raw `<img>` in `src/`; all images via `next/image` (AVIF/WebP, 30-day cache TTL, `sizes` + preload on above-fold images).
5. **Client surface:** 99 of 210 `.tsx` files contain `"use client"` — nearly half the component tree is client-rendered, largely justified (cart, wishlist, gift finder, carousels, forms, dashboards). No bundle analysis was run, so no bundle-size claim is made.

## 7. What the architecture does NOT contain

- No separate backend service, no queue, no worker process (the mail worker is a Vercel cron hitting an API route).
- No carrier API client, webhook, polling worker, event table, or tracking-URL generation (migration 42 header: "No courier API is integrated and no live tracking status is promised").
- No payment gateway code of any kind (COD only, by owner decision).
- No push-notification, in-app-inbox, or analytics-provider code.
- No staging environment and no deployment configuration in the repo — all build/deploy config lives in the Vercel dashboard (see `CI_CD_AND_DEPLOYMENT.md`).

## 8. Coordinator re-verification (this audit)

| Claim | Check | Result |
|---|---|---|
| `database.types.ts` 2,516 lines | `wc -l` | **Verified: 2,516** |
| `mail.ts` 1,146 lines | `wc -l` | **Verified: 1,146** |
| `catalog.ts` 1,011 lines | `wc -l` | **Verified: 1,011** |
| Root layout `force-dynamic` | grep `src/app/layout.tsx:89` | **Verified** |
| No `middleware.ts`; `src/proxy.ts` exists | `ls` | **Verified** |
| No TODO/FIXME in `src/` | grep | **Verified: zero markers** |
| `.ts`/`.tsx` file count | `find` | 415 (specialist's 417 includes non-TS files under `src/`) |

## 9. Recommendations (architecture only; roadmap IDs in `MASTER_ROADMAP.md`)

1. **Generate `database.types.ts` from the live DB in CI** (or add a drift check) — the courier dispute is the live example of why.
2. **Unify guest + signed-in order-detail pages** (shared component + single refund-action module parameterised by auth mode).
3. **Extract shared time-bucketing** from `admin-metrics.ts` / `vendor-analytics.ts`.
4. **Route the product-page primary fetch through cached `catalog.ts` loaders** (or document the bypass).
5. **Split `mail.ts` and `catalog.ts`** when either is next touched.
6. **Run a graph-based dead-code + circular-import check** (e.g. `madge`/`knip`) — several single-importer lib modules are candidates, none proven dead.
7. **Record the `--webpack` build reason** in `package.json` or `docs/` so the Turbopack question is not re-litigated blindly.
8. **Consider aligning signup/sign-out onto the server-action pattern** used by login, so quota and session handling have one shape.
