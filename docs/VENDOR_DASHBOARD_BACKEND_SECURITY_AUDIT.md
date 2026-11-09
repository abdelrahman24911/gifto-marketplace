# Vendor Dashboard Backend Security Audit

**Date:** 2026-11-06
**Audit target:** `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md` and the proposed migration `supabase/migrations/00000000000020_vendor_dashboard_backend_gaps.sql`
**Audit type:** Read-only security, authorization, SQL-correctness, migration, and test-coverage review
**Audit result:** **SAFE AFTER REQUIRED FIXES**
**Draft-as-written status:** **Not safe to apply**

> This audit reviewed the proposal and the existing repository. No proposed SQL was applied to the local or hosted database. No source, migration, test, configuration, or deployment file was changed. The only new file is this report.
>
> **Status update:** the required fixes from this audit were implemented in migrations 20–24 and application code; see `docs/VENDOR_DASHBOARD_BACKEND_IMPLEMENTATION.md`. This report remains the pre-implementation review and should not be read as the current file inventory.

## 1. Executive Summary

The proposal correctly identifies real schema gaps and mostly follows the existing architecture. The additive profile fields, public-vendor projection, dedicated media bucket, support table, and analytics index are reasonable directions. The existing active-vendor helpers, owner-update policy, finance guard, and RLS-scoped analytics query are also appropriate foundations.

The draft cannot be applied as written. The main blockers are:

1. **The pause feature is not implemented beyond adding a column.** The proposal adds `is_accepting_orders` but does not change `_create_order`, does not update `public_vendors`, and does not provide the promised checkout tests. A vendor toggle would be cosmetic.
2. **Any authenticated user can read every column of every active vendor row.** `vendors: public read active` applies to the base table, not only the public view. The existing table grant exposes `commission_rate`, contact details, and `delivery_coverage`; adding `address_line` would expose pickup/logistics data too.
3. **The support-request insert grant is too broad.** Vendors receive table-level `INSERT`, so they can set `status`, `created_at`, `updated_at`, and `id` directly instead of being restricted to safe request fields.
4. **Pause enforcement is racy even if a simple check is added.** `_create_order` locks products but not vendor rows, so status or pause state can change between validation and order insertion.
5. **Existing logo objects are not migrated.** Switching URLs to `vendor-media` without copying existing objects would make existing shop logos disappear.

Secondary issues include a working-hours documentation/validator mismatch for JSON `null`, missing explicit `EXECUTE` grants, unbounded all-time analytics reads, no support rate limiting or notification path, and several migration-idempotency/rollback gaps.

### Feature Decision Summary

| Feature | Decision | Required condition |
| --- | --- | --- |
| Vendor profile fields | **APPROVE AFTER FIXES** | Fix authenticated base-table exposure; keep `address_line` private; add constraint/privacy tests |
| Working-hours validation | **APPROVE AFTER FIXES** | Clarify JSON `null`, add explicit function grants, add validation tests |
| Public projection | **APPROVE AFTER FIXES** | Apply only after the base-table privacy fix and owner approval of public fields |
| `vendor-media` bucket | **APPROVE AFTER FIXES** | Backfill or dual-read existing `product-images` logos; verify bucket configuration |
| Self-serve pause | **APPROVE AFTER FIXES** | Add `_create_order` enforcement, vendor row locks, view projection, and race tests |
| Support requests | **APPROVE AFTER FIXES** | Use column-level insert privileges or a trigger; decide rate limit and admin workflow |
| Analytics index | **APPROVE** | Keep all-time reads bounded or move aggregation to a tested `security invoker` RPC |
| Analytics aggregation RPC | **DEFER** | Separate approved change after measured need |
| Whole migration | **SAFE AFTER REQUIRED FIXES** | Do not apply the current draft |

## 2. Scope, Method, and Constraints

### In scope

- Proposed profile columns and constraints.
- Working-hours validator and check constraint.
- `public_vendors` replacement and grants.
- `vendor-media` bucket and storage policies.
- `is_accepting_orders` pause control and checkout integration.
- `support_requests` table, indexes, trigger, policies, and grants.
- Analytics index and proposed aggregation direction.
- Migration ordering, idempotency, rollback, and test coverage.

### Out of scope

- Applying SQL.
- Changing the hosted Supabase project `hqusykdyjpruysxezsrn`.
- Changing local or hosted storage objects.
- Deploying application code.
- Committing or pushing changes.

### Method

- Static review of the proposal and existing migrations.
- Cross-check of app code paths for vendors, checkout, storage, analytics, and support.
- Review of existing RLS tests and their coverage boundaries.
- Prior validation results were treated as historical evidence only; no proposed SQL or new RLS test was run during this audit.

## 3. Verified Architecture

### Identity and vendor authorization

- `is_platform_admin()` is the platform-admin check (`00000000000001_gifto_foundations.sql:76-93`).
- `is_vendor_active_member()` and `is_vendor_active_owner()` require an active vendor and are `SECURITY DEFINER` helpers (`00000000000015_active_vendor_hardening.sql:20-57`).
- The owner-update policy is active-only (`00000000000015_active_vendor_hardening.sql:81-85`).
- `guard_vendor_finance_fields()` blocks non-admin changes to `status` and `commission_rate` (`00000000000001_gifto_foundations.sql:364-390`).
- Migration 14 replaced `is_vendor_manager` with active-vendor-only logic, so the existing order-status policy is not an inactive-manager finding.

### Vendor base-table access

- `vendors: public read active` is a row policy on the base table (`00000000000001_gifto_foundations.sql:334-336`).
- Authenticated users receive table-level `SELECT, INSERT, UPDATE, DELETE` on `vendors` (`00000000000001_gifto_foundations.sql:431-436`).
- The base table stores private/internal columns including `delivery_coverage`, `commission_rate`, `contact_phone`, and `contact_email` (`00000000000001_gifto_foundations.sql:151-155`).
- The public directory view filters `status = 'active'` and exposes only selected columns (`00000000000003_public_vendor_directory.sql:16-35`).
- `public_vendors` is an owner-rights view; it is not declared `security_barrier`.
- Migration 19 reapplies least-privilege grants on the view (`00000000000019_public_vendor_view_privileges.sql:8-9`).

### Checkout

- Authenticated and guest checkout both call the private `public._create_order(...)` (`00000000000011_guest_checkout.sql:168-184`).
- Products are locked in id order (`00000000000011_guest_checkout.sql:307-313`).
- Product status and `is_public_vendor()` are checked while products are locked (`00000000000011_guest_checkout.sql:317-319`).
- `commission_rate` is read from `vendors` without a vendor-row lock (`00000000000011_guest_checkout.sql:381-384`).
- `is_public_vendor()` currently checks vendor `status = 'active'` only (`00000000000004_catalog.sql:99-107`).
- `_create_order` is revoked from all API roles and is only callable through its wrappers (`00000000000011_guest_checkout.sql:417-421`).

### Storage

- `product-images` is a public-read bucket with a 5 MB limit and image MIME restrictions (`00000000000009_product_image_upload.sql:9-17`).
- Its upload/delete policies require a real product id in path segment 2 and active manager rights (`00000000000009_product_image_upload.sql:29-58`).
- Current logo upload uses `createServiceClient()` after application-level role checks and writes `{vendor_id}/branding/logo-{uuid}.{ext}` into `product-images` (`src/app/vendor/settings/actions.ts:277-302`).
- Current logo removal uses the same service client and `PRODUCT_IMAGES_BUCKET` (`src/app/vendor/settings/actions.ts:219-221`).

### Analytics and support

- Analytics uses the caller's RLS-scoped Supabase client (`src/app/vendor/analytics/page.tsx:83-96`).
- “All time” has no lower `created_at` bound (`src/app/vendor/analytics/page.tsx:81-96`; `src/lib/vendor-analytics.ts:166-170`).
- Analytics semantics are documented as placement-cohort gross sales, delivered-only recognised revenue, delivered-date chart buckets, and delivered-only best sellers (`src/lib/vendor-analytics.ts:3-15`).
- Support is currently static content only; there is no ticket table or form (`docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:17, 27, 261`).

## 4. Section-by-Section Review

### 4.1 Vendor Profile Fields

**Proposal:** Add nullable `cover_path`, `address_line`, `working_hours`, and prep-time columns, plus a prep-time ordering constraint (`docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:39-71`).

**Verified:** The columns do not exist today. The owner-update policy allows descriptive columns, and the finance guard blocks only `status` and `commission_rate`. The prep-time check is logically correct.

**Findings:**

- **SEC-01 (HIGH):** The new `address_line` would be readable by any authenticated user through the base `vendors` table. Keeping it out of `public_vendors` is necessary but not sufficient.
- **SEC-04/LOW:** `vendor_working_hours_valid()` is created with default `EXECUTE` for `PUBLIC`; explicit revocation/grant is required for consistency with the project's hardening pattern.
- The field lengths and prep-time bounds are reasonable, but there is no test for trim behavior or constraint enforcement.

**Required fixes:**

- Resolve SEC-01 before adding `address_line` or any other private vendor field.
- Add explicit function grants for the new validator.
- Add tests for allowed/blocked column updates and for anonymous versus authenticated access.

**Decision:** **APPROVE AFTER FIXES**

### 4.2 Working-Hours Validation

**Proposal:** A JSON object per day, missing or `null` means closed, same-day ranges only, `close > open` (`docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:75-154`).

**Verified:** The function safely normalizes non-object input with a CTE and validates keys, value types, time formats, extra keys, and same-day ordering. The `IMMUTABLE` marker is appropriate for a pure JSON validator.

**Findings:**

- **SQL-01 (LOW):** The documentation says JSON `null` means closed, but the validator rejects `"mon": null` because `slot is not null` does not skip a JSONB null; `jsonb_typeof(slot) <> 'object'` becomes true. The UI must omit the day instead of writing `null`, or the validator must explicitly treat JSON `null` as closed.
- **SEC-04/LOW:** The function has no explicit `REVOKE EXECUTE ... FROM PUBLIC` and no intentional grant.
- The validator rejects overnight ranges by design; this is a product decision, not a correctness bug.
- There is no timezone field or enforcement semantics. Working hours are display-only in the proposal; that should be stated explicitly.

**Required fixes:**

- Decide JSON `null` semantics and make documentation, validator, and UI agree.
- Add `REVOKE`/`GRANT EXECUTE` as appropriate for check-constraint evaluation.
- Add tests for: valid object, empty object, missing day, JSON null day, non-object, invalid day, extra keys, malformed time, `close <= open`, and overnight rejection.

**Decision:** **APPROVE AFTER FIXES**

### 4.3 Public Projection

**Proposal:** Replace `public_vendors`, appending `cover_path`, `working_hours`, and prep-time fields, but not `address_line` (`docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:156-182`).

**Verified:** Appending columns to the existing view is structurally compatible because the current view ends at `created_at` (`00000000000003_public_vendor_directory.sql:16-25`). Reapplying the revoke/grant is consistent with migration 19.

**Findings:**

- **SEC-01 (HIGH):** The view itself is correctly privacy-limited, but it does not fix the base-table leak. An authenticated non-member can bypass the view and read `vendors` directly.
- **INFO-01 (INFORMATIONAL):** The view is owner-rights and is not declared `security_barrier`. That is acceptable for the current hard-filtered projection, but future operators/functions must not be added without re-review.
- **INFO-02 (INFORMATIONAL):** `CREATE OR REPLACE VIEW` preserves column order. Future edits that reorder or change types will fail; append only, as proposed.
- The proposal correctly keeps `address_line` out of the public projection.

**Required fixes:**

- Fix SEC-01 first.
- Make the public-field inclusion an explicit owner decision.
- Add tests that anonymous and authenticated non-members cannot read private columns through either the view or the base table.

**Decision:** **APPROVE AFTER FIXES**

### 4.4 Dedicated `vendor-media` Bucket

**Proposal:** Create public-read `vendor-media`, allow active owners/admins to upload/delete under `{vendor_id}/branding/{uuid}.{ext}`, and switch logo actions away from the service client (`docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:184-244`).

**Verified:** The path convention matches the current logo action (`src/app/vendor/settings/actions.ts:277`). The policy uses `is_vendor_active_owner` and `is_platform_admin`, and compares the first path segment to `vendors.id` as text without casting untrusted input to uuid.

**Findings:**

- **BIZ-05/MEDIUM:** Existing logos live in `product-images`; new uploads would live in `vendor-media`. Switching the URL builder without copying or dual-reading existing objects makes all existing logos disappear.
- **SQL-03/LOW:** `ON CONFLICT (id) DO NOTHING` silently leaves an existing bucket’s `public`, size, or MIME configuration untouched. A pre-existing private bucket would cause public URL failures even though the RLS read policy exists.
- The bucket is intentionally public. It must not be used for private brand assets in the future without a separate bucket revision.
- The current delete path only references `PRODUCT_IMAGES_BUCKET` (`src/app/vendor/settings/actions.ts:219-221`); the switch must handle old and new objects during the transition.
- A suspended vendor cannot upload or delete its own branding because the policy uses active-owner helpers. Admin cleanup remains possible. This is acceptable if suspension is intended to freeze self-service.

**Required fixes:**

- Backfill existing objects into `vendor-media` using a storage copy/script, or keep dual-read and dual-delete support during the transition.
- Change the app’s upload, remove, and public URL logic together.
- Verify or reconcile bucket configuration; do not silently retain a misconfigured existing bucket.
- Add storage-policy tests for active owner, staff, pending owner, cross-vendor owner, anon, and admin; add an integration check that old logos still resolve after the switch.

**Decision:** **APPROVE AFTER FIXES**

### 4.5 Self-Serve Pause / Visibility

**Proposal:** Add `vendors.is_accepting_orders` and update checkout validation, with a note that shipping the toggle alone would be misleading (`docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:246-257`).

**Verified:** The column does not exist today. No `public_vendors` projection for the flag is included in the section, and no `_create_order` change is included. `_create_order` currently checks only product status and `is_public_vendor` before inserting the order (`00000000000011_guest_checkout.sql:307-319, 381-390`).

**Findings:**

- **BIZ-01 (HIGH):** The feature is incomplete. As written, `is_accepting_orders` changes nothing in checkout. The column would be a false control.
- **BIZ-02 (HIGH):** Even a simple `is_accepting_orders` check would race unless vendor rows are locked. Product rows are locked, but vendor status/flag reads are not. A vendor can be paused or suspended between the product check and order insertion; `commission_rate` is also read without a lock.
- **BIZ-03 (MEDIUM):** “Pause” has two possible meanings: block new orders only, or hide the storefront. The proposal does not define whether paused products remain visible, whether `public_vendors` filters the vendor, or whether `is_public_vendor()` changes. Shipping without this decision creates inconsistent customer behavior.
- **BIZ-04 (MEDIUM):** `public_vendors` does not include `is_accepting_orders` in the proposed view SQL, despite the text saying it should be added. The view replacement in section 3.3 runs before the column is added in section 3.5.

**Required fixes:**

- Decide order-blocking versus storefront-hiding semantics.
- If blocking only, keep products visible and show a clear paused state; add the flag to the view only if the UI needs it.
- If hiding, update `public_vendors`, `is_public_vendor()`, product policies, and storefront queries consistently.
- Add `_create_order` enforcement for every distinct vendor in the cart.
- Lock vendor rows in deterministic id order inside `_create_order`, then re-check `status = 'active'` and `is_accepting_orders` before inserting orders or reading `commission_rate`.
- Test authenticated and guest wrappers, mixed carts, paused vendors, suspended vendors, and concurrent pause/checkout behavior.

**Decision:** **APPROVE AFTER FIXES**

### 4.6 Support Requests

**Proposal:** Add `support_requests`, vendor read/insert policies, admin read/update policies, and grants (`docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:259-322`).

**Verified:** The table shape, foreign keys, category/status checks, text length checks, `set_updated_at()` reuse, and RLS policy intent are sound. The admin update policy is appropriately restricted by `is_platform_admin()`.

**Findings:**

- **SEC-02 (MEDIUM/HIGH):** `GRANT SELECT, INSERT ON TABLE ... TO authenticated` is table-level. A vendor can insert `status = 'resolved'` or `'in_progress'`, set arbitrary `created_at`/`updated_at`, and choose an `id`. This breaks the admin queue and status integrity.
- **SEC-03 (MEDIUM):** There is no rate limit. An authenticated vendor can create unlimited requests.
- **BIZ-06 (MEDIUM):** There is no notification path. The proposal acknowledges this, but a ticket queue without monitoring can create false expectations.
- **BIZ-07 (LOW):** There is no reply thread, no resolution note, no `resolved_by`, and no audit trail for status changes. A simple queue is acceptable only if that limitation is explicit.
- **SEC-08 (LOW):** `subject` and `body` are user-controlled text. If a future UI renders them as HTML, stored XSS is possible. Render as plain text or escape on output.
- The proposal’s indexes are not declared `IF NOT EXISTS`; see SQL-02.

**Required fixes:**

- Replace table-level insert with column-level insert privileges, or use a trigger to force `status = 'open'`, `created_at = now()`, `updated_at = now()`, and a generated `id`. The RLS policy should still require `created_by = auth.uid()`.
- Add a rate limit at the application or database layer.
- Decide whether an admin queue is sufficient. If not, add notification infrastructure in a separate approved change.
- Render request text safely.
- Add tests for vendor insert, vendor status tampering, vendor update denial, cross-vendor insert denial, admin read/update, anon denial, and inactive-member behavior.

**Decision:** **APPROVE AFTER FIXES**

### 4.7 Analytics Scale

**Proposal:** Add `order_vendors (vendor_id, created_at desc)` and keep the in-app aggregation until volumes justify a `security invoker` RPC (`docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:324-333`).

**Verified:** The query filters by `vendor_id` and optionally `created_at`, and orders by `created_at desc` (`src/app/vendor/analytics/page.tsx:83-96`). The proposed index matches that access pattern. The proposal correctly says an analytics RPC must be `security invoker`, not `security definer`.

**Findings:**

- **PERF-01 (MEDIUM):** “All time” has no lower bound and returns every suborder plus joined items. The index does not bound the result set. A vendor with years of history can cause slow responses, memory pressure, and repeated expensive reads.
- **SQL-02/LOW:** `CREATE INDEX IF NOT EXISTS` still takes a lock that can block writes while it builds. This is likely acceptable at current scale but should be a conscious deployment decision.
- The existing analytics semantics are internally consistent and should not be changed as part of this migration.

**Required fixes:**

- Keep the index if the query remains.
- Bound “all time” with pagination, a maximum range, or a server-side aggregate RPC.
- If adding the RPC, test it against the existing RLS suites and keep `security invoker`.

**Decision:** **APPROVE** for the index, **DEFER** for the RPC

## 5. Detailed Findings

### SEC-01 — HIGH — Authenticated users can read private active-vendor columns

**References:**

- `supabase/migrations/00000000000001_gifto_foundations.sql:334-336`
- `supabase/migrations/00000000000001_gifto_foundations.sql:431-436`
- `supabase/migrations/00000000000001_gifto_foundations.sql:151-155`
- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:46-47`

**Impact:** Any authenticated user can select all columns from every active vendor, including commission rate, contact phone, contact email, delivery coverage, and any new `address_line`. The `public_vendors` view fixes anonymous column exposure only; it does not remove the base-table path for signed-in users.

**Failure scenario:** A normal customer account queries the `vendors` table with a filter for active status and selects `commission_rate`, `contact_email`, or `address_line`. RLS allows the row because `vendors: public read active` applies to all authenticated callers. No vendor membership or admin role is required.

**Correction:** Remove the broad public-read policy from the base table and serve storefront reads from `public_vendors`. Keep base-table access for own-vendor members, owners, and platform admins through the existing restricted policies. If an authenticated base-table read is unavoidable for a settings flow, expose only the required rows through a reviewed view or RPC rather than restoring the public row policy. Do not add `address_line` until this is fixed.

**Required test:** An authenticated user with no vendor membership cannot select private columns from an active vendor through the base table. An active owner can still select its own vendor; an admin can still select any vendor.

### SEC-02 — MEDIUM/HIGH — Support insert privilege permits status and timestamp tampering

**References:**

- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:295-300`
- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:311-313`
- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:264-278`

**Impact:** The insert RLS policy checks vendor membership and `created_by`, but the table-level `INSERT` grant allows a vendor to supply any insertable column. A vendor can create a ticket already marked `resolved`, set a misleading creation time, or choose its own id.

**Failure scenario:** A vendor inserts a request with `status = 'resolved'`. The admin queue filtered to `open`/`in_progress` never sees it, while the vendor has a record that appears handled. A vendor can also create a future-dated request to manipulate sort order.

**Correction:** Grant insert only on the safe columns: `vendor_id`, `category`, `subject`, and `body`. Let `id`, `created_by`, `status`, `created_at`, and `updated_at` use defaults. Alternatively, add a `BEFORE INSERT` trigger that forces those fields. Keep the RLS check requiring active membership and `created_by = auth.uid()`.

**Required test:** Vendor insert succeeds only with safe columns and defaults; an explicit `status = 'resolved'`, arbitrary timestamp, or arbitrary id is rejected or silently normalized.

### SEC-04 — LOW — Working-hours validator has default public execution

**References:**

- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:85-138`
- `supabase/migrations/00000000000001_gifto_foundations.sql:385-386`

**Impact:** PostgreSQL grants `EXECUTE` on new functions to `PUBLIC` by default. The validator is harmless as a pure boolean function, but the project otherwise explicitly revokes and grants function execution. Leaving the default is inconsistent and increases the future risk of exposing more sensitive function bodies.

**Failure scenario:** An unauthenticated caller invokes the function directly. Today this only returns a boolean, but it establishes an unintended privilege pattern for future changes.

**Correction:** `REVOKE ALL ON FUNCTION public.vendor_working_hours_valid(jsonb) FROM PUBLIC, anon;` and grant only to the roles that must evaluate the check constraint, such as `authenticated` and `service_role`. Confirm owner/service-role behavior in the local database before deployment.

**Required test:** `anon` cannot execute the function; `authenticated` can evaluate it through a vendor update; service-role writes still succeed.

### BIZ-01 — HIGH — Pause is not enforced by the proposed migration

**References:**

- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:246-257`
- `supabase/migrations/00000000000011_guest_checkout.sql:307-319`
- `supabase/migrations/00000000000011_guest_checkout.sql:381-390`

**Impact:** The feature promises a seller-controlled pause, but the proposed SQL only adds a column. Existing checkout continues to place orders for a paused vendor.

**Failure scenario:** A vendor sets `is_accepting_orders = false` and tells customers it is paused. A customer checks out successfully because `_create_order` never reads the flag. The vendor is still obligated to fulfil the order, and the feature has created a false operational signal.

**Correction:** Do not ship the column without checkout enforcement. Add the flag to the relevant public projection, update `_create_order`, and add authenticated and guest order-placement tests. If the flag is not approved, omit the column entirely.

**Required test:** With `is_accepting_orders = false`, both `place_order_with_idempotency` and `place_guest_order` fail before any order/suborder/item rows are created, with a vendor-specific error. With the flag true, both succeed.

### BIZ-02 — HIGH — Vendor state and commission reads need row locks

**References:**

- `supabase/migrations/00000000000011_guest_checkout.sql:307-319`
- `supabase/migrations/00000000000011_guest_checkout.sql:381-384`
- `supabase/migrations/00000000000004_catalog.sql:99-107`

**Impact:** Product rows are locked, but vendor rows are not. Vendor status can change between the `is_public_vendor()` check and order insertion. The current commission read is also unlocked. Adding only a non-locking pause check leaves the same time-of-check/time-of-use race.

**Failure scenario:** Checkout validates that vendor A is active. Before the suborder is inserted, an admin suspends vendor A or the owner pauses it. Checkout still inserts the order and snapshots the old commission. The platform has accepted an order for a vendor that is no longer allowed to sell.

**Correction:** After locking products and collecting distinct vendor ids, lock those vendor rows in ascending id order with `FOR UPDATE`. Re-check `status = 'active'` and `is_accepting_orders` after acquiring the locks, then read `commission_rate` while the row is locked. Keep the order deterministic to avoid deadlocks with multi-vendor carts. Re-check product vendor association while products are locked.

**Required test:** Concurrency test with one session pausing/suspending a vendor and another placing an order. The transaction that acquires the vendor lock first wins; the later transaction sees the new state and fails. At minimum, add a deterministic test that a vendor change committed before checkout is rejected.

### BIZ-03 — MEDIUM — Pause semantics are undefined

**References:**

- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:246-257`
- `supabase/migrations/00000000000004_catalog.sql:99-107`
- `supabase/migrations/00000000000003_public_vendor_directory.sql:16-27`

**Impact:** “Pause” could mean “stop accepting orders but keep the shop visible” or “hide the shop and its products.” The proposal only adds a checkout flag, while the view and `is_public_vendor()` continue to treat the vendor as public. The implementation will be inconsistent depending on which surface a customer uses.

**Failure scenario:** A paused vendor still appears in the public directory and product listings, but checkout fails with a generic availability error. Customers interpret this as a broken shop rather than a deliberate pause.

**Correction:** Make an explicit product decision. For order-only pause, keep the storefront visible, display a paused notice, and block checkout. For full visibility pause, update `public_vendors`, `is_public_vendor()`, product policies, and storefront queries together. Add the chosen behavior to tests and customer-facing copy.

**Required test:** The directory, shop page, product listing, and both checkout paths all agree on the paused state.

### SEC-03 — MEDIUM — Support requests have no abuse limit

**References:**

- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:291-313`
- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:320-321`

**Impact:** Any active vendor member can insert unlimited rows. This is a low-complexity way to fill the table, create admin noise, or consume database/storage resources.

**Failure scenario:** A compromised or malicious vendor account submits thousands of requests. The admin queue and indexes grow, and legitimate requests are buried.

**Correction:** Add an application-level rate limit and a database-side guard such as a recent-request count per vendor/profile. Set a retention policy or admin close/archive path. Do not rely on the UI alone.

**Required test:** Repeated inserts within a short window are rejected or throttled; a legitimate later request still succeeds.

### BIZ-05 — MEDIUM — Existing logos need migration or dual-read

**References:**

- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:184-244`
- `src/app/vendor/settings/actions.ts:219-221`
- `src/app/vendor/settings/actions.ts:277-302`
- `supabase/migrations/00000000000009_product_image_upload.sql:9-58`

**Impact:** Existing `logo_path` values point to objects in `product-images`. A new public URL builder pointed at `vendor-media` will return missing objects until those objects are copied. Current removal logic also only knows the old bucket.

**Failure scenario:** The migration and code deploy before any backfill. Every existing shop logo becomes a broken image. The owner uploads a new logo and the old object remains orphaned in `product-images`.

**Correction:** Prefer a storage copy/backfill step before switching URLs. If that is not possible, dual-read: try `vendor-media`, then fall back to `product-images` for existing paths. Make removal check both buckets during the transition. Ensure `logo_path` remains the same path if objects are copied to the same relative path, or migrate the column values if the path scheme changes.

**Required test:** An existing logo in `product-images` remains visible after the code switch; a new logo in `vendor-media` is visible; removing either path removes or intentionally retains the correct object.

### PERF-01 — MEDIUM — All-time analytics is unbounded

**References:**

- `src/app/vendor/analytics/page.tsx:81-96`
- `src/lib/vendor-analytics.ts:166-170`
- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:324-333`

**Impact:** “All time” omits the `created_at` lower bound and fetches every matching suborder with nested order items. The proposed index improves range scans but does not limit the result set. Large vendors can cause slow responses, high memory use, and database load.

**Failure scenario:** A vendor with several years of orders opens “All time.” PostgREST returns a large joined payload, the server action/rendering exceeds its memory or timeout budget, and the page fails repeatedly.

**Correction:** Keep the index for bounded ranges. Bound “all time” with a maximum range or pagination, or move aggregation server-side into a `security invoker` RPC that returns only aggregate rows. Do not use `security definer` for analytics.

**Required test:** A vendor with a large seeded history can load the page within the agreed budget; cross-vendor rows are absent; the RPC/index plan is reviewed with `EXPLAIN`.

### SQL-01 — LOW — Working-hours JSON null semantics mismatch

**References:**

- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:75`
- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:113-136`

**Impact:** The proposal says missing or `null` means closed, but the validator rejects a present JSON `null` day. Clients that serialize closed days as `null` will fail the check constraint.

**Failure scenario:** The settings UI sends `{"mon": null, ...}` for a closed Monday. The update fails with a check violation even though the documented contract says this is valid.

**Correction:** Either treat `slot = 'null'::jsonb` as closed and skip it, or explicitly document that clients must omit closed days and reject `null`. Make the UI and tests match the chosen contract.

**Required test:** A JSON object with an omitted day succeeds; a JSON object with an explicit `null` day is either accepted as closed or rejected with a clear error, consistently with the documentation.

### SQL-02 — LOW — Migration idempotency and lock behavior

**References:**

- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:280-283`
- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:329-331`
- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:54-68`

**Impact:** The support indexes lack `IF NOT EXISTS`; a partially applied or manually re-run migration can fail. `CREATE INDEX` takes a lock that blocks writes while it builds. `ADD CONSTRAINT ... CHECK` validates existing rows and can hold a stronger lock than expected.

**Failure scenario:** An operator re-runs the migration in a local recovery attempt and hits a duplicate index error, leaving the migration state ambiguous. On a large table, the analytics index blocks order writes for the duration of the build.

**Correction:** Use `CREATE INDEX IF NOT EXISTS`. Keep migrations transactional. For large tables, build indexes concurrently outside the transaction or use a separate deployment step. For expensive checks, consider `NOT VALID` plus a separately scheduled `VALIDATE CONSTRAINT` if the table is large and the lock budget matters.

**Required test:** Apply the migration twice in a disposable local database; confirm idempotent behavior for guarded objects (or confirm the intended one-shot behavior). Review lock impact with representative row counts.

### SQL-03 — LOW — Bucket conflict handling can retain a wrong configuration

**References:**

- `docs/VENDOR_DASHBOARD_BACKEND_GAPS.md:189-197`

**Impact:** `ON CONFLICT (id) DO NOTHING` means an existing bucket is not reconciled. If it exists with `public = false`, wrong size limit, or wrong MIME list, the migration appears successful while public URLs or uploads behave incorrectly.

**Failure scenario:** A developer pre-creates `vendor-media` with the wrong public flag in the dashboard. The migration does nothing. The public URL continues to fail even though the RLS read policy is correct.

**Correction:** Either use `ON CONFLICT (id) DO UPDATE SET` for the controlled fields, or add an explicit verification query that fails the migration if the existing bucket does not match the intended configuration. Do not silently accept drift.

**Required test:** Run the migration against a fresh bucket and against a deliberately misconfigured existing bucket; the result is either corrected or clearly rejected.

### INFO-01 — INFORMATIONAL — Owner-rights public view is not `security_barrier`

**References:**

- `supabase/migrations/00000000000003_public_vendor_directory.sql:9-14`
- `supabase/migrations/00000000000003_public_vendor_directory.sql:16-27`

**Impact:** The view runs with the owner’s rights and applies a hard `status = 'active'` filter. It is currently a safe projection. Without `security_barrier`, future predicates/functions that leak information could change that safety property.

**Failure scenario:** A future maintainer adds a leaky operator or function to the view without re-review, and the owner-rights view exposes data that the caller’s RLS would otherwise hide.

**Correction:** Document the view as security-sensitive. Consider `security_barrier` if future predicates are added. Keep the public-column list explicit and tested.

## 6. SQL Correctness Notes

- The working-hours validator is mostly correct for its stated same-day shape, but the JSON-null mismatch remains (SQL-01).
- The validator is created with default public execution; fix the grant model (SEC-04).
- `CREATE OR REPLACE VIEW` append compatibility is correct for the current column order; do not reorder existing columns.
- The proposal does not update `public_vendors` for `is_accepting_orders`, and section 3.3 runs before section 3.5. A second view replacement or a reordered migration is required if the flag becomes public.
- `_create_order` is not modified by the proposal. The pause feature is therefore SQL-incomplete, not merely untested.
- `is_public_vendor()` checks only `status = 'active'`; it does not know about `is_accepting_orders`. The migration must decide whether pause affects product visibility.
- `support_requests` table-level `INSERT` is the main SQL authorization defect (SEC-02).
- `grant update (status, updated_at)` is correctly column-scoped and is protected by the admin-only update policy. Vendors cannot update through RLS.
- The support indexes need `IF NOT EXISTS` for idempotent recovery.
- The analytics index matches the query shape and should be kept if the in-app aggregation remains.
- The bucket `ON CONFLICT DO NOTHING` needs configuration reconciliation or an explicit assertion.
- The proposal correctly keeps `address_line` out of the public view, but the base-table exposure still makes it private in name only.
- `database.types.ts` must be updated for new vendor columns, the expanded view, `is_accepting_orders`, `support_requests`, and any new RPC. The proposal only mentions the support table.
- `vendor-media` policies reference `public.vendors`; if SEC-01 is fixed by removing the public read policy, ensure owners/admins can still see the vendor row through `vendors: members read own` or `vendors: platform admin read`. Do not break the storage policy while fixing base-table privacy.

## 7. Migration and Rollback Concerns

### Ordering

1. Apply additive vendor columns.
2. Create and grant the working-hours validator.
3. Add the working-hours check constraint.
4. Replace `public_vendors` with the approved public fields.
5. Create/reconcile `vendor-media` and its policies.
6. Add pause column and update checkout/view if approved.
7. Create support table, indexes, trigger, policies, and grants.
8. Create analytics index.

The proposal currently places the pause column after the public view, and does not update the view. Reorder or repeat the view replacement.

### Locking

- `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT` can take a table lock. PostgreSQL 17's fast default avoids a full rewrite for a constant default, but the lock still exists.
- Adding the working-hours check validates existing rows. At current scale this is likely acceptable; at larger scale, use `NOT VALID` plus a controlled validation step.
- `CREATE INDEX` blocks writes while it builds. The analytics index is additive but still has a deployment cost.
- `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block. If the migration runner is transactional, use a separate approved step.

### Rollback

There is no down migration. A rollback must be planned before applying:

- Export or back up any support data before dropping `support_requests`.
- Drop policies, trigger, indexes, and table in dependency order.
- Drop the working-hours constraint before dropping the function.
- Restore the previous `public_vendors` definition; dropping the view is not necessary if the old definition is known, but dependent app code must be checked.
- Remove `is_accepting_orders` only after reverting checkout code and confirming no code reads it.
- Do not delete the `vendor-media` bucket automatically; objects may be the only copy of live logos. Decide retention and cleanup separately.
- Removing profile columns is destructive; back up data first.
- Revert `database.types.ts` and app URL builders in the same deployment window as the migration rollback.

### Deployment sequencing

- Apply additive database changes before deploying code that depends on them.
- For logos, complete the object backfill before switching public URLs, or deploy dual-read first.
- For pause, deploy checkout enforcement before exposing the toggle to vendors.
- Do not expose a toggle that the checkout path does not enforce.

## 8. Test Coverage Matrix

Existing tests were reviewed statically. No new RLS tests were executed during this audit.

| Area | Existing coverage | Required additional coverage | Status |
| --- | --- | --- | --- |
| Vendor profile fields | Foundation RLS tests cover vendor member/owner/admin basics; settings unit tests cover form behavior | Owner update of allowed fields; owner cannot change `status`/`commission_rate`; length and prep-time constraints; anonymous/non-member privacy | Missing |
| Base-table privacy | No test that authenticated non-members cannot read private active-vendor columns | `authenticated` non-member select on `vendors` returns no private rows; owner and admin retain access | Missing; high priority |
| Public view | Catalog/foundation tests cover existing public vendor behavior | New public fields visible; `address_line` absent; inactive rows hidden; grants after replacement | Missing |
| Working hours | None | Valid, empty, missing, JSON null, non-object, invalid day, extra key, malformed time, `close <= open`, overnight rejection, SQL null | Missing |
| Vendor media | `rls_catalog_test.sql:341-431` covers product-image manager upload, staff/cross-vendor/unknown-product denial, anon denial, and public read; `:433-477` covers pending-owner denial and active-owner delete | Vendor-media active-owner upload, staff denial, pending denial, cross-vendor denial, anon denial, admin upload, public read, delete isolation, suspended-vendor behavior | Missing |
| Logo migration | No existing-object backfill test | Existing `product-images` object still resolves after URL switch; dual-read fallback; remove handles old/new bucket | Missing |
| Pause | Orders suite covers basic order RLS and pending-shop isolation (`rls_orders_test.sql`) | Paused vendor blocks authenticated and guest checkout; mixed carts; no partial order; suspended vendor; concurrent pause/checkout; view projection | Missing; required |
| Support requests | None | Vendor insert own; cross-vendor insert denied; `status`/`id`/timestamp tampering rejected; vendor update denied; admin read/update; anon denied; inactive member behavior; rate limit | Missing |
| Analytics | Unit tests cover aggregation semantics; analytics page has existing behavior tests where present | RLS isolation; all-time bound/RPC; large-history budget; index plan; no cross-vendor leakage | Partially covered; scale tests missing |
| Migration/rollback | Existing migrations are hand-reviewed; no down-migration test | Re-run behavior, lock impact, rollback order, type regeneration | Missing |

### Existing storage test observations

`supabase/tests/rls_catalog_test.sql` already establishes the pattern for storage-object tests:

- Test 16 (`:341-359`): a manager inserts into its own vendor/product folder.
- Test 17 (`:361-407`): staff, cross-vendor managers, and unknown products are denied.
- Test 18 (`:409-431`): anon cannot upload but can read the public bucket.
- Test 19 (`:433-477`): pending owners cannot upload; cross-vendor deletes are filtered; active owners can delete their own object.
- Test 20 (`:479-509+`): pending owners cannot update/delete catalog rows; active owners can.

The `vendor-media` tests should mirror this structure, using `storage_stub.sql` for local runs and the real storage schema only in the hosted environment.

## 9. Recommended Changes

### Required before any apply

1. **Fix SEC-01.** Remove the broad authenticated base-table read path for active vendors. Use `public_vendors` for storefront reads and preserve own-member/admin access through the existing restricted policies. Do not add `address_line` until this is fixed and tested.
2. **Fix BIZ-01 and BIZ-02.** Implement pause enforcement in `_create_order`, lock distinct vendor rows in deterministic order, re-check status and pause state, and read `commission_rate` while locked. Add the view projection only if the UI needs it.
3. **Fix SEC-02.** Replace the support table-level insert grant with safe column-level insert privileges or a trigger that forces request metadata.
4. **Fix media migration.** Copy or dual-read existing logos; update upload, remove, and URL code together; reconcile bucket configuration.
5. **Decide pause semantics.** Order-only pause versus full storefront hide; update `is_public_vendor()`, the view, product policies, and UI consistently.
6. **Fix working-hours contract.** Resolve JSON null semantics and add explicit function grants.
7. **Bound analytics.** Keep the index and add a range cap, pagination, or a tested `security invoker` RPC for all-time.
8. **Add rate limiting and an admin workflow for support.** Do not present a queue as monitored without a notification or manual-review decision.
9. **Add the test matrix above before deployment.** Include a disposable local database run of all new RLS tests.

### Recommended implementation order

1. Privacy fix for vendor base-table reads.
2. Profile columns and public view (excluding `address_line` from public).
3. Working-hours function and constraint.
4. Media bucket/backfill and app switch.
5. Pause column, checkout locking/enforcement, view projection.
6. Support table with safe insert grants and rate limit.
7. Analytics index and bounded query.
8. Type regeneration, app deployment, and rollback rehearsal.

## 10. Final Recommendation

**SAFE AFTER REQUIRED FIXES**

The proposal is directionally sound and mostly additive, but the current draft must not be applied. The blockers are:

- **BIZ-01:** Pause is not enforced.
- **BIZ-02:** Vendor state/commission reads are unlocked and racy.
- **SEC-01:** Authenticated users can read private active-vendor columns.
- **SEC-02:** Vendors can forge support status and timestamps.
- **BIZ-05:** Existing logos are not migrated.

After those are fixed, the remaining work is suitable for a separate approved migration with the test matrix above. The analytics index can be approved independently; the analytics aggregation RPC should remain deferred until measured need and a tested `security invoker` design exist.
