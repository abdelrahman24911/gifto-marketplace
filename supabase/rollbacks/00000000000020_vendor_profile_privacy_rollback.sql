-- Rollback for 00000000000020_vendor_profile_privacy.sql.
--
-- Rolling this back removes the profile columns and restores the broad
-- authenticated base-table read policy that migration 20 closed. That policy is
-- intentionally considered insecure; run this only during a coordinated
-- rollback with the old application code.
--
-- Refuse unless the later dashboard migrations have already been rolled back:
--   24 analytics index  -> optional, independent
--   23 support requests -> must be rolled back first
--   22 order pause      -> must be rolled back first
--   21 vendor media     -> must be rolled back first
--
-- Any profile data in the dropped columns is lost. Export it first if it must
-- be preserved.

do $$
begin
  if to_regclass('public.support_requests') is not null then
    raise exception 'Refusing to roll back 20: roll back migration 23 first.';
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'vendors'
       and column_name = 'is_accepting_orders'
  ) then
    raise exception 'Refusing to roll back 20: roll back migration 22 first.';
  end if;

  if exists (select 1 from storage.buckets where id = 'vendor-media') then
    raise exception 'Refusing to roll back 20: roll back migration 21 first.';
  end if;
end $$;

-- Restore the pre-20 public projection.
drop view if exists public.public_vendors;

create view public.public_vendors as
  select
    v.id,
    v.name,
    v.slug,
    v.description,
    v.logo_path,
    v.city,
    v.governorate,
    v.created_at
  from public.vendors v
  where v.status = 'active';

revoke all on table public.public_vendors from public, anon, authenticated;
grant select on table public.public_vendors to anon, authenticated;

-- Restore the pre-20 authenticated base-table read policy. This re-exposes
-- private vendor columns to any signed-in user, so pair it with the old UI.
drop policy if exists "vendors: public read active" on public.vendors;
create policy "vendors: public read active"
  on public.vendors for select
  using (status = 'active');

alter table public.vendors
  drop constraint if exists vendors_working_hours_valid,
  drop constraint if exists vendors_prep_time_order;

drop function if exists public.vendor_working_hours_valid(jsonb);

alter table public.vendors
  drop column if exists prep_time_max_days,
  drop column if exists prep_time_min_days,
  drop column if exists working_hours,
  drop column if exists address_line,
  drop column if exists cover_path;
