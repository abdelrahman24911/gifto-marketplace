# Gifto image optimization pack

Generated locally on 2026-11-16 from the hosted catalogue and occasion images. This pack is an owner-operated set of derivatives; no hosted object, database row, or application code was changed.

## Summary

| Metric | Value |
| --- | --- |
| Source images | 27 |
| Optimized images | 26 |
| Skipped images | 1 (Ramadan occasion source) |
| Source bytes | 8,004,114 |
| WebP bytes (26 files) | 711,186 |
| AVIF bytes (26 files) | 516,651 |
| WebP saving | 91.03% projected library |
| AVIF saving | 93.46% projected library |
| Product images | 25 source files across 24 products |
| Occasion images | 2 (Graduation optimized; Ramadan needs a new source) |

The projected library figures keep the original Ramadan file, because re-encoding it produced larger files and would reduce quality.

## Folder layout

```text
docs/launch/image-optimization/
  README.md
  manifest.json
  manifest.csv
  optimized/
    webp/
      product-images/<vendor-id>/<product-id>/<source-stem>.webp
      occasion-images/<occasion-id>/<source-stem>.webp
    avif/
      product-images/<vendor-id>/<product-id>/<source-stem>.avif
      occasion-images/<occasion-id>/<source-stem>.avif
```

The folder structure mirrors the Supabase Storage object paths, with only the extension changed. `manifest.json` is the authoritative mapping; `manifest.csv` is the same data for spreadsheet review.

## What was changed

- Product images keep their source dimensions.
- The Graduation occasion image was resized from 3734×2667 to 1200×857; all other optimized images keep their source dimensions.
- WebP uses quality 82, effort 6, smart subsampling; AVIF uses quality 60, effort 7.
- EXIF orientation is normalized and encoder metadata is stripped.
- The Ramadan occasion image is intentionally absent: its source is only 354×234 and both derivatives are larger than the 6,822-byte original.

The seven large product images are the main win: they are screenshots from the toy shop, 0.43–1.76 MB each. They now package into roughly 18–226 KB WebP and 13–161 KB AVIF files. The 18 small 800×800 product images are already small; their derivatives are mostly 2–4 KB.

## How to use this pack

1. Review the optimized file and the suggested alt text in `manifest.json`.
2. Prefer AVIF for browsers that support it; keep WebP as the broad fallback.
3. Upload the selected derivative as a **new** Storage object. Do not overwrite or delete the original object; Storage uploads use fresh UUID paths and the app expects immutable public URLs.
4. Update the relevant `product_images.path` or `occasions.image_path` and its alt text after upload.
5. Verify the product card, product gallery, occasion card, and occasion detail page in preview.
6. Remove the old object only after the new path has been verified and a rollback path exists.

The derivatives are not copied into `public/` and are not wired into the application. They are source assets for the owner’s hosted update process.

## Owner actions and caveats

- **Alt text:** Seven toy images still have `Screenshot 2026-...` alt text. `manifest.json` marks these as `altAction: "replace"` and supplies the product name as a starting suggestion. Do not ship the screenshot filenames as alt text.
- **Ramadan image:** Replace the 354×234 source with at least 1200×800, preferably 1600×1200 or larger. The current source cannot support a sharp detail-page hero.
- **Ramadan slug:** The catalogue currently uses `ramdan-night`. Keep that slug stable until a redirect/migration is approved; the display name is normalized separately.
- **Graduation:** The 1200×857 derivative is intentional for the detail hero/card; do not upload the 3734×2667 original as a browser asset unless a larger art-directed hero is needed.
- **Quality check:** Review the derivatives at 1× and 2× on the actual card and detail layouts before uploading. The original hosted images remain available for comparison.
- **No automatic optimizer fix:** The application still asks Next.js to optimize hosted originals. This pack reduces the source bytes the optimizer and browser must fetch, but it does not replace hosted assets by itself.

## Reproducing the derivatives

The pack was generated from a read-only download of the hosted public objects using `sharp` 0.35.5. The source manifest, dimensions, and download results are kept outside the repository in the local temp work area used for the audit. The exact encoder settings are recorded in `manifest.json`. If the hosted catalogue changes, regenerate from the new source images rather than mixing versions.

## Validation

- 26 WebP files and 26 AVIF files are present; the Ramadan source is intentionally skipped.
- WebP and AVIF metadata dimensions match the manifest.
- Each manifest row records source and derivative SHA-256 hashes, dimensions, bytes, reduction percentage, alt status, and recommended owner action.
