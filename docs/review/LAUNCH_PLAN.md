# Gifto — Launch Plan

Review date: 2026-11-09. Inputs: [ARCHITECTURE.md](./ARCHITECTURE.md) and [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md). Finding IDs (SEC-1, MON-3, …) refer to the latter.
**Nothing in this plan is implemented**, with one exception you asked for (§5): the cache-invalidation flaw is already fixed in the working tree. Effort figures are rough engineering hours for one developer, excluding review/waiting time.

**IDs introduced here** (they map to rows of the Q9 table or to Q1/Q2 in PRODUCTION_READINESS):
`DRIFT-1` code/DB mismatch · `DRIFT-2` customer order pages lose shop names · `NTF-1/2` vendor/customer notifications · `LEG-1` legal pages · `L10N-1` Arabic names/slugs · `L10N-2` RTL/Arabic UI · `TST-1` RLS/concurrency tests · `ENV-1` credentials per environment · `DEMO-1` demo data in production · `BETA-1` beta gating · `CACHE-1` invalidation flaw.

---

## 1. Go / No-go

### (a) Public launch — **NO-GO**
1. The hosted database very likely still lets any signed-in user read every active shop's commission rate and contact details (SEC-1), and the code and database are out of step (DRIFT-1).
2. Customers cannot reset a password, receive no order confirmation, and vendors are not told when an order arrives (SEC-2, NTF-1/2).
3. There are no terms, privacy or returns pages, no refund or dispute process, and a shop can avoid commission by cancelling a shipped order with no record of who did it (LEG-1, MON-9, MON-3).
4. There is no staging, no CI, no error tracking or alerts, and no tested backup restore (OPS-1/2, DAT-1), so a bad release could not be detected or undone safely.
5. The money model, stock locking and role-based security are strong, so these are fixable gaps rather than redesign work.

### (b) Closed beta (invited vendors, one city, COD only) — **CONDITIONAL GO, not today**
1. The core purchase path is sound: server-side pricing, integer money, last-unit safety (Q5), guest-token design, and a complete commission/settlement ledger.
2. A supervised beta limits the blast radius of the missing pieces (no online payments, no refunds) because COD cash is settled directly between customer and shop.
3. It becomes a **Go once Phase 0 and the Phase 1 items are done**: apply migration 20 (SEC-1), staging and backup restore, error alerts, SMTP and password reset, vendor order notifications, minimal legal pages, Arabic-safe names, and the MON-3/MON-4 fixes.
4. Beta must stay gated (invited vendors, noindex, order caps) so volume never exceeds what a person can reconcile by hand each day.
5. Re-evaluate after the exit criteria in §6 for the invite-only stage are met.

---

## 2. Top 10 risks (likelihood × business impact)

| # | Risk (business terms) | Finding | Owner type |
|---|---|---|---|
| 1 | Competitors/customers can read each shop's commission rate and contact details | SEC-1 | Backend, ops |
| 2 | A release breaks product pages (shoppers can't add to cart) or the database, with no rollback rehearsed | DRIFT-1, OPS-2 | Ops, backend |
| 3 | Data loss with no proven restore; dev and prod may share one database | DAT-1, ENV-1 | Ops |
| 4 | Vendors don't learn of orders → late/missed deliveries on a gift's deadline | NTF-1 | Product, backend |
| 5 | Shops under-report commission (cancel after delivering) and nobody can prove it | MON-3 | Product, backend |
| 6 | Fake/hoarding COD orders lock up stock and waste vendors' preparation | SEC-5 | Backend |
| 7 | Customers locked out (no reset) or can't track/cancel a guest order | SEC-2, GST-1 | Frontend, backend |
| 8 | Customer charged a different price from the one shown at checkout | MON-4 | Frontend, backend |
| 9 | Arabic shop/product names cannot be created, blocking real vendors | L10N-1 | Backend, product |
| 10 | Launching without terms/privacy/returns or a defined refund process (legal and trust exposure) | LEG-1, MON-9 | Legal, product |

---

## 3. Prioritized backlog

Effort: **S** ≤ 4 h · **M** 4–16 h · **L** > 16 h. "Staging" = the environment created by OPS-2a. Items with a ⚠ change the database schema and need your explicit approval before implementation.

### Phase 0 — Safety (before any real user)

| ID | Business risk | Files / tables | Acceptance criteria | Effort | Depends on |
|---|---|---|---|---|---|
| **DRIFT-1** Commit the work in reviewable groups and cut a release candidate | Nobody can tell what is live or reproduce a deploy | working tree (33 modified, 50 untracked); branch `release/dashboard-20-24` | Clean `git status`; 4 commits (SQL, vendor/admin UI, performance, docs); `npm run lint/typecheck/test/build` all pass; tag RC | S (2–3 h) | — |
| **OPS-2a** Staging environment | No safe place to rehearse migrations or test with real sessions | new Supabase project; Vercel Preview env vars | Staging DB at migration 19 loaded from a prod schema dump; preview deployment points only at staging; credentials differ from prod | M (6–10 h) | — |
| **ENV-1** Separate credentials per environment; rotate prod keys | A dev laptop or preview build could write to production | `.env.local`, Vercel env, Supabase dashboard | Prod service-role key and DB password rotated; dev/staging keys differ; `.env.local` no longer holds prod secrets; documented in README | S (2–3 h) | OPS-2a |
| **DAT-1** Backup + restore drill | A bad migration or deletion cannot be undone | Supabase backups/PITR, storage buckets | Plan confirmed (daily/PITR); `supabase db dump` + storage copy stored off-platform; restore into staging succeeds and row counts match; restore time recorded | M (4–6 h) | OPS-2a |
| **DEMO-1** Verify/remove demo data in production | Fake demo shops could appear to real customers | tables `vendors.is_demo`, `profiles`; `scripts/cleanup-demo.mjs` | `select count(*) from vendors where is_demo` = 0 in prod (or documented exclusion); no demo auth users remain | S (1–2 h) | DAT-1 |
| **DRIFT-2** Fix customer order pages so they keep shop names after migration 20 (Deploy A in §4) | Customers lose shop names/links on their orders the moment privacy migration lands | `app/account/orders/page.tsx:19`, `app/account/orders/[id]/page.tsx:40` | Shop name + link render for active shops with the DB at migration 19 **and** 24; no `vendors` base-table read by customers | S (2–3 h) | DRIFT-1 |
| **SEC-1** + **DRIFT-1** Apply migrations 20–24 and ship the code per the §4 runbook | Competitors can read commission/contact data; product pages break if code ships first | migrations 20–24; `supabase/tests/rls_vendor_dashboard_test.sql` | Runbook gates G1–G5 pass; `select * from pg_policies where tablename='vendors'` has no `public read active`; a customer JWT `GET /rest/v1/vendors?select=commission_rate` returns `[]`; storefront, checkout, pause and uploads verified on prod | M (6–8 h) | OPS-2a, DAT-1, DRIFT-2, TST-1a |
| **TST-1a** Regression tests for SEC-1 and the 9 SQL suites green | The leak could silently return | `supabase/tests/*.sql` | New assertion "non-member cannot read `vendors.commission_rate`/contact fields"; all suites pass on a fresh schema with migrations 1–24 | S (3–4 h) | — (Docker image pull) |
| **OPS-1a** Minimal error tracking, uptime and alerts | Failures are invisible until a customer complains | `app/error.tsx`, `app/vendor/error.tsx`, server actions; Sentry (or equivalent), uptime probe, Supabase/Vercel alerts | A deliberately thrown error reaches the tracker and pages a human within 5 min; uptime probe on `/` and `/shops`; alert on 5xx rate and failed checkouts | M (4–6 h) | OPS-2a |
| **CACHE-1** Cache invalidation flaw | Cache would empty on every order at peak | `checkout/actions.ts`, `account/orders/actions.ts`, `vendor/orders/actions.ts`, `lib/catalog-cache.ts` | **Done** (see §5); re-verify on staging that a burst of orders does not drop the home page hit rate | S (1 h verify) | OPS-2a |

Phase 0 total ≈ **31–47 h**.

### Phase 1 — Closed-beta blockers (before the first invited vendor takes real orders)

| ID | Business risk | Files / tables | Acceptance criteria | Effort | Depends on |
|---|---|---|---|---|---|
| **SEC-3** Custom SMTP | Invites/confirmations throttled or in spam; vendors can't be onboarded | Supabase Auth settings; DNS | SPF/DKIM/DMARC pass; invite, confirm and reset emails arrive in Gmail/Outlook inboxes in < 1 min; templates branded | S (3–5 h) | OPS-2a |
| **SEC-2** Self-service password reset | Locked-out customers/vendors can't return | new `/forgot-password`, `/reset-password`; `auth/callback` | Reset email → set new password → sign in works; rate limit message generic (no account enumeration) | M (6–8 h) | SEC-3 |
| **NTF-1** Vendor new-order notification | A shop misses an order and the gift arrives late | new outbox/queue or DB webhook + sender; vendors contact fields | Within 1 min of `placed` the shop owner gets an email (WhatsApp optional later) with order ref, items, address; failures retried and logged | M–L (14–24 h) | SEC-3, OPS-1a |
| **NTF-2** Customer order confirmation | Customer unsure the order went through; no tracking link | same sender; guest/auth order | Customer with an email gets confirmation + status link; phone-only guests see the on-screen reference | M (6–10 h) | NTF-1 |
| **LEG-1** Terms, Privacy, Returns/Refund, Cookie pages + consent links | Legal/trust exposure from collecting personal data and COD terms | new `app/(legal)/*`; footer, signup, checkout | Pages published (text approved by your lawyer); checkout/signup show consent line with links | M (8–12 h, + lawyer) | Open questions Q1–Q4 |
| **L10N-1** ⚠ Arabic-capable slugs | Real vendors can't create shops/products with Arabic names | `public.slugify` (migration 1:25), `set_product_slug` (4:118-137), `lib/slugify.ts`, `admin/actions.ts` createVendor check | Arabic-only name creates a shop and product with a stable fallback slug (e.g. transliteration or `p-<8 chars>`); TS and SQL slug functions match; tests for Arabic input | M (8–12 h) | schema approval |
| **MON-4** Price-change confirmation at checkout | Customer charged more/less than the price shown | `checkout/checkout-form.tsx`, `checkout/actions.ts`, `lib/cart.ts` | Server compares the cart's expected total with current prices before the RPC; on mismatch it returns the new prices and requires explicit re-confirmation; test covers vendor repricing between cart and checkout | M (6–10 h) | — |
| **MON-3a** ⚠ Order status history with actor + cancel-after-ship rule (design §6) | Shops avoid commission with no audit trail | new `order_status_events`; `assert_order_vendor_transition`; vendor orders UI; admin queue | Every status change stores actor, role, reason; cancelling from `shipped` needs a reason; admin "failed deliveries" list; vendor cancel-after-ship rate visible | L (18–26 h) | schema approval |
| **SEC-5** Order-abuse limits | Bots/competitors drain stock or spam shops with fake COD orders | `place_order_with_idempotency`, `place_guest_order`, `checkout_rate_limits`; `checkout/actions.ts` | Quota enforced **inside** the RPC (not only the action); max open orders per account and per phone; test shows direct REST calls are limited too | M (10–14 h) | TST-1b |
| **GST-1/GST-2** Admin-assisted guest order lookup and cancel | A guest who loses the cookie cannot get help | admin orders page; `cancel_order` | Admin finds a guest order by reference + phone and can cancel it; audited | S–M (6–10 h) | MON-3a |
| **SEC-4** Security headers | Clickjacking/script injection easier | `next.config.ts` | CSP in report-only first, then enforced; `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, HSTS verified with `curl -I` | M (4–8 h) | — |
| **SEC-6** Auth hardening | Fake sign-ups and weak passwords | Supabase Auth config; `components/auth-form.tsx` | Email confirmation on; min password ≥ 8; leaked-password check; CAPTCHA on signup/login | S–M (4–8 h) | — |
| **TST-1b** RLS gap + concurrency tests | The "last unit" and cross-vendor guarantees could regress unnoticed | `supabase/tests/` | New tests for the 8 gaps in PRODUCTION_READINESS Q2 and a two-session last-unit test | M (10–14 h) | TST-1a |
| **OPS-2b** CI pipeline | Broken code or migrations can ship | `.github/workflows/ci.yml` | PR runs lint, typecheck, unit tests, build, SQL suites (Docker); required to merge | M (8–12 h) | TST-1a |
| **BETA-1** Beta gating | "Invite-only" is not enforced; public search engines and shoppers could find it | `app/layout.tsx` metadata, `robots`, Vercel deployment protection, `is_accepting_orders` | `noindex`, `Disallow: /`; only invited shops active; per-shop daily order cap process documented | S (3–5 h) | — |
| **MON-11** Payout dry run + ops runbook | Commission/payout mistakes in week one | `admin/settlements/*` | A full test settlement created, marked paid, voided on staging; reconciliation sheet matches ledger totals | S (3–4 h) | OPS-2a |
| **OPS-4** Incident/on-call runbook | Nobody knows who acts at 2 a.m. | docs | Named owner, escalation path, how to pause all shops (`is_accepting_orders`) | S (3–4 h) | OPS-1a |

Phase 1 total ≈ **120–190 h**.

### Phase 2 — Before public launch

| ID | Business risk | Files / tables | Acceptance criteria | Effort | Depends on |
|---|---|---|---|---|---|
| **MON-9** ⚠ Refunds, returns, disputes | No way to record or resolve a customer complaint or refund | new `refunds`/`disputes` tables, admin and customer UI, ledger reversal | Customer or admin opens a case; admin resolves with amount; commission adjusts via ledger; audited | L (30–50 h) | MON-3a, LEG-1 |
| **MON-3b** ⚠ Delivery confirmation (PIN handover) | A shop can mark orders delivered that never were | `order_vendors`, vendor UI, customer page | `delivered` requires the customer's code (or admin override with reason) | L (16–24 h) | NTF-2, MON-3a |
| **L10N-2** Arabic + RTL storefront and dashboards | Most customers expect Arabic | `app/layout.tsx` (`lang`/`dir`), 34 physical-direction classes, strings, fonts | Arabic/English toggle; RTL layouts pass visual QA on mobile; EGP/number formatting localized | L (40–80 h) | — |
| **GIFT-1** Gift message + hidden prices on packing slip | Core gift promise missing | `orders` columns ⚠, checkout, vendor order view/print | Message printed without prices; hidden from non-recipient surfaces | M (14–20 h) | schema approval |
| **GIFT-2** Scheduled delivery date/time window | Gifts miss their date | `orders`/`order_vendors` ⚠, checkout, vendor UI | Customer picks date/window within shop lead time; vendor sees it; late-delivery metric exists | L (24–36 h) | DLV-1 |
| **DLV-1** Validate address against shop coverage | Orders to areas a shop doesn't serve | `vendors.delivery_coverage`, checkout | Out-of-coverage address blocked with clear message | M (8–10 h) | — |
| **NTF-3** Phone verification (OTP) at checkout | Fake orders and wrong numbers | checkout, SMS provider | OTP required for guests above a risk threshold | M (12–16 h) | SEC-5 |
| **SEC-8** Mask customer phone/address for staff role until `confirmed` | Wider PII exposure than needed | `orders` RLS/view, vendor orders page | Staff see only what delivery needs; test added | M (6–8 h) | — |
| **DRIFT-2b** ⚠ Snapshot vendor name/slug on `order_vendors` | Suspended/renamed shops break order history | migration + `_create_order` + backfill | Order pages never need a `vendors` read | M (6–8 h) | schema approval |
| **DAT-3 / DAT-4 / DEF-1 / DEF-2 / MON-7 / GST-3** DB hardening bundle ⚠ | Audit loss and slow/race edge cases | `inventory_movements` FK, `checkout_rate_limits(window_start)`, `search_path = ''`, support limiter, settlement line check, guest token expiry | Each item has a migration with rollback and a test | M (14–20 h) | schema approval |
| **APP-3 / APP-5** Honest error states + paginate admin lists | Empty pages look like "no products"; slow admin | `lib/catalog.ts`, `admin/orders`, `admin/settlements` | Failed reads show an error state; lists paged | M (8–10 h) | — |
| **SEO-1** Sitemap, robots, canonical, product JSON-LD | Gifts not discoverable on Google | `app/sitemap.ts`, `app/robots.ts`, product page | Valid in Rich Results test; indexable only when BETA-1 is lifted | M (8–12 h) | BETA-1 |
| **MOD-1** Product moderation queue | Offensive/illegal listings go live instantly | `products.status`, admin UI | New products start `draft`→`pending_review` ⚠; admin approves | M (12–18 h) | schema approval |
| **OPS-3** Scheduled jobs: unconfirmed-order reminders/escalation | Orders sit unconfirmed forever | cron (Vercel/Supabase) | Reminder to shop at 30 min, admin alert at 2 h | M (12–18 h) | NTF-1 |
| **OPS-5** Capacity test + PITR + dashboards | Peak seasons (Eid, Valentine's, Mother's Day) overload | staging, k6 | Test at 20 orders/s + 50 page views/s meets p95 targets; PITR enabled | M (10–16 h) | OPS-2a |
| **PRIV-1** Data export/deletion + retention policy | Legal obligation to honor data requests | `profiles`, `orders.user_id` | Documented and tested delete/anonymise procedure | M (12–16 h) | LEG-1 |
| **SEC-7 / APP-6 / patch upgrades** Upload sniffing, remove template SVGs, Next 16.4.5, pin Node | Small hygiene risks | `vendor/settings/actions.ts`, `public/`, `package.json` | Magic-byte check; patch upgrade green in CI | S (4–6 h) | OPS-2b |

Phase 2 total ≈ **245–400 h**.

### Phase 3 — Later

| ID | Item | Effort |
|---|---|---|
| MON-8 | Online payments (gateway, webhooks with signature verification, idempotency, reconciliation) | L (60–100 h) |
| DLV-2 | Courier integration and live tracking | L (40–80 h) |
| ACC-1 | Reorder, address book, saved recipients, occasion reminders | L (30–50 h) |
| DIS-1 | Occasion/recipient filters, gift guides, sorting | M–L (20–40 h) |
| KYC-1 | Vendor verification documents | M–L (16–30 h) |
| ADM-1 | Reports, staff roles, admin activity log | L (30–50 h) |
| ARCH-1 | Data-access layer (`lib/data/*`) to reduce lock-in | L (40–60 h) |

---

## 4. Production runbook: migrations 20–24 and the working-tree code

**Principle:** migrations 20–24 are safe for the committed code **except** the two customer order pages, and the working-tree code is **not** safe on a database at 19. So the order is **Deploy A (hotfix on current prod code) → migrate → Deploy B (full code)**. Replace `<PROD_REF>`, `<STAGING_REF>`; keep credentials in environment variables, never in the repo or shell history.

### Step 0 — Preparation (staging)
1. `git switch -c release/dashboard-20-24` and commit the working tree in groups (DRIFT-1). Tag the commit that production currently runs (`d64dae5`, *verify in Vercel*) as `prod-before-20`.
2. `npm ci && npm run lint && npm run typecheck && npm test && npm run build` (all must pass). `npm audit --omit=dev` must show 0.
3. Create staging (OPS-2a): new Supabase project; load production's schema+data at migration 19 (`supabase db dump --linked -f prod.sql` from prod, restore into staging); point a Vercel Preview environment at staging.

### Step 1 — Confirm the hosted state (read-only)
```
supabase link --project-ref <PROD_REF>
supabase migration list --linked          # expect 1–19 applied, 20–24 not applied
```
SQL (dashboard SQL editor, read-only):
```sql
select policyname from pg_policies where schemaname='public' and tablename='vendors';      -- expect "vendors: public read active"
select column_name from information_schema.columns where table_name='vendors' and column_name in ('cover_path','is_accepting_orders'); -- expect 0 rows
select count(*) from public.vendors where is_demo;                                           -- DEMO-1: expect 0
select has_schema_privilege('authenticated','public','CREATE');                              -- DEF-1: expect false
```
Stop if the migration list differs from the expectation: reconcile first.

### Step 2 — Backup production (gate G1)
1. Dashboard → Database → Backups: confirm daily backups or PITR are active; note the latest restore point and plan.
2. `supabase db dump --linked -f backup/schema-<date>.sql` and `supabase db dump --linked --data-only -f backup/data-<date>.sql` (requires Docker). Store both off-platform, encrypted.
3. Copy Storage objects of `product-images` (and `vendor-media` if it exists) to off-platform storage (S3-compatible access or `supabase storage cp`).
4. Record baseline counts for later comparison:
```sql
select 'orders',count(*) from orders union all select 'order_vendors',count(*) from order_vendors
union all select 'products',count(*) from products union all select 'vendors',count(*) from vendors
union all select 'commission_entries',count(*) from commission_entries union all select 'settlements',count(*) from settlements;
```
**G1 passes only if** the backup restored successfully into staging and the counts match.

### Step 3 — Validate on staging (gate G2)
1. `supabase link --project-ref <STAGING_REF>`; `supabase db push --dry-run`; `supabase db push` (applies 20→24 in order, each in its own transaction).
2. Run all **9** SQL suites on a throwaway Docker Postgres (README "Verifying RLS locally"), including `rls_vendor_dashboard_test.sql`; all must pass.
3. Deploy the release branch to a Preview pointing at staging and execute the smoke list in Step 6. Also run the two-vendor/one-customer RLS test (Checklist §8).
4. Rehearse rollback on staging (Step 7, Level 2) and re-apply.
**G2 passes only if** all suites and the smoke list pass and the rollback rehearsal worked.

### Step 4 — Deploy A: hotfix for the customer order pages (prod, still at migration 19)
Branch from the current prod commit: `git switch -c hotfix/order-shop-names prod-before-20`. Change the two embeds so customers read shop names from the **public view** (this works on the DB at 19 *and* at 24, because HEAD already embeds `public_vendors` from `products`):
```ts
// app/account/orders/page.tsx:19 and app/account/orders/[id]/page.tsx:40
order_vendors(id, status, vendor:public_vendors(name, slug))   // was vendor:vendors(name, slug)
```
Verify on a staging copy at 19 and at 24, then deploy to production. *Fallback if PostgREST cannot resolve the embed:* one extra query `from("public_vendors").select("id, name, slug").in("id", vendorIds)` and map by `vendor_id`. Note: suspended/pending shops are not in `public_vendors`, so their names will not show until DRIFT-2b (snapshot columns) is done — acceptable for beta.
**G3:** account order list and detail pages show shop names on production.

### Step 5 — Apply migrations to production (gate G4: maintenance window, low traffic)
1. Announce a short window. Optionally set every shop to not accepting orders only after 22 exists — not needed here.
2. `supabase link --project-ref <PROD_REF>`; `supabase db push --dry-run` (expect exactly 20–24, nothing else); then `supabase db push`.
3. `supabase migration list --linked` → 1–24 all applied.
4. Branding media: dry run `node scripts/backfill-vendor-media.mjs` with the **production** variables set explicitly in the shell (not `.env.local`); review the plan; then `--apply`. It copies (never moves) logos to `vendor-media`, so sources remain for rollback.
5. Immediately run the **SQL post-checks** of Step 6 (items 1–4). If any fail, go to Step 7.

### Step 6 — Deploy B (full code) and post-deploy checks (gate G5)
1. Merge `release/dashboard-20-24` to `main` (or promote the staged preview). Confirm Vercel env has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`. The hosted project publishes an ES256 signing key (checked earlier at `/auth/v1/.well-known/jwks.json`), so the faster `getClaims()` auth works; if the project is ever switched to a symmetric key it falls back to `getUser()` automatically.
2. **Checks — expected results:**
   1. `select policyname from pg_policies where tablename='vendors'` → **no** `vendors: public read active`.
   2. With a signed-in **customer** token: `GET /rest/v1/vendors?select=commission_rate,contact_email` → `[]`.
   3. Anonymous: `GET /rest/v1/public_vendors?select=id,name,cover_path,is_accepting_orders&limit=1` → 200.
   4. Row counts equal the Step 2 baseline (plus any new orders).
   5. `/`, `/shops`, a shop page, a product page → 200; images load (check `/_next/image` returns 200, not 400).
   6. Add to cart → guest checkout with a designated **test product at a test shop** → success page; then cancel the order and confirm stock restored.
   7. Signed-in customer places and cancels an order; account pages show shop names.
   8. Vendor: save settings, upload logo and cover, toggle **pause orders** → checkout shows "not accepting orders", unpause; submit a support request; open analytics (30d).
   9. Admin: vendors, orders, settlements, support pages load; create and void a test settlement.
   10. Vercel runtime logs and Supabase logs show no new 5xx/errors for 30 minutes; error tracker quiet.

### Step 7 — Rollback (use the lowest level that fixes the problem)
**Triggers:** checkout failing, 5xx > 2% for 10 minutes, any data exposure, or a failed check above.

*Level 1 — Code only (preferred, ~minutes):* Vercel → Deployments → previous production deployment → **Instant Rollback**. Because Deploy A is already live, the previous code works with the database at 24.

*Level 2 — Database (only for a faulty migration).* Order matters; each script refuses unsafe states:
1. Run old code (Level 1) first. Rolling back 20 **reopens the vendor-data leak** (the script's own warning) — do it only to recover from a broken migration and re-apply immediately after.
2. Before 23: export `support_requests` (script refuses if rows exist). Before 21: delete the copied objects in `vendor-media` (the script refuses otherwise; sources remain in `product-images`). Before 20: export `address_line`, `working_hours`, `prep_time_*`, `cover_path` (data is dropped).
3. Execute in this order, stopping on any error:
```
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollbacks/00000000000024_analytics_scale_rollback.sql
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollbacks/00000000000023_vendor_support_requests_rollback.sql
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollbacks/00000000000022_vendor_pause_checkout_rollback.sql
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollbacks/00000000000021_vendor_media_rollback.sql
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollbacks/00000000000020_vendor_profile_privacy_rollback.sql
supabase migration repair --status reverted 00000000000024 00000000000023 00000000000022 00000000000021 00000000000020 --linked
supabase migration list --linked      # expect 1–19 applied
```
Rollback 22 restores migration 11's checkout function; orders placed while paused remain valid.

*Level 3 — Restore from backup/PITR (corruption only):* choose a restore point just before Step 5, restore to a new project, verify, then switch. Orders placed after that point must be reconciled from Vercel logs and shop notifications. Last resort.

### Step 8 — Aftercare
Monitor for 24 hours; keep the backup for 14 days; update README "hosted state: migrations 1–24"; record timings and any deviations in the release notes.

---

## 5. Cache invalidation flaw — fixed

**Flaw (mine, in the working tree):** every order and every cancellation cleared the `catalog` cache tag, so at peak order rates the cache would be emptied continuously and home/shop pages would fall back to 6–8 queries per view.
**Fix (done, verified):** removed `revalidatePublicCatalog` from `checkout/actions.ts` (guest and signed-in paths), `account/orders/actions.ts` and `vendor/orders/actions.ts`; documented the rule in `lib/catalog-cache.ts`. Invalidation now happens only for deliberate changes: product create/edit/delete, product images, manual stock adjustment, shop settings/pause, shop status changes, new categories. Staleness of stock labels is bounded by the 60-second expiry and real stock is always enforced in the database at checkout. `lint`, `typecheck` and all **129 unit tests pass**. Remaining task: confirm on staging (CACHE-1).

---

## 6. MON-3 design: shops avoiding commission by cancelling shipped orders

**Problem:** commission is earned only on `delivered` (`6:118-146`); the shop collects the cash and can move a suborder `shipped → cancelled` or `shipped → delivered` (`13:25-31`), and nothing records who did it or why.

**Common building block (all options): `order_status_events`** ⚠ (append-only)
`id, order_vendor_id, from_status, to_status, actor_id, actor_role (customer | vendor | admin | system), reason_code, note, created_at`. Written by an `AFTER UPDATE OF status` trigger on `order_vendors` (reads `auth.uid()`; null → `system`), readable by the customer, the shop's members and admins; no client INSERT/UPDATE/DELETE. Also record `order_vendors` cancellations that come from `cancel_order`.

| Option | What it does | Pros | Cons | Effort |
|---|---|---|---|---|
| **A. Event log + reason + review queue** | Replace the direct status UPDATE with an RPC `set_suborder_status(id, status, reason)`; cancelling from `shipped` requires a `reason_code` (customer_refused, unreachable, wrong_address, other) and a note; admin sees a "failed deliveries" queue; per-shop cancel-after-ship rate is computed and flagged above a threshold | Cheap, no new customer step, gives evidence | Does not stop a determined shop; relies on review | L (18–26 h) |
| **B. Admin approval for shipped→cancelled** | The shop *requests* cancellation; stock and status change only after admin approves | Strongest control | Admin bottleneck; delays restock; poor at scale | L (24–32 h) |
| **C. Customer delivery confirmation (PIN)** | Customer gets a 4–6 digit handover code (order page/SMS); `delivered` needs the code, with admin override | Stops false "delivered"; gives proof of delivery | Doesn't stop cancel-after-delivery alone; needs notifications | L (16–24 h) |
| **C-lite. Customer notice on cancel-after-ship** | When a shipped order is cancelled, the customer is told and can tap "I did receive this", which opens a dispute and flags the shop | Directly counters cancel-to-avoid-commission; cheap once NTF-2 exists | Needs email/SMS | M (6–10 h) |

**Recommendation:** **A now (Phase 1, beta)** because it is the only thing that gives an audit trail before real money flows, plus **C-lite as soon as NTF-2 exists**, and **C in Phase 2** for public launch. Use **B only automatically** for shops whose cancel-after-ship rate exceeds a threshold. Alternative (business option, not recommended): earn commission at `shipped` and reverse on admin-verified failure — changes shop cash-flow and needs the owner's agreement.

**Acceptance criteria (Option A):** every status change creates an event with actor; `shipped → cancelled` without a reason is rejected; events are immutable; admin can list failed deliveries by shop and date; a test proves a vendor cannot UPDATE `order_vendors.status` directly anymore (grant revoked in favor of the RPC); the commission trigger behaviour is unchanged.

---

## 7. Staged rollout plan

| Stage | Scope | Entry criteria | Exit criteria |
|---|---|---|---|
| **1. Internal test** | Team + staging/prod-like data; no real customers | Phase 0 complete (SEC-1 applied, staging, backup restore proven, alerts firing); `BETA-1` noindex on | ≥ 20 end-to-end test orders (guest + account, 2 shops, cancel, failed delivery, return); all 9 SQL suites + CI green; rollback rehearsed; two-vendor/one-customer RLS test passes; no open P0/P1 defect |
| **2. Invite-only beta** | 3–5 invited shops in **one city** (e.g. Alexandria), COD, orders capped (e.g. ≤ 30/day total), friends-and-family customers | Stage 1 exit + Phase 1 complete (SMTP, reset, NTF-1/2, LEG-1 minimal, L10N-1, MON-3a, MON-4, SEC-5, GST-1) + support contact published + on-call named | 2 consecutive weeks with: 0 critical incidents; ≥ 95% of orders confirmed by shop within 30 min; ≥ 90% delivered; order-notification delivery ≥ 99%; payout reconciliation matches the ledger exactly; cancel-after-ship rate < 10% and every case explained; support tickets < 15 per 100 orders |
| **3. Limited public beta** | Public signups/orders, more shops, 1–2 cities, rate-limited, advertised lightly | Stage 2 exit + Phase 2 items marked "before public launch": refunds/disputes (MON-9), delivery confirmation (MON-3b), phone verification, Arabic/RTL, gift message + scheduled delivery, SEO, load test, PITR, data export/delete | 4 weeks: p95 page < 2 s; checkout success ≥ 95%; on-time delivery ≥ 90%; refund/dispute handled within SLA; no data-exposure incident; capacity test at 2× expected peak passes |
| **4. Full launch** | Open marketing, all approved cities | Stage 3 exit + peak-season readiness review (Eid/Valentine's/Mother's Day capacity plan, staffed support) + legal sign-off | Ongoing monitoring of §9 metrics; quarterly restore + rollback drills |

---

## 8. Pre-launch checklist (run on every stage gate; tick each box)

- [ ] **RLS with two vendors and one customer:** Vendor A, Vendor B, Customer C each have their own session. Confirm via PostgREST (anon key + each JWT): C cannot read `vendors.commission_rate`/contact fields; A cannot `GET/PATCH/DELETE` B's `products`, `product_images`, `order_vendors`, `support_requests`, `vendor_members`; A cannot read B's settlements/commission; C cannot read another customer's `orders`/`order_items`; staff cannot write; anon sees only the public view and active catalog.
- [ ] **Full test purchase:** guest checkout across 2 shops (cookie confirmation page; reference shown), then signed-in checkout; verify totals, stock decrement, vendor notification, customer confirmation.
- [ ] **Concurrency spot check:** two browsers buy the last unit; one succeeds, one gets "Only 0 … in stock".
- [ ] **Cancel and refund test:** customer cancels a `placed` order (stock restored); vendor cancels `confirmed`; failed delivery `shipped → cancelled` requires a reason and appears in the admin queue; admin marks a delivered order `returned` and the commission reverses. *Refunds do not exist yet (MON-9): record the cash refund in the order note and confirm the ledger is correct; mark this box "n/a" only after MON-9.*
- [ ] **Payout dry run:** create a settlement from earned commission, mark paid, void another; the reconciliation sheet equals ledger totals to the piastre.
- [ ] **Monitoring alert test:** throw a test error and a failed-checkout simulation; confirm the tracker/pager reaches a human in ≤ 5 minutes; uptime probe fires when the site is paused.
- [ ] **Backup restore:** latest backup restored into staging; counts and a random sample of orders match; time recorded.
- [ ] **Rollback rehearsal:** Vercel Instant Rollback executed once; Level 2 DB rollback 24→20 and re-apply executed on staging.
- [ ] Email deliverability (invite, confirm, reset) to Gmail/Outlook/Yahoo in the inbox; SPF/DKIM/DMARC pass.
- [ ] Legal pages live and linked; consent line present; noindex state matches the stage.
- [ ] Demo data absent in production; production keys rotated and not on developer machines.
- [ ] Support contact, on-call owner and "pause all shops" procedure written down.

---

## 9. Metrics to track from day one

| Metric | Definition / source today |
|---|---|
| Conversion | visitors → checkout started → order placed. Needs web analytics (none installed — add privacy-friendly analytics) |
| On-time delivery rate | `delivered_at − orders.created_at` ≤ promised window. Until scheduled delivery exists (GIFT-2) use a fixed SLA (e.g. 48 h) from `order_vendors.delivered_at` |
| Order cancellation rate | cancelled suborders ÷ placed, split by actor and by stage (before/after `shipped`) — needs `order_status_events` (MON-3a) |
| Vendor response time | `confirmed_at − created_at` per shop (columns exist) |
| Refund/return rate | returned suborders (+ refunds once MON-9 exists) ÷ delivered |
| Payout accuracy | per settlement, sum of `settlement_lines` vs `commission_entries`; discrepancies must be 0 |
| Support tickets per 100 orders | `support_requests` (vendor side) + customer channel (add one) |
| Also watch | checkout error rate, notification delivery rate, cancel-after-ship rate per shop, p95 page time, 5xx rate, stock-out ratio |

---

## 10. Open questions for the business owner (with recommended defaults)

| # | Question | Recommended default |
|---|---|---|
| 1 | Legal entity, tax/VAT status, and whether Gifto must issue invoices for commission | Confirm with an Egyptian accountant before beta; assume commission invoices are required |
| 2 | Terms/returns policy for COD gifts (who accepts returns, time window, perishable items) | 24–48 h for damaged/wrong items, no returns on perishables/personalised items, shop handles exchanges |
| 3 | Payment gateway for the future (card/wallet) | Paymob or Fawry (Egypt-supported); keep COD-only through public beta |
| 4 | Payout method and schedule to shops | Weekly bank transfer or InstaPay; Gifto records commission, settles weekly, reconciles before paying |
| 5 | Commission model (flat %, tiered, minimums) and who pays on failed delivery | Keep per-shop flat % (current model, default 10%); no commission on failed delivery |
| 6 | Delivery model and fee | Shops deliver themselves; fee stays EGP 0 in beta, then per-shop fee configurable |
| 7 | Launch city and shops | Alexandria, 3–5 hand-picked shops with reliable same-day capability |
| 8 | Customer notification channel (email, SMS, WhatsApp) | Email now (needs SMTP); WhatsApp Business for vendor alerts in Phase 2 |
| 9 | Order caps and acceptance rules in beta | ≤ 30 orders/day total, ≤ EGP 3,000 per order, COD cap per customer |
| 10 | Arabic/English launch language | Arabic + English; Arabic-first for the storefront in public beta |
| 11 | Vendor onboarding checklist (commercial register, ID, sample products) and product rules (prohibited items) | Manual checklist + admin review of each shop's first 5 products |
| 12 | Refund policy and who approves disputes | Admin decides within 48 h; refund cash handled by the shop, recorded in the ledger |
| 13 | Support channel and hours | WhatsApp business number + email, 9:00–21:00, one named owner |
| 14 | Data residency and retention | Keep Supabase region closest to Egypt (EU/Middle East), retain order data 5 years, delete personal data on request |
| 15 | Beta access control (public URL vs invite code) | Public URL but `noindex`, shops limited to invited ones, orders capped |

---

## 11. Phase 0 scope for your approval

Please approve (or amend) these items; I will not start until you do:
**DRIFT-1, OPS-2a, ENV-1, DAT-1, DEMO-1, DRIFT-2, TST-1a, SEC-1 (runbook execution support), OPS-1a, CACHE-1 verification** — ≈ 31–47 hours. Items needing your **schema approval** later: MON-3a, L10N-1, SEC-5 (if the quota moves into SQL), GIFT-1/2, MON-9, DRIFT-2b, the DB hardening bundle. Phase 0 includes **no** schema changes (migrations 20–24 already exist); steps that touch your real Supabase project (backup, `db push`, key rotation) are performed by you or on your explicit go-ahead.
