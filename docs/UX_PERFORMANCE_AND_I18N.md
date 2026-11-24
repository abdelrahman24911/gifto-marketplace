# Gifto — UX / Performance / i18n

- **Audit date:** 2026-11-24
- **Worktree:** `~/workspace/gifto-master-audit`, HEAD `54c780b`
- **Source:** specialist UX report (`/tmp/gifto-audit/ux.md`). **Code inspection only** — read-only. No dev server, no Playwright, no Chromium download, no hosted access, **no measurements taken**. Every performance statement is structural; anything labelled "measured" is cited from `docs/MUSE_TEST_RESULTS.md`, not re-measured here.
- **Method:** source reads, greps, one read-only run of `node scripts/check-i18n-keys.mjs`, and a Python leaf-key count over `messages/*.json`. No file in any checkout was modified.

## 0. Headline verdicts

- **Performance (code-level): no measured problems, several structural risks.** Nothing was measured: **no Lighthouse score, no Core Web Vitals, no timings exist in this audit and none are claimed.** Structurally sound where it counts (all images via `next/image`, zero raw `<img>`, catalog reads cached 60 s + tag invalidation, lists paginated at 25/page). The dominant cost is that **every route is dynamic** — no static shell anywhere; every page SSR-hits auth + DB on every request.
- **UX: strong and consistent.** Loading skeletons, empty states, error boundaries, `ConfirmSubmit` two-step confirmations, type-to-confirm product delete, toasts with `aria-live`, skip links, and filter-pill/finance-tab pending states are all present in code. Gaps: missing `loading.tsx` for most storefront routes; F-01 404 empty DOM; hardcoded English strings in localised surfaces that the i18n check cannot see.
- **i18n: storefront plumbing complete and passing; coverage partial by design.** **Correction to the prior claim:** the often-quoted "788 keys" is wrong. `check:i18n` reports **788 translator *calls***; the actual key set is **648 leaf keys**, identical in `en` and `ar` (verified by independent count). The check passes. But vendor/admin dashboards are English-only by design, legal/policy pages are hardcoded English, and the auth form has zero `useTranslations` calls.

## 1. Performance

### 1.1 Rendering model — Verified

- Root layout is async and `force-dynamic` (`src/app/layout.tsx:89`); `cacheComponents: false` (`next.config.ts`). Comment in the file: "Every route here reads the auth session and/or the database, so nothing is statically prerenderable."
- `generateStaticParams` exists only for the two locales — no product/category/shop page is statically generated.
- **Consequence (inferred):** no static HTML is served for any public page; first paint waits on server data on every navigation. Whether that is slow in practice is **Unknown** — no timing was measured.

### 1.2 Data fetching — Verified, with two flagged risks

- **Homepage** (`page.tsx`, 300 lines): 7 loads in one `Promise.all` (occasions, categories, new arrivals limit 8, shops limit 4, gift-finder page size 8, category previews, shop previews). Parallel, not sequential — good. Per-section failure renders `SectionError`/`EmptyState` rather than failing the whole page.
- **Catalog caching — Verified:** `catalog-cache.ts` wraps public reads in `unstable_cache` (`revalidate: 60` s) with tag invalidation after mutations. Uncacheable results are never stored.
- **Pagination — Verified:** `DEFAULT_PAGE_SIZE = 25`; search, categories, shops, admin orders/products/refunds/shops/support, and account orders all use `.range()`; reviews capped at 20; mail outbox capped at 50/25. No unbounded storefront list was found.
- **Risk 1 — Category/shop preview fan-out (inferred, needs measurement):** `PREVIEW_PRODUCT_LIMIT = 500` (`catalog.ts:586`, `.limit(500)` at line 618) for `loadCategoryPreviews`/`loadShopPreviews`. The homepage fetches both preview maps on every load. Bounded but large for a homepage payload; materiality Unknown without measurement.
- **Risk 2 — Vendor analytics reads (verified, partially mitigated):** `ANALYTICS_ALL_TIME_ROW_LIMIT = 1_000` (`vendor-analytics.ts:46`) caps the "all time" read at 1,000 suborders — so the earlier PERF-01 finding ("All time has no lower bound") is **no longer accurate as written**. However the 7d/30d/90d ranges still use `fetchAllRows`, which pages up to `maxRows = 20_000` rows with joined items. A high-volume vendor could pull up to 20k rows with joins into one server render. Suspected bottleneck, **not** a measured problem.
- **Product page:** shop then product fetched sequentially inside `getProductPageData` (minor waterfall, inferred); no N+1 loop found — reviews are a single ranged query.
- **Checkout:** 2–3 sequential queries only; no N+1 found.
- No `fetch` cache usage / `revalidate` segment exports outside `catalog-cache.ts` — caching is centralised there; admin/vendor pages have no caching layer (appropriate — per-user).

### 1.3 Images — Verified (strong)

- **Zero raw `<img>` tags** in `src/` (grep count 0, excluding tests). All images through `next/image` via `product-image.tsx` (+ `shop-cover.tsx`, `shop-logo.tsx`, `category-tile.tsx`, `occasion-tile.tsx`).
- `next.config.ts` images: `formats: ["image/avif", "image/webp"]`, `minimumCacheTTL: 30 days`, `remotePatterns` restricted to the configured Supabase project's `/storage/v1/object/public/**` only.
- `sizes` at call sites, fixed intrinsic dimensions, graceful fallback (typographic initial panel, `aria-hidden`), bucket fallback for legacy `product-images` vs new `vendor-media`.
- **Above-the-fold preload — Verified:** product-gallery first image, shop cover, occasion hero image.
- **Caveat (verified):** `unoptimized={!shouldOptimizeImages()}` disables the optimizer for localhost/private-network Supabase URLs — correct for local dev, but **local performance testing does not exercise the production image pipeline**.

### 1.4 F-01 — 404 empty DOM — Verified (still present by construction)

- Root cause as recorded in `docs/MUSE_TEST_RESULTS.md:40-66` is consistent with the code: root layout async + `force-dynamic`; `[locale]` layout async; Next streams the shell first with the children slot as a hidden Suspense placeholder, so a no-JS client sees only the page title (measured in that report as 40 visible characters; homepage 4,990). The 404 UI itself exists and is good (`not-found.tsx`: "This gift isn't here", Back home / Browse shops / Search gifts).
- Three fixes were attempted in an isolated worktree and none kept (remove root `force-dynamic`; `force-static` on `not-found.tsx`; Next 16 `globalNotFound`): all left the 404 DOM unchanged. **This audit did not re-run those experiments** — the code state (root layout still async + `force-dynamic`) is unchanged, so the issue is **still present by construction**.
- Partial mitigation: `/ar/…` 404s render 312 visible characters because the `[locale]` segment matches; admin 404s render their (synchronous) layout.
- **Impact (inferred):** JS-enabled browsers hydrate and render correctly; Googlebot executes JS, so SEO impact is limited. No-JS clients and naive crawlers see an empty page. Severity Medium-Low, as recorded. **Do not re-attempt without a new approach** — a fix likely requires restructuring the root layout (removing async work from it), a larger change needing owner sign-off.

### 1.5 Bundle / client surface — Verified (structural only)

- **99 files** in `src/` contain `"use client"` out of 210 `.tsx` files — nearly half the component tree is client-rendered, largely justified (cart, wishlist, gift finder, carousels, forms, dashboards). No bundle analysis was run; **no bundle-size claim is made**.
- Fonts: `next/font/google` — Geist, Geist_Mono (`preload: false`), Fraunces (latin subset only), IBM Plex Sans Arabic (arabic subset, 400/500/600/700). Fraunces has no Arabic subset, so Arabic display type falls back to Plex Sans Arabic via `html[dir="rtl"] .font-display` — a deliberate, acceptable trade-off.
- **Suspense boundaries — Verified gap:** only one file outside tests uses `Suspense` (`site-header.tsx`). There is no `<Suspense>` streaming around the homepage's seven parallel loads — the page waits for all of them before any HTML is sent (inferred from `page.tsx` awaiting `Promise.all` before returning JSX). A real streaming opportunity, unmeasured.

## 2. UX

### 2.1 Loading states — Verified (patchy coverage)

| Route / area | Loading state |
|---|---|
| Checkout / Search / Product page | Skeleton (`loading.tsx`; checkout skeleton has `aria-live="polite"`) |
| Admin (all) / Vendor (all) | `DashboardLoading` |
| Admin occasions (+ edit/new) | Own `loading.tsx` |
| Homepage, categories, category page, shops, shop page, occasions, account, cart, wishlist, orders, auth, legal/help pages | **No `loading.tsx`** — full-page server wait with no skeleton (inferred) |
| Filter pills (admin/vendor) / Finance tabs (vendor) | Pending spinner + dim (`filter-pill.tsx` — `useTransition`, `aria-busy`, spinner SVG, `opacity-60`) |
| Refresh buttons / Forms | Pending label ("Loading…", "Adding…", "Deleting…", "Recording…") with `disabled={pending}` |

**Gap:** `loading.tsx` does not re-trigger for search-param-only navigations — the reason `FilterPill` exists. That is handled for admin/vendor filters and finance tabs, but **storefront** search-param navigations (search filters, category/shop pagination) were not found to use `FilterPill` or any equivalent pending treatment — **Unknown** whether they show feedback; the storefront `Pagination` component is a plain link list. Worth a browser check.

### 2.2 Empty states — Verified (good)

Shared `EmptyState` and `SectionError` (`ui/section.tsx:77-116`); `EmptyState` referenced in 93 places; homepage degrades per-section; dedicated empty components for occasions; product-image fallbacks are intentional typographic panels, not broken-image icons.

### 2.3 Error states — Verified (good at boundaries, thin inside storefront)

Root `error.tsx` ("We hit a snag"), `not-found.tsx`, admin/vendor `error.tsx`, segment `not-found.tsx` for admin occasion edit and vendor product detail; `DashboardError` with Try again / Back to storefront. Server pages use `notFound()` consistently (20+ call sites). **Gap:** no `error.tsx` under `[locale]` — a storefront segment error falls back to the root `error.tsx`. Whether any route renders blank on an unexpected throw is **Unknown** without a browser run; F-01 (§1.4) is the one proven blank-render path.

### 2.4 Forms & validation — Verified (mixed)

Server-action forms use `useActionState` with inline `role="alert"` / `role="status"` messages. `aria-invalid` appears in 11 places — present but not universal; checkout field-level labelled errors were not fully traced (**Unknown**). Unsaved-changes guard (`navigation-guard.tsx`) tracks dirty sources with a "Leave without saving?" dialog — strings hardcoded English (see §3.4). Auth form handles sign-in/sign-up client-side with toasts and special-cases "too many attempts".

### 2.5 Destructive / money actions — Verified

- **`ConfirmSubmit` — 6 call sites + definition:** first click reveals an inline summary with Confirm/Cancel; only Confirm submits; auto-closes when the action settles; `role="alert"`. Used in admin shop status/commission controls, tag approve/reject/deactivate, support status, occasion publish/hide, vendor pause-orders. Note: "Cancel"/"Confirm" defaults are hardcoded English.
- **Product delete type-to-confirm — Verified:** vendor must type the exact product name (case-sensitive, `confirm-delete.ts`); server action re-checks; submit disabled until match. Added after the live Plant Pot deletion. Strongest destructive-action guard in the app.
- **Occasion delete:** confirm step, not type-to-confirm (appropriate, lower blast radius).
- **Money actions** (settlement paid/void, clawback repayment, commission received): `useActionState` + pending labels + disabled-while-pending + success-state disabling.

### 2.6 Toasts — Verified

`ToastProvider` mounted once in root layout: 6,000 ms lifetime, deduplicated by ID, success/error/info tones, `aria-live="polite"`, `role="alert"` for errors. Good implementation.

### 2.7 Accessibility — Verified (solid baseline, two gaps)

**Present:** skip links (storefront + dashboard shell); semantic HTML (`<main>`, `<nav aria-label>`, `<h1>` per page, breadcrumb nav); `aria-label`/`aria-current` on filter pills and carousel arrows; focus-visible styles consistently; `aria-busy` on pending pills/forms; `role="alert"`/`role="status"` on form results and toasts; meaningful alt text everywhere sampled; `prefers-reduced-motion` respected (carousel + `motion-reduce` classes); keyboard: carousel rail focusable/scrollable, filter pills are real links, mobile nav uses buttons.

**Gaps:**
1. No `aria-modal`/`role="dialog"` usage anywhere; focus return after closing a confirm step not verified in code.
2. **No automated a11y test suite** — no `axe`/`jest-axe` dependency, no a11y-specific spec. **Unknown** whether a screen-reader pass has ever been done.
3. Carousel arrows hidden below `sm` — correct for touch, but keyboard-only desktop users at narrow widths must scroll the focusable rail (acceptable, noted).

### 2.8 Mobile responsiveness — Verified in code, Implemented-but-unverified in browser

Responsive classes pervasive (`sm:`/`md:`/`lg:`/`xl:`); mobile nav exists. Playwright mobile coverage exists in code (`dashboard-mobile.spec.ts` Pixel 7, `search-overflow.spec.ts`, occasion-carousel, homepage specs) — **not run in this audit**; existence Verified, passing state Implemented-but-unverified here. Prior reports record a browser pass on the owner's machine (2026-11-23) including mobile dashboard checks; that is prior work, not re-verified.

### 2.9 Known-context verification

| Item | Status |
|---|---|
| Occasion carousel (snap rail, mobile swipe, desktop arrows, RTL-aware) | **Verified** |
| Environment banner (demo amber, staging sky, absent prod/dev) | **Verified** (`environment.ts:94-112`, `environment-banner.tsx`) |
| Review stars on listings | **Verified** — six listing surfaces |
| BreadcrumbList JSON-LD | **Verified** — category/occasion/shop/product pages (not homepage/search/account/legal — correct, no breadcrumb trail there) |
| Filter-pill pending states | **Verified** — across admin + vendor |
| Finance tab pending states | **Verified** — vendor finance tabs are `FilterPill`s |
| Homepage redesign preview / landing concepts | **Not audited** — artifacts outside the repo |

## 3. Internationalization

### 3.1 Translation completeness — Verified (with correction)

- Ran `node scripts/check-i18n-keys.mjs`: **passes** — "OK — 788 translator calls, all keys present in messages/en.json; messages/en.json and messages/ar.json share 648 keys" (exit 0).
- Independent Python count: **648 leaf keys in each file**, 16 top-level namespaces each (`cart, checkout, common, giftFinder, home, order, product, announcement, footer, account, search, categories, shops, occasions, wishlist, addressBook`), zero keys missing in either direction, zero empty strings.
- **Correction:** the prior claim of "788 keys" conflates calls with keys. Real figures: **648 keys / 788 call sites**.
- The check script is well-built (resolves namespace from `useTranslations`/`getTranslations` bindings, requires both locale files, fails hard on a missing file) but does **not** type-check keys (no `IntlMessages` declaration), so it is the only guard against silent missing-key fallbacks.
- **CI wiring: VERIFIED** — `check:i18n` runs in the `app` job (`.github/workflows/ci.yml:42`; fix `63a27e3`). The UX specialist's "unconfirmed" is superseded by the testing specialist's verification (see `TESTING_AND_QUALITY.md` §2.6).

### 3.2 Arabic / RTL behaviour — Verified (good)

- Locales: `en` (default, prefix-free) and `ar` (under `/ar/…`), `localePrefix: "as-needed"`. Locale routing via next-intl + `proxy.ts`.
- `dir`/`lang` on `<html>`; `LocaleHtmlSync` keeps them in sync after client-side locale switches; invalid locale → `notFound()`.
- RTL styles: `html[dir="rtl"]` switches body/display font to IBM Plex Sans Arabic; `rtl:` variants for icon mirroring (12 occurrences) and gradient direction; carousel scroll math handles negative `scrollLeft` in RTL.
- **Gap (minor):** `rtl:` usage is thin (13 occurrences total) — most layout relies on logical-property-friendly flex/grid and `ms-`/`me-`/`start-`/`end-` utilities, which is the right approach, but a visual RTL check was not possible here (**Implemented-but-unverified** — needs a browser pass on `/ar`).

### 3.3 Date / number / currency (EGP) — Verified

- **Currency:** `formatEgp` (`money.ts`) — integer piastres, no floats. `en` → `"EGP 1,250.50"`; `ar` → `Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP" })` (Arabic-Indic digits + "ج.م."), bidi marks stripped. `parseEgpToMinor` accepts Arabic-Indic digits, Arabic separators, decimal commas. Caveat: vendor/admin call sites keep English format — consistent with English-only dashboards.
- **Dates:** storefront uses `toLocaleDateString`/`toLocaleString` with `ar-EG` / `en-GB`; admin/vendor hardcode `en-GB`/`en-US`.
- **Numbers:** `toLocaleString("en-US")` in admin; storefront prices go through `formatEgp`.

### 3.4 Hardcoded strings in localised surfaces — Verified (the main i18n gap)

The `check:i18n` script only sees `t("…")` calls, so hardcoded literals are invisible to it:

- **`auth-form.tsx` — worst case:** zero `useTranslations` calls; "Full name", "Email", "Password", "Create an account", "Sign in", "Forgot your password?" all literals. Login/signup/forgot-password/reset-password render English-only even on `/ar/…`.
- **Auth pages:** forgot/reset password pages — same issue.
- **Legal/policy pages:** privacy, terms, refund-policy, delivery-returns, help, contact — fully hardcoded English bodies. Draft legal pages (six pages with draft notices per owner decision), so translation may be intentionally deferred — but as shipped, `/ar/privacy` etc. are English. Flag as known limitation, not a regression.
- **`policy-page.tsx`:** "Publishing status", "Details still needed from the owner", "Back to the Help Centre" hardcoded.
- **`navigation-guard.tsx`:** "Unsaved changes" / "Leave without saving?" / "Keep editing" / "Discard changes" hardcoded.
- **`pagination.tsx`:** "Previous"/"Next" hardcoded.
- **`confirm-submit.tsx`:** "Cancel" literal, `confirmLabel` default `"Confirm"`.
- **Environment banner copy** hardcoded English — operator-facing, low priority.
- No hardcoded strings were found in the main storefront listing/product/cart/checkout components in the sampled scan — the translated surfaces are genuinely translated.

### 3.5 Vendor / admin dashboards language coverage — Verified (English-only, by design)

**0 of 96** `.tsx` files under `src/app/admin` and `src/app/vendor` use `useTranslations`/`getTranslations`. The `[locale]` layout comment states it explicitly: "Vendor and admin stay outside the `[locale]` segment and render English only". This is a **documented product decision, not an oversight** — but Arabic-speaking vendors (likely in Alexandria) will operate money flows in English, including settlement forms and refund flows. Flag to the owner as adoption friction, not a code defect.

### 3.6 Translation quality — not audited

Whether the Arabic strings are correct, natural, and complete in meaning was not assessed — that needs a native Arabic reviewer. Key parity is verified; quality is **Unknown**.

## 4. Prioritised findings

### P1 — Fix or decide
1. **Auth forms and pagination are English-only on Arabic routes** (§3.4). Small fix: move these strings into `messages/*.json` (namespaces exist: `common`, `account`). Owner decision needed only if auth is intentionally English.
2. **F-01 404 empty DOM still present by construction** (§1.4). No safe small fix found; do not re-attempt blindly. If SEO/no-JS matters for launch, the fix likely requires restructuring the root layout — a larger change needing owner sign-off.
3. **Vendor/admin dashboards are English-only** (§3.5). Documented decision, but flag to the owner: Arabic-first vendors will operate money flows in English. Decide whether to localise dashboards before or after pilot.

### P2 — Improve
4. **Add `loading.tsx` for homepage, categories, shops, account, cart, wishlist** (§2.1).
5. **Stream the homepage** (§1.5): wrap the seven parallel loads in `<Suspense>` per section so the hero/shell paints before slow catalog reads resolve.
6. **Bound the 7d/30d/90d vendor-analytics reads** (§1.2, Risk 2): `fetchAllRows` caps at 20,000 rows with joined items; extend a cap (or server-side aggregation) to the ranged reads.
7. **Homepage preview fan-out** (§1.2, Risk 1): `PREVIEW_PRODUCT_LIMIT = 500` on every homepage load — measure and, if material, reduce or defer below the fold.
8. **Translate or explicitly defer legal/policy pages + navigation-guard dialog** (§3.4). If the six legal pages stay English drafts, say so on the Arabic versions rather than silently serving English.

### P3 — Polish / verify in browser
9. **Storefront filter/pagination pending feedback** (§2.1): verify in a browser whether search/category pagination shows any pending state.
10. **RTL visual pass on `/ar`** (§3.2) and **screen-reader pass** (§2.7): code is RTL-aware and aria-annotated, but neither has been verified by rendering. Add an `axe`-style check or a manual pass before pilot.
11. **ConfirmSubmit defaults**: make `"Confirm"`/`"Cancel"` translatable props with no English default (§2.5).
12. **Measure performance before public launch**: Lighthouse/CWV on the deployed build — no numbers exist anywhere in this audit or in prior reports.
