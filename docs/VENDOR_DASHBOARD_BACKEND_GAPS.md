> **HISTORICAL — 2026-11-20 (P0-08).** Dated snapshot of a past verification (see the date in the file). Its numbers and hosted-state claims were true when written and are not current. Current state: `README.md`, `docs/HOSTED_STATE.md` (single hosted-state table), `docs/DECISIONS.md`. Kept as a record; its findings were not edited.

# Vendor Dashboard Backend Gaps

**Date:** 2026-11-06
**Scope:** `/vendor/analytics`, `/vendor/settings`, `/vendor/support` and the vendor logo surface.
**Status:** the three dashboard sections were first implemented against the **existing** schema, then the approved backend remediation was implemented in migrations 20–24. See `docs/VENDOR_DASHBOARD_BACKEND_IMPLEMENTATION.md` for the shipped design, validation, backfill, and rollback order. This document remains the original proposal and audit trail; the SQL below is not the applied shape.
**Rule:** do not apply, deploy, or commit these changes without explicit owner approval.

---

## 1. What shipped without a migration

| Area | Implemented behaviour | Backend used |
| --- | --- | --- |
| Analytics | Delivered-only recognised revenue, gross/open/cancelled/returned reconciliation, revenue and order charts, best sellers, status outcomes, low-stock alerts | RLS-scoped reads of `order_vendors`, `order_items`, `products` |
| Store settings | Shop name, description, contact phone/email, city/governorate, delivery coverage | RLS-scoped `vendors` read/update (`vendors: owner update own`) |
| Shop logo | Upload/replace/remove, public rendering, monogram fallback | server action uploads to `product-images` with the service-role client, then writes `vendors.logo_path` under RLS |
| Help & support | 23 searchable, grounded FAQs plus honest "no in-app tickets yet" notice | static content only |
| Public logo | `logo_path` added to the shop loader and rendered on shop cards and shop pages | `public_vendors.logo_path` |

The existing owner-update policy allows the descriptive columns above. The finance-field guard trigger only blocks `status` and `commission_rate`, so no new RLS policy is needed for the shipped settings form.

---

## 2. Confirmed schema limits

- `vendors` has no `cover_path`, street address, working hours, preparation/lead-time fields, or self-serve visibility/pause field.
- There is no `support_requests` (or equivalent) table.
- There is no dedicated vendor-media bucket. The only bucket is `product-images`; its insert/delete policies require a real product id in path segment 2, so they cannot authorize a logo write.
- Logo upload therefore uses `createServiceClient()` server-side **after** the action has verified `requireVendorRole`, `canEdit`, and the vendor id. The database write remains RLS-scoped. Orphaned-object cleanup is best-effort.
- `public_vendors` exposes `logo_path`, but not any of the fields proposed below.

---

## 3. Proposed migration (not applied)

Suggested file name: `supabase/migrations/00000000000020_vendor_dashboard_backend_gaps.sql`.
Apply only after approval, then deploy the matching application code.

### 3.1 Additive vendor profile fields (safe subset)

```sql
-- Additive, nullable fields. Existing rows keep working while the UI rolls out.
alter table public.vendors
  add column if not exists cover_path text
    check (cover_path is null or length(cover_path) between 1 and 400),
  add column if not exists address_line text
    check (address_line is null or length(btrim(address_line)) between 5 and 300),
  add column if not exists working_hours jsonb not null default '{}'::jsonb,
  add column if not exists prep_time_min_days int
    check (prep_time_min_days is null or prep_time_min_days between 0 and 60),
  add column if not exists prep_time_max_days int
    check (prep_time_max_days is null or prep_time_max_days between 0 and 60);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vendors_prep_time_order'
      and conrelid = 'public.vendors'::regclass
  ) then
    alter table public.vendors
      add constraint vendors_prep_time_order check (
        prep_time_min_days is null
        or prep_time_max_days is null
        or prep_time_max_days >= prep_time_min_days
      );
  end if;
end $$;
```

`address_line` is intentionally **not** proposed for `public_vendors`: it is a pickup/logistics detail, not public storefront copy. `cover_path`, `working_hours`, and prep times are candidates for public display, but that is an owner decision (see section 5).

### 3.2 Working-hours validation

The proposed shape is one optional object per day. Missing or `null` means closed.

```json
{
  "mon": { "open": "09:00", "close": "18:00" },
  "fri": { "open": "14:00", "close": "20:00" }
}
```

```sql
create or replace function public.vendor_working_hours_valid(p_hours jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  with safe as (
    select case
      when jsonb_typeof(p_hours) = 'object' then p_hours
      else '{}'::jsonb
    end as hours
  ),
  allowed_days(day) as (
    values ('sun'), ('mon'), ('tue'), ('wed'), ('thu'), ('fri'), ('sat')
  ),
  slots as (
    select safe.hours -> allowed_days.day as slot
    from safe
    cross join allowed_days
  )
  select
    coalesce(jsonb_typeof(p_hours) = 'object', false)
    and (select count(*) from safe, jsonb_object_keys(safe.hours)) <= 7
    and not exists (
      select 1
      from safe, jsonb_object_keys(safe.hours) as k(day)
      where k.day not in ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat')
    )
    and not exists (
      select 1
      from slots
      where slot is not null
        and (
          jsonb_typeof(slot) <> 'object'
          or exists (
            select 1
            from jsonb_object_keys(
              case
                when jsonb_typeof(slot) = 'object' then slot
                else '{}'::jsonb
              end
            ) as key(name)
            where key.name not in ('open', 'close')
          )
          or not (slot ? 'open')
          or not (slot ? 'close')
          or jsonb_typeof(slot -> 'open') <> 'string'
          or jsonb_typeof(slot -> 'close') <> 'string'
          or (slot ->> 'open') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          or (slot ->> 'close') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          or (slot ->> 'close') <= (slot ->> 'open')
        )
    );
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vendors_working_hours_valid'
      and conrelid = 'public.vendors'::regclass
  ) then
    alter table public.vendors
      add constraint vendors_working_hours_valid
      check (public.vendor_working_hours_valid(working_hours));
  end if;
end $$;
```

This deliberately rejects overnight ranges (`close <= open`). Supporting overnight hours needs an explicit product decision and a different validator.

### 3.3 Public projection

If the owner approves public display, append the fields to the existing view. Append rather than reorder so `create or replace view` keeps the existing columns stable.

```sql
create or replace view public.public_vendors as
  select
    v.id,
    v.name,
    v.slug,
    v.description,
    v.logo_path,
    v.city,
    v.governorate,
    v.created_at,
    v.cover_path,
    v.working_hours,
    v.prep_time_min_days,
    v.prep_time_max_days
  from public.vendors v
  where v.status = 'active';

revoke all on table public.public_vendors from public, anon, authenticated;
grant select on table public.public_vendors to anon, authenticated;
```

Do **not** add `address_line` here.

### 3.4 Dedicated vendor-media bucket (recommended)

This removes the service-role upload workaround for branding. Path convention: `{vendor_id}/branding/{uuid}.{ext}`.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendor-media',
  'vendor-media',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

drop policy if exists "vendor media: public read" on storage.objects;
create policy "vendor media: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'vendor-media');

drop policy if exists "vendor media: owner upload" on storage.objects;
create policy "vendor media: owner upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'vendor-media'
    and (storage.foldername(name))[2] = 'branding'
    and exists (
      select 1
      from public.vendors v
      where v.id::text = (storage.foldername(name))[1]
        and (
          public.is_vendor_active_owner(v.id)
          or public.is_platform_admin()
        )
    )
  );

drop policy if exists "vendor media: owner delete" on storage.objects;
create policy "vendor media: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'vendor-media'
    and (storage.foldername(name))[2] = 'branding'
    and exists (
      select 1
      from public.vendors v
      where v.id::text = (storage.foldername(name))[1]
        and (
          public.is_vendor_active_owner(v.id)
          or public.is_platform_admin()
        )
    )
  );
```

Follow-up code change: switch `uploadVendorLogo` / `removeVendorLogo` from `createServiceClient()` to the RLS session client, and point public logo URLs at `vendor-media`. The existing `product-images` policies do not authorize this path, so no policy change is needed for that bucket.

Alternative: keep `product-images` and add an owner-only branding policy for `{vendor_id}/branding/...`. It is a smaller migration but mixes product media and shop branding in one bucket; the dedicated bucket is easier to reason about.

### 3.5 Self-serve pause / visibility (needs a separate decision)

A `vendors.is_accepting_orders boolean not null default true` column is easy to add, but **misleading unless checkout is changed at the same time**. The current checkout RPC only checks `status = 'active'`; a vendor toggle would not stop orders until that RPC (and its tests) are updated.

If approved, the minimum change is:

```sql
alter table public.vendors
  add column if not exists is_accepting_orders boolean not null default true;
```

Then add `is_accepting_orders` to `public_vendors` and update the checkout validation to reject any shop with `is_accepting_orders = false` with a friendly, vendor-specific error. The existing owner-update RLS policy and finance guard already allow/deny the right actors. Do not ship the toggle without the checkout change and order-placement tests.

### 3.6 Support requests

The current Help & support page deliberately has no form because there is nowhere to store a message. A minimal table and RLS would make an in-app queue possible:

```sql
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  category text not null
    check (category in ('orders', 'products', 'finance', 'analytics', 'settings', 'account')),
  subject text not null
    check (length(btrim(subject)) between 3 and 120),
  body text not null
    check (length(btrim(body)) between 10 and 4000),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_requests_vendor_idx
  on public.support_requests (vendor_id, created_at desc);
create index support_requests_status_idx
  on public.support_requests (status, created_at);

create trigger support_requests_set_updated_at
  before update on public.support_requests
  for each row execute function public.set_updated_at();

alter table public.support_requests enable row level security;

create policy "support_requests: vendor read own"
  on public.support_requests for select
  using (public.is_vendor_active_member(vendor_id));

create policy "support_requests: vendor insert own"
  on public.support_requests for insert
  with check (
    public.is_vendor_active_member(vendor_id)
    and created_by = auth.uid()
  );

create policy "support_requests: platform admin read"
  on public.support_requests for select
  using (public.is_platform_admin());

create policy "support_requests: platform admin update"
  on public.support_requests for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on table public.support_requests from public, anon, authenticated;
grant select, insert on table public.support_requests to authenticated;
grant update (status, updated_at) on table public.support_requests to authenticated;
```

Notes:

- Vendors can create and read their own requests; they cannot edit or close them.
- Platform admins can read all and change status. A role check in the application is still required in addition to RLS.
- There is **no email or push infrastructure** in this project. A ticket queue does not notify anyone by itself. Either the admin queue is checked manually, or a separate notification integration is approved.
- A reply thread needs a second table (for example `support_request_messages`) and its own RLS. Do not fake replies in the UI until that exists.
- Update `src/lib/supabase/database.types.ts` after applying the migration.

### 3.7 Analytics scale (optional, no behaviour change)

The current page reads the RLS-scoped rows and aggregates in Node. That is simple and correct for current volumes, but it fetches every suborder and item in the range. A supporting index is a safe first step:

```sql
create index if not exists order_vendors_vendor_created_idx
  on public.order_vendors (vendor_id, created_at desc);
```

If volumes justify it, replace the two reads with a `security invoker` RPC that applies RLS and returns pre-aggregated buckets. Do not use `security definer` for analytics: that would bypass vendor isolation. The RPC must be tested with the existing RLS suites before use.

---

## 4. Current analytics semantics

These are intentional and should be stated in any future copy review:

- **Gross sales** is every shop line **placed** in the selected window, whatever its current status.
- **Recognised revenue** is delivered shop lines among those placed in the window. Delivered lines are grouped on the chart by delivery date.
- Orders placed before the window but delivered inside it are **not** included. This is a placement cohort, not a delivery-date revenue window.
- Open, cancelled, and returned amounts reconcile to gross sales.
- Best sellers use delivered items only.
- All amounts are integer piastres and are formatted with `formatEgp`.

If the owner wants delivery-date revenue instead, the query and the domain function must both change (including the unique-window logic and tests). That is a semantic change, not a UI tweak.

---

## 5. Decisions needed before applying

1. **Public fields:** should customers see `cover_path`, `working_hours`, and prep times? `address_line` should stay private unless the owner explicitly wants it public.
2. **Overnight hours:** are same-day ranges enough, or must the schema support ranges that cross midnight?
3. **Pause control:** add `is_accepting_orders` with checkout enforcement, or keep status platform-controlled only?
4. **Support channel:** is a manual admin queue acceptable, or is email/push notification required? Replies need a second table.
5. **Media storage:** adopt the dedicated `vendor-media` bucket, or extend `product-images` with a branding policy?
6. **Analytics scale:** keep the in-app aggregation until measured volume requires an RPC/index migration?

---

## 6. Validation already performed

- `npm run typecheck`: clean.
- `npm run test`: 11 files / 98 tests pass.
- `npm run lint`: clean.
- `npm run build` (`next build --webpack`): succeeds; all three routes are in the route list; Tailwind verification passes.
- Local disposable RLS suites: `rls_foundation_test.sql`, `rls_orders_test.sql`, and `rls_commissions_test.sql` pass against migrations 1-19. No hosted database was modified.
- Browser smoke tests (local Supabase, demo data, production build): sign-in, nav, analytics range filtering, low-stock alerts, settings prefill/forms, support search/filter/empty state, and mobile overflow checks pass with no console or page errors.

The new fields, bucket, and support table above have **not** been applied anywhere. They require a new migration, RLS tests, and a separate deployment approval.
