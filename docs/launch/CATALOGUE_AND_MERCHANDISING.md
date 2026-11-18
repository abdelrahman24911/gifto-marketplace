# Catalogue and merchandising review

Read-only review of the hosted catalogue on 2026-11-16. No product, occasion, category, tag, image, or rule was changed.

## Current snapshot

| Item | Value |
| --- | --- |
| Active products | 24 |
| Active vendors | 4 |
| Active categories | 8 |
| Active occasions | 2 |
| Manual occasion products | 0 |
| Occasion category rules | 0 |
| Occasion tag rules | 0 |
| Approved tags | 0 |
| Product tags | 0 |
| Product images | 25 across 24 products |

Both occasions are configured as `match_mode = hybrid`, but their manual, category, and tag rule tables are empty. As a result:

- `/occasions/graduation` and `/occasions/ramdan-night` render the “No gifts here yet” state.
- The homepage occasion cards can be promoted, but the destination pages have no products.
- The Gift Finder still returns category-derived results because it uses a separate category mapping, not the occasion matching tables.

## Gift Finder vs. occasion pages

The two surfaces currently use different merchandising rules:

- **Occasion pages** call `get_occasion_products`, which combines manual picks, category rules, and tag rules.
- **Gift Finder** uses hardcoded category slugs in `src/lib/gift-finder.ts`; it does not call `get_occasion_products`.

That causes a visible inconsistency:

| Surface | Graduation result | Ramadan result |
| --- | --- | --- |
| Occasion page | 0 products | 0 products |
| Gift Finder (`limit=24`) | 10 products | 6 products |

“Graduation Flower Box” is the most obvious Graduation product in the catalogue, but it is in the `Occasions` category, so the Graduation Gift Finder mapping excludes it. This is a merchandising and architecture gap, not a filtering bug.

**Recommendation:** populate the occasion pages with manual picks now, then either add the relevant categories to `OCCASION_CATEGORY_SLUGS` or, preferably, make Gift Finder read `get_occasion_products` and filter that result by recipient/budget. Until the latter is done, document that Gift Finder and the occasion page can show different sets.

## Recommended occasion picks

These are manual `occasion_products` candidates. They are all active, in stock, and belong to active public vendors. Sort order is suggested top to bottom.

### Graduation (6)

| Product | Price | Stock | Vendor | Product ID |
| --- | ---: | ---: | --- | --- |
| Graduation Flower Box | EGP 560 | 18 | Nile Blossoms | `e10c701d-88f3-4baf-901b-5f557d55af6e` |
| Personalized Photo Frame (Oak) | EGP 270 | 28 | Legacy Engraving Studio | `93437f30-0175-43f9-82e7-b5d79cc5ae17` |
| Monogram Leather Journal | EGP 320 | 22 | Legacy Engraving Studio | `46c2751c-49ca-47ab-9d2a-671ffc4546c7` |
| Engraved Walnut Keepsake Box | EGP 480 | 16 | Legacy Engraving Studio | `0b931a0b-2061-4108-b363-54ac53b5a96b` |
| Classic Red Rose Bouquet | EGP 450 | 24 | Nile Blossoms | `a5fd1ae1-f6d1-444c-afe2-9566dcb7b456` |
| Luxury Chocolate Tower (3 tiers) | EGP 1,450 | 8 | Cairo Cocoa & Confections | `b5bb48af-3186-410d-b0b7-3717e3b57f36` |

Why these: one unmistakable graduation gift, three personalised keepsakes, one classic flower option, and one celebration chocolate centrepiece. All have healthy stock except the tower, which should be monitored because it is the highest-price item.

### Ramadan (6)

| Product | Price | Stock | Vendor | Product ID |
| --- | ---: | ---: | --- | --- |
| Egyptian Date & Chocolate Gift Box | EGP 290 | 35 | Cairo Cocoa & Confections | `ac17fb96-12ea-4ed8-bda2-c1ced565b0e9` |
| Assorted Bonbon Bag (24 pc) | EGP 340 | 30 | Cairo Cocoa & Confections | `5273a63b-839b-48f9-8955-2b0917144b48` |
| Belgian Dark Truffle Box (16 pc) | EGP 380 | 40 | Cairo Cocoa & Confections | `36815eb6-6a28-4012-8a01-23c5d8c8e6e7` |
| Pistachio Baklava Tray (1 kg) | EGP 420 | 20 | Cairo Cocoa & Confections | `433730a7-2fac-455f-aa0e-fe07bc480ac0` |
| Molten Cake Dessert Kit | EGP 260 | 25 | Cairo Cocoa & Confections | `0a6e992c-a9e9-4e76-8056-935a80294665` |
| Luxury Chocolate Tower (3 tiers) | EGP 1,450 | 8 | Cairo Cocoa & Confections | `b5bb48af-3186-410d-b0b7-3717e3b57f36` |

Why these: dates, chocolate, baklava, and a hosting dessert form a coherent Ramadan gifting set. This is a thin seasonal assortment, not a full Ramadan collection; the owner should add at least one non-food gift (for example a lantern, decor, or personalised item) before treating Ramadan as a major campaign.

## Suggested admin steps

1. Open **Admin → Occasions → Graduation → Edit**.
2. Keep `match_mode` as `hybrid`; add the six Graduation products above as manual picks in the listed order.
3. Do not add broad categories unless the owner wants every product in that category to appear; manual picks are safer for a launch assortment.
4. Repeat for **Ramadan Night** with the six Ramadan picks.
5. Preview both public pages and the Gift Finder; record the resulting counts and any duplicate products.
6. Decide whether the `Occasions` category should remain in the storefront category grid. It currently contains only “Graduation Flower Box” and overlaps the occasion navigation.

## Category and data risks

- **No tags exist.** Automatic tag-based occasion rules cannot work until approved tags and product tags are created. Use manual picks or category rules for now.
- **Sparse categories.** `gift-boxes` and `corporate-gifts` each contain one product; `Occasions` contains one. Category tiles may look fuller than the underlying assortment.
- **Low stock not surfaced in this report.** Stock was read on 2026-11-16; recheck before launch. The Luxury Chocolate Tower has the lowest stock among the recommended picks (8).
- **No occasion redirect exists.** `ramdan-night` is a live slug with no `occasion_slug_redirects` row. The display name is normalised to “Ramadan Night”, but URLs and links still use the misspelled slug. Keep it stable until an owner-approved migration/redirect is planned.
- **Images:** see `docs/launch/image-optimization/README.md`. The Ramadan occasion image is only 354×234 and needs replacement. Seven toy product images have screenshot filenames used as alt text and should be corrected even if the images themselves are kept.

## Launch recommendation

Do not promote Graduation or Ramadan as complete shopping destinations until both occasion pages have manual picks and the Ramadan image is replaced. If the owner prefers to launch without seasonal curation, keep those occasion cards out of the primary campaign and label the pages as early collections rather than complete assortments.
