-- Rollback for 00000000000031_fix_parent_status_lock_order.sql.
--
-- This restores the exact migration-13 definition of
-- sync_parent_order_status() (count suborders first, lock the parent row
-- afterwards). It reopens H-01 (the parent-status race), so it is for
-- emergency rollback only. It does not alter order or suborder data.

create or replace function public.sync_parent_order_status()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_total       int;
  v_delivered   int;
  v_cancelled   int;
  v_returned    int;
  v_in_progress int;
  v_current     public.order_status;
  v_next        public.order_status;
begin
  select count(*),
         count(*) filter (where status = 'delivered'),
         count(*) filter (where status = 'cancelled'),
         count(*) filter (where status = 'returned'),
         count(*) filter (where status in ('confirmed', 'shipped'))
    into v_total, v_delivered, v_cancelled, v_returned, v_in_progress
    from public.order_vendors
   where order_id = new.order_id;

  if v_total = 0 then
    return null;
  end if;

  select status into v_current from public.orders where id = new.order_id for update;
  if v_current is null then
    return null;
  end if;

  if v_total = v_delivered then
    v_next := 'delivered';
  elsif v_total = v_cancelled then
    v_next := 'cancelled';
  elsif v_total = v_returned then
    v_next := 'returned';
  elsif v_total = v_delivered + v_cancelled + v_returned then
    -- Every suborder is terminal but the outcomes differ.
    v_next := 'partially_completed';
  elsif v_in_progress > 0 and v_current = 'placed' then
    v_next := 'confirmed';
  else
    return null;
  end if;

  update public.orders
     set status = v_next
   where id = new.order_id
     and status is distinct from v_next;

  return null;
end;
$$;

revoke all on function public.sync_parent_order_status() from public, anon, authenticated;

-- Restore the original trigger name. (Migration 31 renamed it to
-- order_vendors_parent_sync so it fires before the audit trigger; rolling
-- back the function without the trigger name would leave the renamed
-- trigger calling the old function.)
drop trigger if exists order_vendors_parent_sync on public.order_vendors;
create trigger order_vendors_sync_parent
  after update of status on public.order_vendors
  for each row execute function public.sync_parent_order_status();
