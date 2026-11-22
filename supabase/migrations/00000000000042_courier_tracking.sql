-- Gifto Marketplace - P1-15 (H-08): courier and tracking fields.
--
-- Delivery model is vendor-delivers (D-06, DECIDED 2026-11-20: "each shop
-- delivers its own suborder", fee "kept by the delivering vendor"), so the
-- shop that ships a suborder is the one that records the handover.
--
-- Until now "shipped" was a bare assertion: order_vendors had no courier or
-- tracking columns, so a COD delivery dispute had no evidence of handover —
-- who took the parcel, when, under what reference.
--
-- This migration:
--   * adds courier_name, tracking_ref and handed_over_at to order_vendors
--     (all nullable; suborders already shipped are NOT retro-blocked and
--     keep nulls — there is no handover evidence to invent for them);
--   * redefines set_order_vendor_status (migration 28 — never edited in
--     place) with two new optional parameters, p_courier_name and
--     p_tracking_ref. A transition to 'shipped' now requires both: a courier
--     name (2-80 characters) and a tracking reference (3-80 characters).
--     The shipped transition stamps handed_over_at = now() alongside the
--     status. Courier/tracking passed for any other transition are ignored,
--     never stored. Every other rule in the function is unchanged: actor
--     checks, stale-page protection, reason rules, and the audit trigger
--     still records the transition.
--
-- The old 5-argument function is dropped first: CREATE OR REPLACE with a
-- different signature would leave the old function behind as an overload
-- and shipping without courier would still succeed through it. The only
-- in-database caller (confirm_refund_receipt, migration 35) moves a
-- suborder to 'returned' with 5 arguments, which the new defaults still
-- accept.
--
-- Direct writes stay closed: authenticated holds only
-- update (status, updated_at) on order_vendors (migrations 05/12, revoked
-- by migration 28), so the new columns were never client-writable and the
-- RPC remains the only write path. No courier API is integrated and no live
-- tracking status is promised — these fields are the handover record only.

alter table public.order_vendors
  add column if not exists courier_name text,
  add column if not exists tracking_ref text,
  add column if not exists handed_over_at timestamptz;

comment on column public.order_vendors.courier_name is
  'Courier or delivering party recorded when the suborder shipped (P1-15, H-08). Null until shipped; existing shipped rows keep null (no evidence to invent).';
comment on column public.order_vendors.tracking_ref is
  'Tracking or handover reference recorded when the suborder shipped (P1-15, H-08).';
comment on column public.order_vendors.handed_over_at is
  'When the parcel was handed to the courier (P1-15, H-08). Stamped by set_order_vendor_status on the shipped transition.';

-- Index for the admin logistics list (shipped suborders by courier/date).
create index order_vendors_shipped_courier_idx
  on public.order_vendors (courier_name, shipped_at desc)
  where status in ('shipped', 'delivered') and courier_name is not null;

-- ---------------------------------------------------------------------------
-- Redefined transition RPC: shipping requires courier + tracking.
-- ---------------------------------------------------------------------------

drop function if exists public.set_order_vendor_status(
  uuid,
  public.order_status,
  public.order_status,
  text,
  text
);

create or replace function public.set_order_vendor_status(
  p_order_vendor_id uuid,
  p_next_status public.order_status,
  p_expected_status public.order_status,
  p_reason_code text default null,
  p_note text default null,
  p_courier_name text default null,
  p_tracking_ref text default null
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
  v_courier text := nullif(btrim(p_courier_name), '');
  v_tracking text := nullif(btrim(p_tracking_ref), '');
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

  -- P1-15: "shipped" is a handover, not an assertion. The courier and the
  -- tracking reference are required before the transition succeeds.
  if p_next_status = 'shipped' then
    if v_courier is null or v_tracking is null then
      raise exception 'Shipping needs a courier and a tracking reference.'
        using errcode = '23514';
    end if;
    if length(v_courier) < 2 or length(v_courier) > 80 then
      raise exception 'The courier name must be 2-80 characters.' using errcode = '22001';
    end if;
    if length(v_tracking) < 3 or length(v_tracking) > 80 then
      raise exception 'The tracking reference must be 3-80 characters.' using errcode = '22001';
    end if;
  end if;

  perform set_config('gifto.order_status_reason', coalesce(v_reason, ''), true);
  perform set_config('gifto.order_status_note', coalesce(v_note, ''), true);

  if p_next_status = 'shipped' then
    update public.order_vendors
       set status = p_next_status,
           courier_name = v_courier,
           tracking_ref = v_tracking,
           handed_over_at = now()
     where id = v_row.id;
  else
    update public.order_vendors
       set status = p_next_status
     where id = v_row.id;
  end if;

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
  text,
  text,
  text
) from public, anon;
grant execute on function public.set_order_vendor_status(
  uuid,
  public.order_status,
  public.order_status,
  text,
  text,
  text,
  text
) to authenticated;

-- Status changes still have exactly one API path. The RLS policy remains as a
-- second boundary if grants are ever widened by mistake.
revoke update (status, updated_at) on table public.order_vendors
  from authenticated;

comment on function public.set_order_vendor_status(
  uuid,
  public.order_status,
  public.order_status,
  text,
  text,
  text,
  text
) is
  'Authorized, stale-safe suborder transition with audit reason and note. Shipping requires a courier name and tracking reference and stamps handed_over_at (P1-15, H-08).';

-- ---------------------------------------------------------------------------
-- get_guest_order — redefined with the handover record per vendor
-- (migration 35 body + courier_name, tracking_ref, handed_over_at, so the
-- guest order page can show the same handover details as the signed-in
-- order page). Signature unchanged; no new data is exposed beyond the
-- token-holder's own order.
-- ---------------------------------------------------------------------------

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
          'courier_name', ov.courier_name,
          'tracking_ref', ov.tracking_ref,
          'handed_over_at', ov.handed_over_at,
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
