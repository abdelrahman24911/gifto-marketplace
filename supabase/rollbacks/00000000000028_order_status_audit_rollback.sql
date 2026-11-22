-- Rollback for 00000000000028_order_status_audit.sql.
--
-- Removes the append-only order-status audit trail, its trigger and helper,
-- the single transition RPC introduced by migration 28, the reporting
-- indexes, and restores the direct status-update grant from migration 12.
--
-- DATA LOSS: the audit history is deleted with the table. This rollback
-- refuses while any audit row exists; export the table first. Run it only
-- after rolling back the later migrations in reverse order (rollback 46,
-- then rollback 42, which restores the five-argument set_order_vendor_status).
-- Deploy the pre-28 application code in the same window; this rollback does
-- not recreate a safe direct-update path beyond the restored column grant.

do $$
begin
  if to_regclass('public.order_status_events') is not null then
    if exists (select 1 from public.order_status_events) then
      raise exception 'Refusing to roll back 28: order status audit history exists. Export it first.';
    end if;
  end if;
end $$;

drop trigger if exists order_vendors_record_status_event
  on public.order_vendors;
drop function if exists public.record_order_status_event();
drop function if exists public.set_order_vendor_status(
  uuid,
  public.order_status,
  public.order_status,
  text,
  text
);
drop table if exists public.order_status_events;

drop index if exists public.order_vendors_vendor_delivered_idx;
drop index if exists public.order_vendors_delivered_idx;
drop index if exists public.order_vendors_created_idx;

-- Migration 12 grant, restored for the pre-28 direct-update path.
grant select, update (status, updated_at) on table public.order_vendors
  to authenticated;
