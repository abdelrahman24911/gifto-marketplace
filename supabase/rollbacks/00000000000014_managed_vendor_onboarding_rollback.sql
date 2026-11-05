-- Rollback for 00000000000014_managed_vendor_onboarding.sql.
--
-- Restores the pre-14 is_vendor_manager() helper (membership-only). Migration 14
-- also dropped public.apply_as_vendor(); this rollback deliberately does NOT
-- recreate self-service onboarding. Reintroducing it requires a reviewed
-- migration and an explicit business decision.
--
-- If migration 15 is applied, roll it back first. Otherwise this restores a
-- membership-only is_vendor_manager() underneath 15's active-only helpers.

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

revoke all on function public.is_vendor_manager(uuid) from public;
grant execute on function public.is_vendor_manager(uuid) to anon, authenticated;
