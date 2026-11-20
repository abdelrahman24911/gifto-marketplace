-- Rollback for 00000000000042_courier_tracking.sql (P1-15, H-08).
--
-- Drops the courier/tracking columns and restores the migration-28
-- five-argument set_order_vendor_status (shipping without courier again).
-- Safe to run only while no deployed code passes courier/tracking arguments
-- or reads the new columns; the vendor/admin ship forms and the logistics
-- list are removed in the same release that rolls this migration back.
-- Handover evidence recorded in the dropped columns is deleted with them —
-- export it first if it must be kept.

drop function if exists public.set_order_vendor_status(
  uuid,
  public.order_status,
  public.order_status,
  text,
  text,
  text,
  text
);

create or replace function public.set_order_vendor_status(
  p_order_vendor_id uuid,
  p_next_status public.order_status,
  p_expected_status public.order_status,
  p_reason_code text default null,
  p_note text default null
)
returns table (
  order_id uuid,
  vendor_id uuid,
  previous_status public.order_status,
  status public.order_status
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.order_vendors%rowtype;
  v_is_admin boolean;
  v_is_vendor boolean;
  v_reason text := nullif(lower(btrim(p_reason_code)), '');
  v_note text := nullif(btrim(p_note), '');
begin
  if v_actor is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select *
    into v_row
    from public.order_vendors
   where id = p_order_vendor_id
     for update;

  if not found then
    raise exception 'Order line not found.' using errcode = '42501';
  end if;

  v_is_admin := public.is_platform_admin();
  v_is_vendor := public.is_vendor_manager(v_row.vendor_id);

  if not (v_is_admin or v_is_vendor) then
    raise exception 'Only shop owners, managers, or platform administrators can update orders.'
      using errcode = '42501';
  end if;

  if v_row.status <> p_expected_status then
    raise exception 'This order line changed since the page was loaded. Refresh and try again.'
      using errcode = '40001';
  end if;

  if v_row.status = p_next_status then
    raise exception 'This order line is already marked "%".', p_next_status
      using errcode = '23514';
  end if;

  if v_note is not null and length(v_note) > 1000 then
    raise exception 'The note must be 1000 characters or fewer.' using errcode = '22001';
  end if;

  if v_reason is not null and v_reason not in (
    'customer_refused',
    'unreachable',
    'wrong_address',
    'customer_request',
    'out_of_stock',
    'damaged',
    'duplicate',
    'fraud',
    'admin_override',
    'other'
  ) then
    raise exception 'Unknown status reason.' using errcode = '22023';
  end if;

  if v_row.status = 'shipped' and p_next_status = 'cancelled' and v_reason is null then
    raise exception 'A failed delivery needs a reason.'
      using errcode = '23514';
  end if;

  if v_is_admin and p_next_status in ('cancelled', 'returned') and v_reason is null then
    raise exception 'Administrative cancellations and returns need a reason.'
      using errcode = '23514';
  end if;

  if v_reason = 'other' and v_note is null then
    raise exception 'Add a note when the reason is "other".'
      using errcode = '23514';
  end if;

  perform set_config('gifto.order_status_reason', coalesce(v_reason, ''), true);
  perform set_config('gifto.order_status_note', coalesce(v_note, ''), true);

  update public.order_vendors
     set status = p_next_status
   where id = v_row.id;

  perform set_config('gifto.order_status_reason', '', true);
  perform set_config('gifto.order_status_note', '', true);

  return query
    select v_row.order_id, v_row.vendor_id, v_row.status, p_next_status;
end;
$$;

revoke all on function public.set_order_vendor_status(
  uuid,
  public.order_status,
  public.order_status,
  text,
  text
) from public, anon;
grant execute on function public.set_order_vendor_status(
  uuid,
  public.order_status,
  public.order_status,
  text,
  text
) to authenticated;

revoke update (status, updated_at) on table public.order_vendors
  from authenticated;

drop index if exists public.order_vendors_shipped_courier_idx;
alter table public.order_vendors
  drop column if exists handed_over_at,
  drop column if exists tracking_ref,
  drop column if exists courier_name;

-- Restore the migration-35 get_guest_order (without the handover fields).
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
          'delivered_at', ov.delivered_at,
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
    and p_token_hash ~ '^[0-9a-f]{64}$'
    and (o.guest_token_expires_at is null
         or o.guest_token_expires_at > now());
$$;

revoke all on function public.get_guest_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_guest_order(uuid, text)
  to service_role;
