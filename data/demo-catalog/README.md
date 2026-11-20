# Gifto demo catalogue

A versioned, removable demo assortment of 52 gift products for founder and vendor-acquisition demos. The catalogue is designed to sit on top of the existing Gifto product, vendor and category model without a migration, without a runtime third-party API, and without using the Supabase service-role key.

**Status:** the dataset, artwork and import/rollback tooling are prepared locally. No hosted import has been run and no hosted occasion mapping has been changed.

## What is in the box

| Item | Value |
| --- | --- |
| Dataset | `gifto-demo-catalog` version `1` |
| Products | 52 |
| Vendors | 4 existing active demo vendors |
| Categories | 5 existing platform categories |
| Images | 52 original 1024x1024 JPEGs in `images/` |
| Price currency | EGP (stored as integer piastres by the importer) |
| Occasion proposal | 12 Graduation + 12 Ramadan Night picks; not applied |

### Product mix

| Collection | Products | Existing category | Vendor |
| --- | ---: | --- | --- |
| Flowers | 8 | `flowers` | Nile Blossoms |
| Chocolates & Sweets | 10 | `chocolates-sweets` | Cairo Cocoa & Confections |
| Personalized Gifts | 8 | `personalized-gifts` | Legacy Engraving Studio |
| Gift Boxes | 8 | `gift-boxes` | 4 Cairo Cocoa, 4 Legacy Engraving |
| Perfumes & Accessories | 6 | `personalized-gifts` fallback | Legacy Engraving Studio |
| Toys & Cute Gifts | 6 | `toys-kids` | Alexandria Toy Corner |
| Home & Lifestyle | 6 | `gift-boxes` fallback | Nile Blossoms |

There is no Perfumes & Accessories or Home & Lifestyle category in the current hosted taxonomy. The fallback mapping keeps the catalogue importable without inventing platform taxonomy. It is intentionally recorded in the data and importer rather than hidden in code.

### Vendor distribution

| Vendor slug | Products |
| --- | ---: |
| `nile-blossoms` | 14 |
| `cairo-cocoa` | 14 |
| `legacy-engraving` | 18 |
| `alex-toy-corner` | 6 |

`delta-dried-flowers` is pending and excluded. The 24 pre-existing demo products are not part of this dataset and are never removed by this catalogue's rollback.

## Source and image policy

DummyJSON was used to shortlist nine generic gift concepts (IDs `44`, `45`, `46`, `47`, `67`, `75`, `155`, `172`, `182`). DummyJSON's repository is MIT-licensed, but image-specific rights are not separately stated. For that reason:

- DummyJSON product images are not downloaded, copied, hotlinked or rendered.
- Every image in `images/` is original SVG artwork generated locally by `scripts/demo-catalog/generate-artwork.mjs` and captured as JPEG through Playwright/Chromium.
- Product names and descriptions were written for this demo catalogue. Candidate metadata is recorded in each product's `source` object for attribution and traceability.
- Prices are illustrative EGP demo values, not verified market prices or vendor quotations.
- No reviews, ratings, sales counts, certifications or brand claims are included.

The artwork is deliberately stylised studio illustration rather than photography. Replace it with approved vendor photography before any public campaign where photorealism is expected.

## Files

- `products.json` - canonical 52-product dataset, with vendor/category mapping, local image metadata and source attribution.
- `manifest.json` - counts, distributions, image summary and source summary.
- `occasions.proposed.json` - proposed Graduation and Ramadan Night curation. It is not imported by the catalogue importer.
- `images/` - 52 local JPEGs, one per product.
- `scripts/demo-catalog/build-dataset.mjs` - regenerates the JSON files from the curated specification and fetches DummyJSON candidate metadata only.
- `scripts/demo-catalog/generate-artwork.mjs` - regenerates every image locally.
- `scripts/demo-catalog/validate.mjs` - validates schema, counts, mapping, provenance, image dimensions and JPEG signatures.
- `scripts/demo-catalog/import.mjs` - idempotent import/refresh using demo-owner sessions and RLS.
- `scripts/demo-catalog/rollback.mjs` - removes only this dataset's exact slugs and their catalogue images.

## Regenerate and validate

```bash
npm run demo:catalog:build
npm run demo:catalog:art
npm run demo:catalog:validate
```

`build` needs network access to fetch DummyJSON candidate metadata. `art` needs the repository's installed Playwright Chromium. Neither writes to Supabase.

## Credentials

The importer and rollback use the public anon key plus a password sign-in for each vendor owner. They never read `SUPABASE_SERVICE_ROLE_KEY`, never create users, never disable RLS and never bypass vendor ownership policies.

Create a git-ignored credentials file at `.demo-catalog/credentials.json`:

```json
{
  "nile-blossoms": {
    "email": "nile-blossoms@demo.gifto.example",
    "password": "<rotated-password>"
  },
  "cairo-cocoa": {
    "email": "cairo-cocoa@demo.gifto.example",
    "password": "<rotated-password>"
  },
  "legacy-engraving": {
    "email": "legacy-engraving@demo.gifto.example",
    "password": "<rotated-password>"
  },
  "alex-toy-corner": {
    "email": "alex-toy-corner@demo.gifto.example",
    "password": "<rotated-password>"
  }
}
```

Run `npm run demo:passwords` yourself to rotate and reveal fresh demo passwords. Copy them into the credentials file; do not paste them into chat, documentation, issues or commits. The file is covered by `.gitignore` through `.demo-catalog/`.

For a hosted preview target, the target must also be explicitly allowlisted:

```bash
DEMO_CATALOG_ENV=preview
DEMO_CATALOG_ALLOWED_PROJECT_REFS=<preview-project-ref>
```

The script refuses production, refuses an unlisted project ref, and refuses a `local` target that is not localhost.

## Local plan, verification and import

The default command is a local, offline plan:

```bash
npm run demo:catalog:import
```

Read-only target verification:

```bash
npm run demo:catalog:import -- --verify
```

Perform the import:

```bash
DEMO_CATALOG_ENV=local \
DEMO_CATALOG_CONFIRM="IMPORT gifto-demo-catalog@1" \
npm run demo:catalog:import -- --apply
```

On PowerShell:

```powershell
$env:DEMO_CATALOG_ENV = "local"
$env:DEMO_CATALOG_CONFIRM = "IMPORT gifto-demo-catalog@1"
npm run demo:catalog:import -- --apply
```

The importer:

1. Validates the local dataset and all 52 JPEGs.
2. Signs in as each active demo vendor owner with the anon key.
3. Confirms each vendor is active, `is_demo = true`, and owned or managed by the signed-in account.
4. Confirms all required categories are active and all conflicting rows at the dataset slugs are demo rows.
5. Inserts missing products with the exact `demo-catalog-` slug, `is_demo = true`, initial stock and EGP minor-unit price.
6. Refreshes existing catalogue products' allowed descriptive fields only.
7. Uploads `demo-catalog-hero.jpg` only when the object is missing, then upserts the `product_images` row.
8. Verifies that all 52 products are present, active and demo-flagged.

On refresh, stock is deliberately not updated. Migration 15 restricts generic product updates and requires audited inventory changes through `adjust_product_stock`; the importer leaves any stock-adjusted value intact and reports the difference.

A failed run is safe to repeat. Inserts and image checks are idempotent, but there is no cross-vendor transaction; a mid-run failure can leave some products already imported.

## Rollback

Plan without network access:

```bash
npm run demo:catalog:rollback
```

Inspect the target without writes:

```bash
npm run demo:catalog:rollback -- --verify
```

Remove this catalogue:

```powershell
$env:DEMO_CATALOG_ENV = "local"
$env:DEMO_CATALOG_CONFIRM = "ROLLBACK gifto-demo-catalog@1"
npm run demo:catalog:rollback -- --apply
```

Rollback only targets the exact slugs in `products.json` for the four demo vendors, with `is_demo = true`. It removes the deterministic hero objects first and then deletes the products; `product_images` rows cascade. The 24 pre-existing demo products, real catalogue rows and platform categories are left alone.

## Occasion proposal

`occasions.proposed.json` contains 12 Graduation picks and 12 Ramadan Night picks using the new catalogue. It records the hosted pre-state as zero manual picks, zero category rules and zero tag rules, and is marked `proposed-not-applied`.

The proposal is not consumed by the importer. Apply it only after owner approval, using the existing admin occasion workflow and `replace_occasion_products`. Keep the live slug `ramdan-night`; display it as "Ramadan Night".

## Verification checks

```bash
npm run typecheck
npx eslint src scripts/demo-catalog
npm test
npm run build
```

The catalogue should be visible on `/shops` under each active demo vendor and in `/categories` under the mapped category. Product cards should use the local artwork after the upload. No occasion page should change until the separate occasion proposal is explicitly applied.
