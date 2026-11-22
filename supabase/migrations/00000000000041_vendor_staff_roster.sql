-- Gifto Marketplace - P1-14 (H-07): vendor staff management, roster read.
--
-- vendor_members and its role RLS already exist (migration 01, tightened in
-- migration 15: only active owners manage the roster; migration 08's
-- last-owner guard blocks demoting or deleting the sole owner), and
-- set_order_vendor_status already distinguishes managers — but there is no
-- member-management UI, so a shop with more than one person cannot grant or
-- revoke access in practice.
--
-- This migration adds only the one read path the UI needs. The write path
-- needs no new function: owner insert/update/delete already go through the
-- RLS-scoped client (policies "vendor_members: owner manage/update/delete"),
-- and the invite flow in the server action reuses Supabase Auth invites
-- (generateLink 'invite' + Gifto's own mail module, P1-01) with the
-- membership row created right after the invite, exactly like the admin
-- createVendor flow.
--
-- Why an RPC for the roster: profiles are self-read only ("profiles: read
-- own"), so a vendor owner listing their own shop's members cannot read the
-- other members' profile rows (email, full name) through a plain join — the
-- embedded profile would come back null. list_vendor_members() is a
-- SECURITY DEFINER read that returns the roster (profile id, email, full
-- name, role, joined date) only to members of that vendor or platform
-- admins; anyone else gets zero rows, never an error that reveals the
-- roster exists.

create or replace function public.list_vendor_members(p_vendor_id uuid)
returns table (
  profile_id uuid,
  email text,
  full_name text,
  role public.vendor_role,
  created_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select vm.profile_id, p.email, p.full_name, vm.role, vm.created_at
    from public.vendor_members vm
    join public.profiles p on p.id = vm.profile_id
   where vm.vendor_id = p_vendor_id
     and (
       public.is_vendor_member(p_vendor_id)
       or public.is_platform_admin()
     )
   order by vm.created_at asc;
$$;

revoke all on function public.list_vendor_members(uuid)
  from public, anon;
grant execute on function public.list_vendor_members(uuid) to authenticated;

comment on function public.list_vendor_members(uuid) is
  'Roster read for vendor staff management (P1-14, H-07). Returns members with profile email/name only to members of that vendor or platform admins; anyone else sees zero rows.';
