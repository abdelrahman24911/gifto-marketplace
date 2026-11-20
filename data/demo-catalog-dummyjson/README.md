# DummyJSON gift edit

A second, isolated demo assortment built from **40 curated DummyJSON sample products** and their **actual product images**. It is intended to give prospective-vendor demos a stronger visual catalogue than the original 52-product v1 set.

**Status:** imported to the hosted preview. The 40 products and 40 hero images exist in the demo vendors; the latest refresh assigns the approved existing-category mapping. No category, occasion or vendor record was created or edited. The v1 catalogue and the 24 pre-existing demo products are untouched.

## Quick facts

| Item | Value |
| --- | --- |
| Dataset | `gifto-demo-catalog-dummyjson` version `1` |
| Products | 40 |
| Source catalogue | DummyJSON, one-time 194-product snapshot |
| Slugs | `demo-catalog-dj-*` |
| Vendors | 2 existing demo vendors |
| Gifto categories | `personalized-gifts` (31), `gift-boxes` (9) |
| Images | 40 actual DummyJSON WebP files, stored locally at 1000x1000 |
| Currency | EGP (the importer stores integer piastres) |
| Contact sheet | `contact-sheet.jpg` |
| Exclusion report | `exclusions.md` and `exclusions.json` |
| Imported? | Yes, hosted preview |

## Product mix

| Curation group | Products | Vendor | Existing category |
| --- | ---: | --- | --- |
| Fragrance | 5 | Nile Blossoms | `personalized-gifts` |
| Skin care | 3 | Nile Blossoms | `personalized-gifts` |
| Beauty | 5 | Nile Blossoms | `personalized-gifts` |
| Bags | 5 | Legacy Engraving | `personalized-gifts` |
| Jewellery | 3 | Legacy Engraving | `personalized-gifts` |
| Watches | 6 | Legacy Engraving | `personalized-gifts` |
| Sunglasses | 4 | Legacy Engraving | `personalized-gifts` |
| Home & living | 3 | Nile Blossoms | `gift-boxes` |
| Kitchen & dining | 6 | Nile Blossoms | `gift-boxes` |
| **Total** | **40** | | |

### Vendor distribution

| Vendor slug | Products | Existing demo products preserved |
| --- | ---: | --- |
| `nile-blossoms` | 22 | Yes |
| `legacy-engraving` | 18 | Yes |
| `cairo-cocoa` | 0 new | Yes |
| `alex-toy-corner` | 0 new | Yes |

This mapping is approved for the demo catalogue. Nile Blossoms is a florist and Legacy Engraving is a personalization studio; both are closer to the new gift-led assortment than the confectionery and toy demo vendors, but neither is a perfect lifestyle-retail fit. No new vendor is created.

### Category mapping

The existing Gifto taxonomy contains `gift-boxes`, `flowers`, `chocolates-sweets`, `cakes-baked-goods`, `personalized-gifts`, `toys-kids`, `occasions` and `corporate-gifts`. The approved compromise maps the new assortment to two existing categories instead of adding a new taxonomy:

| Curation groups | Products | Category |
| --- | ---: | --- |
| Fragrance, Skin care, Beauty, Bags, Jewellery, Watches, Sunglasses | 31 | `personalized-gifts` |
| Home & living, Kitchen & dining | 9 | `gift-boxes` |

Consequences:

- all 40 products appear in shop listings, new arrivals, search and category browse pages;
- `personalized-gifts` becomes the broadest category, with 31 new demo products;
- no category, migration or platform taxonomy change is required;
- the mapping is a demo compromise, not a claim that every item is literally personalised.

Adding dedicated lifestyle, beauty or accessories categories remains a separate product decision.

## Source and image policy

- The full DummyJSON catalogue was fetched **once** from `https://dummyjson.com/products?limit=0` and saved at `source/dummyjson-products.json`.
- Selected images were downloaded from DummyJSON's CDN and stored locally in `images/`. There are no hotlinks and no runtime DummyJSON requests.
- Each product records the DummyJSON product ID, original title, category, brand, price, product URL, thumbnail URL, full image list and selected image URL.
- DummyJSON's repository is MIT-licensed, but image-specific rights are not separately stated. This dataset is for local demos only until image usage is approved for any public campaign.
- Brand names, product titles and images are DummyJSON sample metadata. No affiliation, authenticity, stock or availability claim is made.
- DummyJSON stock, ratings, reviews, discounts, warranty text and shipping text are **not imported**.
- Prices are illustrative EGP demo values, not vendor quotations or verified market prices. Each description includes a short demo/illustrative-price disclosure.
- Source prices in USD are retained only as provenance in `source.sourcePriceUsd`.

## Curation notes

The selected set concentrates on nine visually distinct, gift-friendly lanes. Fragrance images use the boxed shot where available; the Mug Tree Stand uses its filled-mugs image so the product is immediately understandable.

Rejected products include:

- an entire non-food scope layer: groceries, electronics, vehicles, furniture, apparel and footwear;
- duplicate or near-duplicate luxury watches;
- novelty party glasses;
- oversized or visually weak home pieces;
- ordinary single kitchen utensils and bulky appliances.

The full 154-item rejection set with a reason per product is in `exclusions.md`. The category summary shows that 40 of 194 products were selected.

## Files

- `products.json` - canonical 40-product dataset with source provenance, vendor mapping, approved existing-category mapping and local image metadata.
- `manifest.json` - counts, distributions, source summary, image summary and report paths.
- `contact-sheet.jpg` - visual review sheet of all 40 selected images, prices and vendors.
- `exclusions.md` - human-readable 154-product exclusion report.
- `exclusions.json` - machine-readable exclusion report.
- `images/` - 40 local WebP files, named `gdj-001.webp` through `gdj-040.webp`.
- `source/dummyjson-products.json` - the one-time 194-product source snapshot.
- `scripts/demo-catalog-dummyjson/build-dataset.mjs` - rebuilds the JSON from the source snapshot, curation entries and local WebP files. It does not use the network.
- `scripts/demo-catalog-dummyjson/build-reports.mjs` - regenerates the contact sheet and exclusion reports. It needs Playwright Chromium.
- `scripts/demo-catalog-dummyjson/shared.mjs` - schema, counts, image validation and target guards.
- `scripts/demo-catalog-dummyjson/validate.mjs` - offline validation.
- `scripts/demo-catalog-dummyjson/import.mjs` - idempotent import/refresh using demo-owner sessions and RLS.
- `scripts/demo-catalog-dummyjson/rollback.mjs` - removes only this dataset's exact slugs and images.

## Regenerate and validate

```powershell
npm run demo:catalog:dj:build
npm run demo:catalog:dj:reports
npm run demo:catalog:dj:validate
```

`build` reads the committed snapshot and local images; it does not make network requests. `reports` uses the repository's installed Playwright Chromium to render `contact-sheet.jpg`.

The dataset is ready for import only after validation passes. Regenerate reports after changing the mapping, then run hosted `--verify` before `--apply`.

## Local plan, verification and import

The default command is an offline plan:

```powershell
npm run demo:catalog:dj:import
```

Read-only target verification:

```powershell
npm run demo:catalog:dj:import -- --verify
```

Apply after explicit approval:

```powershell
$env:DEMO_CATALOG_ENV = "local"
$env:DEMO_CATALOG_CONFIRM = "IMPORT gifto-demo-catalog-dummyjson@1"
npm run demo:catalog:dj:import -- --apply
```

For a hosted preview, also set `DEMO_CATALOG_ALLOWED_PROJECT_REFS` to the allowlisted project ref. The shared guard refuses production, an unlisted ref, or a non-local `local` target.

The v2 importer:

1. Validates the dataset, 40 local WebP images, contact sheet and exclusion reports.
2. Signs in as the Nile Blossoms and Legacy Engraving demo owners with the anon key.
3. Confirms each vendor is active, `is_demo = true`, and owned or managed by the signed-in account.
4. Refuses to overwrite any non-demo slug.
5. Resolves the two approved category slugs to existing category IDs and refuses to continue if either category is missing or inactive.
6. Inserts missing products with `demo-catalog-dj-*` slugs, `is_demo = true`, initial stock, EGP minor-unit prices and the mapped `category_id`.
7. Refreshes descriptive fields, category and image alt text on existing v2 products, while preserving live stock.
8. Uploads `demo-catalog-dj-hero.webp` only when missing, then upserts the `product_images` row.
9. Verifies all 40 products are active, demo-flagged and assigned to the expected category.

The service-role key is never read. Existing v1 `demo-catalog-*` products and the 24 pre-existing demo products are not part of the import scope.

## Rollback

Plan offline:

```powershell
npm run demo:catalog:dj:rollback
```

Inspect without writes:

```powershell
npm run demo:catalog:dj:rollback -- --verify
```

Remove only this dataset:

```powershell
$env:DEMO_CATALOG_ENV = "local"
$env:DEMO_CATALOG_CONFIRM = "ROLLBACK gifto-demo-catalog-dummyjson@1"
npm run demo:catalog:dj:rollback -- --apply
```

Rollback targets only the exact `demo-catalog-dj-*` slugs in `products.json`, the two mapped demo vendors and `is_demo = true` rows. It removes the dataset's image objects and cascades `product_images`; it does not remove v1, the 24 pre-existing demo products, categories or occasions.

## Credentials

Credentials use the same git-ignored `.demo-catalog/credentials.json` file as v1, or `DEMO_CATALOG_CREDENTIALS_FILE`. Only `nile-blossoms` and `legacy-engraving` are required for this dataset. Run `npm run demo:passwords` yourself if rotation is needed; never paste passwords into chat, docs or commits.

## Approval status

Approved and applied:

1. Contact sheet and product mix.
2. Vendor mapping to Nile Blossoms and Legacy Engraving.
3. Existing-category mapping: 31 to `personalized-gifts`, 9 to `gift-boxes`.
4. DummyJSON image and brand-disclosure approach for demo use.
5. Allowlisted hosted preview target and rotated demo-owner credentials.

Any further hosted change still requires `--verify` before `--apply` and explicit approval.
