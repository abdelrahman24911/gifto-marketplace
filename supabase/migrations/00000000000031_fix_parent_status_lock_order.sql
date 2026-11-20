-- Gifto Marketplace - P0-04 (H-01): fix the parent-order status race.
--
-- Migration 13 defined sync_parent_order_status() to count the suborders
-- FIRST and only afterwards lock the parent orders row FOR UPDATE. Two
-- vendors transitioning their suborders at the same time could each count
-- the other's old state, both decide "no change", and leave the parent
-- stuck on "placed" after every suborder was terminal.
--
-- This migration redefines the function with the lock order reversed and
-- nothing else changed: the parent row is locked FOR UPDATE BEFORE its
-- suborders are counted, so the second concurrent transition blocks on the
-- parent lock and then counts the first transition's committed state.
-- Status-derivation rules, SECURITY settings, search_path pinning, and the
-- REVOKE shape are identical to migration 13. Migration 28 (order-status
-- audit) did not touch this function.
--
-- Regression test: supabase/tests/concurrency_parent_status_test.sql +
-- scripts/run-parent-status-concurrency.mjs (two concurrent sessions,
-- one suborder delivered and one cancelled, parent must end
-- partially_completed, not placed).

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
  -- Lock the parent row FIRST, before counting suborders. A concurrent
  -- transition on another suborder of the same order blocks here and then
  -- counts the committed state, so the parent can never be derived from a
  -- stale suborder count.
  select status into v_current from public.orders where id = new.order_id for update;
  if v_current is null then
    return null;
  end if;

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

-- Trigger firing order (P0-04, H-01): Postgres fires same-event triggers in
-- alphabetical order by name. This trigger MUST fire before
-- order_vendors_record_status_event. The audit trigger inserts into
-- order_status_events, whose order_id FK takes a FOR KEY SHARE lock on the
-- parent orders row; if sync_parent then asks for the same row FOR UPDATE,
-- two concurrent transitions each hold the share lock and wait for the
-- exclusive lock — a deterministic deadlock (40P01), reproduced 2026-11-20
-- on the migration-13 definition. Firing sync_parent first takes the parent
-- FOR UPDATE lock before any audit FK share lock exists, so concurrent
-- transitions serialize on the parent row instead of deadlocking.
drop trigger if exists order_vendors_sync_parent on public.order_vendors;
create trigger order_vendors_parent_sync
  after update of status on public.order_vendors
  for each row execute function public.sync_parent_order_status();
