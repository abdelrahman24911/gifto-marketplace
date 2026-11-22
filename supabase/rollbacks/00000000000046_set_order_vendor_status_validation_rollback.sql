-- Rollback for migration 46 (N-05 in-RPC transition validation).
--
-- Restores migration 42's set_order_vendor_status definition exactly
-- (no in-RPC edge check; legality enforced only by the BEFORE trigger).
-- The trigger itself was never touched by migration 46.

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
