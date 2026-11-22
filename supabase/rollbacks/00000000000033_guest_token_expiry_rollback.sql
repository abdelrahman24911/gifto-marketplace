-- Rollback for 00000000000033_guest_token_expiry.sql.
--
-- Drops the recovery tables/functions and restores the migration 11 / 30 /
-- 32 definitions of the guest RPCs (without expiry enforcement). Guest
-- orders keep working with the cookie-only model, as before P1-02. The
-- guest_token_expires_at column is dropped; no order, suborder, stock, or
-- audit data is altered.

drop function if exists public.guest_token_expired(uuid, text);
drop function if exists public.claim_guest_order(uuid, text, uuid);
drop function if exists public.redeem_guest_recovery_token(uuid, text, text);
drop function if exists public.request_guest_order_recovery(text, text);
drop function if exists public.guest_token_is_live(uuid, text);
drop table if exists public.guest_recovery_tokens;
drop trigger if exists orders_stamp_guest_token_expiry on public.orders;
drop function if exists public.stamp_guest_token_expiry();

alter table public.orders drop column if exists guest_token_expires_at;

-- get_guest_order as defined by migration 11 (no expiry check).
create or replace function public.get_guest_order(
  p_order_id uuid,
  p_token_hash text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'reference', o.public_reference,
    'status', o.status,
    'currency', o.currency,
    'subtotal_minor', o.subtotal_minor,
    'delivery_fee_minor', o.delivery_fee_minor,
    'total_minor', o.total_minor,
    'recipient_name', o.recipient_name,
    'contact_phone', o.contact_phone,
    'address_line', o.address_line,
    'city', o.city,
    'governorate', o.governorate,
    'notes', o.notes,
    'created_at', o.created_at,
    'vendors', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ov.id,
          'status', ov.status,
          'subtotal_minor', ov.subtotal_minor,
          'vendor_name', v.name,
          'vendor_slug', v.slug,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'product_name', i.product_name,
                'product_slug', i.product_slug,
                'unit_price_minor', i.unit_price_minor,
                'quantity', i.quantity,
                'line_total_minor', i.line_total_minor
              )
              order by i.created_at, i.id
            )
            from public.order_items i
            where i.order_vendor_id = ov.id
          ), '[]'::jsonb)
        )
        order by ov.created_at, ov.id
      )
      from public.order_vendors ov
      join public.vendors v on v.id = ov.vendor_id
      where ov.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id
    and o.guest_token_hash is not null
    and o.guest_token_hash = lower(p_token_hash)
    and p_token_hash ~ '^[0-9a-f]{64}$';
$$;

revoke all on function public.get_guest_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_guest_order(uuid, text)
  to service_role;

-- cancel_guest_order as defined by migration 32 (no expiry check).
create or replace function public.cancel_guest_order(
  p_order_id uuid,
  p_token_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
begin
  if p_token_hash is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.user_id is null
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
  ) then
    raise exception 'Order not found.' using errcode = '42501';
  end if;

  select status
    into v_status
    from public.orders
   where id = p_order_id
   for update;

  if v_status = 'cancelled' then
    return;
  end if;

  if v_status <> 'placed' then
    raise exception 'Only orders that no shop has started processing can be cancelled.'
      using errcode = '23514';
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id;

  update public.order_vendors
     set status = 'cancelled'
   where order_id = p_order_id
     and status <> 'cancelled';
end;
$$;

revoke all on function public.cancel_guest_order(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_guest_order(uuid, text) to service_role;

-- open_guest_refund_case as defined by migration 30 (no expiry check).
create or replace function public.open_guest_refund_case(
  p_order_id uuid,
  p_token_hash text,
  p_order_vendor_id uuid,
  p_reason text,
  p_requested_amount_minor int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suborder record;
  v_case_id  uuid;
begin
  if p_token_hash is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
  ) then
    raise exception 'This order link is not valid.' using errcode = '42501';
  end if;

  select ov.id, ov.order_id, ov.vendor_id, ov.status, ov.subtotal_minor
    into v_suborder
    from public.order_vendors ov
   where ov.id = p_order_vendor_id
     and ov.order_id = p_order_id;

  if v_suborder.id is null then
    raise exception 'Choose a valid order item group.' using errcode = '22023';
  end if;

  if v_suborder.status not in ('shipped', 'delivered', 'returned') then
    raise exception 'A refund can be requested after the shop ships the order.'
      using errcode = '23514';
  end if;

  if p_reason is null or length(trim(p_reason)) not between 5 and 1000 then
    raise exception 'Describe the problem in 5-1000 characters.'
      using errcode = '22023';
  end if;

  if p_requested_amount_minor is not null
     and (p_requested_amount_minor < 0
          or p_requested_amount_minor > v_suborder.subtotal_minor) then
    raise exception 'The requested amount cannot exceed the shop subtotal.'
      using errcode = '22023';
  end if;

  begin
    insert into public.refund_cases (
      order_id, order_vendor_id, vendor_id, source, opened_by,
      reason, requested_amount_minor
    ) values (
      v_suborder.order_id, v_suborder.id, v_suborder.vendor_id, 'guest',
      null, trim(p_reason), p_requested_amount_minor
    )
    returning id into v_case_id;
  exception when unique_violation then
    raise exception 'There is already an open refund case for this shop in your order.'
      using errcode = '23514';
  end;

  return v_case_id;
end;
$$;

revoke all on function public.open_guest_refund_case(uuid, text, uuid, text, int)
  from public, anon, authenticated;
grant execute on function public.open_guest_refund_case(uuid, text, uuid, text, int)
  to service_role;

-- get_guest_refund_cases as defined by migration 30 (no expiry check).
create or replace function public.get_guest_refund_cases(
  p_order_id uuid,
  p_token_hash text
)
returns table (
  id uuid,
  order_vendor_id uuid,
  status public.refund_case_status,
  reason text,
  requested_amount_minor int,
  refund_amount_minor int,
  resolution_note text,
  created_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token_hash is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
  ) then
    raise exception 'This order link is not valid.' using errcode = '42501';
  end if;

  return query
    select rc.id, rc.order_vendor_id, rc.status, rc.reason,
           rc.requested_amount_minor, rc.refund_amount_minor,
           rc.resolution_note, rc.created_at, rc.resolved_at
      from public.refund_cases rc
     where rc.order_id = p_order_id
     order by rc.created_at desc;
end;
$$;

revoke all on function public.get_guest_refund_cases(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_guest_refund_cases(uuid, text)
  to service_role;
