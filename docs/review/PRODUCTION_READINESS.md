# Gifto — Production Readiness Review

Review date: 2026-11-09. Read-only: nothing outside `docs/review/` was modified. Companion: [ARCHITECTURE.md](./ARCHITECTURE.md).

**Status legend:** **Blocker** (do not onboard real users/money until fixed) · **Needs work** (fix before public launch; acceptable in a supervised beta only if noted) · **Ready**.
**Evidence legend:** `file:line` = code, `NN:line` = `supabase/migrations/000…NN_*.sql`. *(assumption)* = not provable from the repo, with how to verify. *(helper-verified)* = extracted by a read-only helper agent and spot-checked by me where stated.

**Not executed in this review:** the 9 SQL/RLS suites (they need Docker + a ~1 GB image that is not cached here), any load test, any run against the hosted Supabase project, `supabase migration list --linked`. So "tests pass" claims below are limited to `npm run lint`, `typecheck`, `npm test` (129 unit tests) from the previous session, and the stub-based production build checks.

---

## 0. Scorecard

| Area | Status | One-line reason |
|---|---|---|
| A. Security | **Blocker** | Hosted DB likely still lets any signed-in user read every active shop's commission rate and contact details; no self-service password reset |
| B. Money & orders | **Needs work** | Core money model and stock locking are strong; no refunds, no payments, vendor-controlled delivery/cancel lets a shop avoid commission |
| C. Data model & integrity | **Needs work** | Constraints are good; backups/restore unverified, Arabic names unsupported by slug logic |
| D. Application quality | **Needs work** | Clean TypeScript; no server-action/E2E tests, silent-failure patterns, every page dynamic |
| E. Reliability & operations | **Blocker** | No CI, no staging, no error tracking, no alerts |
| F. Product completeness | **Needs work** | Marketplace core exists; gift-specific features and customer notifications absent |
| G. Compliance & trust | **Blocker** | No terms, privacy, or returns pages anywhere |
| H. UX / a11y / L10n | **Blocker** (for Cairo/Alex beta) | English-only, LTR-only, Latin-only slugs |
| I. Future-proofing | **Needs work** | No data-access layer; strong Postgres-side logic is portable, RLS/Auth are not |

Blockers: 9. Needs work: 20+. Ready: money representation, order state machine, last-unit stock safety, guest-order token design, SECURITY DEFINER hygiene, secrets handling, XSS surface.

---

## 1. Your nine questions

### Q1. Drift: untracked / unapplied files and what breaks — **Blocker**

**Git state.** `main` = `origin/main` = `d64dae5` (no unpushed commits). Working tree: **33 tracked files modified** (+920/−353) and **50 untracked files**. Hosted DB state: README says migrations **1–19** verified (`README.md`, "Database / Migrations"); **20–24 are untracked and not recorded as applied** *(assumption — verify with `supabase migration list --linked` or `select version from supabase_migrations.schema_migrations`)*. Production presumably runs `d64dae5` *(assumption — check the Vercel deployment's commit)*.

**Untracked (50):**
| Group | Files |
|---|---|
| SQL (11) | migrations 20, 21, 22, 23, 24; rollbacks 20–24; `supabase/tests/rls_vendor_dashboard_test.sql` |
| Vendor/Admin UI (14) | `app/vendor/analytics/*` (2), `app/vendor/settings/*` (5), `app/vendor/support/*` (4), `app/admin/support/*` (3) |
| Components (3) | `pagination.tsx`, `shop-cover.tsx`, `shop-logo.tsx` |
| Lib (16) | `vendor-analytics`, `vendor-settings`, `support-requests`, `support-content`, `catalog-cache`, `fetch-all`, `images`, `pagination`, `supabase/public` (+ their tests, `auth.test.ts`) |
| Other (6) | 5 docs under `docs/`, `scripts/backfill-vendor-media.mjs` |

**Modified tracked files:** `catalog.ts`, `auth.ts`, `vendor.ts`, `proxy.ts`, `database.types.ts`, shop/product pages, vendor/admin pages and actions, `site-header.tsx`, `next.config.ts`, image components, etc. Some of this is my earlier performance work in this same working tree (auth via `getClaims`, pagination, catalog cache, image optimizer, header Suspense) — **none of it has been exercised against a real Supabase project**.

**What each migration unlocks:**
| Migration | Adds | Code that needs it |
|---|---|---|
| 20 | drops policy `vendors: public read active` (`20:20`); `cover_path`, `address_line`, `working_hours`, `prep_time_*`; extends `public_vendors` view | `catalog.ts` (selects `cover_path`), shop cover/logo, vendor settings page |
| 21 | `vendor-media` bucket + policies | branding upload, `ShopLogo`/`ShopCover` |
| 22 | `vendors.is_accepting_orders`; **replaces `_create_order`** with a pause check; view adds `is_accepting_orders` | product page, `catalog.ts`, pause toggle, `lib/guest-order.ts` message |
| 23 | `support_requests` + rate-limit trigger | vendor/admin Support pages |
| 24 | covering index `order_vendors_vendor_created_idx` | analytics (performance only) |

**Scenario A — deploy the working-tree code to the hosted DB at 1–19 (migrations unapplied):**
- `catalog.ts` selects `cover_path, is_accepting_orders` from `public_vendors`; the hosted view lacks them → query error (`catalog.ts` `loadShops`/`loadShop`).
- `/shops` shows its error state; the home page's shop rail silently empties (`getShops` returns `[]`); `/shops/[slug]` errors.
- **Product pages 404:** `shops/[slug]/[productSlug]/page.tsx:20-25` selects `is_accepting_orders` from `public_vendors`; the failure yields `shop = null` → `notFound()`. `AddToCartButton` is rendered **only** on this page (`:131`), so customers cannot add anything to the cart. **Checkout itself is untouched** (no checkout code reads migration 20–24 objects; `place_order*` stays at migration 11's version and simply won't enforce the pause) — but the path leading to it is broken.
- Vendor Settings/Support and Admin Support pages error (missing columns/table); logo/cover uploads fail (no bucket); analytics works but without its index.
- **Verdict: Blocker if code is deployed before 20–24.**

**Scenario B — apply 20–24 while the committed code (`d64dae5`) is live:**
- Customers' `/account/orders` and `/account/orders/[id]` embed `vendor:vendors(name, slug)` (`account/orders/page.tsx:19`, `account/orders/[id]/page.tsx:40`). After migration 20 customers can no longer read `vendors` rows (this is the intended privacy fix), so the embed is `null`: pages degrade to a generic "Shop" label and lose shop/product links (`[id]/page.tsx:121-129`). **Needs work** — fix by reading shop name through `public_vendors` or storing a vendor-name snapshot on `order_vendors`.
- HEAD code reads only the old six `public_vendors` columns; the view change is append-only, so storefront keeps working.
- Migration 22 replaces the checkout function; HEAD's error mapper would show a generic message for "not accepting orders" (cosmetic).

**Recommended order:** (1) commit everything; (2) apply 20–24 to **staging**, run all 9 suites; (3) back up production; (4) apply 20–24 to production; (5) deploy code; (6) fix Scenario B embeds in the same release.

### Q2. RLS policies and test matrix — **Blocker (until migration 20 is applied) / Needs work (tests)**

All **16 of 16** tables have `enable row level security` (verified: 16 `create table` vs 16 `enable row level security` in `supabase/migrations`). No policy uses `using (true)` *(helper-verified)*. Writes to money tables are impossible for clients: `orders`, `order_items`, `inventory_movements`, `commission_entries`, `settlements`, `settlement_lines` grant `SELECT` only to `authenticated` (`12:13-27`, `16:247-259`); `order_vendors` allows `UPDATE (status, updated_at)` only.

**Policies in force after migrations 1–24** *(helper-extracted, final-state; key ones spot-checked)*:
| Table | Policies (name → who) |
|---|---|
| `profiles` | read own / admin; update own; admin update others (`1:314-329`); admin-flag guard triggers (`1:101`, `8:27`) |
| `vendors` | admin read/insert/update/delete; members read own (`1:338-357`); owner update own **active** (`15:81`); **`public read active` (`1:334`) — dropped only by `20:20`** |
| `vendor_members` | read own roster; owner (active) insert/update/delete; admin (`15:87-113`); last-owner guard (`8:56`) |
| `vendor_status_history` | admin read; vendor members read (`1:415-421`); written by trigger only |
| `categories` | public read active; admin write (`4:172-188`) |
| `products` | public read active+active vendor; admin read; members read own; manager insert/update; owner delete (`4:190-212`, `15:119`) — UPDATE limited to `(name, description, price_minor, category_id, status, updated_at)` (`15:141-142`) |
| `product_images` | public read of public products; manager write; owner delete (`4:219-256`, `15:127`) |
| `orders` | customer own; admin; shop member via `is_order_shop_member` (`5:555-583`, `15:61`) |
| `order_vendors` | customer own; active member; admin; manager/admin update status (`5:563-588`, `15:150`) |
| `order_items` | customer own; active member; admin (`5:590-609`, `15:155`) |
| `inventory_movements` | active member; admin (`15:168`, `5:618`) |
| `commission_entries`, `settlements`, `settlement_lines` | active member read; admin read (`15:179-198`, `6:329-350`) |
| `checkout_rate_limits` | none; service role only (`11:98-99`) |
| `support_requests` | active member read/insert (`created_by = auth.uid()`); admin read/update status (`23:85-108`) |

**Test matrix** (R=select, I=insert, U=update, D=delete; `—` none). "Guest" = no JWT; at the database a guest is `anon`, and guests only act through service-role RPCs called by the server.

| Table | Anonymous | Customer (own rows) | Guest | Vendor owner | Vendor staff | Other vendor | Admin |
|---|---|---|---|---|---|---|---|
| profiles | — | R U own | — | R U own | R U own | — | R U all |
| vendors | — (view only) | **R active\*** | — | R, U (active) | R | **R active\*** | R I U D |
| vendor_members | — | own roster | — | R I U D | R | — | R I U D |
| vendor_status_history | — | — | — | R | R | — | R |
| categories | R active | R active | R active | R active | R active | R active | R I U D |
| products | R active | R active | R active | R I U D (own) | R own | R active only | R I U D |
| product_images | R public | R public | R public | R I U D own | R own | R public only | R I U D |
| orders | — | R own | — (RPC) | R shop's orders | R shop's orders | — | R |
| order_vendors | — | R own | — | R, U status | R | — | R, U status |
| order_items | — | R own | — | R | R | — | R |
| inventory_movements | — | — | — | R | R | — | R |
| commission_entries / settlements / settlement_lines | — | — | — | R | R | — | R (writes via RPC) |
| checkout_rate_limits | — | — | — | — | — | — | — |
| support_requests | — | — | — | R I | R I | — | R U(status) |

\* **Pre-migration-20 (hosted today):** any authenticated user — a customer or another vendor — can `select *` from `vendors` where `status='active'`, which includes `commission_rate`, `contact_email`, `contact_phone`, `delivery_coverage` (policy `1:334-336` + authenticated DML grant `1:431-439`). Anonymous cannot (`3:32-35` revokes it). Migration 20's own header states this is the fix (`20:10-20`). A manager equals an owner for products/orders but not for vendor profile or roster.

**Gaps not covered by the 9 SQL suites** *(helper-extracted; I confirmed there is no concurrent-session test: 0 hits for `pg_sleep|dblink|concurrent|race`)*:
1. Concurrency: none (see Q5).
2. Anonymous access to *every* table is not asserted (tests focus on RPC privileges).
3. Cross-vendor UPDATE/DELETE on `products`, `product_images`, `order_vendors`, `vendor_members`, `support_requests`.
4. Vendor **staff** write attempts on products/images/order status/support.
5. Admin write paths on admin-only tables, and customer reading another customer's `order_items`.
6. Storage: cross-vendor upload/delete for both buckets; vendor-media cross-vendor UPDATE.
7. `inventory_movements` with admin and other-vendor actors; `checkout_rate_limits` as a role matrix.
8. Add a test that a signed-in non-member **cannot** `select commission_rate, contact_email from vendors` (the SEC-1 regression test).

**How to test manually (two vendor accounts + one customer):** sign in as each, call PostgREST `GET /rest/v1/vendors?select=commission_rate,contact_email`, `GET /rest/v1/orders`, `PATCH /rest/v1/products?id=eq.<other vendor's id>` and expect empty/403.

### Q3. SECURITY DEFINER functions — **Ready (with two Needs-work items)**

*(helper-verified; I personally read `get_guest_order`, `consume_checkout_quota`, `_create_order`, `cancel_order`, `adjust_product_stock`.)* 47 `security definer` declarations resolve to **35 final functions**; **all pin `set search_path`** (`public`, or `public, extensions` for `_create_order`), and **none lacks `REVOKE … FROM PUBLIC`**. No dynamic SQL found.

| Function | Who can execute | Caller check | Verdict |
|---|---|---|---|
| `place_order`, `place_order_with_idempotency` | authenticated | uses `auth.uid()` only; user id is never a parameter (`11:440-451`) | Safe |
| `place_guest_order`, `get_guest_order`, `consume_checkout_quota`, `create_vendor_for_owner` | **service_role only** (`11:550-558, 623-627, 155-160`; `15:333-344`) | token/limit validation inside | Safe |
| `_create_order` (internal) | nobody (`22:320`) — accepts `p_user_id`, so it must stay unreachable | wrappers supply the id | Safe (fragile if grants change) |
| `cancel_order` | authenticated | `orders.user_id = auth.uid()` or admin; only status `placed` (`5:505-516`) | Safe |
| `adjust_product_stock` | authenticated | `is_vendor_manager(product's vendor)` or admin, row locked (`7:34-63`) | Safe |
| `create_settlement`, `mark_settlement_paid`, `void_settlement` | authenticated | `is_platform_admin()` (`18:201, 276, 326`) | Safe |
| `is_*` predicates | anon/authenticated | answer only about the caller (`auth.uid()`) | Safe |
| Trigger functions (restock, commission, parent sync, transition guard, admin-flag guards) | no direct execute | operate on `new` row | Safe |

**Cannot abuse to read/change another vendor's data:** every RPC resolves the target row's vendor/owner and checks it against `auth.uid()`; none takes a vendor or user id from the caller. Minor information leak: `adjust_product_stock` answers "Product not found" vs "Only shop owners…" so a signed-in user can test whether a product UUID exists (UUIDs are unguessable — Low).

**Needs work:**
- **DEF-1** `search_path = public` rather than `''`/`pg_catalog` first. Safe only if no role can `CREATE` in `public` *(assumption — verify `select has_schema_privilege('authenticated','public','CREATE')` is `false`)*. Hardening: `set search_path = ''` and fully qualify.
- **DEF-2** `enforce_support_request_rate_limit` is a count-then-insert; concurrent inserts can exceed 5 per 15 min (`23:61-72`). Low.
- **DEF-3 (business)** `place_order_with_idempotency` is callable **directly** with any user's JWT; the per-IP quota exists only in the Server Action (`checkout/actions.ts:144` vs `:166`). See SEC-5.

### Q4. Guest orders — **Ready (security) / Needs work (recovery)**

| Question | Answer | Evidence |
|---|---|---|
| Token generation | 32 random bytes from the browser's `crypto.getRandomValues` = 256 bits, created once per checkout form | `lib/guest-client.ts:15-46` |
| Hashing / storage | Server validates 64-hex, stores **only SHA-256**; raw token never stored or put in a URL | `lib/guest-order.ts:19-25`, `checkout/actions.ts:206-217`, `11:616-620` |
| Delivery to the guest | HttpOnly cookie `gifto_guest_<orderId>`, scoped to `/orders/<id>`, `SameSite=Lax`, `Secure` in production, **7 days** | `guest-order.ts:17,34`, `checkout/actions.ts` cookie block |
| Expiry | **Cookie only.** The database has no expiry/rotation: any holder of the token reads the order forever. Low risk (256-bit secret) | `get_guest_order` has no age check (`11:561-627`) |
| Guessable references | New references are `GFT-` + 48 random bits (`11:346`); order ids are random UUIDs; the reference is explicitly "not an access credential" (`11:82-83`). Access needs **order id + token**; every failure is `notFound()` (no oracle) | `orders/[id]/page.tsx:73-92` |
| Retry safety | Same idempotency key returns the same order and requires the same token hash (`22:~94-112`) | verified in `_create_order` |
| **Lost cookie** | **Nothing.** No lookup by reference, no email link (no email is sent), and `cancel_order` rejects guest orders because `user_id` is null — even for an admin (`5:505-511`). Only a phone call to the shop works | `cancel_order`, no routes |

Findings: **GST-1 Needs work** — no recovery path for guests (add "track order" by reference + phone/email OTP, and an emailed magic link). **GST-2 Needs work** — admins cannot cancel guest orders through the RPC. **GST-3 Low** — add a database-side expiry (e.g. 90 days) to `get_guest_order`.

### Q5. Two buyers, last unit — **Ready (by proof); Needs work (no automated test)**

Proof from the final checkout function `_create_order` (`22:40-320`):
1. Items are read with `select … from products where id = any(v_pids) order by p.id for update` (`22:182-187`) — row locks in a fixed order (no deadlock between carts).
2. Stock is checked **inside that lock**: `if v_product.stock < v_qty then raise exception` (`22:196`).
3. The decrement happens in the same transaction: `update products set stock = stock - v_ok_qtys[i]` (`22:307-308`), and `products.stock` has `check (stock >= 0)` as a backstop (`4:46-62`).
4. A second buyer's `FOR UPDATE` blocks until the first commits, then re-reads the updated row (PostgreSQL READ COMMITTED re-evaluates a locked row after waiting), sees stock 0, and gets "Only 0 of … are in stock".
5. The vendor lock (`22:~220-235`) is taken after product locks, in id order; a concurrent pause toggle waits. Idempotency uses an advisory lock keyed on the key (`22:94`).

So **both cannot buy the last unit**. Residual: no suite proves it — add a two-session test (`psql` ×2 with `pg_sleep`, or a pgbench script). Also a cancelled order restocks via trigger (`5:186-216`), so a hoarding bot can cycle stock (see SEC-5).

### Q6. Vendor publishing: price and stock after an order — **Ready (immutability) / Needs work (customer price surprise, commission)**

| Vendor action | Possible? | Effect on past orders | Evidence |
|---|---|---|---|
| Change price | Yes, anytime | **None** — `order_items` stores `product_name`, `unit_price_minor`, `line_total_minor` snapshots with a check `line_total = unit_price × qty` | `5:98-112`; no client UPDATE on `order_items` (`12:13-27`) |
| Change stock directly | **No** — `stock` is not in the UPDATE column grant; only `adjust_product_stock` (audited) | none | `15:141-142`, `7:21-98` |
| Delete product | Owner only | `order_items.product_id` → NULL, snapshot kept; **but `inventory_movements` cascade-deleted** (audit loss) | `15:119`, `5:101,122` |
| Archive/unpublish | Yes | open orders continue | `vendor/products/actions.ts:15,48` |
| Edit order totals, items, address, commission rate | **No** | — | no grants; `1:367-388` finance guard |
| Move suborder status | Yes (owner/manager): confirm, ship, **deliver, or cancel** | cancel restocks | `lib/orders.ts:60-70`, `5:138-178` |

Findings:
- **MON-4 Needs work — price shown ≠ price charged.** The cart stores `priceMinor` in the browser (`lib/cart.ts:19`) and the checkout page shows it (`checkout-form.tsx:260-283`); the database charges the **current** price (`22:239`) with no "price changed" confirmation. A vendor repricing (or a stale cart) silently changes what a COD customer owes at the door.
- **MON-3 Needs work (Blocker for public launch) — commission avoidance.** Commission is recorded only on `delivered` (`6:118-146`). The vendor holds the cash and controls both `delivered` and "cancel after shipped" (`lib/orders.ts:68-76`, label "Delivery failed – cancel and restock"). A shop can cancel a delivered order to avoid commission; there is **no actor/audit trail** for order status changes (0 matches for any order-history table) and no customer confirmation of delivery.

### Q7. Cost and scale — **Needs work**

**Today:** all 36 routes are dynamic (`app/layout.tsx:64` `force-dynamic`; header reads cookies). Public pages run 6–8 PostgREST queries per view on the committed code.

| Page | Cacheable? | How | Staleness risk |
|---|---|---|---|
| Home, `/categories`, `/shops`, `/shops/[slug]`, category lists | **Yes** | shared data cache (`unstable_cache`, 60 s, tag-invalidated) — **already in the working tree** (`lib/catalog-cache.ts`) | stock/price labels up to 60 s old |
| Same pages as full static/ISR HTML | Later | needs the header decoupled from cookies (the working tree's Suspense header makes `cacheComponents`/PPR feasible) | as above |
| Product detail | Cache data 30–60 s | tag per product | `place_order` still enforces stock |
| Search with text | No | unbounded keys | — |
| Cart, checkout, account, vendor, admin, guest order | **Never** | private | — |
| Product/shop images | Yes | CDN + Next optimizer (working tree) | URLs are immutable (UUID paths, `upsert:false`) |

**Flaw in my own working-tree change (flagging for correctness):** `checkout/actions.ts` and cancel actions call `revalidatePublicCatalog([catalog])` on every order. At peak (several orders/second) the cache would be wiped continuously and hit rate falls toward zero. Recommendation: stop invalidating on checkout/cancel (the 60 s TTL already bounds stock-label staleness and the database enforces stock), or invalidate only when stock reaches 0.

**Estimated checkout load (assumptions, not measured; hosted plan unknown):**
A guest checkout of a 3-line, 2-shop cart = 1 Auth/none + `consume_checkout_quota` (upsert + an unindexed `delete … where window_start < …`, `11:130-132`) + `place_guest_order` ≈ **17 SQL statements** (advisory lock, idempotency lookup, product `FOR UPDATE`, 2 vendor locks, 1 order, 2 suborders, 3 items, 3 stock updates, 3 movements) in one transaction, plus triggers.

| Peak orders/s | SQL statements/s | Comment |
|---|---|---|
| 1 | ~20 | trivial |
| 5 | ~100 | fine on any paid compute tier |
| 20 | ~400 + page traffic | needs measurement; a single hot product serialises (~15 ms lock hold ⇒ ~65 orders/s ceiling per SKU) |

Browsing dominates: 50 page views/s × 6–8 uncached queries ≈ 300–400 queries/s versus ≈ 100 with the cache — measure with k6 against staging before Eid/Ramadan/Valentine's/Mother's Day. Next.js functions do not open Postgres connections (everything is HTTP via PostgREST/Auth), so connection pooling is not the constraint; PostgREST/DB compute is. Add an index on `checkout_rate_limits(window_start)` (**DAT-4**, Low).

### Q8. Lock-in — **Needs work; difficulty: Hard to another BaaS, Moderate to plain Postgres**

Counts (non-test source): **35 files** call the database/RPC/storage directly — **33 in `app/` and `components/`** (pages, Server Actions) and only **2 in `lib/`** (`lib/auth.ts`, `lib/catalog.ts`). There is **no data-access layer** for vendor/admin/order code: 78 `.from("table")`, 71 `.select(` (heavily PostgREST embed syntax), 10 `.rpc(`, 5 storage calls, plus 5 files using Supabase Auth directly and 28 importing the generated `database.types.ts`. 4,047 lines of SQL hold pricing, stock, the order state machine, commission and ledger logic (≈22% of code) — this is **portable Postgres** and a strength.

Top 3 lock-in points:
1. **RLS + `auth.uid()` as the authorization layer** (35 definer functions and ~60 policies depend on Supabase's JWT/`auth` schema). Moving means re-implementing authz in an API.
2. **PostgREST query syntax everywhere** (embedded selects, `.range`, count headers) in 33 UI files.
3. **Supabase Auth + Storage** (`@supabase/ssr` cookies, admin invite API, `profiles.id → auth.users`, storage policies keyed on paths).

Mitigation if desired: introduce `lib/data/{orders,products,vendors,finance}.ts` and route all queries through it (incremental, no behaviour change).

### Q9. Cairo/Alexandria beta gaps

| Need | Status | Evidence / action |
|---|---|---|
| **Custom SMTP** | **Blocker** *(assumption on hosted)* | All email is Supabase Auth's built-in (invites, confirmation, recovery). Local config limits `email_sent = 2` per hour (`supabase/config.toml:200`) — the built-in service is rate-limited and not for production. Configure SMTP (e.g. a transactional provider) and verify SPF/DKIM/DMARC and the Arabic/English templates. Verify in Supabase → Auth → SMTP |
| **Order notifications** (customer, vendor, admin) | **Blocker** for a real beta | No code sends any order email/SMS/WhatsApp. Vendors learn of orders only by opening the dashboard. At minimum: new-order notification to vendor (WhatsApp/SMS/email) and order confirmation to customers who give an email/phone |
| **Self-service password reset** | **Blocker** | No `/forgot-password` route; `resetPasswordForEmail` exists only in an admin action (`admin/actions.ts:212`) |
| **Privacy policy, Terms, returns/refund policy, cookie notice** | **Blocker** | No such routes; footer has 6 links, none legal (`components/site-footer.tsx`); no consent at signup/checkout |
| **Arabic names** | **Blocker** | `slugify` keeps only `[a-z0-9]` in both TypeScript (`lib/slugify.ts`) and SQL (`1:25`). A product named only in Arabic raises "Product name must contain at least one letter or number" (`4:134-137`); admin `createVendor` rejects non-Latin shop names (`admin/actions.ts` "Shop names must contain Latin letters or numbers"). Fix: generate a slug fallback (transliteration or short id) |
| **RTL / Arabic UI** | Not started | `<html lang="en">` (`app/layout.tsx`), no `dir`, no i18n library, no Arabic font subset, 34 physical-direction classes (`ml-/mr-/pl-/pr-/left-/right-`) vs **0** logical (`ms-/me-/ps-/pe-`). Prices render as "EGP 175.00" only (`lib/money.ts:14`) |
| **Phone-first checkout** | Needs work | phone accepted as free text 5–30 chars (`22` validation); no Egyptian number format check or OTP |
| **Delivery area/slot** | Needs work | `delivery_coverage` jsonb exists on shops, but checkout does not validate the address against it; no delivery date/time window |
| **Error tracking & alerts** | **Blocker** | see E |

---

## 2. Area-by-area review

### A. Security
| ID | Finding | Status | Evidence → fix |
|---|---|---|---|
| SEC-1 | Signed-in users can read all active vendors' `commission_rate`, contact email/phone, `delivery_coverage` on the hosted DB | **Blocker** | `1:334-336`, `1:431-439`; fixed only by `20:20` (unapplied). Apply 20 after Q1 steps; add regression test |
| SEC-2 | No password reset for customers/vendors | **Blocker** | no route; `admin/actions.ts:212` only |
| SEC-3 | Auth emails depend on the default mail service | **Blocker** *(assumption)* | `config.toml:200`; configure SMTP |
| SEC-4 | No security headers beyond `/orders/*` (no CSP, `X-Frame-Options`/`frame-ancestors`, `nosniff`, `Permissions-Policy`, explicit HSTS) | Needs work | `next.config.ts`; verify live with `curl -I` (Vercel may add HSTS) |
| SEC-5 | COD order spam / **stock hoarding**: authenticated users can call the order RPC directly (no IP quota), guests rotate IPs (60/h per IP), cancel is free and restocks | Needs work | `11:498-503`, `checkout/actions.ts:144,166`, `5:186-216`. Add per-user/phone caps, max open orders, phone OTP, DB-side quota inside the RPC |
| SEC-6 | Login/signup run browser → Supabase Auth with no CAPTCHA; protection = Supabase defaults; password minimum 6 locally | Needs work *(assumption on hosted)* | `components/auth-form.tsx:50,61`, `config.toml:183`. Raise minimum, enable CAPTCHA/leaked-password protection, confirm email confirmations are on |
| SEC-7 | Upload type comes from client-declared `file.type`; no content sniffing; relies on bucket MIME list | Needs work (Low) | `vendor/settings/actions.ts:325,356`; bucket limits `21:14-22` |
| SEC-8 | Vendor **staff** (any role) can read customers' full delivery PII (phone, email, address) for their shop's orders | Needs work | `5:581-583`, `15:61-72`. Limit staff role or mask phone until `confirmed` |
| SEC-9 | Session cookies use `@supabase/ssr` defaults (JS-readable) | Needs work *(assumption)* | `lib/supabase/server.ts`; accepted trade-off of the library |
| SEC-10 | Input validation is hand-written per action (no schema library); DB constraints are the real backstop | Needs work | no zod; e.g. `admin/actions.ts:96-146`, `22:…` checks |
| SEC-11 | Service-role key: server-only module, not `NEXT_PUBLIC`, 4 call sites, none in client code | **Ready** | `lib/supabase/service.ts:1-18` |
| SEC-12 | No XSS sinks (`dangerouslySetInnerHTML`/`innerHTML`/`eval`: 0); open-redirect guard on `next`; Server Actions use Next's same-origin check | **Ready** | `auth/callback/route.ts:12-17`, `auth-form.tsx:36-39` |
| SEC-13 | Dependencies: `npm audit` = 0 production vulns; 8 moderate in the dev-only lint chain; Next 16.4.2 → 16.4.5 patch available | **Ready** / patch | `npm audit`, `npm outdated`. Upgrade patch releases before launch |
| SEC-14 | No secrets committed: `.env*` and `supabase/.temp` are ignored; only `.env.example` is tracked | **Ready** | `.gitignore:44-46`, `supabase/.gitignore:3`. *(Rotate service-role/DB keys if `supabase/.temp` or `.env.local` were ever shared.)* |
| SEC-15 | CORS: no API routes exist besides `/auth/callback`; Supabase CORS is project-level | **Ready** | — |

### B. Money and orders
| ID | Finding | Status | Evidence |
|---|---|---|---|
| MON-1 | Money is integer piastres with `currency = 'EGP'` check everywhere; no floats | **Ready** | `4:52-55`, `5:39-52,103-110`, `6:43-57` |
| MON-2 | Prices, subtotals, stock, commission snapshot computed in the DB; client sends only product ids + quantities | **Ready** | `22:182-239`, `checkout/actions.ts` doc comment |
| MON-3 | Vendor can avoid commission by cancelling a shipped order; no actor audit | Needs work → **Blocker at public launch** | Q6 |
| MON-4 | Customer sees browser-stored price, charged current price | Needs work | Q6 |
| MON-5 | Order state machine enforced by trigger; parent status derived | **Ready** | `5:138-178`, `13:18-114` |
| MON-6 | Ledger: commission entries are one-per-suborder and immutable-by-rule; settlements void append-only with release metadata; partial unique indexes prevent double allocation | **Ready** | `6:33-60`, `18:78-111` |
| MON-7 | `settlement_lines.amount_minor` is not DB-constrained to equal the entry's commission (helper-flagged) | Needs work (Low) | `6:96-107` |
| MON-8 | Payments/webhooks: **not applicable** (COD only, `payment_method = 'cod'` check). If online payment is added, signature verification, idempotent events and reconciliation must be built — none exists | Not started | `5:36` |
| MON-9 | Refunds/disputes: only cancel/return statuses; no refund record, reason, evidence or customer-facing flow | Needs work (Blocker before public launch) | schema, `lib/orders.ts` |
| MON-10 | Delivery fee column exists but is always `0` | Needs work (business decision) | `22:255,292` |
| MON-11 | Payouts: manual/external; platform admin builds batches and marks paid | Needs work | `admin/settlements/*` |
| MON-12 | Failed delivery = cancel + restock (no courier reattempt, no partial-return, no photo/proof) | Needs work | `13`, `lib/orders.ts` |

### C. Data model and integrity
| ID | Finding | Status | Evidence |
|---|---|---|---|
| DAT-1 | Backups / PITR / tested restore: not documented anywhere; hosted plan unknown | **Blocker** | prior audit docs; verify in dashboard, perform a restore drill |
| DAT-2 | FKs, uniques, checks, partial unique indexes cover the core model; indexes exist for main filters (`order_vendors(vendor_id,status)`, `orders(user_id,created_at)`, `products(vendor_id)`, etc.) | **Ready** | `4:68-76`, `5:58-92`, `24:10` |
| DAT-3 | Hard deletes: deleting a product cascades its `inventory_movements`; vendors with orders can't be deleted (restrict) but products can | Needs work | `5:122`; prefer archive-only |
| DAT-4 | `checkout_rate_limits` cleanup runs a `delete` on every checkout with no `window_start` index | Needs work (Low) | `11:130-132` |
| DAT-5 | Audit trail: vendor status history and settlement actors exist; **no order-status actor/history**, no admin action log | Needs work | MON-3 |
| DAT-6 | Migrations: 24 versioned files reproducible from scratch; rollbacks only for 14–18, 20–24; seed/demo flagged `is_demo` | Needs work | `supabase/rollbacks/` |

### D. Application quality
| ID | Finding | Status | Evidence |
|---|---|---|---|
| APP-1 | TypeScript `strict`; 0 `any`, 0 `@ts-ignore`; 3 `as unknown as` casts; generated types used in 28 files | **Ready** | scan of `src/` |
| APP-2 | Loading/error/not-found boundaries present for root, vendor, categories, shops, search | **Ready** | `app/*/loading.tsx`, `error.tsx` |
| APP-3 | Silent failures: `getNewArrivals`/`getProductsByBudget` return `[]` on error (empty rails look like an empty catalogue); `app/error.tsx` only `console.error` | Needs work | `lib/catalog.ts`, `app/error.tsx:16` |
| APP-4 | Tests: 16 unit-test files (129 tests: money, cart, orders, finance, catalog, auth tiers, pagination); **no tests for Server Actions, pages or E2E**; SQL suites not wired to CI | Needs work | `src/**/*.test.ts`, no `.github/` |
| APP-5 | Every route dynamic; N+1: none found in current code; unbounded lists fixed in working tree (vendor orders/products/finance paginated) but still unbounded on committed code, admin orders/settlements | Needs work | Q7; `admin/orders/page.tsx`, `admin/settlements/page.tsx` |
| APP-6 | Template leftovers: 5 unused SVGs in `public/` | Needs work (trivial) | `public/` |
| APP-7 | Duplicated money/status helpers are minimal; no dead feature flags; no mock data in app code (demo seeding is script-only, flagged `is_demo`) | **Ready** | `scripts/seed-demo.mjs:6-18` |

### E. Reliability and operations
| ID | Finding | Status | Evidence |
|---|---|---|---|
| OPS-1 | No error tracking, logging, uptime monitor or alerting | **Blocker** | `package.json`, only `console.error` |
| OPS-2 | No CI/CD (lint, typecheck, tests, SQL suites, build); no preview gating; manual `db push` + deploy; **no staging**; dev and prod likely share one Supabase project *(assumption)* | **Blocker** | no `.github/`; README |
| OPS-3 | Background jobs: none exist. Needed soon: unconfirmed-order reminders/auto-cancel, abandoned carts, payout reminders. Guest-quota cleanup is opportunistic | Needs work | no cron |
| OPS-4 | Capacity: Supabase plan/limits unknown; peak seasons untested | Needs work | Q7 |
| OPS-5 | Node version unpinned (`engines` missing) | Needs work (Low) | `package.json` |

### F. Product completeness (gift marketplace)
| Feature | Status |
|---|---|
| Gift message, hidden prices on packing slip, wrapping, personalization | **Missing** (only free-text `notes`) |
| Scheduled delivery date/time window, deadline guarantee | **Missing** |
| Surprise-safe notifications to recipient | **Missing** |
| Discovery: text search, category, price filters | Partial (no occasion/recipient filters, no gift guides, no sorting) |
| Vendor onboarding | Ready (admin-managed); verification/KYC **missing** |
| Product moderation | **Missing** — vendors self-publish (`vendor/products/actions.ts:15`) |
| Vendor performance tracking | Partial (analytics page, untracked) |
| Customer account: order history/cancel | Ready; reorder, address book, saved recipients, occasion reminders **Missing** |
| Admin tools: approvals/commission/settlements/support | Ready (basic); disputes, refunds, reports, staff roles, activity log **Missing** |
| Empty/loading/error states, destructive confirmations | Ready (confirm dialogs on payout/void/cancel) |

### G. Compliance and trust
Status **Blocker**. Missing pages: Terms, Privacy, Returns/Refund, Cookie notice, Vendor agreement — none exists in `src/app`. **Questions for a local lawyer/accountant (not legal advice):** consumer-protection rules for COD and returns/exchange periods in Egypt; the Personal Data Protection Law (Law 151/2020) obligations, consent and registration; data-processor terms with Supabase/Vercel and cross-border transfer; commercial registration, tax registration and VAT/e-invoicing for the platform's commission (and whether Gifto must issue invoices); vendor agreement and liability for delivery; marketplace/e-commerce licensing; electronic receipts. **Personal data collected:** name, email, phone, delivery address, order history, IP hash for rate limit; stored in Supabase (region *(assumption — check)*); accessible to platform admins, vendor members of the shop (customer contact + address) and the service role. **Deletion:** no user-facing delete/export; `profiles` cascade from `auth.users`, but `orders.user_id` is set null (`5`), so a delete/anonymise procedure and a published retention policy are needed.

### H. UX, accessibility, localisation, SEO
| Item | Status | Evidence |
|---|---|---|
| Mobile-first layout, focus rings, labelled forms | Ready (visual QA still needed) | Tailwind classes use `focus-visible`, form labels present |
| Contrast/keyboard audit | Not verified | run axe/Lighthouse |
| Arabic/RTL | **Blocker for Cairo/Alex beta** | Q9 |
| SEO | Needs work | per-page `metadata` exists; **no `sitemap.xml`, `robots.txt`, structured data (JSON-LD 0 hits), canonical tags**; clean URLs `/shops/[slug]/[product]` are good |
| Analytics / conversion tracking | **Missing** | no provider |

### I. Future-proofing
See Q8. Overall **Needs work** (moderate): add a thin data layer and keep business rules in SQL.

---

## 3. Verified vs. assumed

**Verified directly (code/SQL read by me):** RLS enabled on 16/16 tables; migration 20 drops the broad vendors policy and 1–19 contain it; guest token/hash/cookie/reference design; `_create_order` locking, stock check, decrement; `cancel_order`, `adjust_product_stock`, `get_guest_order`, `consume_checkout_quota`; product UPDATE column grant; order snapshots; cart price handling; absence of reset/legal/sitemap routes; Latin-only slug logic; route and Supabase-call counts; git drift; `npm audit`/`outdated`.
**Helper-extracted, spot-checked:** the final policy set and function-by-function grant/`search_path` table.
**Assumptions to verify:** hosted migration level (1–19 vs 24); production commit; shared dev/prod Supabase project; hosted Auth settings (SMTP, password rules, email confirmation, CAPTCHA); `public` schema CREATE privilege; backup/PITR plan; security headers in production; Vercel Node version; Supabase region/plan.
**Not run:** SQL suites, load tests, hosted queries, Lighthouse/axe.
