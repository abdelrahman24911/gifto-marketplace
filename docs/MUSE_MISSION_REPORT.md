# Gifto — Autonomous Improvement Mission: Full Report

Branch `muse/gifto-autonomous-improvement`, HEAD `dc37ff0` (44 commits above base `b369412`), 2026-11-23.
Nothing pushed, merged, deployed, or written to any hosted system.

This file combines the four mission reports into one document. The four reports were written at HEAD `c5c2bdf`; the reports commit `dc37ff0` adds documentation only, so all findings, gates, and verdicts below are current.

Verdict: **NO-GO public launch, CONDITIONAL GO closed pilot.**
Single most important next action (owner): choose the SMTP provider and sending domain, then verify a real send.

## Contents

- Part 1 — Implementation Summary
- Part 2 — Full-Site Test Results
- Part 3 — Production Blockers
- Part 4 — Next Actions

---

## Gifto — Implementation Summary (autonomous improvement mission)

Branch `muse/gifto-autonomous-improvement`, HEAD `c5c2bdf`
(43 commits above base `b369412`, the post-merge main of 2026-11-23).
Nothing pushed, merged, deployed, or written to any hosted system.
Tree clean at `c5c2bdf`.

### What was investigated

The mission was: take the branch from the merged P0/P1 state through
P2–P6, then run a full-site test pass and fix loop, and record the
results. The work was done in five batches plus the final pass,
verified-first throughout: every QA finding was checked against the
actual code before any fix, because the live deployed site (older
build) had produced phantom findings. The five "failing to load" admin
pages, the vendor Orders list, admin order detail, and the vendor
staff list were all VERIFIED-WORKING in current code — no change was
made for them.

### What was implemented, by batch

#### Batch 1 — P0 demo containment + P1 financial correction (5 commits, HEAD `5308032`)

- **Migration 67** demo containment: `app_settings`
  (`demo_orders_allowed`, default false) + `_create_order` rejects
  demo vendors transactionally + rollback. Deployment order: apply
  migration 67 BEFORE deploying the app code that reads
  `app_settings`.
- App layer: `src/lib/demo-containment.ts`, placeOrder pre-check,
  demo-owner resume refusal, paused treatment on product/shop/buy-now
  pages; `database.types.ts` gains `app_settings` + `vendors.is_demo`.
- RLS suite TEST 1–8 + 5 unit tests.
- P1 C1 correction: `supabase/corrections/` + `scripts/rehearse-c1.sh`
  + seed; rehearsal ALL CHECKS PASSED. C1 never executed against
  production.
- TEST 21 double-mark-paid refusal + TEST 22 re-batch after void.

#### Batch 2 — P2 dashboards, verified-first (20 commits, HEAD `d300047`)

- Vendor order-detail page with confirm/ship/close + refund link.
- Product delete requires typing the exact product name (UI + server
  re-check). Shared `ConfirmSubmit` for one-click money/destructive
  actions. Customer contact masking in admin orders list.
  Returned-order commission notes. Working Try again on load errors.
- Mail outbox no longer contradicts itself; Retry disabled while SMTP
  off.
- Migration 68 `ramdan-night` → `ramadan-night` with redirect +
  public preview per occasion. Migration 69 admin in-app replies on
  support requests (`admin_reply`/`replied_at`/`replied_by` + RLS
  TEST 20).
- CSV exports (vendor finance, admin commissions); sorting +
  required stock-change reason; filter-pill pending states; centred
  occasion delete dialog.
- One regression caught and fixed during final gates (`d300047`
  finance pagination).

#### Batch 3 — P3 security + P4 UI/UX/perf (9 commits, HEAD `7548861`)

- `safeDbError` helper: vendor/admin/storefront actions no longer
  return raw database error text (constraint names, RLS policy text).
- Quota-gate service failure now shows a distinct "unavailable"
  message instead of the false "Too many attempts" lockout (the
  2026-11-22 lockout root-cause class).
- Shared magic-byte image verification on all upload surfaces
  (product images, vendor branding, occasions); preflight checks all
  three image buckets.
- Vendor finance tabs got the pending-state treatment; admin products
  CSV export; migration 70 window indexes (orders + commission
  entries).
- Verified with no change needed: auth/session guards, CSP/security
  headers, Storage policies, no N+1 queries, all lists paginate.

#### Batch 4 — P5 demo separation + P6 validation (6 commits, HEAD `04b48d3`)

- `GIFTO_ENVIRONMENT` parsing (production/staging/demo/development,
  unknown values throw) + demo/staging environment banner in the root
  layout.
- Mail demo guard: no real email from a demo environment unless
  `GIFTO_DEMO_ALLOW_EMAIL=true`; blocked sends still enqueue; outbox
  processing refuses without touching a row.
- Demo-script target guard (seed/cleanup/passwords refuse unless
  `GIFTO_ENVIRONMENT=demo`, https only, refuse the known production
  project ref unless explicitly opted in) + new
  `scripts/reset-demo.mjs` and `npm run demo:reset`;
  `docs/DEMO_SEPARATION_CHECKLIST.md` (owner steps for isolated
  Supabase + Vercel demo projects, retiring production demo data).
- Migration 70 rollback added (67–70 all have rollbacks now).
- Behaviour change for the owner: demo scripts now refuse without
  `GIFTO_ENVIRONMENT=demo` set.

#### Final pass — full-site test + fix loop (3 commits, HEAD `c5c2bdf`)

- **`50dc6da`** fix(admin): disambiguate support queue creator embed
  (PGRST201). Migration 69's `replied_by` FK made the
  `creator:profiles(...)` embed ambiguous; the support queue failed
  to load. Exported `ADMIN_SUPPORT_REQUEST_COLUMNS` with an explicit
  FK-qualified embed + 2 regression tests.
- **`17d440b`** fix(mail): `notifyOrderPlaced` must never throw and
  fail checkout. It was the only order notifier without a try/catch;
  `getSiteUrl()` throws on localhost in production, which turned an
  already-placed order into a customer-facing failure with no
  notification. Wrapped in try/catch like its siblings + 2 tests.
  Live-verified on the prod build.
- **`c5c2bdf`** fix(refunds): make cancelled-suborder approval
  explicit in `resolve_refund_case` (N-02). Migration 71 + rollback +
  RLS TEST 14f. No behaviour change.

### Most important bugs fixed

1. **Checkout could fail after the order was placed** (F-03) — a
   missing try/catch in the one mail notifier turned a notification
   failure into a customer-facing order failure. The money path now
   cannot be broken by the notification path.
2. **Admin support queue failed to load** (F-02) — an ambiguous
   PostgREST embed (PGRST201) emptied the queue. One FK-qualified
   embed fixed it.
3. **Pre-delivery refunds silently over-earned commission** (N-02,
   migration 44) — now recorded as pending adjustments converted at
   delivery, and the last silent path (cancelled before approval) is
   explicit and tested (migration 71).
4. **Demo vendors could keep taking orders in production** (P0,
   migration 67) — transactionally refused, with an app-layer
   pre-check and paused treatment.
5. **False lockouts** (Batch 3) — quota-gate service failures no
   longer present as "Too many attempts".
6. **Raw database errors leaked to clients** (Batch 3) — `safeDbError`
   everywhere.
7. **Fake images could be uploaded** (Batch 3 + final pass) —
   magic-byte verification on all upload surfaces, verified end-to-end
   with a real upload.

### Files created / modified (branch diff vs `b369412`)

147 files changed, 9,324 insertions, 698 deletions. Headline
additions: `src/lib/demo-containment.ts`, `src/lib/safe-db-error.ts`,
`src/lib/environment.ts` (+ banner component), mail demo guard in
`src/lib/mail.ts`, `src/lib/image-upload.ts` (shared magic-byte
validation), `scripts/reset-demo.mjs`, `scripts/rehearse-c1.sh`,
`supabase/corrections/`, `docs/DEMO_SEPARATION_CHECKLIST.md`,
migrations 67–71 (+ rollbacks in `supabase/rollbacks/`), the four
`docs/MUSE_*.md` reports in this final pass, and RLS TEST 14f in
`supabase/tests/rls_refunds_test.sql`.

### Tests and exact results (final HEAD `c5c2bdf`, 2026-11-23)

| Gate | Result |
|---|---|
| Lint (`npm run lint`) | PASS |
| Typecheck (`npm run typecheck`) | PASS |
| Vitest (`npm run test`) | **674/674, 75 files** (670 at Batch 4; +4 from F-02/F-03 tests) |
| RLS suites (`scripts/run-rls-suites.sh`, disposable Postgres 16.15) | **18/18 PASS** |
| Production build (`npm run build`, local Supabase env) | PASS |
| C1 rehearsal (`scripts/rehearse-c1.sh`, disposable DB) | **ALL CHECKS PASSED** |
| node:test (preflight + demo-target guard) | **13/13 PASS** |
| Migration chain 1–71 | Applies cleanly fresh (proven 18× by the RLS runner); rollback 71 round-trips |
| HTTP crawl (66 routes, all sessions) | 0 error markers; all 16 admin + 9 vendor sections 200 |
| Live action verifications | Guest checkout (prod), demo mail guard, magic-byte upload, PRICE_CHANGED, support reply, vendor confirm/ship, CSV exports, slug redirect — all verified (see `docs/MUSE_TEST_RESULTS.md`) |
| Secret scan over the branch diff | 0 matches; `git diff --check` clean |

### What remains unverified

- **Browser rendering/interaction** for: finance tab pending state,
  ConfirmSubmit flows, support preview, CSV download behaviour,
  filter-pill pending state, wishlist client sync, environment banner
  visuals. Playwright execution is blocked (Chromium download failed,
  approval timed out — do not retry without the owner's approval).
- **404 empty DOM** (F-01): root cause established, recorded, no
  small safe fix.
- **Owner-side blockers**: see `docs/MUSE_PRODUCTION_BLOCKERS.md`.

---

## Gifto — Full-Site Test Results (final pass)

Branch `muse/gifto-autonomous-improvement`, HEAD `c5c2bdf`
(43 commits above base `b369412`). Written 2026-11-23, after the final
full-site test pass on the local production build. Nothing was pushed,
merged, deployed, or written to any hosted system.

### How the pass ran

- **Local Supabase-lite stack** (disposable Postgres 16.15, GoTrue
  v2.198.0, PostgREST 16.6, storage shim + gateway) on
  `127.0.0.1:54321`, migrations 1–71 applied, seeded with fixed test
  data (admin / vendor / customer, E2E Flower Shop + E2E Demo Shop, 6
  products, 1 support request). Scripts live in `~/workspace/gifto-e2e/`
  (outside the repo; the stack is test harness, not product code).
- **App**: production build (`next build`) with the local Supabase URL
  baked in, served by `next start` on `127.0.0.1:3100`. Dev server was
  used only for the first action-harness probes.
- **HTTP crawl**: 66 routes with the right session (anon / admin /
  vendor / customer), visible-text checks after stripping
  `<script>` / `<style>` / `<template>` (i18n strings live in the RSC
  payload and false-positive otherwise).
- **Server actions over HTTP**: invoked with React's `encodeReply`
  wire format (raw multipart FormData POSTs fail with
  "Unexpected end of form" — a harness artifact, not an app bug;
  Node's chunked FormData streaming also fails, so the harness
  serializes the multipart body with an explicit boundary and
  Content-Length). Action IDs were read from
  `.next/server/server-reference-manifest.json`, not scraped from
  chunks.
- **Playwright execution never ran in this environment**: the Chromium
  download failed and its approval timed out, and the bundled
  `/opt/meta-chromium/chrome` refuses Playwright launch. Items that
  need a real browser are marked UNVERIFIED below — never claimed
  passed. Do NOT retry the Chromium download without the owner's
  approval.

### Issues found in this pass

#### F-01 — 404 pages serve an empty DOM (REMAINING, Medium-Low)

- **Evidence**: `/shops/no-such-shop`, `/categories/no-such`, and
  `/definitely-not-a-route` all return 404 with 40 visible characters
  (the page title only). Body is `<div hidden><!--$--><!--/$--></div>`
  plus scripts. The 404 UI ("This gift isn't here", "Back home",
  "Browse shops", "Search gifts") exists only inside the flight
  script payload as serialized React elements. Normal pages SSR fine
  (homepage: 4,990 visible chars). Admin 404s render their layout
  (312 chars) because the admin shell is synchronous.
- **Root cause established**: the root layout is
  `dynamic = "force-dynamic"` and async (awaits `getLocale()`,
  `headers()`, `getMessages()`), and the `[locale]` layout is async
  too. Next streams the shell first with the children slot as a hidden
  Suspense placeholder; the not-found content arrives in a later
  flight chunk in the same response. A JS-enabled browser applies it
  on hydration and renders the 404 correctly; no-JS clients and naive
  crawlers see an empty page. Googlebot executes JS, so the SEO impact
  is limited.
- **Fix attempted? No.** Removing `force-dynamic` risks breaking the
  prerender pass the comment documents ("lets the root layout use
  cookies() without breaking the not-found/prerender pass under
  `cacheComponents`"), and Next has no supported knob to force
  not-found content into the first flush for dynamic layouts. Per the
  mission rule (fix if small and safe, otherwise record), this is
  recorded as remaining.
- **Also observed**: `/occasions/ramdan-night` 404s in the fresh seed
  DB because the seed creates `ramadan-night` directly and migration
  68's redirect row only exists when the old slug existed. The
  redirect mechanism itself was verified end-to-end (throwaway
  occasion renamed, 308 to the new slug, cleaned up). Not a bug.

#### F-02 — `/admin/support` showed a visible load error (FIXED, `50dc6da`)

- **Evidence**: crawl flagged "Some support data could not be loaded..."
  on `/admin/support` as admin.
- **Root cause**: migration 69 added `replied_by` FK to `profiles`,
  making the `creator:profiles(...)` embed ambiguous → PostgREST
  PGRST201 (300 Multiple Choices), so the whole list query failed and
  the queue rendered empty. Only ambiguous embed in the app (grep
  confirmed).
- **Fix**: `src/lib/support-requests.ts` gained exported
  `ADMIN_SUPPORT_REQUEST_COLUMNS` using
  `creator:profiles!support_requests_created_by_fkey(full_name)`;
  `src/app/admin/support/page.tsx` uses it; 2 regression tests added
  in `src/lib/support-requests.test.ts` (8 tests in file pass).
- **Live re-verification**: crawl re-run — `/admin/support` 200,
  1,428 visible chars, no error markers; the seeded request renders
  with its creator name.

#### F-03 — `notifyOrderPlaced` threw and failed checkout (FIXED, `17d440b`, live-verified)

- **Evidence**: guest checkout on the prod build (`next start`,
  `NODE_ENV=production`) returned "The order could not be placed.
  Please try again." even though the order was placed in the DB, and
  no notification was enqueued. Observed twice on prod 3100 (demo and
  non-demo env); dev 3101 unaffected.
- **Root cause**: `notifyOrderPlaced` was the only order notifier
  WITHOUT a try/catch (siblings `notifyOrderStatusChanged`,
  `notifySupportRequestStatusChanged`,
  `notifyRefundCaseOpened/Resolved` all have one). `getSiteUrl()`
  throws "NEXT_PUBLIC_SITE_URL must not point to localhost in
  production" when `NODE_ENV=production` and the site URL is
  localhost — the exact combination a local `next start` run has.
  The throw propagated to `placeOrder`'s guest-branch catch, turning
  an already-placed order into a customer-facing failure with no
  notification enqueued. The checkout action's own comment promises
  "notifyOrderPlaced catches and logs its own failures" and "A failed
  send never rolls the order back" — the code did not guarantee it.
- **Fix**: `notifyOrderPlaced` wraps an inner function in try/catch
  (log + swallow), matching its siblings. 2 tests added in
  `src/lib/mail.test.ts` (resolves without throwing under
  production+localhost site URL with a fake service client; happy path
  enqueues vendor + customer rows). Mail suite 41/41 pass.
- **Live re-verification (this pass, prod 3100, no `NEXT_PUBLIC_SITE_URL`)**:
  guest checkout (1× White Lily Bouquet EGP 520 + 2× Red Rose Dozen
  EGP 750, gift wrap + message) placed order `GFT-E4F32BAF5ABB`,
  status `placed`, total 202000 minor, with 2 `mail_outbox` rows
  (`order_placed_customer` + `order_placed_vendor`, both `pending`,
  last_error "SMTP is not configured" — expected: no SMTP provider is
  configured locally; rows queue for manual admin retry, which is the
  documented behaviour). Correct local prod-test env config learned:
  do NOT set `NEXT_PUBLIC_SITE_URL` to a localhost URL for `next start`.
- **Note**: temporary console.error probes were added to
  `checkout/actions.ts` twice during debugging and reverted both
  times; the tree is clean at `c5c2bdf`.

#### F-04 — Refund window checked at open, not at resolve (RECORDED, NOT changed — owner decision)

- **Evidence**: `open_refund_case` enforces the 7-day window from
  delivery; `resolve_refund_case` does not re-check it. A case opened
  on day 6 can be resolved on day 20.
- **Decision**: deliberately NOT changed. The window governs the
  customer's right to OPEN a case (D-09: "7 days from delivery"),
  not the admin's processing time. Enforcing at resolve would reject
  legitimately opened cases that sat in the admin queue — unfair and
  surprising. The re-audit's "enforce at resolve too" recommendation
  is a policy change, not a safe silent fix. If the owner wants the
  window enforced at resolve, say so explicitly and it will be a
  deliberate change with vendor/customer comms.

#### N-02 final fallthrough — cancelled-suborder approval was silent (FIXED, migration 71, `c5c2bdf`)

- **Evidence**: in `resolve_refund_case` (migration 44 version), the
  no-earned-entry arm recorded a pending commission adjustment only
  while the suborder was `shipped`. A case opened while shipped, then
  cancelled before approval, fell through silently: no entry, no
  pending row, no record that the commission path was considered.
  Reachability established: cases can only open on shipped /
  delivered / returned suborders, and transitions are forward-only
  except shipped → cancelled, so `cancelled` is the only non-shipped
  status reachable at approval. The outcome was already correct (a
  cancelled suborder can never be delivered, so no commission is ever
  earned and there is nothing to reduce) — but implicit and untested.
- **Fix**: migration 71
  (`00000000000071_explicit_cancelled_refund_approval.sql` + rollback
  in `supabase/rollbacks/`) adds an explicit `cancelled` branch and
  an explicit `else` for the delivered/returned anomaly. No behaviour
  change. RLS TEST 14f proves it: case opened on a shipped suborder,
  suborder cancelled, admin approves → case `approved` (2500 minor),
  no pending row, no commission entry, no commission adjustment,
  suborder stays cancelled. Rollback 71 round-trips (function reverts,
  re-apply restores the branch).
- **Related, verified closed**: the RLS runner's `*.rollback.sql`
  glob. The runner refuses to run if any `*rollback*` file sits in
  `supabase/migrations/` AND refuses per-file inside the apply loop;
  all rollback files live in `supabase/rollbacks/` and none are in
  `supabase/migrations/`. No action needed.

#### Test-environment artifact — RLS 10/18 failures were NOT a code regression

- **Evidence**: the first full RLS run at `c5c2bdf` failed 10/18
  suites (`gen_random_bytes does not exist`,
  `operator does not exist: text % text`).
- **Root cause**: the local `postgres` role carried
  `search_path=auth, public` (left over from the GoTrue stack work),
  so `CREATE EXTENSION` placed `pgcrypto`/`pg_trgm` in the `auth`
  schema, and the checkout RPCs pinned to `set search_path = public`
  could not see them. Earlier 18/18 runs had the extensions in
  `public`.
- **Fix (environment only, no repo change)**: `ALTER ROLE postgres
  RESET search_path` + `ALTER EXTENSION pgcrypto/pg_trgm SET SCHEMA
  public`. Re-run: **RLS 18/18 PASS**. The refunds suite passed
  throughout because it never calls `gen_random_bytes` inside a
  search-path-pinned function.

### Crawl results (corrected route list, 2026-11-23)

66 routes, **0 flagged** by error markers. All 16 admin sections
200 (Overview, Analytics, Shops, Orders, Logistics, Refunds,
Price-change refusals `/admin/price-consent-refusals`, Reviews,
Commissions, Settlements, Products, Categories, Occasions, Tags,
Vendor support, Mail outbox). All 9 vendor sections 200 (Overview,
Orders, Products, Inventory, Refunds, Finance, Analytics, Store
settings, Help & support) plus `/vendor/settings/staff` 200. Guards
verified: `/admin` as vendor → 307, `/vendor` as admin → 307,
`/account` anon → 307. `/sitemap.xml` 200 (1,546 chars, valid
`<urlset>`), `/robots.txt` 200 (68 chars, correct content).

Notes on the first crawl run: it used `/en/...` URLs, which 307 to
the unprefixed paths (English is the default locale, no prefix; only
`/ar/...` is prefixed), and it used wrong admin routes
(`/admin/price-refusals`, `/admin/staff`, `/vendor/reviews` do not
exist — the real routes are `/admin/price-consent-refusals`, and
staff/reviews live elsewhere). The corrected crawl above is the
authoritative one. `/login` renders its full sign-in form server-side
(331 visible chars). `/wishlist` renders for the customer (1,721
chars); items load client-side after hydration from the DB via server
actions — the seeded wishlist row exists in the DB.

### Live verifications in this pass

| Check | Result |
|---|---|
| Guest checkout, prod build (F-03 fix) | Order `GFT-E4F32BAF5ABB` placed, 202000 minor; 2 outbox rows enqueued |
| Demo-vendor refusal | Guest checkout with the Demo Plant Pot returns `"E2E Demo Shop" is not accepting orders right now.`; no demo order created |
| PRICE_CHANGED flow | Wrong expected price → `priceChanged` state with line diff + `price_consent_refusals` row; resubmit with `price_confirmation` → order placed |
| Mail demo guard, end-to-end (prod, `GIFTO_ENVIRONMENT=demo`) | Order `GFT-38CC0E6781A0` placed (52000); 2 new outbox rows with last_error `demo environment: sending disabled`; no real send attempted. Banner renders: "Demo environment — demo data only. No real orders, payments or emails." |
| Magic-byte image rejection, real upload flow | Fake PNG (text bytes, `image/png`) → `"fake.png" does not look like a valid image.`; fake JPEG → same for `fake.jpg`; valid 1×1 PNG → uploaded (storage objects 1→2, product_images 1→2) |
| Support reply flow | `updateSupportRequestStatus` via action → "Reply saved and status updated.", status `in_progress`, `admin_reply` persisted, `replied_by` set |
| Vendor order flows | `setSuborderStatus` confirm (placed → confirmed) then ship (confirmed → shipped, courier "E2E Courier", tracking "E2E-TRACK-001"); parent order stayed `confirmed` |
| CSV exports | `/admin/products/export`, `/admin/commissions/export`, `/vendor/finance/export` all 200, `text/csv; charset=utf-8` (commissions/finance header-only: no entries yet, order not delivered) |
| Slug redirect | Throwaway occasion renamed → 308 to the new slug, new slug 200; cleaned up |
| Environment banner, production env | Not shown on the production build (correct) |

### Carried-over browser-unverified items — final status

| Item | Status |
|---|---|
| Environment banner (demo/staging, never production) | VERIFIED server-side HTML in both envs (shown in demo, absent in production). Visual rendering needs a browser — UNVERIFIED |
| Mail blocked in demo environment, end-to-end | VERIFIED (see above) |
| Finance tab pending state | UNVERIFIED — needs a browser |
| ConfirmSubmit flows | UNVERIFIED — needs a browser |
| Support preview / reply flows | Reply VERIFIED via action; preview needs a browser — UNVERIFIED |
| CSV downloads | Content + headers VERIFIED via HTTP GET; the download behaviour itself needs a browser — UNVERIFIED |
| Magic-byte image rejection in a real upload | VERIFIED via the real `uploadProductImages` action |
| Filter-pill pending state | UNVERIFIED — needs a browser |
| Wishlist sync | Page renders; DB row exists; client-side sync needs a browser or action-level check — UNVERIFIED |

### Final gates at HEAD `c5c2bdf` (2026-11-23)

| Gate | Command | Result |
|---|---|---|
| Lint | `npm run lint` | PASS |
| Typecheck | `npm run typecheck` | PASS |
| Vitest | `npm run test` | **674/674 (75 files)** (was 670 at `04b48d3`; +4 = 2 mail + 2 support tests) |
| RLS suites | `scripts/run-rls-suites.sh` on disposable Postgres 16.15 (`gifto_rls_test`) | **18/18 PASS** (after fixing the test-env search_path artifact; see above) |
| Production build | `npm run build` (local Supabase env) | PASS (+ Tailwind verification OK) |
| C1 rehearsal | `scripts/rehearse-c1.sh` (disposable DB `gifto_c1_rehearsal`) | **ALL CHECKS PASSED** |
| node:test | `node --test scripts/check-deployment-preflight.test.mjs scripts/demo-target-guard.test.mjs` | **13/13 PASS** |
| Migration chain | 1–71 applied fresh per RLS suite (18×) | Clean; rollback 71 round-trips |
| Secret scan | grep over `git diff b369412..HEAD` | 0 matches; `git diff --check` clean |

Note: bare `node --test` (no args) fails on Vitest files — that is an
invocation mistake, not a test failure; the scoped command above is
the correct one (preflight + demo-target guard, 13 tests).

### Stack wipe and rebuild (test-harness note)

2026-11-23 ~03:43 EET a service restart wiped `/tmp/gifto-e2e/` and
killed all stack processes. The stack was rebuilt in persistent
locations (scripts/keys in `~/workspace/gifto-e2e/`, binaries/data in
`/var/lib/gifto-e2e/`). Two stack bugs were found and fixed during the
rebuild, both harness-side, never app fixes:

1. **GoTrue startup fatal** on `20250731150234_add_oauth_clients_table`:
   the first `auth migrate` run recorded versions in
   `public.schema_migrations` while the server tracks
   `auth.schema_migrations` (55 vs 77 rows). Fix: copied the 22
   missing versions into `auth.schema_migrations`, dropped the stray
   public table. GoTrue healthy, `/health` 200.
2. **Seed user-id reassignment** failed (FKs from `auth.identities`
   etc. have no ON UPDATE CASCADE, and the two directions of the FK
   cannot both be satisfied in sequence). Fix: the seed now keeps the
   Admin-API-generated user ids and uses them consistently; the admin
   flag is granted via upsert (INSERT with the flag is allowed with no
   JWT) with a guard-trigger-disable fallback, verified re-enabled.

Also fixed during the rebuild: PostgREST's `authenticator` role
needed `GRANT anon, authenticated, service_role TO authenticator`
(else 403 `permission denied to set role`), and migration 67's
revoke of `demo_orders_allowed()` from `service_role` was restored
after a blanket grant re-added it (service RPC now correctly 403, as
in the original stack).

### Remaining (not fixed in this pass)

- **F-01** 404 empty DOM (Medium-Low, no-JS/crawler only).
- **F-04** refund window at resolve — owner policy decision, not a bug.
- **No automatic mail-outbox retry worker** — pilot: manual admin
  retry is fine; public launch needs a cron/worker within the
  existing 5-attempt / 2-requeue caps.
- **Browser-unverified items** in the table above (finance tabs,
  ConfirmSubmit, support preview, CSV download behaviour, filter
  pills, wishlist sync, banner visual rendering).
- **Playwright execution** — blocked on the Chromium download
  approval (see top). All browser-dependent verification is therefore
  outstanding.
- **Owner-side items** — see `docs/MUSE_PRODUCTION_BLOCKERS.md`.

---

## Gifto — Production Blockers (final pass)

Branch `muse/gifto-autonomous-improvement`, HEAD `c5c2bdf`
(2026-11-23). Verdict unchanged: **NO-GO public launch,
CONDITIONAL GO closed pilot** — with the conditions below.

### What is NOT blocking the closed pilot

- All P0/P1/P2/P3/P4/P5/P6 code work on this branch is done and
  gated (lint, typecheck, Vitest 674/674, RLS 18/18, production
  build, C1 rehearsal passing, node:test 13/13).
- The full-site test pass is clean except F-01 (404 empty DOM,
  no-JS/crawler only, Medium-Low) and the browser-unverified items
  listed in `docs/MUSE_TEST_RESULTS.md`.
- The remaining code items are small and documented, not launch
  blockers: no automatic mail-outbox retry worker (manual admin retry
  is fine for the pilot), F-01.

### Owner-side blockers (only the owner can clear these)

| Blocker | Why it blocks | What the owner must do |
|---|---|---|
| **SMTP provider + sending domain not chosen** | No transactional email is delivered at all. All mail is skipped or queued in the outbox for manual admin retry. Password recovery, order notifications, and refund emails do not reach customers. | Pick Brevo (free 300/day) or Resend (free 3,000/mo, 100/day cap) — comparison was presented 2026-11-21 — plus the sending domain for SPF/DKIM/DMARC and `MAIL_FROM`. Credentials only via secure vault, never pasted in chat. Then verify a real send end-to-end. |
| **Hosted migration state unverified** | Migrations 1–71 apply cleanly on disposable Postgres, but the state of the hosted Supabase project (which migrations are actually applied there) is unknown. Deploying the app before migration 67 is applied breaks demo containment (the app reads `app_settings`). | Confirm hosted migration state; apply 28–71 in order on staging first, then production, following the deployment order: migration 67 BEFORE the app code that reads `app_settings`. |
| **No staging / backup drill** | No verified staging environment, no backup/PITR drill, no CI re-verification after the PR #1 merge. | Set up staging + run the backup restore drill (owner access required). |
| **Monitoring not live** | Sentry DSN unset, UptimeRobot monitors not created (approved 2026-11-20, never wired). | Supply the Sentry DSN (env only) and confirm UptimeRobot access; Muse wires them and verifies an alert fires. |
| **Legal pages still draft** | Six legal pages carry draft notices; no entity/contact details, no owner/lawyer approval. | Owner/lawyer review and approval; supply the real company details. Do not invent them. |
| **Isolated demo environment not set up** | Demo data and demo accounts still live in the production Supabase project; demo scripts now refuse without `GIFTO_ENVIRONMENT=demo` (Batch 4 behaviour change). | Follow `docs/DEMO_SEPARATION_CHECKLIST.md` (separate Supabase + Vercel demo projects, retire production demo data). Needs the owner's account access + go-ahead. |
| **R-04 coverage fail-open undecided** | Deliberate documented policy: when the delivery-coverage check cannot run, checkout proceeds. Flipping it to fail-closed changes who can order during an outage. | Owner decision + vendor/customer comms. Never flip silently. |
| **CAPTCHA on signup undecided** | No bot protection on signup; rate-limit bypass via direct Supabase Auth has no clean code-side guard. | Owner decision: enable Supabase Auth dashboard limits + CAPTCHA, or accept the risk for the pilot. |
| **Supabase Auth dashboard settings unverified** | Rate limits, email templates, and redirect URLs in the hosted Auth settings have not been checked. | Owner verifies in the dashboard (Muse cannot change hosted settings). |
| **C1 execution against production** | The C1 financial correction is prepared and rehearsed (ALL CHECKS PASSED) but must never run against production without the owner's explicit go-ahead. | Owner gives the go-ahead when the hosted state is known; C1 itself is not run by Muse unprompted. |
| **SEO indexing flag not flipped** | Correct for now (site is not public-ready). | Flip only when going public, after hosted verification. |
| **GitHub PATs pasted in chat (2026-11-20)** | Two tokens were pasted in chat; both failed git push with 403 despite API write access. They must be revoked/rotated. | Revoke/rotate both tokens; use the secure vault next time. |

### Code items remaining (engineer work, not launch blockers)

| Item | Status |
|---|---|
| F-01: 404 pages serve an empty DOM (no-JS/crawler only) | Recorded with root cause; no small safe fix (see `MUSE_TEST_RESULTS.md`). Browser renders correctly via hydration. |
| F-04: refund window at resolve | Deliberate non-change; needs an owner policy decision first (window governs opening, not admin processing time). |
| No automatic mail-outbox retry worker | Pilot: manual admin retry is fine. Public launch: add a cron/worker within the 5-attempt / 2-requeue caps. |
| Browser-unverified UI items (finance tab pending state, ConfirmSubmit, support preview, CSV download behaviour, filter pills, wishlist sync, banner visual rendering) | Need a real browser pass (Playwright blocked — Chromium download approval outstanding). |
| Polish / post-pilot items (from the re-audit) | Unescaped LIKE in admin logistics search; i18n key guard not wired into CI; vendor/admin dashboards English-only; no live tracking integration; review stars only on product pages; no similarity threshold / Arabic fuzzy proof for search; BreadcrumbList only on shop/product pages; settlement reconciliation is UI arithmetic only (no COD cash ledger); return-courier payer is a recorded label, not a financial charge; preferred delivery date is a preference with no fulfilment enforcement. None block the pilot. |

### Deliberately left alone (not blockers)

- **S-11** recovery code in plain email text: same secret and channel
  as the URL fragment, mitigated by `enqueue: false` so it is never
  persisted in the outbox. Revisit only for a redesign.
- **S-07** recovery fragment survival: unproven in a browser; verify a
  real recovery link end-to-end in a browser (both locales) once SMTP
  is live.
- **Rollbacks 59/61–65**: rolling back reintroduces the gaps those
  migrations closed, by design. Never apply a rollback outside the
  disposable test DB.
- **No commission percentage decided**: commission is per-vendor,
  admin-set, on product subtotal only, earned on delivery. The schema
  default of 10% is a column default, NOT a commercial offer. Never
  print a percentage to vendors.
- **No delivery fee amount, launch date, or order-volume guarantee**:
  D-06 (free delivery through launch, flat fee per shop later, review
  after 100 orders) and D-07 (no subscription at launch) stand.

---

## Gifto — Next Actions (final pass)

Branch `muse/gifto-autonomous-improvement`, HEAD `c5c2bdf`
(2026-11-23). Verdict: NO-GO public, CONDITIONAL GO closed pilot.

### 1. (OWNER — the single most important next action) Choose the SMTP provider and sending domain, then verify a real send

Nothing else unblocks the pilot's communications: password recovery,
order notifications, and refund emails currently never reach a
customer — they are skipped or queued in the outbox for manual admin
retry. Pick Brevo (free 300/day) or Resend (free 3,000/mo, 100/day
cap) from the comparison presented 2026-11-21, plus the sending
domain for SPF/DKIM/DMARC and `MAIL_FROM`. Credentials only via the
secure vault, never pasted in chat. Then Muse verifies a real send
end-to-end (and the S-07 recovery-fragment check in a browser, both
locales). Until this is done, the pilot runs with manual admin mail
retry.

### 2. (OWNER) Confirm the hosted Supabase migration state and apply migrations 28–71 (staging first)

The app code on this branch requires migration 67 before deployment
(demo containment reads `app_settings`). Apply in order on staging,
verify, then production. Do not deploy the app before migration 67
is applied.

### 3. (OWNER) Decide the R-04 coverage fail-open policy

When the delivery-coverage check cannot run, checkout currently
proceeds (documented fail-open). Flipping to fail-closed changes who
can order during an outage — it needs the owner's decision plus
vendor/customer comms. Never flip silently.

### 4. (OWNER) Approve the Playwright Chromium download (or run the browser pass another way)

The full-site pass is complete over HTTP, but seven UI items remain
browser-unverified (finance tab pending state, ConfirmSubmit flows,
support preview, CSV download behaviour, filter-pill pending state,
wishlist client sync, banner visual rendering). The Chromium download
failed and its approval timed out; do not retry without the owner's
go-ahead. Once approved, run the browser pass against the local build
and close or log each item.

### 5. (OWNER) Set up the isolated demo environment

Follow `docs/DEMO_SEPARATION_CHECKLIST.md`: separate Supabase +
Vercel demo projects, retire production demo data. Demo scripts now
refuse without `GIFTO_ENVIRONMENT=demo`. Needs the owner's account
access + go-ahead. Until then, the production-project opt-in is how
demo seeding continues deliberately.

### 6. (OWNER) Wire monitoring (Sentry DSN + UptimeRobot)

Approved 2026-11-20, never wired. Supply the Sentry DSN (env only)
and confirm UptimeRobot access; Muse wires them and verifies an
alert fires.

### 7. (OWNER) Legal approval + real company details

The six legal pages are still draft. Owner/lawyer review and
approval; supply the real company details. Do not invent them.

### 8. (OWNER) Decide: CAPTCHA on signup + Supabase Auth dashboard limits

Rate-limit bypass via direct Supabase Auth has no clean code-side
guard. Owner decides whether to enable dashboard limits + CAPTCHA
or accept the risk for the pilot, and verifies the hosted Auth
settings (rate limits, email templates, redirect URLs).

### 9. (OWNER) Give the go-ahead for C1 execution against production (when ready)

C1 is prepared and rehearsed (ALL CHECKS PASSED) but must never run
against production without explicit go-ahead, and only once the
hosted migration state is known (action 2).

### 10. (OWNER) Revoke/rotate the two GitHub PATs pasted in chat (2026-11-20)

Both failed git push with 403. Use the secure vault next time.

### 11. (ENGINEER, after action 4) Close out the browser-unverified items

Run the browser pass, verify each of the seven items (action 4), and
fix anything it finds on this branch with tests and gates.

### 12. (ENGINEER, after action 1) Add the automatic mail-outbox retry worker

Pilot runs fine on manual admin retry. For public launch, add a
cron/worker that retries pending rows within the existing 5-attempt /
2-requeue caps.

### 13. (ENGINEER, post-pilot polish) The polish batch

Unescaped LIKE in admin logistics search; i18n key guard wired into
CI; vendor/admin dashboards English-only; live tracking integration;
review stars on product listings; search similarity threshold /
Arabic fuzzy proof; BreadcrumbList beyond shop/product pages;
settlement reconciliation beyond UI arithmetic (COD cash ledger);
return-courier payer as a financial charge; delivery-date fulfilment
enforcement. None block the pilot.

### 14. (OWNER, when going public) Flip the SEO indexing flag

Only after hosted verification, never before.

### 15. (OWNER, if wanted) Decide the refund-window-at-resolve policy (F-04)

The 7-day window is enforced when a case opens, not when it
resolves — deliberately, because the window governs the customer's
right to open a case, not the admin's processing time. If the owner
wants it enforced at resolve too, say so explicitly; it will be a
deliberate change with comms, not a silent flip.
