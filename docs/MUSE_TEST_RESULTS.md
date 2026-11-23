# Gifto — Full-Site Test Results (final pass)

Branch `muse/gifto-autonomous-improvement`, HEAD `c5c2bdf`
(43 commits above base `b369412`). Written 2026-11-23, after the final
full-site test pass on the local production build. Nothing was pushed,
merged, deployed, or written to any hosted system.

## How the pass ran

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

## Issues found in this pass

### F-01 — 404 pages serve an empty DOM (REMAINING, Medium-Low)

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

### F-02 — `/admin/support` showed a visible load error (FIXED, `50dc6da`)

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

### F-03 — `notifyOrderPlaced` threw and failed checkout (FIXED, `17d440b`, live-verified)

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

### F-04 — Refund window checked at open, not at resolve (RECORDED, NOT changed — owner decision)

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

### N-02 final fallthrough — cancelled-suborder approval was silent (FIXED, migration 71, `c5c2bdf`)

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

### Test-environment artifact — RLS 10/18 failures were NOT a code regression

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

## Crawl results (corrected route list, 2026-11-23)

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

## Live verifications in this pass

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

## Carried-over browser-unverified items — final status

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

## Final gates at HEAD `c5c2bdf` (2026-11-23)

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

## Stack wipe and rebuild (test-harness note)

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

## Remaining (not fixed in this pass)

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
