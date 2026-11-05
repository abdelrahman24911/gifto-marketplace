# Gifto Marketplace - Phase 1 Vendor Audit

**Date:** 2026-11-05
**Mode:** Read-only audit
**Scope:** Current working tree, migrations 1-13, vendor/storefront/admin surfaces
**Vendor archetype:** General gift shop (Alexandria, Egypt)
**Business model:** Managed marketplace - vendors must not self-register and become active sellers

No code, migrations, configuration, or docs were changed during the audit.

---

## 1. Executive Summary

The platform foundation is solid: catalog, COD checkout, per-vendor suborders, commission snapshots, guest checkout with idempotency, row-locked stock, audited inventory movements, and RLS policies are all implemented and tested. 55 unit tests and 8 RLS suites exist, and migrations 1-13 are applied.

The vendor experience, however, is a thin skeleton. Only four areas exist in the dashboard: overview, orders, products, inventory. There is no finance, analytics, settings, team, notifications, support, order detail, or settlement UI. There is no `/vendor/layout.tsx`, shared vendor navigation, loading state, or error boundary.

Two findings dominate Phase 2:

1. **Business-model conflict:** self-service vendor registration is live. `apply_as_vendor` exists (`supabase/migrations/00000000000002...sql`), the account page renders an onboarding form (`src/app/account/onboarding-form.tsx`), the action calls the RPC (`src/app/account/actions.ts:14,31`), and the homepage CTA "Sell on Gifto" links to `/signup` (`src/app/page.tsx`). This contradicts the managed marketplace requirement. There is also no admin "create/edit/invite vendor" flow.
2. **Vendor status is not enforced for dashboard access:** `requireVendorRole` resolves any membership regardless of status (`src/lib/vendor.ts:34-64`), and RLS product/order policies check membership only (`supabase/migrations/00000000000004_catalog.sql:205-217`, `supabase/migrations/00000000000005_orders.sql:585-588`). A pending, suspended, or rejected vendor can navigate directly to `/vendor/*` and mutate products/orders.

Admin finance is also incomplete: `commission_entries`, `settlements`, `settlement_lines`, `create_settlement`, and `mark_settlement_paid` exist, but there is no admin or vendor UI.

---

## 2. Architecture Map

| Layer | Implementation |
|---|---|
| Framework | Next.js 16.4.2 App Router, React 19.3.0, TypeScript strict, Tailwind v4 |
| Runtime | `npm run build` uses `--webpack`; Turbopack native SWC binding fails on this win32 machine |
| Database | Supabase Postgres, 13 migrations under `supabase/migrations/` |
| Auth | Supabase Auth; `src/lib/auth.ts` request-cached context; `src/proxy.ts` protects `/account`, `/admin`, `/vendor`; `/checkout` public |
| Data access | Server Components and Server Actions call Supabase directly; anon session client for user-scoped reads/writes; service-role client only in `src/app/checkout/actions.ts` and `src/app/orders/[id]/page.tsx` |
| Storage | Public `product-images` bucket; path `{vendor_id}/{product_id}/{uuid}.{ext}` |
| Money | Integer piastres, explicit EGP formatting; server recomputes all prices |
| Orders | COD only; parent order + per-vendor suborders; commission snapshotted; free delivery at launch |
| Tests | Vitest unit tests plus 8 destructive RLS suites under `supabase/tests/` |

Routes that exist today:

- Public: `/`, `/categories`, `/categories/[slug]`, `/shops`, `/shops/[slug]`, `/shops/[slug]/[productSlug]`, `/search`
- Auth: `/signup`, `/login`, `/auth/callback`
- Customer: `/cart`, `/checkout`, `/account`, `/account/orders`, `/account/orders/[id]`, `/orders/[id]`
- Vendor: `/vendor`, `/vendor/overview`, `/vendor/orders`, `/vendor/products`, `/vendor/products/new`, `/vendor/products/[id]`, `/vendor/products/[id]/inventory`, `/vendor/products/[id]/images`
- Admin: `/admin`, `/admin/orders`

---

## 3. End-to-End Flows (Current)

**Purchase:** Browse -> cart (client state) -> `/checkout` -> server action recomputes totals -> `place_order_with_idempotency` (signed-in) or `place_guest_order` (guest, service role) -> atomic order/suborders/items/movements -> vendor queue.

**Fulfilment:** Vendor sets `placed -> confirmed -> shipped` -> `delivered` or failed-delivery `shipped -> cancelled`. Parent status is derived; mixed terminal outcomes become `partially_completed`. Delivery triggers commission earn; cancellation restocks and reverses unsettled commission.

**Vendor onboarding (current, conflicting):** Signup -> `/account` -> "Apply to sell" -> `apply_as_vendor` creates a `pending` vendor + owner membership -> admin sets `active` in `/admin` -> vendor dashboard link appears in `SiteHeader` only for active shops (`src/components/site-header.tsx:55-84`).

**Guest confirmation:** Raw token in HttpOnly cookie; SHA-256 hash stored; `get_guest_order` service-role-only.

---

## 4. Vendor Functionality Inventory

| Area | Exists | Files | Notes |
|---|---|---|---|
| Overview | Yes | `src/app/vendor/overview/page.tsx` | Counts by status, low-stock threshold 5, recent 10 suborders |
| Orders | Yes | `src/app/vendor/orders/{page,actions,suborder-actions}.tsx` | List, status filter, state transitions |
| Products | Yes | `src/app/vendor/products/{page,actions,product-form,new,[id]}` | Create/edit, draft/active/archived |
| Inventory | Yes | `src/app/vendor/products/[id]/inventory/*` | Stock history, manual adjustment RPC |
| Images | Yes | `src/app/vendor/products/[id]/images/actions.ts` | Max 8, 5 MB, jpeg/png/webp/avif |
| Store settings | No | - | No name, description, logo, contact, delivery coverage, slug management |
| Finance | No | - | Ledger/settlements exist in DB only |
| Analytics | No | - | No sales, product, or trend reporting |
| Team | No | - | RLS supports owner-managed roster; no UI |
| Notifications | No | - | No in-app or email alerts |
| Support | No | - | `/account` references contacting support, but no route |
| Order detail | No | - | Only list rows; no per-suborder detail or packing slip |
| Admin settlements | No | - | RPCs exist; no `/admin/settlements` |
| Admin vendor creation | No | - | Admin can only change status of self-applied vendors |

---

## 5. Missing Functionality Matrix

| Capability | Status | Priority |
|---|---|---|
| Managed vendor onboarding (admin-only create/invite) | Missing | P0 |
| Vendor status enforcement on routes and writes | Missing | P0 |
| Vendor shell / shared navigation | Missing | P0 |
| Vendor loading/error boundaries | Missing | P0 |
| Vendor finance read-only (earnings, commission, settlements) | Missing | P1 |
| Admin settlement UI using existing RPCs | Missing | P1 |
| Store settings (profile, branding, contact, delivery) | Missing | P1 |
| Team/member management | Missing | P1 |
| Order detail + packing slip | Missing | P1 |
| Search/sort/pagination on vendor lists | Missing | P1 |
| Analytics dashboard | Missing | P2 |
| Notifications (in-app/email) | Missing | P2 |
| Support/help center | Missing | P2 |
| Order status history and tracking fields | Missing | P2 |
| Returns/stock workflow (D-09) | Undecided | P2 |
| Vendor type / capability model | Missing | P2 |
| Delivery fee / payout account model | Deferred | P3 |

---

## 6. Database / Backend Assessment

Strengths:

- Atomic order creation with idempotency and rate limiting.
- Integer money; commission rate snapshotted onto `order_vendors`.
- Least-privilege order grants in migration 12.
- Restock via audited `inventory_movements`.
- State-machine trigger prevents invalid transitions.
- Storage policies verify both vendor and product path segments.

Gaps:

- No `vendor_type` or capability model. The platform assumes one generic vendor while seed categories already include flowers, cakes, and corporate gifts (`supabase/seed.sql:9-17`). Perishable/same-day vendors would need different fulfilment rules.
- No vendor invitation/onboarding tables or admin-created vendor workflow.
- No notifications, support tickets, or order status history tables.
- Settlement backend lacks audit columns (`created_by`, `paid_by`, `paid_at`), a one-open-settlement-per-vendor constraint, and a void path (already noted in `docs/STATUS_REPORT.md`).
- No vendor payout account/bank details storage.
- No COD collection/payment status beyond `delivered`.
- No tracking/courier/delivery-note fields.
- Returns leave stock unchanged pending D-09.
- `database.types.ts` header is stale: it says Phases 1-6 and "9 migrations" (`src/lib/supabase/database.types.ts:1-16`), although guest RPCs and `partially_completed` are actually typed later in the file.

---

## 7. Security & Correctness Findings

**P0 - Self-service vendor onboarding contradicts the model.** `apply_as_vendor` is client-executable, the account onboarding form is publicly reachable, and the homepage promotes "Sell on Gifto" to `/signup`. Anyone can create a pending shop and populate products.

**P0 - Vendor status is not enforced.** `requireVendorRole` ignores `m.vendor.status` for authorization; it only records it. RLS product write/update/delete policies use `is_vendor_manager` (`supabase/migrations/00000000000004_catalog.sql:205-217`), and order status updates use the same membership-only helper (`supabase/migrations/00000000000005_orders.sql:585-588`). Pending/suspended/rejected vendors can manage catalog and fulfil existing orders via direct URLs. Only checkout blocks non-active vendors from receiving new orders.

**P1 - Owner can change vendor slug and contact fields through RLS** (`vendors: owner update own`) with no settings UI or guard. A slug change breaks shared storefront URLs.

**P1 - Public storage bucket exposes unreleased product images.** The `product-images` bucket is public; RLS read policy only affects listing, not public URL access. Anyone with a known path can view images for draft products or inactive vendors.

**P1 - Vendor status changes lack reasons/audit notes.** `vendor_status_history.note` exists but admin actions do not collect it, and there is no history UI.

**P1 - `apply_as_vendor` has no application limit.** API callers can create multiple pending shops.

**P1 - Service-role usage relies on convention.** The service client is imported only server-side, but there is no explicit `server-only` guard to prevent accidental client import.

**P2 - Anon-executable SECURITY DEFINER helpers and default ACLs** remain per the prior status report; migration 12 hardened current order tables only.

**Correctness positives:** prices are recomputed in the database; stock decrements under row locks; idempotency keys are unique; cancellation restocks exactly once; commission is earned on delivery and reversed only before settlement. Parent totals are not database-constrained, but only RPC paths write orders. There is no order status history, so operational auditing is limited.

---

## 8. UX / UI & Design-System Findings

- Vendor and admin screens use hardcoded `zinc`/black styling instead of Gifto tokens (`paper`, `ink`, `berry`, `gold`). The storefront is polished and brand-consistent; the vendor side feels like an internal admin tool.
- No `/vendor/layout.tsx`: each page repeats its own header/nav and hardcodes the active item. Navigation drifts and is not scalable.
- No vendor `loading.tsx` or `error.tsx`; slow navigation shows a blank area, and query failures are often rendered as empty states because vendor pages ignore Supabase errors.
- No order detail view, packing slip, tracking, internal notes, or delivery controls.
- No search, sort, or pagination in vendor orders/products; all rows are fetched and filtered client-side. This will not scale.
- Empty states are good in overview/orders/products; error handling is inconsistent.
- Responsive layout is generally sound; mobile nav exists for storefront, not vendor.
- Accessibility: native `window.confirm` for cancellation, missing focus-visible styles on vendor controls, and some low-contrast muted text. Storefront ARIA usage is better.
- Money formatting is consistent and correct.

---

## 9. Technical Debt & Maintainability

- `src/lib/supabase/database.types.ts` is hand-written and its header is stale despite newer types being present. Regenerate from the live schema.
- Documentation drift: `docs/STATUS_REPORT.md` is dated 2026-10-26 and the prior audit docs are older; guest checkout and migration 13 are now implemented.
- Vendor navigation markup is duplicated across three pages.
- Low-stock threshold 5 is duplicated in overview and products.
- Order transition rules exist in both `src/lib/orders.ts` and the DB trigger; they can drift.
- No CI configuration; the E2E harness lives outside the repo.
- Unbounded queries and client-side filtering.
- No `server-only` package guard on the service client.
- Build is pinned to webpack because of the local native binary issue.
- Working tree is ahead of `origin/main` by one commit with uncommitted changes.

---

## 10. Prioritized Roadmap

### Phase 2A - Managed onboarding, access control, vendor shell (P0)

1. Remove self-service entry points: hide/remove the onboarding form, change the homepage CTA, and revoke `apply_as_vendor` from client roles or repurpose it as admin-only.
2. Add admin vendor creation/invitation: create vendor + owner membership, send a Supabase Auth invite, keep status `pending`, activate from `/admin`.
3. Enforce vendor status in `requireVendorRole` and RLS. Recommended: `active` = full access; `pending` = blocked or read-only; `suspended`/`rejected` = blocked.
4. Add `/vendor/layout.tsx` with shared nav, vendor switcher, and Gifto design tokens.
5. Add vendor loading/error boundaries and surface query errors.
6. Fix `database.types.ts` and update stale docs.

### Phase 2B - Money, settings, operations (P1)

7. Vendor finance read-only: earnings, commission entries, settlement history.
8. Admin settlement UI using existing RPCs; add audit columns and one-open-settlement constraint.
9. Store settings: profile, description, logo upload, contact, delivery coverage; guard slug changes.
10. Team management: invite/remove owner/manager.
11. Order detail with packing slip, search, sort, pagination.

### Phase 2C - Growth and support (P2)

12. Analytics: sales, top products, order trends, low-stock alerts.
13. Notifications: new-order and status-change alerts; email provider.
14. Support/help center and vendor contact channel.
15. Decide returns/stock policy; add order status history and tracking fields.

### Phase 3 - Extensibility (P3)

16. Vendor type/capability model.
17. Delivery fees and vendor payout accounts.
18. Advanced settlement automation and reporting exports.

---

## 11. Proposed Vendor Navigation

Recommended desktop sidebar and mobile drawer:

- **Overview** - `/vendor/overview`
- **Orders** - `/vendor/orders`, plus `/vendor/orders/[id]`
- **Products** - `/vendor/products`, `/vendor/products/new`, `/vendor/products/[id]`, inventory/images under product
- **Inventory** - `/vendor/inventory` (cross-product stock alerts and history)
- **Finance** - `/vendor/finance` (earnings, commission, settlements)
- **Analytics** - `/vendor/analytics`
- **Store** - `/vendor/settings` (profile, branding, delivery coverage, team)
- **Notifications** - `/vendor/notifications`
- **Support** - `/vendor/support`

Keep the vendor switcher at the top for multi-shop owners. Hide nothing behind missing modules; show honest empty states until data exists.

---

## 12. Required Database Changes (Proposed, Not Applied)

| Change | Purpose |
|---|---|
| `vendors.vendor_type` (default `general_gift_shop`), `vendors.created_by` | Managed onboarding and future vendor specialization |
| Vendor invitation flow (`vendor_invites` table or Auth invites) | Admin-controlled acquisition |
| Revoke client execute on `apply_as_vendor` | Remove self-service |
| RLS checks for `vendor.status = 'active'` on product/image/order writes | Close status bypass |
| Settlement audit columns, unique open-settlement index, void path | Safe payouts |
| Vendor payout account table | Future payouts |
| `notifications` table | In-app alerts |
| `support_tickets` / `support_messages` | Support workflow |
| `order_status_history`, `tracking_number`, `courier`, `delivery_notes`, `returned_at`, COD collection fields | Operational visibility |
| Vendor-logo storage bucket/policies | Store branding |
| Optional: private product-image bucket or signed URLs | Hide unreleased media |
| Future-table ACL hardening | Close Supabase default grants |

Returns stock handling requires an explicit decision first (D-09).

---

## 13. Dependencies, Risks & Open Questions

**Decisions needed before Phase 2:**

1. How should managed onboarding work: admin creates account and sends invite, or vendor self-enters details and admin approves? Current RPC can be repurposed, but the UI and access model must change.
2. Should `pending` vendors see a read-only dashboard, or be blocked entirely until active?
3. Should suspended vendors retain read-only access to historical orders?
4. D-09: on return, restock automatically, quarantine, or require manual adjustment?
5. Which vendor types launch first? The requirement says general gift shop, but seed categories include flowers and cakes, which imply different fulfilment expectations.
6. Settlement cadence, payout method, and who is authorized to mark paid.
7. Whether product images should become private until the vendor/product is active.

**Risks:**

- Revoking `apply_as_vendor` and enforcing vendor status are breaking changes for existing pending/suspended accounts.
- RLS changes require a hosted migration and re-running the destructive RLS suites.
- Public bucket behavior is silent; fixing it may require path or URL changes.
- No CI means regressions rely on manual test runs.
- Documentation and hand-written types will drift further unless regenerated.

No code, migrations, configuration, or docs were changed during the audit. Awaiting approval before Phase 2A design/implementation.
