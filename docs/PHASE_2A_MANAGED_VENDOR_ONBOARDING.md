# Phase 2A — Managed Vendor Onboarding

## Status

Implemented in the application and prepared as migrations:

- `00000000000014_managed_vendor_onboarding.sql`
- `00000000000015_active_vendor_hardening.sql`

Neither migration's application state is tracked here. Whether migrations 14–15
are applied on the hosted project is recorded in `docs/HOSTED_STATE.md` — the
single hosted-state table; do not rely on this file for deployment state.
Apply 14 before 15, then deploy the matching application version.

## What changed

- Vendors are created by platform admins only. Public/self-service onboarding is removed.
- Admin creates a shop and sends the owner a Supabase Auth email invitation.
- New shops are always created with `status = 'pending'`.
- Vendors only reach the operational dashboard after an admin sets `status = 'active'`.
- `public.is_vendor_manager(uuid)` now requires the vendor to be `active`, so product, image, order and storage policies reject pending, suspended and rejected shops.
- The old `public.apply_as_vendor(...)` RPC is dropped.
- Migration 15 makes operational authorization consistently active-only:
  - Inactive owners cannot edit the vendor profile or manage the roster.
  - Inactive vendors cannot delete products or product images.
  - Inactive vendors cannot read orders, order items, PII, inventory movements, commission entries or settlements.
  - Inactive vendors keep read access to their own membership/status so `/account` can explain the current state.
- Product stock is no longer writable through the generic product UPDATE path. Migration 15 grants column-level product UPDATE access only; stock changes go through `adjust_product_stock(...)`, which writes an inventory movement.
- Vendor + owner creation is now a single service-role-only RPC, `create_vendor_for_owner(...)`, so a shop cannot be left without an owner.
- Contact emails have a normalized uniqueness index. The migration aborts with a duplicate-email report if existing data conflicts.
- Invitations to an already-registered email fall back to an Auth recovery link instead of failing.
- The vendor dashboard has a shared shell, shop switcher, active navigation, loading state and error state.
- Account screens show shop status but do not link non-active shops to the dashboard.
- The homepage and auth screens no longer advertise self-service vendor signup.

## Required environment

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=https://gifto-marketplace.vercel.app
```

`SUPABASE_SERVICE_ROLE_KEY` is used only in server actions through `src/lib/supabase/service.ts`, which imports `server-only`. Never expose it to the browser.

`NEXT_PUBLIC_SITE_URL` is used to build invitation/recovery redirects. Production
defaults to `https://gifto-marketplace.vercel.app` when the variable is omitted,
and rejects localhost origins if one is configured. Development defaults to
`http://localhost:3000`.

## Supabase Auth setup

1. Set **Authentication → URL Configuration → Site URL** to
   `https://gifto-marketplace.vercel.app`.
2. Add the following to **Redirect URLs**:
   - `https://gifto-marketplace.vercel.app/auth/callback`
   - `https://gifto-marketplace.vercel.app/auth/accept-invite`
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/accept-invite` for local development
3. Configure SMTP or the Supabase email provider so invitation emails are delivered.
4. Confirm the Auth email template for **Invite user** is enabled and looks correct.
5. Set a sensible minimum password length in Supabase Auth. The accept-invite form requires at least 8 characters.

## Admin flow

1. An admin signs in and opens `/admin`.
2. The admin fills in **Add a shop**: name, business email, optional description, city, governorate, phone and commission.
3. The server action verifies the platform-admin session.
4. The action checks for an existing vendor with the same contact email.
5. For a new email, Supabase Auth sends an invitation with a redirect to `/auth/accept-invite`.
6. For an already-registered email, the action reads the existing Auth user id and sends a password-recovery link instead.
7. The action calls `create_vendor_for_owner(...)`, which atomically creates the pending `vendors` row and the owner `vendor_members` row.
8. If vendor creation fails after a new Auth user was invited, the action deletes that new user. Existing Auth users are never deleted.
9. The new shop appears under **Pending activation**.
10. The admin sets the shop to `active` when Gifto is ready to launch it.

The database side is transactional. Auth account creation and email delivery happen outside that transaction, so cleanup remains best-effort for newly created Auth users.

## Invitation acceptance flow

The invited owner opens the email link and lands on `/auth/accept-invite`.

The client establishes the Supabase session from the invitation link, asks for a password, calls `supabase.auth.updateUser({ password })`, and redirects to `/account`.

If the link is invalid or expired, the page asks the owner to request a new invitation from Gifto.

## Authorization behavior

- `requireVendorRole` only returns active shops. A user with only pending/suspended/rejected shops is redirected to `/account`.
- The vendor layout performs the same active-shop guard before rendering the dashboard.
- Account pages show the status for non-active shops and keep dashboard links hidden.
- Product/image/order/storage writes are gated by active-only manager checks.
- Vendor profile edits and roster changes are gated by `is_vendor_active_owner`.
- Orders, order items, PII, inventory movements, commission entries and settlements are readable only by active vendor members.
- Inactive vendors can still read their own vendor/membership/status rows so the account page can explain the current state.
- Product stock changes are audited through `adjust_product_stock(...)`; direct `stock` updates are denied even for active managers.
- Platform admins continue to use the existing admin controls to activate, suspend or reject shops.
- No onboarding-profile edit flow exists for pending vendors. Pending vendors cannot write vendor profile fields directly.

## Migration contents

Migration 14:

- Drops `public.apply_as_vendor(text, text, text, text, text, text)`.
- Replaces `public.is_vendor_manager(uuid)` so it checks membership, owner/manager role and active vendor status.
- Restores the existing least-privilege grants on `is_vendor_manager`.

Policies that call `is_vendor_manager` automatically inherit the active-only rule, including product writes, product image writes, order line updates and storage writes.

Migration 15:

- Adds active-only helpers `is_vendor_active_member(uuid)` and `is_vendor_active_owner(uuid)`.
- Replaces `is_order_shop_member(uuid)` so parent-order PII is active-only.
- Replaces owner/roster/catalog-delete/order/PII/inventory/commission/settlement policies with active-only versions.
- Revokes table-wide product UPDATE from `authenticated` and grants only descriptive columns plus `updated_at`; `stock` is excluded.
- Adds a preflight duplicate check and a unique index on `lower(btrim(contact_email))`.
- Adds service-role-only `create_vendor_for_owner(...)` for atomic vendor + owner creation.

## Verification performed

```text
npm run typecheck   passed
npm run lint        passed
npm test            70 tests passed
npm run build       passed, including Tailwind CSS verification
```

Database RLS suites passed on fresh schemas after migrations 1-15 using the local Supabase CLI stack. Repeat them against an isolated disposable database (or the pinned `supabase/postgres:17.11.0.003` container) before deployment.

The SQL suites now refuse to run unless the disposable-database guard is explicitly set, and each suite wraps its work in a transaction that ends with `rollback`. In the same psql session:

```sql
set gifto.rls_test_disposable = 'yes';
\i supabase/tests/rls_catalog_test.sql
```

Recommended sequence:

1. Review migrations 14 and 15, their rollback files and the updated SQL suites.
2. Start a disposable database and set `gifto.rls_test_disposable = 'yes'`.
3. Run all SQL suites against that disposable database.
4. Apply migration 14, then migration 15, to staging.
5. Configure Supabase Auth URLs, SMTP and `NEXT_PUBLIC_SITE_URL`; production must not use localhost.
6. Create a test vendor from `/admin` and complete both the new-email invitation and existing-email recovery flows.
7. Verify pending/suspended vendors cannot read PII, manage rosters/profiles, delete catalog data or change stock directly.
8. Apply to production only after approval.

## Rollback

Rollback is not automatic. Executable rollback files are in `supabase/rollbacks/`:

- `00000000000015_active_vendor_hardening_rollback.sql`
- `00000000000014_managed_vendor_onboarding_rollback.sql`

Roll back 15 before 14. Rolling back 15 removes the active-only controls, the stock write restriction and the vendor-creation RPC. The migration 14 rollback restores membership-only `is_vendor_manager`; it deliberately does not recreate `apply_as_vendor`, because restoring self-service onboarding requires a separate reviewed decision. Redeploy the prior application version after rolling back the database.

Do not run a migration rollback against production without a reviewed plan and a database backup.

## Known limitations

- The `product-images` bucket remains public. Changing it to private/signed URLs is deferred because it affects storefront rendering and requires a separate storage-policy review.
- The normalized contact-email unique index can make migration 15 fail if production already contains duplicate emails. Resolve the duplicates reported by the preflight error, then rerun the migration.
- Deleting an active vendor product still cascades its `inventory_movements` rows. Product deletion is active-only now, but full audit retention across deletion requires a separate schema decision (for example archive-only deletion or detached movement history).
- There is no admin UI yet to resend an invitation or transfer ownership.
- Existing-email invitation fallback relies on Supabase Auth's recovery-link behavior and must be verified in the target project.
- There is no explicit pending-vendor onboarding-profile edit flow; pending vendors are blocked from direct vendor profile writes.
- The commission percentage bug in the existing admin control was corrected while implementing vendor creation: percentages are now converted to the stored `0–1` fraction instead of being stored as whole numbers.
