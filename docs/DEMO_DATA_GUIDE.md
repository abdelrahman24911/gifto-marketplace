# Demo Data Guide

How the Gifto demo marketplace is seeded, inspected, refreshed, and removed.

## Status at a glance

| Item | Value |
| --- | --- |
| Supabase project ref | `hqusykdyjpruysxezsrn` (`gifto`, `eu-central-1`) |
| Remote migrations applied | `00000000000001` - `00000000000027` |
| Demo vendors | 5 (4 `active`, 1 `pending`) |
| Demo products | 70 (all `active`, all `is_demo = true`) |
| Platform categories | 8 (shared, not demo-only) |
| Demo vendor accounts | 5 (`@demo.gifto.example`) |
| Demo customer account | 1 (`layla.hassan@demo.gifto.example`) |
| Demo orders | 40 (42 total orders including 2 earlier guest orders) |
| Demo settlements | 4 (2 paid, 1 open, 1 voided) |
| Demo support requests | 5 across 4 vendors (2 open, 1 in progress, 2 resolved) |
| Merchandising | 15 tags, 6 active occasions, 3 pending tag suggestions |
| Storage | Product images, vendor logos/covers, and occasion banners |

Everything seeded by this workflow is tagged with `is_demo = true` on vendors
and products, or is attached to a demo vendor and removed with it.

## What the marketplace contains

| Vendor | Slug | City | Status | Commission | Products |
| --- | --- | --- | --- | --- | --- |
| Nile Blossoms | `nile-blossoms` | Alexandria | active | 12% | 29 |
| Cairo Cocoa & Confections | `cairo-cocoa` | Cairo | active | 15% | 8 |
| Legacy Engraving Studio | `legacy-engraving` | Luxor | active | 10% | 27 |
| Alexandria Toy Corner | `alex-toy-corner` | Alexandria | active | 12% | 6 |
| Delta Dried Flowers | `delta-dried-flowers` | Damietta | pending | 10% | 0 |

- Prices are stored in piastres (`price_minor = EGP x 100`).
- All 70 products are `active`; one Cairo Cocoa product has deliberately zero
  stock so the storefront shows a sold-out state.
- `delta-dried-flowers` is submitted as `pending` with no products so the
  platform-admin vendor review queue has a realistic item to action.
- There is one additional non-demo pending vendor (`abdelrahman-osama`) created
  during manual testing. Cleanup preserves it.
- The eight categories come from `supabase/seed.sql` and are shared platform
  data, not demo-flagged. Cleanup never removes them.
- Product images live in the public `product-images` bucket, vendor logos and
  covers in `vendor-media`, and occasion banners in `occasion-images`.

## Accounts and credentials

Vendor owner accounts:

- `nile-blossoms@demo.gifto.example`
- `cairo-cocoa@demo.gifto.example`
- `legacy-engraving@demo.gifto.example`
- `alex-toy-corner@demo.gifto.example`
- `delta-dried-flowers@demo.gifto.example`

Demo customer:

- `layla.hassan@demo.gifto.example` (8 signed-in orders in her history)

Platform admin:

- `admin@gifto.example` (not a demo-domain account; cleanup preserves it)

Passwords are never printed by seeders or stored in documentation. They live in
the git-ignored `.demo-catalog/credentials.json` under `platform-admin`,
`demo-customer`, and one key per vendor. To rotate and reveal vendor owner
passwords in your terminal:

```powershell
npm run demo:passwords
```

Treat that output as a secret. If it is exposed, run the command again; the old
passwords stop working immediately.

## Seeding and refreshing

All demo seed scripts share the same safety gate:

- `DEMO_SEED_ENV=local|preview`
- `DEMO_SEED_ALLOWED_PROJECT_REFS=<project-ref>` for hosted targets
- `DEMO_SEED_CONFIRM="SEED <script>@1"` for `--apply`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
- production environments are refused

Each script supports `--verify` (read-only) and `--apply`. Run `--verify` first.
The examples below target the hosted demo project from PowerShell.

```powershell
$env:DEMO_SEED_ENV="preview"
$env:DEMO_SEED_ALLOWED_PROJECT_REFS="hqusykdyjpruysxezsrn"
```

### 1. Catalog and artwork

The catalogue was generated from DummyJSON product data. To rebuild or refresh:

```powershell
npm run demo:catalog:dj:build
npm run demo:catalog:dj:reports
npm run demo:catalog:dj:validate
$env:DEMO_CATALOG_ENV="preview"
$env:DEMO_CATALOG_ALLOWED_PROJECT_REFS="hqusykdyjpruysxezsrn"
$env:DEMO_CATALOG_CONFIRM="IMPORT gifto-demo-catalog-dummyjson@2"
npm run demo:catalog:dj:import -- --apply
```

Generated demo artwork is local-only and can be regenerated with:

```powershell
npm run demo:seed:art
```

### 2. Vendor branding and profiles

```powershell
$env:DEMO_SEED_CONFIRM="SEED vendor-profiles@1"
npm run demo:seed:profiles -- --apply
npm run demo:seed:profiles -- --verify
```

Uploads logos and covers, sets descriptions, addresses, delivery coverage,
working hours, and prep-time ranges.

### 3. Merchandising

```powershell
$env:DEMO_SEED_CONFIRM="SEED merchandising@1"
npm run demo:seed:merchandising -- --apply
npm run demo:seed:merchandising -- --verify
```

Creates 15 tags, assigns up to 10 per product, configures 6 active occasions
with 10 curated picks and matching rules each, uploads banners, and files 3
pending tag suggestions from vendors.

### 4. Orders, commissions, and settlements

```powershell
$env:DEMO_SEED_CONFIRM="SEED orders@1"
npm run demo:seed:orders -- --apply
npm run demo:seed:orders -- --verify
```

This creates the demo customer, 40 backdated orders, all order/suborder status
transitions, two returns, one partially completed multi-vendor order, inventory
movements, commission entries, and four settlements. Order dates span roughly
81 days ago to 3 days ago.

Order mix:

- Customer orders: 8 (indexes `[2, 7, 12, 17, 21, 25, 31, 37]`)
- Guest orders: 32
- Parent statuses: 20 delivered, 2 returned, 4 cancelled, 1
  `partially_completed`, 5 shipped, 5 confirmed, 3 placed
- Multi-vendor: order 20 (`nile-blossoms` + `alex-toy-corner`, delivered) and
  order 27 (`cairo-cocoa` delivered + `alex-toy-corner` cancelled)
- Settlements: Nile paid, Legacy paid, Cairo open, Alex voided. All use the note
  prefix `DEMO-SEED:`.

Rerunning is idempotent while the demo orders are intact because placement uses
deterministic idempotency keys. If someone has manually advanced a seeded order,
the seeder may refuse to rewrite it; clean up and reapply instead.

### 5. Support requests

```powershell
$env:DEMO_SEED_CONFIRM="SEED support@1"
npm run demo:seed:support -- --apply
npm run demo:seed:support -- --verify
```

Creates 5 backdated requests across Nile Blossoms, Cairo Cocoa, Legacy
Engraving, and Alexandria Toy Corner. Subjects are the idempotency marker; an
admin editing a subject or body will make `--verify` fail.

## Demo markers and safety rules

- Vendors/products: `is_demo = true`.
- Auth users: email ends in `@demo.gifto.example`.
- Orders: `contact_email` ends in `@demo.gifto.example`; public references still
  match the production `GFT-XXXXXXXXXXXX` format.
- Settlements: note starts with `DEMO-SEED:`.
- Tags and occasions: identified by the canonical slug lists in the seed
  scripts, not by a `is_demo` column.
- `orders.status` is normally derived, but the parent sync trigger never sets
  `shipped`. The order seeder sets the 5 shipped parent orders explicitly after
  their suborders reach shipped.
- Supabase `upsert(..., { onConflict: "slug" })` is unsafe for tags/occasions
  because slug triggers rename candidates before conflict resolution. The
  merchandising seeder selects by slug and updates by id instead.
- The `set_updated_at` triggers set `updated_at = now()` on update. `created_at`
  and lifecycle timestamps (`confirmed_at`, `shipped_at`, `delivered_at`,
  `earned_at`, etc.) are backdated; `updated_at` remains the seeding time.

## Verifying the hosted deployment

Read-only SQL:

```sql
select
  (select count(*) from vendors where is_demo)                          as demo_vendors,
  (select count(*) from vendors where is_demo and status = 'active')    as active_demo_vendors,
  (select count(*) from vendors where is_demo and status = 'pending')   as pending_demo_vendors,
  (select count(*) from products where is_demo)                         as demo_products,
  (select count(*) from products where is_demo and status = 'active')   as active_demo_products,
  (select count(*) from tags)                                           as tags,
  (select count(*) from occasions where is_active)                      as active_occasions,
  (select count(*) from tag_suggestions where status = 'pending')       as pending_suggestions,
  (select count(*) from orders where contact_email like '%@demo.gifto.example') as demo_orders,
  (select count(*) from settlements where note like 'DEMO-SEED:%')     as demo_settlements,
  (select count(*) from support_requests)                               as support_requests,
  (select count(*) from auth.users where email like '%@demo.gifto.example') as demo_accounts;
```

Expected on the current hosted project: `5, 4, 1, 70, 70, 15, 6, 3, 40, 4, 5, 6`.

Public visibility check (anon key, no service role):

```powershell
curl "$env:NEXT_PUBLIC_SUPABASE_URL/rest/v1/public_vendors?select=slug" `
  -H "apikey: $env:NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

Expected: the four active demo slugs only. `delta-dried-flowers` and the
non-demo pending vendor must not appear.

## Cleanup

Cleanup removes every row and storage object attached to the demo catalog and
vendors, including orders and financial history. It is deliberately destructive.

```powershell
$env:DEMO_SEED_ENV="preview"
$env:DEMO_SEED_ALLOWED_PROJECT_REFS="hqusykdyjpruysxezsrn"
node scripts/cleanup-demo.mjs --dry-run
$env:DEMO_SEED_CONFIRM="CLEANUP demo@1"
npm run cleanup:demo
node scripts/cleanup-demo.mjs --verify
```

It removes, in order:

1. Product images for demo vendors, vendor logos/covers, and occasion banners.
2. Settlement lines and settlements for demo vendors.
3. Commission entries for demo vendors.
4. Every order that contains a demo-vendor suborder (including the 2 earlier
   guest orders).
5. Demo support requests and tag suggestions.
6. Seeded occasions and their picks, rules, and redirects.
7. Demo vendors and products, which cascades memberships, status history,
   product images, product tags, and inventory movements.
8. Seed tags that are no longer referenced by any product or occasion.
9. Auth users whose email ends in `@demo.gifto.example`.

It does not remove platform categories, the platform admin account,
non-demo vendors/products, or orders that have no demo-vendor suborders.

## Limitations and follow-ups

- `.example` addresses cannot receive mail. Password reset emails will not
  arrive; use `npm run demo:passwords` instead.
- The two earlier guest orders pre-date the demo order seed. They use the demo
  vendors, so cleanup removes them to satisfy the vendor foreign keys.
- Support requests are backdated by `created_at`; `updated_at` reflects the seed
  run because of the shared update trigger.
- Demo accounts are real auth users in the hosted project. They can sign in and
  edit only their own demo shops. Delete them with the cleanup command when the
  demo is no longer needed.
