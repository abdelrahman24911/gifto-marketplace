# Demo Data Guide

How the Gifto demo catalog is deployed, inspected, edited, re-seeded, and removed.

## Status at a glance

| Item | Value |
| --- | --- |
| Supabase project ref | `hqusykdyjpruysxezsrn` (`gifto`, `eu-central-1`) |
| Remote migrations applied | `00000000000001` – `00000000000013` |
| Demo vendors | 5 (4 `active`, 1 `pending`) |
| Demo products | 24 (all `active`, all `is_demo = true`) |
| Platform categories | 8 (shared, not demo-only) |
| Demo owner accounts | 5 (`@demo.gifto.example`) |
| Product images | 24 generated PNGs in the public `product-images` bucket |
| Demo orders | none (intentional — see Limitations) |

Everything seeded by this workflow is tagged with `is_demo = true` on `vendors`
and `products`. Public storefront rendering is unchanged; the flag exists so
admin tooling and cleanup can identify seeded rows safely.

## What the catalog contains

| Vendor | Slug | City | Status | Commission | Products |
| --- | --- | --- | --- | --- | --- |
| Nile Blossoms | `nile-blossoms` | Alexandria | active | 12% | 6 |
| Cairo Cocoa & Confections | `cairo-cocoa` | Cairo | active | 15% | 6 |
| Legacy Engraving Studio | `legacy-engraving` | Luxor | active | 10% | 6 |
| Alexandria Toy Corner | `alex-toy-corner` | Alexandria | active | 12% | 6 |
| Delta Dried Flowers | `delta-dried-flowers` | Damietta | pending | 10% | 0 |

- Prices are stored in **piastres** (`price_minor = EGP × 100`); seeded prices
  range from EGP 190 to EGP 1,450.
- Stock ranges from 8 to 50 units per product.
- `delta-dried-flowers` is deliberately submitted as `pending` with no products
  so the platform-admin vendor review queue has a realistic item to action.
- The eight categories come from `supabase/seed.sql` and are shared platform
  data, not demo-flagged. Cleanup never removes them.
- Each product has one generated 800×800 gradient placeholder at
  `product-images/{vendor_id}/{product_id}/hero-1.png`. Replace these with real
  photos through the vendor UI whenever you want better visuals.

## Demo owner accounts

One owner account exists per vendor, using the reserved `.example` TLD so no
real mail can ever be delivered:

- `nile-blossoms@demo.gifto.example`
- `cairo-cocoa@demo.gifto.example`
- `legacy-engraving@demo.gifto.example`
- `alex-toy-corner@demo.gifto.example`
- `delta-dried-flowers@demo.gifto.example`

### Getting a password

Passwords are never stored in the repository, printed by the seeder, or
recorded in documentation. To sign in, rotate and reveal fresh credentials in
your own terminal:

```bash
npm run demo:passwords
```

The script prints one email + password per account and invalidates the previous
password on every run. Treat that output as a secret: do not paste it into
issues, docs, chat, or commit it. If an output is ever exposed, simply run the
script again — the old passwords stop working immediately.

## Where to look in the app

- `/shops` — storefront directory; shows the 4 `active` demo vendors.
- `/admin` — vendor approval queue; `Delta Dried Flowers` appears as `pending`.
- `/vendor` — vendor dashboard for the signed-in owner (products, images,
  inventory). This is the supported path for editing demo products; the admin
  UI intentionally has no product CRUD.

A platform-admin account is **not** seeded. If one is needed, follow the
guard-free bootstrap procedure in
`docs/LAUNCH_READINESS_PLAN_REVIEW.md` §5 and keep the credentials out of the
repository.

## Editing demo data

- Sign in as a vendor owner and use `/vendor` to add, edit, archive products,
  upload images, and adjust stock. Changes persist normally.
- Re-running the seeder is safe and idempotent. It refreshes descriptive fields
  (name, description, city, coverage, contact, price, stock, category) but
  **never changes vendor status or commission** — the
  `vendors_guard_finance_fields` trigger rejects those updates even for the
  service role. Change status/commission through the platform-admin UI.
- The seeder refuses to touch a vendor or product whose slug already exists
  without `is_demo = true`, so a real row can never be overwritten by accident.

## Re-seeding

```bash
npm run seed:demo
```

Behavior:

- Creates missing categories, vendors, products, owner accounts, memberships,
  and images.
- Updates existing **demo** rows' descriptive fields in place.
- Re-uploads placeholder images with `upsert` and does not duplicate
  `product_images` rows.
- Leaves non-demo data untouched.
- Prints counts only; it does not print credentials.

Preflight checks fail fast if the `is_demo` column is missing. If the
`product-images` bucket is missing, it warns and seeds the catalog without
images (re-run after the bucket exists).

## Verifying the deployment

Read-only checks (run in the SQL editor or through the Supabase MCP server):

```sql
select
  (select count(*) from categories)                                        as categories,
  (select count(*) from vendors where is_demo)                             as demo_vendors,
  (select count(*) from vendors where is_demo and status = 'active')       as active_demo_vendors,
  (select count(*) from vendors where is_demo and status = 'pending')      as pending_demo_vendors,
  (select count(*) from products where is_demo)                            as demo_products,
  (select count(*) from vendors where not is_demo)                         as non_demo_vendors,
  (select count(*) from products where not is_demo)                        as non_demo_products,
  (select count(*) from product_images)                                    as product_images,
  (select count(*) from auth.users
     where email like '%@demo.gifto.example')                              as demo_accounts,
  (select count(*) from storage.objects
     where bucket_id = 'product-images')                                   as stored_images;
```

Expected: `8, 5, 4, 1, 24, 0, 0, 24, 5, 24`.

Public visibility check (anon key, no service role):

```bash
curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/public_vendors?select=slug"
```

Expected: the four active slugs only — `delta-dried-flowers` must not appear.

Image check: open any public URL of the form
`{SUPABASE_URL}/storage/v1/object/public/product-images/{vendor_id}/{product_id}/hero-1.png`.
It should return `200 image/png`.

## Cleanup

```bash
npm run cleanup:demo
```

Removes, in order:

1. Every object under demo vendor folders in the `product-images` bucket.
2. Every vendor with `is_demo = true` (products, images, memberships and
   vendor-scoped rows cascade).
3. Every auth user whose email ends in `@demo.gifto.example`.

It does **not** remove categories, real vendors/products, orders, commissions,
or inventory ledger rows. Run it deliberately — it is destructive to all demo
data and is not part of normal deployment.

## Deployment mechanics and future migrations

Migrations `00000000000008` (security hardening), `00000000000009`
(product-image bucket and policies), `00000000000010` (`is_demo` columns),
`00000000000011` (guest checkout), `00000000000012` (order-table least-privilege
grants), and `00000000000013` (failed COD delivery) are applied and recorded in
`supabase_migrations.schema_migrations`. The remote history is now `1`-`13`.
The local migration files remain the source of truth; the newest history rows
were normalized to the local version names after applying the SQL because the
MCP migration tool timestamps versions differently.

For future migrations, either:

- **Supabase CLI:** `npx supabase login`, then `npx supabase db push`
  (interactive; requires the database password), or
- **Supabase MCP / Management API:** the same OAuth session can run DDL and
  record migration history without a database password.

The Supabase MCP server is configured in the global opencode config
(`~/.config/opencode/opencode.json` or `opencode.jsonc`) and authenticated with
`opencode mcp auth supabase`. Restart opencode after editing MCP config so the
server's tools load.

Environment variables used by the scripts (names only — values live in
`.env.local`, which is git-ignored):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (only for public visibility checks)

## Limitations and follow-ups

- **No demo orders.** The checkout RPCs (`place_order_with_idempotency` for
  signed-in customers, `place_guest_order` for guests) and the database triggers
  are the only writers of order, inventory, and commission ledger rows;
  fabricating orders directly would create financial history that never
  happened. Create orders through the real checkout flow if you need them.
- **Placeholder art.** The gradient PNGs are generated locally (no external
  fetches) and are meant to be replaced with real photography.
- **Five owner accounts, not four.** The pending vendor needs an owner to be
  reviewable and editable after approval; this is the only deviation from the
  originally discussed four.
- **`.example` addresses cannot receive mail.** Password reset emails will not
  arrive; use `npm run demo:passwords` instead.
- **Demo accounts are real auth users** in the production project. They can sign
  in and edit only their own demo shops. Rotate or delete them via
  `cleanup:demo` when the demo is no longer needed.
