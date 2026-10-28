-- Gifto Marketplace - Phase 9B: failed COD delivery
--
-- A COD delivery can fail after dispatch (the customer refuses the parcel or is
-- unreachable). Reuse the existing `cancelled` status instead of adding a new
-- suborder state: the restock trigger already restores every line and writes an
-- `order_cancelled` movement, and no commission was earned because the suborder
-- never reached `delivered`. `shipped_at` plus `cancelled_at` preserve the fact
-- that the failure happened after dispatch.
--
-- A parent order can now have a mix of terminal suborders, for example one shop
-- delivered and another cancelled. Without an explicit aggregate state the
-- parent would stay stuck in `confirmed` forever. `partially_completed` is a
-- parent-only terminal state: the transition trigger below still rejects it on
-- `order_vendors`.

alter type public.order_status add value if not exists 'partially_completed';

create or replace function public.assert_order_vendor_transition()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_ok :=
       (old.status = 'placed'    and new.status in ('confirmed', 'cancelled'))
    or (old.status = 'confirmed' and new.status in ('shipped', 'cancelled'))
    or (old.status = 'shipped'   and new.status in ('delivered', 'cancelled'))
    or (old.status = 'delivered' and new.status = 'returned' and public.is_platform_admin());

  if not v_ok then
    raise exception 'A % order cannot move from "%" to "%".',
      'vendor suborder', old.status, new.status
      using errcode = '23514';
  end if;

  if new.status = 'confirmed' and old.status = 'placed' then
    new.confirmed_at := now();
  elsif new.status = 'shipped' and old.status = 'confirmed' then
    new.shipped_at := now();
  elsif new.status = 'delivered' and old.status = 'shipped' then
    new.delivered_at := now();
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := now();
  end if;

  return new;
end;
$$;

revoke all on function public.assert_order_vendor_transition() from public, anon, authenticated;

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
