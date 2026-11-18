# Launch smoke test plan

This plan is a gate, not a deployment instruction. Production mutations, real orders, and image uploads require explicit owner approval. Do not run write flows against production until the release owner approves a disposable order and cleanup path.

## Environments

| Environment | Purpose | Data rule |
| --- | --- | --- |
| Local (production build) | Full write-path verification | Local `.env.local` / test data only |
| Preview | Visual, SEO, auth, CSP, and catalogue verification | Preview must point at a non-production Supabase project; stop if it points at production |
| Production | Read-only launch check plus approved critical paths | No migrations, no test orders, no cleanup deletes without approval |

## 1. Build and automated gates

Run from the repository root:

```powershell
npm ci
npm run typecheck
npx eslint src
npm test
npm run build
$env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:3101"
npm run test:e2e
```

Notes:

- Use `npx eslint src`, not the full workspace lint, while unrelated `deepseek-harnessed/` files are present.
- Playwright defaults to local port 3100 and refuses non-local hosts. Start the built app on 3101 or use the default test server.
- The default E2E run skips admin occasions unless `PLAYWRIGHT_ADMIN_OCCASIONS=1` and approved admin credentials are supplied.
- Keep the build, test, Playwright HTML report, and screenshots with the release record.

## 2. Public navigation and discovery

- [ ] `/` returns 200; announcement bar, header, hero, occasions, categories, fresh picks, Gift Finder, shops, how-it-works, and footer render.
- [ ] Header links work at desktop and mobile: Occasions, Categories, Shops, search, account, cart.
- [ ] Occasion cards resolve to `/occasions/<slug>`; Graduation and Ramadan pages render the intended state (empty or curated).
- [ ] Category cards resolve to `/categories/<slug>`; each page shows the expected products or empty state.
- [ ] Shop cards resolve to `/shops/<slug>`; all four active shops load.
- [ ] Product cards resolve to `/shops/<vendor>/<product>`; gallery, price, stock, vendor, and add-to-cart are correct.
- [ ] Footer and policy links (`help`, `contact`, `privacy`, `terms`, `delivery-returns`, `refund-policy`) return 200 and contain no placeholder legal text.
- [ ] `robots.txt` and `sitemap.xml` return 200; sitemap product URLs resolve.
- [ ] No horizontal overflow at 320, 390, 768, 1024, and 1440 pixels.
- [ ] No broken images; fallback art appears for a missing/invalid image path.
- [ ] Scroll to the bottom and back; no layout shift or trapped focus.

## 3. 404 and error semantics

- [ ] `/occasions/does-not-exist` returns **404**, not 200.
- [ ] `/categories/does-not-exist` returns **404**.
- [ ] `/shops/does-not-exist` returns **404**.
- [ ] `/shops/does-not-exist/does-not-exist` returns **404**.
- [ ] Each unknown URL renders the Gifto not-found page with `robots=noindex`.
- [ ] A valid occasion, category, shop, and product still returns 200.
- [ ] Unknown routes do not leak stack traces, Supabase errors, keys, or private data.
- [ ] Search and Gift Finder failure states remain usable when the API returns 503.

Decision recorded: the root and catalog route-level `loading.tsx` boundaries were removed because they forced streamed 200 responses before `notFound()`. Only `search/loading.tsx` remains. Validate that navigation still feels acceptable; if skeleton UX is required later, add page-level Suspense after existence validation rather than restoring the old boundaries.

## 4. Search and Gift Finder

- [ ] Search returns matches for a known product name; an empty query shows guidance, not an error.
- [ ] Search handles `%`, `_`, very long input, and XSS-like input without crashing or rendering raw HTML.
- [ ] Gift Finder initially shows 8 of 24 and “Show more” reveals 16 then 24.
- [ ] Show more focus moves to the result summary when all results are shown; focus is visible.
- [ ] Recipient, occasion, and budget filters update the count and results.
- [ ] Unsupported occasion returns a clear empty state, not a request error.
- [ ] API returns 400 for invalid filters, 200 with correct `Cache-Control` for valid filters, and 503 with `no-store` on catalogue failure.
- [ ] Graduation and Ramadan Gift Finder results are compared with the curated occasion pages; differences are documented.
- [ ] Reduced-motion preference stops decorative motion without hiding content.

## 5. Accessibility and keyboard

- [ ] Tab from the top reaches announcement pause, logo, primary nav, search, account, and cart with a visible 2px focus ring.
- [ ] Search input has a visible focus state that is not only a subtle box shadow.
- [ ] Quick-add accessible name includes the visible “Add to cart” label and the product name.
- [ ] Add-to-cart announces success and updates the cart count.
- [ ] Mobile menu: opens as a dialog, traps focus, closes on Escape, restores focus, locks body scroll, and fits 320px.
- [ ] Product cards and links have meaningful accessible names; decorative artwork is hidden.
- [ ] No automated axe WCAG A/AA violations at 320, 390, 768, 1024, or 1440.
- [ ] Manually check text over gradient/blob backgrounds; axe reports these as incomplete. Confirm the design-token pairs in the launch report.
- [ ] Reduced-motion and keyboard-only runs remain usable.

## 6. Commerce and auth

Run write flows only in local/preview with disposable data.

- [ ] Add a product to cart; quantity, subtotal, and remove controls are correct.
- [ ] Multi-shop cart creates one suborder per shop and shows the correct totals.
- [ ] Checkout validates required fields and rejects invalid quantities/stock.
- [ ] COD order places successfully; confirmation shows order number, items, totals, and delivery details.
- [ ] Guest confirmation is reachable only in the same browser via the HttpOnly cookie; a copied URL without the cookie is denied.
- [ ] Signed-in account order list/detail shows only the intended customer’s orders.
- [ ] Login, signup, callback, session refresh, sign-out, and protected-route redirects work.
- [ ] Checkout rejects a paused vendor with a clear message.
- [ ] No service-role key, private address, or another user’s data appears in page source or client bundles.

## 7. Vendor and admin

- [ ] Vendor owner can load overview, products, inventory, orders, analytics, finance, settings, and support.
- [ ] Manager access is read-only where intended.
- [ ] Admin can load dashboard, orders, products, shops, occasions, matching rules, categories, tags, commissions, settlements, support, and analytics.
- [ ] Occasion editor can save manual picks and category/tag rules; public preview updates.
- [ ] Settlement totals and void states match the underlying commission rows.
- [ ] Support request workflow does not expose another vendor’s request.
- [ ] Unauthenticated access to account, admin, and vendor routes redirects to login.

## 8. Images and performance

- [ ] Product card, gallery, occasion card, and occasion hero use the expected image size/source.
- [ ] Optimized derivatives are not served until uploaded and wired by the owner.
- [ ] Oversized hosted images do not block first paint; check Lighthouse/network for the product and occasion pages.
- [ ] Supabase image optimizer returns AVIF/WebP when supported and falls back safely.
- [ ] The Ramadan hero is replaced before Ramadan promotion; otherwise it is visibly low-resolution.
- [ ] Run Lighthouse mobile/desktop on `/`, `/shops`, a product page, and an occasion page; record LCP, CLS, INP/TBT, and image transfer.
- [ ] Verify no layout shift from images without dimensions and no horizontal scroll from long shop names.

## 9. Headers, CSP, and SEO

- [ ] `Content-Security-Policy-Report-Only` is present; its Supabase origin matches the environment.
- [ ] `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` are present.
- [ ] Browser console shows no unexpected CSP reports during the full run; known dev-only `unsafe-eval` reports are documented separately.
- [ ] API responses have the expected cache headers; private/order routes are `private, no-store` and `noindex`.
- [ ] Canonical URL, OG image, Twitter card, and page title/description are correct for home, occasion, category, shop, product, and policy pages.
- [ ] Unknown detail pages are 404 and noindex; search remains noindex.
- [ ] Sitemap has no unknown/draft/private URLs.

## 10. Production read-only launch check

Only after preview sign-off:

- [ ] Confirm the deployed commit and production environment variables.
- [ ] `/`, `/shops`, `/occasions`, `/categories`, search, Gift Finder, one shop, and one product return 200.
- [ ] Unknown dynamic routes return 404.
- [ ] The cart and checkout page load; do not place an order unless approved.
- [ ] Login page loads; do not use real customer credentials unless approved.
- [ ] Images and fonts load; no mixed-content or CSP breakage.
- [ ] Confirm the previous Vercel deployment is available for rollback.
- [ ] Record the release owner, timestamp, browser/device versions, and any accepted risks.

## Exit criteria

Launch only when:

1. Automated gates pass.
2. No critical/high functional or security defect remains.
3. Unknown catalogue URLs return real 404s.
4. The owner has approved the curated occasion state, image replacements, policy text, and decision log.
5. Any unresolved medium risk is written down with an owner and a target date.

## Rollback

- App-only: restore the previous Vercel deployment; do not weaken RLS or CSP to work around a regression.
- Images: keep old Storage objects until the new paths are verified; revert paths if needed.
- Database: no migration is part of this smoke test; any future migration needs its own backup, approval, and rollback plan.
