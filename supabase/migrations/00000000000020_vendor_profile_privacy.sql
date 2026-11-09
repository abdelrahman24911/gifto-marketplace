-- Gifto Marketplace - vendor profile privacy, working hours and public projection
--
-- This migration:
--   1. closes the authenticated base-table read path for active vendors;
--   2. adds the approved vendor profile fields;
--   3. validates the structured working-hours object;
--   4. exposes only approved public fields on `public_vendors`.
--
-- `address_line` is intentionally private. It is available to the vendor's
-- members and platform admins through the base table, never through the public
-- view.

-- ---------------------------------------------------------------------------
-- Authenticated base-table privacy
-- ---------------------------------------------------------------------------
-- The public storefront uses `public_vendors`. The base `vendors` table keeps
-- only own-member and platform-admin SELECT policies. Removing this broad row
-- policy prevents any signed-in customer from reading commission_rate,
-- contact fields, delivery_coverage, or address_line for active vendors.
drop policy if exists "vendors: public read active" on public.vendors;

-- ---------------------------------------------------------------------------
-- Vendor profile fields
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Working-hours validation
-- ---------------------------------------------------------------------------
-- Accepted shape:
--   {"mon": {"open": "09:00", "close": "18:00"}}
-- Missing days and an explicit JSON null mean closed. Same-day ranges only.
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
        and slot <> 'null'::jsonb
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

revoke all on function public.vendor_working_hours_valid(jsonb)
  from public, anon;
grant execute on function public.vendor_working_hours_valid(jsonb)
  to authenticated, service_role;

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

-- ---------------------------------------------------------------------------
-- Public projection
-- ---------------------------------------------------------------------------
-- Append only: existing column order is preserved so dependent code continues
-- to work. `address_line` must never be added here.
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
