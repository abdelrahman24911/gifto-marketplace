> **HISTORICAL - 2026-11-22 (P0 remediation).** Dated readiness snapshot at `5aee211`; its CSP report-only and no-CI statements are no longer current. CSP is now enforced with a per-request nonce (`src/proxy.ts`), and CI has app, security-header Playwright, and RLS jobs. Current state: `README.md`, `docs/HOSTED_STATE.md`, `docs/launch/CSP_ENFORCEMENT_PLAN.md`. Kept as a record; its findings were not edited.

# HOMEPAGE-04 launch readiness report

**Date:** 2026-11-16  
**Branch:** `preview/search-overflow-security-headers`  
**HEAD:** `5aee2112d0e0ad8b7e907c9933a0b8f1190de3ae`  
**Classification: CONDITIONALLY READY for a limited/soft launch; NOT READY for a full public launch.**

The application code, accessibility, responsive behavior, 404 semantics, and automated gates pass. Full public launch is blocked by catalogue curation, the low-resolution Ramadan image, unresolved owner/legal decisions, and the absence of a verified backup/RLS run. None of those blockers require reverting the code fixes below.

## 1. What this phase changed

### Code and behavior

- Fixed the 320px horizontal overflow in `src/components/shop-card.tsx` by allowing the card and its flex row to shrink (`min-w-0`).
- Fixed the quick-add accessible name in `src/components/quick-add-button.tsx`: it now includes the visible “Add to cart” label plus the product name, and changes to “Added to cart: ...” after success.
- Fixed the hero trust-list contrast by changing `text-ink-mute` to `text-ink-soft` in `src/components/home/hero.tsx`.
- Added consistent 2px focus-visible rings to the Cart link, section “view all” links, and account fallbacks in `src/components/site-header.tsx` and `src/components/ui/section.tsx`.
- Added regression coverage in `tests/homepage.spec.ts` for 320px overflow and the quick-add accessible name.
- Changed unknown catalogue routes to return real 404s by removing the route-level loading boundaries that streamed a 200 response before `notFound()`:
  - `src/app/(storefront)/loading.tsx`
  - `src/app/(storefront)/categories/loading.tsx`
  - `src/app/(storefront)/categories/[slug]/loading.tsx`
  - `src/app/(storefront)/occasions/loading.tsx`
  - `src/app/(storefront)/occasions/[slug]/loading.tsx`
  - `src/app/(storefront)/shops/loading.tsx`
  - `src/app/(storefront)/shops/[slug]/loading.tsx`
- Kept `src/app/(storefront)/search/loading.tsx` because search has no unknown dynamic child.
- Updated `tests/seo.spec.ts` to assert HTTP 404 plus `robots=noindex` for unknown occasion, category, shop, and product URLs.

Trade-off: homepage/catalog client navigation no longer shows the former route-level skeleton while loading. This was accepted in exchange for correct 404 semantics. If skeleton UX is required later, add page-level Suspense after existence validation instead of restoring the old boundaries.

### Documentation and assets

- Added `docs/launch/CATALOGUE_AND_MERCHANDISING.md`.
- Added `docs/launch/CSP_ENFORCEMENT_PLAN.md`.
- Added `docs/launch/OWNER_INPUT_CHECKLIST.md`.
- Added `docs/launch/SMOKE_TEST_PLAN.md`.
- Added `docs/launch/image-optimization/` with 26 WebP files, 26 AVIF files, `manifest.json`, `manifest.csv`, and `README.md`.
- No hosted object, database row, migration, RLS policy, Storage upload, production environment variable, or deployment was changed.
- Nothing was committed, pushed, merged, or deployed.

## 2. Validation evidence

| Gate | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npx eslint src` | Passed |
| `npm test` | 36 files / 342 tests passed |
| `npm run build` | Passed; Next.js 16.4.2 webpack build and Tailwind verification passed |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 npm run test:e2e` | 35 tests: 29 passed, 6 expected admin-auth skips |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| Unknown catalogue routes | All tested paths return 404 and noindex |
| Responsive audit | No horizontal overflow at 320, 390, 768, 1024, or 1440 |
| Axe WCAG A/AA | 0 violations at all five viewports |
| Keyboard focus | 2px solid focus rings; no missing outline in the 18-step desktop sequence |
| Mobile menu | Dialog, focus trap, Escape, focus restoration, scroll lock all pass |
| Gift Finder | 8 initial / 24 total; Show more → 16 → 24; summary focused after exhaustion |
| Reduced motion | 0 running animations; `.gifto-rise` animation is `none` |
| Queue/loading errors | No console/page errors in the final homepage audit |
| Gift Finder API | Graduation 10 results; Ramadan 6; valid filters 200; invalid filters 400; failure path 503 with `no-store` |

The axe “color-contrast incomplete” count is 62–69 nodes because many sections use gradients/blurs. Manual token verification after the fix:

- `ink` on solid surfaces: 10.52–14.21:1
- `ink-soft` on solid surfaces: 5.37–7.26:1
- `ink-mute` on paper/paper-soft/paper-deep: 4.84–5.35:1
- Hero trust list now uses `ink-soft`, not muted text
- No essential homepage text was found over `berry-tint` or `gold-soft` with `ink-mute`

## 3. Findings fixed in this phase

### High/medium UI and accessibility

- **320px shop-card overflow:** Fixed with `min-w-0`; document and body scroll width now equal viewport width at 320.
- **Quick-add accessible-name mismatch:** Fixed; the visible label is contained in the accessible name.
- **Hero trust-list contrast:** Fixed from 4.38:1 to the `ink-soft` range.
- **Inconsistent focus rings:** Fixed on Cart, section links, and account icon fallbacks.
- **Unknown catalogue URLs returning 200:** Fixed with real 404s; verified in production build and E2E.

## 4. Remaining launch findings

### P0 — owner/content blockers

1. **Occasion pages are empty.** Both occasions are `hybrid` with zero manual products, zero category rules, and zero tag rules. `/occasions/graduation` and `/occasions/ramdan-night` show “No gifts here yet” while the homepage promotes them.
2. **Ramadan hero is too low-resolution.** The source is 354×234 / 6.8 KB. Replace it with at least 1200×800, preferably 1600×1200+.
3. **Owner/legal/support inputs are incomplete.** Policies, business identity, delivery/refund wording, support contacts, and the three open decisions in `docs/OWNER_DECISIONS_BRIEF.md` need owner approval.
4. **No verified backup/PITR and no run SQL/RLS suite.** These are inherited operational gates; the app-code work does not prove database safety.

### P1 — launch quality and consistency

5. **Gift Finder and occasion pages disagree.** Gift Finder returns 10 Graduation and 6 Ramadan products from category mappings, while occasion pages return 0. “Graduation Flower Box” is excluded from the Graduation Gift Finder because it is in the `Occasions` category. Either curate both surfaces separately or unify Gift Finder on `get_occasion_products`.
6. **Image derivatives are not uploaded.** Hosted originals remain heavy; the 8 MB source library can be reduced to roughly 0.72 MB WebP or 0.52 MB AVIF. Until the owner uploads and re-points records, the Next.js optimizer still processes the large sources.
7. **CSP is report-only.** Script enforcement needs a per-request nonce; style enforcement needs chart refactoring. See `CSP_ENFORCEMENT_PLAN.md`.
8. **No route-level loading skeletons for home/catalog after the 404 fix.** Functional tests pass; assess perceived speed during the owner smoke test.
9. **Search wildcard characters are not escaped.** Supabase parameterization prevents SQL injection, but `%` and `_` can broaden search unexpectedly; harden in a follow-up.

### P2 — catalogue/ops polish

10. **No tags and sparse categories.** `Gift Boxes`, `Corporate Gifts`, and `Occasions` each contain one product; automatic occasion tag rules cannot work until tags exist.
11. **Ramadan slug remains `ramdan-night`.** Display is normalized to “Ramadan Night”; keep the slug stable until an owner-approved redirect/migration.
12. **No CI/CD, staging, error tracking, or alerts.** The local validation is strong but manual.
13. **Gallery/occasion hero quality depends on owner assets.** Seven toy images have screenshot filenames as alt text; the manifest supplies suggested replacements.

## 5. Image optimization result

| Metric | Value |
| --- | --- |
| Source files | 27 |
| Optimized derivatives | 26 WebP + 26 AVIF |
| Skipped | Ramadan occasion image |
| Source bytes | 8,004,114 |
| WebP bytes | 711,186 |
| AVIF bytes | 516,651 |
| Projected WebP saving | 91.03% |
| Projected AVIF saving | 93.46% |

The seven large toy images account for most of the savings. The Ramadan file is intentionally not replaced because its re-encoded copies are larger than the 6.8 KB original and its source resolution is insufficient. See `docs/launch/image-optimization/README.md` for upload rules and the exact manifest.

## 6. Readiness scorecard

| Area | Status | Notes |
| --- | --- | --- |
| Build and unit tests | PASS | 342 tests, clean typecheck/eslint/build |
| E2E | PASS | 29 passed, 6 expected admin skips |
| Accessibility | PASS with manual caveat | Axe 0; gradient nodes manually checked |
| Responsive layout | PASS | 320–1440 |
| 404/SEO | PASS | Real 404 + noindex; valid routes 200 |
| Gift Finder interaction | PASS | 8→16→24, focus restoration |
| Security boundaries | PASS with inherited caveats | Anon/service split, RLS/proxy design; SQL/RLS suite not run |
| CSP | CONDITIONAL | Report-only; staged plan documented |
| Image performance | CONDITIONAL | Pack ready; not uploaded/wired |
| Catalogue/merchandising | FAIL | 0 occasion products; sparse seasonal assortment |
| Owner content/legal | FAIL | Inputs outstanding |
| Production operations | CONDITIONAL | No verified backup/RLS/CI |

## 7. Recommended launch decision

**Do not run a full public launch yet.** The code is ready enough for a controlled preview or soft launch after the P0 owner actions. Before promoting the homepage:

1. Curate Graduation and Ramadan with the six recommended picks in `CATALOGUE_AND_MERCHANDISING.md`.
2. Replace the Ramadan image and approve the optimized image pack; fix screenshot alt text.
3. Resolve owner decisions and policy/legal/support content.
4. Confirm backup/PITR and either run or explicitly accept the SQL/RLS gap.
5. Run `SMOKE_TEST_PLAN.md` in preview, then a read-only production check.
6. Re-run the six automated gates and update this report.

**What can ship once approved:** the current code fixes, real 404s, accessibility/responsive fixes, tests, and the local image pack. **What should not ship as a full destination yet:** empty occasion pages, the low-resolution Ramadan hero, and unapproved policy content.

## 8. Exact changed files

```text
src/components/home/hero.tsx
src/components/quick-add-button.tsx
src/components/shop-card.tsx
src/components/site-header.tsx
src/components/ui/section.tsx
tests/homepage.spec.ts
tests/seo.spec.ts
docs/launch/CATALOGUE_AND_MERCHANDISING.md
docs/launch/CSP_ENFORCEMENT_PLAN.md
docs/launch/HOMEPAGE_04_READINESS_REPORT.md
docs/launch/OWNER_INPUT_CHECKLIST.md
docs/launch/SMOKE_TEST_PLAN.md
docs/launch/image-optimization/README.md
docs/launch/image-optimization/manifest.json
docs/launch/image-optimization/manifest.csv
docs/launch/image-optimization/optimized/webp/**
docs/launch/image-optimization/optimized/avif/**
```

Deleted:

```text
src/app/(storefront)/loading.tsx
src/app/(storefront)/categories/loading.tsx
src/app/(storefront)/categories/[slug]/loading.tsx
src/app/(storefront)/occasions/loading.tsx
src/app/(storefront)/occasions/[slug]/loading.tsx
src/app/(storefront)/shops/loading.tsx
src/app/(storefront)/shops/[slug]/loading.tsx
```

Kept: `src/app/(storefront)/search/loading.tsx`.

No commit, push, deployment, migration, Storage upload, RLS change, or production configuration change was performed.
