-- Rollback for 00000000000035_returns_completion.sql.
--
-- Drops the P1-04 vendor/escalation/restock RPCs, restores the migration-30
-- definitions of open_refund_case and resolve_refund_case (4 arguments, no
-- return path) and the migration-33 definitions of open_guest_refund_case
-- and get_guest_refund_cases (with the P1-02 token-expiry check), and drops
-- the P1-04 refund_cases columns. The D-09 return window, receipt, restock
-- and escalation are removed; cases keep their rows but lose the P1-04
-- tracking columns. No order data is altered.

drop function if exists public.escalate_guest_refund_case(uuid, text, uuid, text);
drop function if exists public.escalate_refund_case(uuid, text);
drop function if exists public.restock_refund_case(uuid);
drop function if exists public.confirm_refund_receipt(uuid, text);
drop function if exists public.acknowledge_refund_case(uuid);
drop function if exists public.resolve_refund_case(uuid, boolean, int, text, boolean);

-- open_refund_case: restore the migration-30 body (no return window).
create or replace function public.open_refund_case(
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
  v_user_id    uuid := auth.uid();
  v_admin      boolean := public.is_platform_admin();
  v_suborder   record;
  v_case_id    uuid;
  v_source     public.refund_case_source;
begin
  if v_user_id is null then
    raise exception 'Sign in to request a refund.' using errcode = '42501';
  end if;

  select ov.id, ov.order_id, ov.vendor_id, ov.status, ov.subtotal_minor, o.user_id
    into v_suborder
    from public.order_vendors ov
    join public.orders o on o.id = ov.order_id
   where ov.id = p_order_vendor_id;

  if v_suborder.id is null then
    raise exception 'Choose a valid order item group.' using errcode = '22023';
  end if;

  if not v_admin and v_suborder.user_id is distinct from v_user_id then
    raise exception 'You can only request a refund for your own order.'
      using errcode = '42501';
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

  v_source := case when v_admin then 'admin'::public.refund_case_source
                   else 'customer'::public.refund_case_source end;

  begin
    insert into public.refund_cases (
      order_id, order_vendor_id, vendor_id, source, opened_by,
      reason, requested_amount_minor
    ) values (
      v_suborder.order_id, v_suborder.id, v_suborder.vendor_id, v_source,
      v_user_id, trim(p_reason), p_requested_amount_minor
    )
    returning id into v_case_id;
  exception when unique_violation then
    raise exception 'There is already an open refund case for this shop in your order.'
      using errcode = '23514';
  end;

  return v_case_id;
end;
$$;

revoke all on function public.open_refund_case(uuid, text, int) from public, anon;

grant execute on function public.open_refund_case(uuid, text, int) to authenticated;

-- resolve_refund_case: restore the migration-30 body (4 arguments, no
-- return path; N-01 settlement raise intact).
create or replace function public.resolve_refund_case(
  p_case_id uuid,
  p_approved boolean,
  p_refund_amount_minor int default 0,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case        record;
  v_subtotal    int;
  v_entry       record;
  v_adjusted    int;
  v_remaining   int;
  v_reduction   int;
  v_active_paid boolean;
  v_approved_total int;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can resolve refunds.'
      using errcode = '42501';
  end if;

  if p_note is not null and length(p_note) > 1000 then
    raise exception 'A resolution note must be 1000 characters or fewer.'
      using errcode = '22023';
  end if;

  select rc.*, ov.subtotal_minor
    into v_case
    from public.refund_cases rc
    join public.order_vendors ov on ov.id = rc.order_vendor_id
   where rc.id = p_case_id
   for update of rc;

  if v_case.id is null then
    raise exception 'Refund case not found.' using errcode = '22023';
  end if;

  if v_case.status <> 'open' then
    raise exception 'This refund case is already resolved.' using errcode = '23514';
  end if;

  if not p_approved then
    if p_refund_amount_minor is not null and p_refund_amount_minor <> 0 then
      raise exception 'A rejected case cannot have a refund amount.'
        using errcode = '22023';
    end if;

    update public.refund_cases
       set status = 'rejected',
           refund_amount_minor = 0,
           resolution_note = nullif(trim(p_note), ''),
           resolved_by = auth.uid(),
           resolved_at = now()
     where id = p_case_id;
    return;
  end if;

  if p_refund_amount_minor is null or p_refund_amount_minor <= 0 then
    raise exception 'Enter a refund amount greater than zero.' using errcode = '22023';
  end if;

  if p_refund_amount_minor > v_case.subtotal_minor then
    raise exception 'The refund cannot exceed the shop subtotal.' using errcode = '23514';
  end if;

  -- Serialise approvals for the same suborder so two admins cannot approve
  -- more than the customer paid.
  perform 1 from public.order_vendors where id = v_case.order_vendor_id for update;

  select coalesce(sum(refund_amount_minor), 0)
    into v_approved_total
    from public.refund_cases
   where order_vendor_id = v_case.order_vendor_id
     and status = 'approved';

  if v_approved_total + p_refund_amount_minor > v_case.subtotal_minor then
    raise exception 'Earlier refunds already cover this shop subtotal.'
      using errcode = '23514';
  end if;

  select ce.id, ce.vendor_id, ce.rate, ce.amount_minor, ce.status
    into v_entry
    from public.commission_entries ce
   where ce.order_vendor_id = v_case.order_vendor_id
   for update;

  if v_entry.id is not null and v_entry.status = 'earned' then
    select exists (
      select 1 from public.settlement_lines l
       where l.commission_entry_id = v_entry.id
         and l.released_at is null
    ) into v_active_paid;

    if v_active_paid then
      raise exception 'This commission is part of an active settlement. Void or release it before approving the refund.'
        using errcode = '23514';
    end if;

    select coalesce(sum(amount_minor), 0)
      into v_adjusted
      from public.commission_adjustments
     where commission_entry_id = v_entry.id;

    v_remaining := v_entry.amount_minor + v_adjusted;

    if v_remaining > 0 then
      v_reduction := least(
        round(p_refund_amount_minor * v_entry.rate)::int,
        v_remaining
      );

      if v_reduction > 0 then
        insert into public.commission_adjustments (
          commission_entry_id, refund_case_id, vendor_id, amount_minor,
          reason, created_by
        ) values (
          v_entry.id, v_case.id, v_entry.vendor_id, -v_reduction,
          'Refund case approved', auth.uid()
        );

        if v_reduction >= v_remaining then
          update public.commission_entries
             set status = 'reversed', reversed_at = now()
           where id = v_entry.id and status = 'earned';
        end if;
      end if;
    end if;
  end if;

  update public.refund_cases
     set status = 'approved',
         refund_amount_minor = p_refund_amount_minor,
         resolution_note = nullif(trim(p_note), ''),
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = p_case_id;
end;
$$;

revoke all on function public.resolve_refund_case(uuid, boolean, int, text)
  from public, anon;

grant execute on function public.resolve_refund_case(uuid, boolean, int, text)
  to authenticated;

-- open_guest_refund_case: restore the migration-33 body (P1-02 token-expiry
-- check, no return window).
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
       and (o.guest_token_expires_at is null
            or o.guest_token_expires_at > now())
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

-- get_guest_refund_cases: restore the migration-33 body (9 columns, P1-02
-- token-expiry check). The 11-column P1-04 version must be dropped first.
drop function if exists public.get_guest_refund_cases(uuid, text);

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
       and (o.guest_token_expires_at is null
            or o.guest_token_expires_at > now())
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

-- Drop the P1-04 columns and their checks.
alter table public.refund_cases
  drop constraint if exists refund_cases_escalation_matches,
  drop constraint if exists refund_cases_receipt_matches,
  drop constraint if exists refund_cases_return_path_matches,
  drop column if exists first_resolution_note,
  drop column if exists first_resolved_at,
  drop column if exists first_resolved_by,
  drop column if exists escalation_note,
  drop column if exists escalated_at,
  drop column if exists escalation_count,
  drop column if exists restocked_by,
  drop column if exists restocked_at,
  drop column if exists acknowledged_by,
  drop column if exists acknowledged_at,
  drop column if exists receipt_note,
  drop column if exists received_by,
  drop column if exists received_at,
  drop column if exists return_path;

-- Transition trigger: restore the migration-13 body verbatim (delivered ->
-- returned is admin-only again) and drop the P1-04 receipt gate.
drop function if exists public.refund_receipt_allows_return(uuid);

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

-- get_guest_order: restore the migration-33 body (no delivered_at per
-- vendor; P1-02 token-expiry check intact).
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
    and p_token_hash ~ '^[0-9a-f]{64}$'
    and (o.guest_token_expires_at is null
         or o.guest_token_expires_at > now());
$$;

revoke all on function public.get_guest_order(uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_guest_order(uuid, text)
  to service_role;
