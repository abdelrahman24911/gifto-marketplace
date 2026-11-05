drop function if exists public.apply_as_vendor(text, text, text, text, text, text);

create or replace function public.is_vendor_manager(p_vendor_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vendor_members vm
    join public.vendors v on v.id = vm.vendor_id
    where vm.vendor_id = p_vendor_id
      and vm.profile_id = auth.uid()
      and vm.role in ('owner', 'manager')
      and v.status = 'active'
  );
$$;

revoke all on function public.is_vendor_manager(uuid) from public;
grant execute on function public.is_vendor_manager(uuid) to anon, authenticated;
