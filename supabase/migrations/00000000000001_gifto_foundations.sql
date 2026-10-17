-- Gifto Marketplace — Phase 1 foundations
-- Separate project from FL Tase3 (single-vendor store).
-- Scope: profiles, platform-admin authorization, vendor identity, vendor membership.
-- Future (NOT yet created — see README architecture notes): orders/parent-order,
-- order_vendors (suborders), order_items, inventory, commission ledger, settlements,
-- optional vendor subscriptions.

-- ---------------------------------------------------------------------------
-- Extensions & shared helpers
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.slugify(p_input text)
returns text
language sql immutable
set search_path = public
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

create type public.vendor_role as enum ('owner', 'manager', 'staff');
create type public.vendor_status as enum ('pending', 'active', 'suspended', 'rejected');

-- ---------------------------------------------------------------------------
-- profiles — linked to auth.users
--
-- is_platform_admin is the ONLY privilege flag on the profile. It must never be
-- settable by the owning user through direct updates. A SECURITY DEFINER trigger
-- (below) enforces that ordinary users cannot grant themselves platform admin.
-- Private fields (email, phone, full_name) are only readable by the owner,
-- platform admins, and (selectively) their own vendor members where required.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  full_name         text,
  phone             text,
  is_platform_admin boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privilege helpers (SECURITY DEFINER, search_path pinned, EXECUTE restricted)
--
-- SECURITY DEFINER is required so RLS policies can reference these without
-- infinite recursion (table owner bypasses RLS). search_path is pinned to
-- public to prevent hijack via search path. EXECUTE is revoked from PUBLIC and
-- granted only to authenticated (server-side/admin flows) and anon where a
-- policy genuinely needs it (none here for admin checks).
-- ---------------------------------------------------------------------------

-- True only for explicitly granted platform administrators.
create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select p.is_platform_admin
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

-- Restrict EXECUTE: drop the default PUBLIC grant. Read-only boolean checks that
-- only inspect auth.uid(); executable by anon + authenticated so RLS policy
-- expressions can evaluate for either role.
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Guard: ordinary users cannot grant/deny themselves platform admin.
-- SECURITY DEFINER trigger runs with owner privileges; search_path pinned.
-- Platform admins remain free to change the flag for other users.
-- ---------------------------------------------------------------------------

create or replace function public.protect_platform_admin_grant()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.is_platform_admin is distinct from old.is_platform_admin
     and not exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.is_platform_admin = true
     ) then
    raise exception 'Only platform administrators can change platform-admin privileges.';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_platform_admin_grant() from public, anon;
grant execute on function public.protect_platform_admin_grant() to authenticated;

create trigger profiles_protect_platform_admin
  before update of is_platform_admin on public.profiles
  for each row execute function public.protect_platform_admin_grant();

-- ---------------------------------------------------------------------------
-- vendors — marketplace store identity
--
-- status semantics (enforced today by RLS reads; checkout enforcement arrives
-- with Phase 4/5 checkout work):
--   pending   — submitted, awaiting review. Not publicly visible. Owner sees own.
--   active    — approved & selling. Publicly visible; may list products/orders.
--   suspended — blocked by admin. Owner sees own. Public invisible. MUST be
--               blocked from checkout (Phase 4/5: checkout RPC rejects vendors
--               whose status is not 'active'). Defined now, enforced later.
--   rejected  — application declined. Owner sees own. Public invisible.
--
-- Private application fields (city/governorate may be intentionally public later;
-- delivery_coverage/details are internal during review) are only exposed to the
-- vendor's own members and platform admins via RLS — never to anon.
-- ---------------------------------------------------------------------------

create table public.vendors (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) >= 2),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description      text,
  logo_path        text, -- Supabase Storage path (never binary)
  status           public.vendor_status not null default 'pending',
  city             text,
  governorate      text,
  delivery_coverage jsonb not null default '{}'::jsonb, -- e.g. {"governorates": ["alexandria"], "areas": []}
  commission_rate  numeric(5,4) not null default 0.1000
                   check (commission_rate >= 0 and commission_rate <= 1),
  contact_phone    text,
  contact_email    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.vendors enable row level security;

create trigger vendors_set_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

create index vendors_status_idx on public.vendors (status);
create index vendors_governorate_idx on public.vendors (governorate);

-- ---------------------------------------------------------------------------
-- vendor_members — profile ↔ vendor membership with role
-- ---------------------------------------------------------------------------

create table public.vendor_members (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references public.vendors (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       public.vendor_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, profile_id)
);

alter table public.vendor_members enable row level security;

create trigger vendor_members_set_updated_at
  before update on public.vendor_members
  for each row execute function public.set_updated_at();

create index vendor_members_profile_idx on public.vendor_members (profile_id);
create index vendor_members_vendor_idx on public.vendor_members (vendor_id);

-- Membership authorization helpers. Defined after vendor_members exists because
-- PostgreSQL validates function bodies at CREATE time. SECURITY DEFINER + pinned
-- search_path so RLS policies can use them without recursion; EXECUTE granted to
-- anon + authenticated (read-only boolean checks over auth.uid()).
create or replace function public.is_vendor_member(p_vendor_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vendor_members vm
    where vm.vendor_id = p_vendor_id
      and vm.profile_id = auth.uid()
  );
$$;

create or replace function public.is_vendor_owner(p_vendor_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vendor_members vm
    where vm.vendor_id = p_vendor_id
      and vm.profile_id = auth.uid()
      and vm.role = 'owner'
  );
$$;

create or replace function public.is_vendor_manager(p_vendor_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vendor_members vm
    where vm.vendor_id = p_vendor_id
      and vm.profile_id = auth.uid()
      and vm.role in ('owner', 'manager')
  );
$$;

create or replace function public.is_vendor_staff(p_vendor_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vendor_members vm
    where vm.vendor_id = p_vendor_id
      and vm.profile_id = auth.uid()
  );
$$;

revoke all on function
  public.is_vendor_member(uuid),
  public.is_vendor_owner(uuid),
  public.is_vendor_manager(uuid),
  public.is_vendor_staff(uuid)
from public;

grant execute on function
  public.is_vendor_member(uuid),
  public.is_vendor_owner(uuid),
  public.is_vendor_manager(uuid),
  public.is_vendor_staff(uuid)
to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vendor application audit trail (status transitions are logged; required for
-- trustworthy admin review of pending/suspended/rejected decisions)
-- ---------------------------------------------------------------------------

create table public.vendor_status_history (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  from_status public.vendor_status,
  to_status   public.vendor_status not null,
  changed_by  uuid references public.profiles (id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.vendor_status_history enable row level security;

create index vendor_status_history_vendor_idx on public.vendor_status_history (vendor_id, created_at desc);

create or replace function public.log_vendor_status_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.vendor_status_history (vendor_id, from_status, to_status, changed_by, note)
    values (new.id, null, new.status, auth.uid(), null);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.vendor_status_history (vendor_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, auth.uid(), null);
  end if;
  return new;
end;
$$;

revoke all on function public.log_vendor_status_change() from public, anon;
grant execute on function public.log_vendor_status_change() to authenticated;

create trigger vendors_status_history
  after insert or update of status on public.vendors
  for each row execute function public.log_vendor_status_change();

-- ---------------------------------------------------------------------------
-- RLS POLICIES
-- ---------------------------------------------------------------------------

-- profiles: owner reads/updates own; platform admins read all. No anon read.
create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid() or public.is_platform_admin());

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- (is_platform_admin changes are additionally guarded by trigger above.)

create policy "profiles: platform admin update others"
  on public.profiles for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- vendors
--   public: read active vendors only (storefront browsing).
--   platform admin: full read/write (including pending/suspended details).
--   vendor members: read own vendor (all statuses) so owners manage application.
create policy "vendors: public read active"
  on public.vendors for select
  using (status = 'active');

create policy "vendors: platform admin read"
  on public.vendors for select
  using (public.is_platform_admin());

create policy "vendors: platform admin write"
  on public.vendors for insert
  with check (public.is_platform_admin());

create policy "vendors: platform admin update"
  on public.vendors for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "vendors: platform admin delete"
  on public.vendors for delete
  using (public.is_platform_admin());

create policy "vendors: members read own"
  on public.vendors for select
  using (public.is_vendor_member(id));

create policy "vendors: owner update own"
  on public.vendors for update
  using (public.is_vendor_owner(id))
  with check (public.is_vendor_owner(id));

-- Owners may edit descriptive fields, but status and commission_rate are
-- platform-admin-only. A SECURITY DEFINER trigger (below) enforces this —
-- WITH CHECK cannot reference the OLD row, so a trigger is required.
create or replace function public.guard_vendor_finance_fields()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status
      or new.commission_rate is distinct from old.commission_rate)
     and not exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.is_platform_admin = true
     ) then
    raise exception 'Only platform administrators can change vendor status or commission rate.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_vendor_finance_fields() from public, anon;
grant execute on function public.guard_vendor_finance_fields() to authenticated;

create trigger vendors_guard_finance_fields
  before update of status, commission_rate on public.vendors
  for each row execute function public.guard_vendor_finance_fields();

-- vendor_members
--   members: read own vendor's roster.
--   owner: manage roster (add/remove/change role) for own vendor.
--   platform admin: manage all.
-- No policy for anon. Users cannot create membership for vendors they do not own.
create policy "vendor_members: read own roster"
  on public.vendor_members for select
  using (public.is_vendor_member(vendor_id) or public.is_platform_admin());

create policy "vendor_members: owner manage"
  on public.vendor_members for insert
  with check (public.is_vendor_owner(vendor_id) or public.is_platform_admin());

create policy "vendor_members: owner update"
  on public.vendor_members for update
  using (public.is_vendor_owner(vendor_id) or public.is_platform_admin())
  with check (public.is_vendor_owner(vendor_id) or public.is_platform_admin());

create policy "vendor_members: owner delete"
  on public.vendor_members for delete
  using (public.is_vendor_owner(vendor_id) or public.is_platform_admin());

-- vendor_status_history: platform admin full read; members read own vendor's trail.
create policy "vendor_status_history: platform admin read"
  on public.vendor_status_history for select
  using (public.is_platform_admin());

create policy "vendor_status_history: vendor members read"
  on public.vendor_status_history for select
  using (public.is_vendor_member(vendor_id));

-- ---------------------------------------------------------------------------
-- Least-privilege grants
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

-- Tables: authenticated gets table-level DML grant; RLS policies are the actual
-- boundary.
grant select, insert, update, delete on table
  public.profiles,
  public.vendors,
  public.vendor_members,
  public.vendor_status_history
to authenticated;

-- anon may only read the public storefront surface (active vendors). RLS
-- restricts the rows; no anon access to profiles/members/history.
grant select on table public.vendors to anon;

revoke all on table
  public.profiles,
  public.vendor_members,
  public.vendor_status_history
from anon;

