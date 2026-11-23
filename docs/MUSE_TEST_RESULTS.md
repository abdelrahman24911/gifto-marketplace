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

### F-01 — 404 pages serve an empty DOM (INVESTIGATED - no safe fix, Medium-Low)

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
- **Fix attempted? Yes — Phase 2 investigation (2026-11-23), no safe
  fix found.** Three small changes were built and measured in an
  isolated worktree (production build, `next start`, same 404 URLs);
  none was kept:
  1. **Remove `force-dynamic` from the root layout.** The production
     build still passed (all pages, 53/53), but `/definitely-not-a-route`
     still returned 404 with **40 visible characters** — the empty DOM
     is not caused by `force-dynamic`.
  2. **`export const dynamic = "force-static"` on the root
     `not-found.tsx`.** Build passed; the 404 DOM was unchanged (40
     visible characters). A child segment cannot force a static 404
     under a dynamic root layout.
  3. **Next 16's experimental `globalNotFound` flag plus a
     `global-not-found.tsx`.** Build passed, but the failing unprefixed
     route was unchanged (40 visible characters). The flag also only
     applies to unmatched routes, not to `notFound()` from an existing
     route (e.g. `/shops/no-such-shop`), and it would duplicate the
     root `<html>`, fonts, providers and banner — not small or safe.
  `/ar/definitely-not-a-route` was measured alongside: it already
  renders 312 visible characters because the `[locale]` segment matches
  and the not-found UI is flushed inside that layout, confirming the
  problem is specific to the dynamic root-only 404 path.
- **Why it remains unresolved:** the root layout is async and dynamic
  (awaits `getLocale()`, `headers()`, `getMessages()`), so Next streams
  the shell first and the root 404 UI arrives in a later flight chunk.
  Next has no supported knob to force not-found content into the first
  flush for a dynamic root layout. Per the mission rule (fix only if
  small and safe, otherwise record), no application code was changed;
  browser users and JS-executing crawlers render the 404 correctly.
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
| Environment banner (demo/staging, never production) | VERIFIED in a real browser (see local browser pass below) |
| Mail blocked in demo environment, end-to-end | VERIFIED (see above) |
| Finance tab pending state | VERIFIED in a real browser (see below) |
| ConfirmSubmit flows | VERIFIED in a real browser (see below) |
| Support preview / reply flows | Reply VERIFIED via action; preview VERIFIED in a real browser (see below) |
| CSV downloads | Content + headers VERIFIED via HTTP GET; download behaviour VERIFIED in a real browser (see below) |
| Magic-byte image rejection in a real upload | VERIFIED via the real `uploadProductImages` action |
| Filter-pill pending state | VERIFIED in a real browser (see below) |
| Wishlist sync | VERIFIED after fixing a real bug (see below) |

## Local browser pass on Windows (2026-11-23)

The Chromium download that blocked the original pass was already
available on this machine (Playwright `chromium-1254`), so the seven
browser-only items were executed against the local stack (Supabase
migrations 1–71 + seed, production build, admin E2E lane on port 3100).
Command:

`npx playwright test --config playwright.admin.config.ts e2e/admin/mission-browser-pass.spec.ts e2e/admin/environment-banner.spec.ts`

**8/8 PASS** (1 worker). New coverage:

| Item | Browser evidence |
|---|---|
| Finance tab pending state | Clicking **Settlements** sets `aria-busy`, shows the spinner and `opacity-60` while the RSC request is held; releases into **Settlement history** |
| ConfirmSubmit | Shop status: **Apply** only previews "Change E2E Mobile Shop from Active to Suspended?", **Cancel** leaves the DB `active`, **Confirm** persists and reports `Status set to “suspended”.`, then restored to active |
| Support preview | **Review request** shows the exact topic/subject/body, **Edit request** returns filled fields, **Send** reports success and persists an `open` `support_requests` row with the same body |
| CSV downloads | Real download events for `/admin/products/export` (`gifto-products.csv`, contains the E2E rose), `/admin/commissions/export` (`gifto-commissions.csv`), `/vendor/finance/export` (`gifto-finance-ledger-all.csv`); headers verified |
| Filter-pill pending state | Admin product **Active** filter shows `aria-busy`, spinner and `opacity-60` while held, then lands on `status=active` with `aria-current="page"` |
| Wishlist sync | Save as a customer → DB row → **clear localStorage and reload** → button restored from the account copy → remove on `/wishlist` empties both UI and DB |
| Environment banner | Separate `next start` instances: demo (amber, `data-environment="demo"`), staging (sky), production and development render no banner; screenshots saved under `test-results/browser-pass/` |

**Bug found and fixed during this pass:** `listWishlistItems` embedded
`vendor:vendors(...)` on the base `vendors` table. Migration 20 removed
the authenticated read policy for that table, so the embed came back
`null` for every signed-in customer and the restore path silently
dropped all saved items — the wishlist only survived through
localStorage. The action now reads product `vendor_id` and resolves
names from `public_vendors`; the browser test above proves cross-device
restore by clearing localStorage before reloading.

Changed for this pass: `src/app/[locale]/(storefront)/wishlist/actions.ts`
(fix), `e2e/admin/fixture-admin.ts` + `global-setup.ts` (E2E customer),
`e2e/admin/mission-browser-pass.spec.ts` and
`e2e/admin/environment-banner.spec.ts` (new coverage).

Harness note: `e2e/admin/dashboard-mobile.spec.ts` signs in for every
test (13 admin + 10 vendor tests). It cannot pass as a whole within the
15-minute window: the login quota (10 per account / 20 per IP) rejects
the 11th admin sign-in with "Too many sign-in attempts". 18/23 passed
when run alone after clearing quota; the five failures are all that
quota alert at login, not page or layout failures. The mission specs
above use five sign-ins total and stay inside the quota. A storage-state
reuse refactor of the older spec is the real fix for full-lane runs.

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
- **Browser-unverified items** — none on this machine: all seven were
  executed in Chromium; see the local browser pass above. (The original
  Muse environment could not download Chromium; this run used the
  already-installed browser.)
- **Wishlist restore fix** — included locally with the browser pass;
  re-run the gates below before shipping this change.
- **Full admin E2E lane** — `dashboard-mobile.spec.ts` hits the local
  login quota because it signs in per test; targeted runs pass. Reuse a
  saved storage state before using the whole lane as a release gate.
- **Owner-side items** — see `docs/MUSE_PRODUCTION_BLOCKERS.md`.

## Post-pilot polish pass at HEAD `2c6c019` (2026-11-23)

Commits in this pass: `8134be2` (browser pass), `65ecefc` (mail
outbox cron worker), `1c5d971` (F-01 investigation record), `1cd8e8a`
(BreadcrumbList), `2c6c019` (review stars on listings).

### Item results

| Item | Result | Evidence |
|---|---|---|
| Automatic mail-outbox retry worker | **DONE** | `65ecefc`; cron route + tests, `vercel.json`, `CRON_SECRET` docs |
| i18n key guard wired into CI | **ALREADY DONE** | `.github/workflows/ci.yml` line 41 runs `npm run check:i18n` (R-06) |
| Review stars on product listings | **DONE** | `2c6c019`; bulk approved-review query in `src/lib/catalog.ts`, stars in `ProductCard`, all six listing surfaces, 3 new tests |
| BreadcrumbList beyond shop/product | **DONE** | `1cd8e8a`; category and occasion pages emit locale-prefixed BreadcrumbList JSON-LD with the CSP nonce |
| F-01 404 empty DOM | **INVESTIGATED, NO SAFE FIX** | `1c5d971`; three approaches rejected (see below) |
| Unescaped LIKE in admin logistics search | **BLOCKED** | Concurrent agent has uncommitted WIP in `src/app/admin/logistics/page.tsx`; not touched |
| Vendor/admin dashboards English-only | **NOT CHANGED** | Intentional pilot limitation (`vendorAdminEnglishOnly` copy); localisation is a larger batch |
| Live tracking integration | **NOT STARTED** | Needs a carrier API and owner credentials; no safe local change |
| Search similarity threshold / Arabic fuzzy proof | **NOT STARTED** | Needs a live/local Postgres with `pg_trgm`; local Supabase is down (503) |
| Settlement reconciliation / return-courier charge / delivery-date enforcement | **NOT STARTED** | Financial/fulfilment behaviour changes; owner decisions and migration work |

### F-01 investigation outcome

The empty-DOM 404 is specific to dynamic root-only paths. All three
attempts left the unprefixed 404 at 40 visible characters:
removing root `force-dynamic`, `force-static` on root `not-found.tsx`,
and Next 16 `experimental.globalNotFound` + `global-not-found.tsx`.
`/ar/definitely-not-a-route` already rendered 312 visible characters
without the flag, so the flag had no effect. No application code was
changed; the findings are recorded in the F-01 section above.

### Gates at `2c6c019`

Run in a clean detached worktree (`node_modules` junctioned, `.env.local`
copied), so concurrent agent WIP in the main checkout could not affect
the result.

| Gate | Command | Result |
|---|---|---|
| i18n keys | `npm run check:i18n` | PASS (788 translator calls) |
| Lint | `npm run lint` | PASS |
| Typecheck | `npm run typecheck` | PASS |
| Vitest | `npm test` | **686/686 (76 files)** (+3 catalog tests) |
| Production build | `npm run build` | PASS (webpack, 53/53 static pages; Tailwind verification OK) |

Not re-run this pass: RLS suites, C1 rehearsal, Playwright. Local
Supabase is down (`/rest/v1/` 503) and Chromium is unavailable, and
these commits add no migrations or schema changes; the prior 18/18 RLS
and ALL CHECKS PASSED C1 results still apply to the unchanged database
chain. Consequence: the new BreadcrumbList JSON-LD and listing stars
are build/unit verified only, not runtime-verified against a database.

### Review stars implementation notes

- `CatalogProduct.reviewSummary` is optional; listings attach it with
  one bulk `product_reviews` query (`.in(product_id).eq(status=approved)`).
- A failed review read returns the products unchanged, so stars never
  take down a listing.
- `ProductCard` renders stars only when `count > 0`, using existing
  `product.reviewsAverage` / `product.reviewCount` keys; no new i18n.
- Catalogue reads are cached for 60 seconds, so new approvals can take
  up to a minute to appear on listing cards.

### Remaining after this pass

- Item 3a (logistics LIKE escaping): apply once the concurrent agent's
  edits to `src/app/admin/logistics/page.tsx` are settled. Correct
  helper shape: backslash-escape `\`, `%`, `_` and strip `*` (PostgREST
  maps `*` to `%` unconditionally, so `*` cannot be escaped).
- Browser/runtime verification of review stars and BreadcrumbList once
  a database is reachable.
- Owner-side items in `docs/MUSE_PRODUCTION_BLOCKERS.md` are unchanged.
