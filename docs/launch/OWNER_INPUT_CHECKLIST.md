# Owner input checklist

Use this alongside `docs/OWNER_DECISIONS_BRIEF.md` and `docs/DECISIONS.md`. Items marked **blocking** must be answered or explicitly accepted before launch; the rest should be confirmed before the production smoke test.

## 1. Business and launch scope

- [ ] **Blocking:** Confirm the launch market, currency, and language: Egypt, EGP, English storefront copy.
- [ ] **Blocking:** Confirm cash-on-delivery only for launch; no card payment provider.
- [ ] **Blocking:** Confirm the public brand name, logo/wordmark, tagline, and support email/phone.
- [ ] **Blocking:** Approve the legal entity name and the address to publish on policy pages.
- [ ] Confirm whether the first campaign targets Alexandria only or all served governorates.
- [ ] Confirm the target launch date and the owner contact who will approve the production smoke test.
- [ ] Answer the open decisions in `docs/OWNER_DECISIONS_BRIEF.md`: delivery fee direction, vendor subscription model, and settlement cadence.

## 2. Customer-facing policies

- [ ] **Blocking:** Approve the delivery promise and excluded areas; current copy says free delivery at launch and cash on delivery.
- [ ] **Blocking:** Approve the return, refund, and cancellation rules, including who pays return delivery.
- [ ] **Blocking:** Confirm the privacy policy, terms of service, contact page, help page, and complaint route are accurate.
- [ ] Confirm the order-confirmation wording and what the customer receives after placing an order.
- [ ] Confirm how a customer reports a missing, damaged, or incorrect item.
- [ ] Confirm how customer data is handled and who can access orders; do not promise deletion or retention terms that are not implemented.

## 3. Vendor operations

- [ ] **Blocking:** Confirm the four active shops are intended to be publicly orderable at launch.
- [ ] Confirm each shop can fulfil its listed stock, prep time, and delivery coverage.
- [ ] Confirm commission rates per vendor and the payout cadence.
- [ ] Confirm whether vendor logos/covers are optional for launch; all are currently null.
- [ ] Confirm who monitors failed delivery, cancellations, returns, and settlement adjustments.
- [ ] Confirm vendor support contact and escalation path.
- [ ] Confirm whether vendors may edit products during launch week or must request admin changes.

## 4. Catalogue and merchandising

- [ ] **Blocking:** Approve or reject the six Graduation manual picks in `docs/launch/CATALOGUE_AND_MERCHANDISING.md`.
- [ ] **Blocking:** Approve or reject the six Ramadan manual picks; add at least one non-food Ramadan gift if Ramadan will be promoted.
- [ ] Confirm whether `Occasions` should remain a storefront category; it contains only “Graduation Flower Box”.
- [ ] Confirm whether Gift Finder and occasion pages may show different result sets until the matching logic is unified.
- [ ] Confirm the Ramadan display name “Ramadan Night” and whether the `ramdan-night` slug should be migrated later.
- [ ] Review product names, descriptions, prices, stock, and vendor names for launch accuracy.
- [ ] Confirm the 24-product assortment is sufficient for launch; sparse categories are noted in the catalogue review.

## 5. Images and content

- [ ] **Blocking:** Replace the Ramadan occasion image (currently 354×234 / 6.8 KB) with a source at least 1200×800, preferably 1600×1200 or larger.
- [ ] Review the optimized pack in `docs/launch/image-optimization/` and approve which derivatives to upload.
- [ ] Replace the seven `Screenshot 2026-...` product-image alt texts with descriptive product names; the manifest supplies suggested text.
- [ ] Confirm whether the seven toy images themselves are acceptable after optimization or need reshooting.
- [ ] Confirm the Graduation 1200×857 crop is acceptable for the occasion hero/card.
- [ ] Confirm product image ordering and that the first image for each product is the intended card image.
- [ ] Confirm social sharing image `public/og-image.png` is the approved brand asset.

## 6. Trust, content, and SEO

- [ ] Confirm the homepage trust claims (“Every shop reviewed by Gifto”, delivery promise, etc.) are true and supportable.
- [ ] Confirm the “About”/brand story copy and any launch announcement wording.
- [ ] Confirm contact details, response-time promises, and working hours.
- [ ] Confirm the sitemap/canonical host and production site URL.
- [ ] Confirm whether search result pages should remain `noindex` (current behavior).
- [ ] Confirm the launch policy on testimonials, ratings, reviews, and popularity claims; none should be invented.

## 7. Operations, security, and launch gate

- [ ] Confirm who holds Supabase and Vercel admin access and who can approve production changes.
- [ ] Confirm a backup/PITR decision and the rollback owner; see `docs/review/PRODUCTION_RELEASE_CHECKLIST.md`.
- [ ] Confirm whether the unrun SQL/RLS suites and the accepted database risks are launch blockers or explicitly accepted risks.
- [ ] Confirm error monitoring, alert destination, and on-call contact for launch week.
- [ ] Confirm analytics/tracking requirements; current CSP allows no third-party analytics origins.
- [ ] Confirm the production environment variables are set, including `NEXT_PUBLIC_SITE_URL` (never localhost), Supabase URL/anon key, and server-only service-role key.
- [ ] Approve the pre-production and production smoke-test plan in `docs/launch/SMOKE_TEST_PLAN.md`.
- [ ] Name the person who will sign off the final launch decision and record the date.

## 8. Decisions that remain explicitly deferred

The owner may defer these, but they must be recorded as accepted launch limitations:

- Hard 404s now work for unknown catalogue detail routes; route-level skeleton loading screens for catalog pages were removed to obtain them.
- CSP remains report-only; script nonce enforcement and style refactoring are post-launch work.
- Gift Finder occasion filtering remains category-based rather than using the explicit occasion matching tables.
- Image derivatives are prepared locally but not uploaded; hosted originals remain in use until the owner performs the upload and path update.
- No automated CI/CD, staging environment, error tracking, or SQL/RLS suite execution exists in this worktree.
