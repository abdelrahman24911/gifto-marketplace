-- Gifto Marketplace — security hardening (Phase 0 audit findings 1–3)
-- 1. INSERT-path guard: nobody can self-provision is_platform_admin = true.
-- 2. Drop the redundant is_vendor_staff helper (identical to is_vendor_member).
-- 3. Guard: a vendor can never lose its last owner (demotion or deletion).
--    Only direct roster management is constrained: cascading deletes (vendor
--    removal, account removal) fire nested triggers at depth 2+ and pass
--    through, so admin cleanup is never orphaned by this guard.

-- ---------------------------------------------------------------------------
-- Finding 2: drop the duplicate helper
-- ---------------------------------------------------------------------------

drop function if exists public.is_vendor_staff(uuid);

-- ---------------------------------------------------------------------------
-- Finding 1: INSERT-path guard for platform-admin on profiles.
-- The Phase 1 trigger only guarded UPDATEs. There is no client INSERT grant or
-- policy on profiles today, but this trigger makes the invariant hold even if
-- an insert path is ever added. Trusted server-side paths still work:
--   * no user JWT (auth.uid() is null) — service_role, migrations, seed scripts.
--   * an existing platform admin may insert an admin flag for someone else.
--   * handle_new_user always inserts is_platform_admin = false, so signup is
--     unaffected. Note: current_user cannot be used to detect service_role
--     here — SECURITY DEFINER rewrites it to the function owner.
-- ---------------------------------------------------------------------------

create or replace function public.protect_platform_admin_insert()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.is_platform_admin
     and auth.uid() is not null
     and not coalesce(public.is_platform_admin(), false) then
    raise exception 'Only platform administrators can grant platform-admin privileges.';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_platform_admin_insert() from public, anon;
grant execute on function public.protect_platform_admin_insert() to authenticated, service_role;

create trigger profiles_protect_platform_admin_insert
  before insert on public.profiles
  for each row execute function public.protect_platform_admin_insert();

-- ---------------------------------------------------------------------------
-- Finding 3: a vendor must always retain at least one owner.
-- Blocks both demotion (role change away from 'owner') and deletion of the
-- final owner membership — by the owner themselves or by a platform admin —
-- unless another owner already exists. Promote a second owner first.
-- ---------------------------------------------------------------------------

create or replace function public.guard_vendor_last_owner()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- Cascading deletes (vendor removal, account removal) run nested triggers
  -- (depth 2+); the guard only constrains direct roster management.
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner'
       and not exists (
         select 1 from public.vendor_members vm
         where vm.vendor_id = old.vendor_id
           and vm.profile_id <> old.profile_id
           and vm.role = 'owner'
       ) then
      raise exception 'A vendor must always have at least one owner.';
    end if;
    return old;
  end if;

  if old.role = 'owner' and new.role <> 'owner' then
    if not exists (
      select 1 from public.vendor_members vm
      where vm.vendor_id = old.vendor_id
        and vm.profile_id <> old.profile_id
        and vm.role = 'owner'
    ) then
      raise exception 'A vendor must always have at least one owner. Promote another owner first.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_vendor_last_owner() from public, anon;
grant execute on function public.guard_vendor_last_owner() to authenticated, service_role;

create trigger vendor_members_guard_last_owner
  before update of role or delete on public.vendor_members
  for each row execute function public.guard_vendor_last_owner();
