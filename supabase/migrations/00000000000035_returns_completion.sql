-- Gifto Marketplace - P1-04 (CR-01): returns/refunds completion on top of
-- migration 30. Migration 30 is never edited in place; its RPCs are
-- redefined here (drop + create where the signature changes).
--
-- D-09 (DECIDED 2026-11-20) is the policy: return window 7 days from
-- delivery; admin approves; vendor inspects; return courier paid by the
-- customer unless wrong/damaged, then the vendor pays; restock is
-- inspect-then-restock manually (via adjust_product_stock with a note),
-- never automatic; suborder-level only for the pilot.
--
-- Decisions this migration records (the pack asked for them explicitly):
--   * Window: counted from the suborder's delivered_at. A suborder that is
--     merely "shipped" (delivered_at is null) stays openable — the window
--     has not started before delivery. A delivered/returned suborder whose
--     delivered_at is older than 7 days is rejected with the window end
--     date in the error. The same rule applies on both paths and to
--     admin-opened cases.
--   * Returned status: the vendor's receipt confirmation (the D-09
--     inspection) moves the suborder delivered/shipped -> returned through
--     set_order_vendor_status with reason customer_request and a note
--     naming the case. Receipt never touches stock. The migration-13
--     transition trigger only allows delivered -> returned for platform
--     admins, so this migration adds a narrow exception to that trigger:
--     the move is allowed for a vendor only while the transaction-local
--     gifto.refund_receipt_case flag names an approved physical-return
--     case for that exact suborder (checked by
--     refund_receipt_allows_return). The flag alone authorises nothing.
--     The rollback restores migration 13's trigger verbatim.
--   * Restock: a separate manual admin step (restock_refund_case) after
--     receipt. It restocks through the existing adjust_product_stock door
--     (D-09's named path; the inventory_movements row keeps reason
--     manual_adjustment and its note names the refund case) and marks the
--     case restocked. Exactly once: the case row is locked and restocked_at
--     must be null. A damaged item is simply never restocked — the admin
--     does not press the button.
--   * No physical return: the admin approves with p_return_required false
--     (e.g. wrong/damaged beyond return). return_path is 'no_return'; no
--     receipt, no returned transition, no restock. The path is recorded on
--     the case either way.
--   * Dispute: a rejected case can be escalated exactly once by its owner
--     (or, for guests, with the order token). The first decision is stashed
--     in first_resolved_* before the case reopens; the admin's second
--     decision is final and a second escalation is rejected.
--   * COD cash refunds stay off-system (migration 30 header): the system
--     records the case, the decision, the commission effect, and the stock
--     effect. It never moves cash.
--
-- NOT built here (separate prompts): N-01 post-payout clawback, N-02
-- pre-delivery commission adjustment, N-03 case cancellation.

-- ---------------------------------------------------------------------------
-- refund_cases: return path, receipt, acknowledgement, restock, escalation
-- ---------------------------------------------------------------------------

alter table public.refund_cases
  add column if not exists return_path text
    check (return_path is null
           or return_path in ('physical_return', 'no_return')),
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists receipt_note text
    check (receipt_note is null or length(receipt_note) <= 1000),
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists restocked_at timestamptz,
  add column if not exists restocked_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists escalation_count int not null default 0
    check (escalation_count between 0 and 1),
  add column if not exists escalated_at timestamptz,
  add column if not exists escalation_note text
    check (escalation_note is null or length(escalation_note) <= 1000),
  add column if not exists first_resolved_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists first_resolved_at timestamptz,
  add column if not exists first_resolution_note text
    check (first_resolution_note is null
           or length(first_resolution_note) <= 1000);

-- A return path exists exactly on approved cases.
alter table public.refund_cases
  add constraint refund_cases_return_path_matches check (
    (status <> 'approved' and return_path is null)
    or (status = 'approved'
        and return_path in ('physical_return', 'no_return'))
  );

-- Receipt and restock only on a physical return, restock only after receipt.
alter table public.refund_cases
  add constraint refund_cases_receipt_matches check (
    (received_at is null
     and received_by is null
     and receipt_note is null
     and restocked_at is null
     and restocked_by is null)
    or (received_at is not null
        and received_by is not null
        and return_path = 'physical_return'
        and (restocked_at is null and restocked_by is null
             or (restocked_at is not null
                 and restocked_by is not null)))
  );

-- Escalation fields are all set together, exactly once.
alter table public.refund_cases
  add constraint refund_cases_escalation_matches check (
    (escalation_count = 0
     and escalated_at is null
     and escalation_note is null
     and first_resolved_by is null
     and first_resolved_at is null
     and first_resolution_note is null)
    or (escalation_count = 1
        and escalated_at is not null
        and escalation_note is not null
        and first_resolved_by is not null
        and first_resolved_at is not null)
  );

-- ---------------------------------------------------------------------------
-- get_guest_order — redefined with delivered_at per vendor (migration 33
-- body with its P1-02 token-expiry check; the guest order page needs
-- delivered_at to mirror the D-09 return window in the UI, P1-04)
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

-- ---------------------------------------------------------------------------
-- open_refund_case — redefined with the D-09 return window (migration 30
-- body + delivered_at + window check; signature unchanged)
-- ---------------------------------------------------------------------------

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

  select ov.id, ov.order_id, ov.vendor_id, ov.status, ov.subtotal_minor,
         ov.delivered_at, o.user_id
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

  -- D-09 window (P1-04): 7 days from delivery. A suborder that is merely
  -- shipped has no delivered_at yet, so the window has not started and the
  -- case stays openable. A delivered/returned suborder past the window is
  -- rejected with the window end date.
  if v_suborder.status in ('delivered', 'returned')
     and v_suborder.delivered_at is not null
     and v_suborder.delivered_at < now() - interval '7 days' then
    raise exception 'The 7-day return window for this delivery ended on %. Returns are no longer available for this order.'
      , to_char(v_suborder.delivered_at + interval '7 days', 'DD Mon YYYY')
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

-- ---------------------------------------------------------------------------
-- open_guest_refund_case — redefined with the D-09 return window
-- (migration 33 body with its P1-02 token-expiry check + window check;
-- signature unchanged)
-- ---------------------------------------------------------------------------

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

  select ov.id, ov.order_id, ov.vendor_id, ov.status, ov.subtotal_minor,
         ov.delivered_at
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

  -- D-09 window (P1-04): see open_refund_case above.
  if v_suborder.status in ('delivered', 'returned')
     and v_suborder.delivered_at is not null
     and v_suborder.delivered_at < now() - interval '7 days' then
    raise exception 'The 7-day return window for this delivery ended on %. Returns are no longer available for this order.'
      , to_char(v_suborder.delivered_at + interval '7 days', 'DD Mon YYYY')
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

-- ---------------------------------------------------------------------------
-- get_guest_refund_cases — redefined with escalation columns (migration 33
-- body with its P1-02 token-expiry check; return type changed, so drop
-- first). The guest page needs escalation_count to know whether the
-- one-shot escalation is still available.
-- ---------------------------------------------------------------------------

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
  resolved_at timestamptz,
  escalation_count int,
  escalated_at timestamptz
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
           rc.resolution_note, rc.created_at, rc.resolved_at,
           rc.escalation_count, rc.escalated_at
      from public.refund_cases rc
     where rc.order_id = p_order_id
     order by rc.created_at desc;
end;
$$;

revoke all on function public.get_guest_refund_cases(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_guest_refund_cases(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- resolve_refund_case — redefined with the return path (migration 30 body
-- + p_return_required). The N-01 settlement raise below is untouched:
-- commission in an active settlement still blocks automatic approval.
-- Signature changed, so drop first.
-- ---------------------------------------------------------------------------

drop function if exists public.resolve_refund_case(uuid, boolean, int, text);

create or replace function public.resolve_refund_case(
  p_case_id uuid,
  p_approved boolean,
  p_refund_amount_minor int default 0,
  p_note text default null,
  p_return_required boolean default true
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
         resolved_at = now(),
         return_path = case when p_return_required
                            then 'physical_return'::text
                            else 'no_return'::text end
   where id = p_case_id;
end;
$$;

revoke all on function public.resolve_refund_case(uuid, boolean, int, text, boolean)
  from public, anon;
grant execute on function public.resolve_refund_case(uuid, boolean, int, text, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Transition trigger: let a vendor-driven receipt move a suborder to
-- returned, gated by an approved physical-return case (see header)
-- ---------------------------------------------------------------------------

-- The flag alone authorises nothing: the named case must be an approved
-- physical return for this exact suborder. Set transaction-locally by
-- confirm_refund_receipt before it calls set_order_vendor_status.
create or replace function public.refund_receipt_allows_return(
  p_order_vendor_id uuid
)
returns boolean
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_case_id uuid;
begin
  begin
    v_case_id := nullif(
      btrim(current_setting('gifto.refund_receipt_case', true)), '')::uuid;
  exception when others then
    return false;
  end;

  if v_case_id is null then
    return false;
  end if;

  return exists (
    select 1 from public.refund_cases rc
     where rc.id = v_case_id
       and rc.order_vendor_id = p_order_vendor_id
       and rc.status = 'approved'
       and rc.return_path = 'physical_return'
  );
end;
$$;

revoke all on function public.refund_receipt_allows_return(uuid)
  from public, anon, authenticated;

-- Migration 13's trigger body, plus the refund-receipt exception on the
-- delivered/shipped -> returned lines. Everything else is unchanged.
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
    or (old.status = 'shipped'   and new.status = 'returned'
        and public.refund_receipt_allows_return(new.id))
    or (old.status = 'delivered' and new.status = 'returned'
        and (public.is_platform_admin()
             or public.refund_receipt_allows_return(new.id)));

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

-- ---------------------------------------------------------------------------
-- acknowledge_refund_case — vendor marks a case seen (D-09 vendor role)
-- ---------------------------------------------------------------------------

create or replace function public.acknowledge_refund_case(
  p_case_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case record;
begin
  select rc.id, rc.vendor_id, rc.status
    into v_case
    from public.refund_cases rc
   where rc.id = p_case_id
   for update;

  if v_case.id is null then
    raise exception 'Refund case not found.' using errcode = '22023';
  end if;

  if not public.is_vendor_manager(v_case.vendor_id) then
    raise exception 'Only the shop that owns this order can acknowledge its refund case.'
      using errcode = '42501';
  end if;

  if v_case.status not in ('open', 'approved') then
    raise exception 'This refund case is already closed.' using errcode = '23514';
  end if;

  update public.refund_cases
     set acknowledged_at = now(),
         acknowledged_by = auth.uid()
   where id = p_case_id;
end;
$$;

revoke all on function public.acknowledge_refund_case(uuid) from public, anon;
grant execute on function public.acknowledge_refund_case(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- confirm_refund_receipt — vendor confirms the returned item was received
-- (D-09 inspection). Moves the suborder to "returned" through the audited
-- status path. Never touches stock; restock is a separate manual admin step.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_refund_receipt(
  p_case_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case     record;
  v_suborder record;
begin
  if p_note is not null and length(p_note) > 1000 then
    raise exception 'A receipt note must be 1000 characters or fewer.'
      using errcode = '22023';
  end if;

  select rc.*
    into v_case
    from public.refund_cases rc
   where rc.id = p_case_id
   for update;

  if v_case.id is null then
    raise exception 'Refund case not found.' using errcode = '22023';
  end if;

  if not public.is_vendor_manager(v_case.vendor_id) then
    raise exception 'Only the shop that owns this order can confirm receipt of its return.'
      using errcode = '42501';
  end if;

  if v_case.status <> 'approved' then
    raise exception 'Only an approved refund can have its return confirmed.'
      using errcode = '23514';
  end if;

  if v_case.return_path <> 'physical_return' then
    raise exception 'This refund was approved without a physical return.'
      using errcode = '23514';
  end if;

  if v_case.received_at is not null then
    raise exception 'This return was already confirmed received.'
      using errcode = '23514';
  end if;

  update public.refund_cases
     set received_at = now(),
         received_by = auth.uid(),
         receipt_note = nullif(trim(p_note), '')
   where id = p_case_id;

  -- The audited status move. The suborder is delivered (or still shipped)
  -- when the item comes back; an already-returned suborder needs no move.
  select ov.id, ov.status
    into v_suborder
    from public.order_vendors ov
   where ov.id = v_case.order_vendor_id
   for update;

  if v_suborder.id is not null
     and v_suborder.status in ('delivered', 'shipped') then
    -- Gate the transition trigger (see above): the flag names this approved
    -- physical-return case for this suborder, and is cleared right after.
    perform set_config('gifto.refund_receipt_case', p_case_id::text, true);
    begin
      perform public.set_order_vendor_status(
        v_suborder.id,
        'returned'::public.order_status,
        v_suborder.status,
        'customer_request',
        'Return received for refund case ' || p_case_id::text
      );
    exception when others then
      perform set_config('gifto.refund_receipt_case', '', true);
      raise;
    end;
    perform set_config('gifto.refund_receipt_case', '', true);
  end if;
end;
$$;

revoke all on function public.confirm_refund_receipt(uuid, text) from public, anon;
grant execute on function public.confirm_refund_receipt(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- restock_refund_case — manual admin restock after the vendor's inspection
-- (D-09: inspect-then-restock manually, never automatic). Restocks through
-- the existing adjust_product_stock door, so each movement keeps reason
-- manual_adjustment and its note names the refund case. Exactly once.
-- ---------------------------------------------------------------------------

create or replace function public.restock_refund_case(
  p_case_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case record;
  v_item record;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can restock a return.'
      using errcode = '42501';
  end if;

  select rc.*
    into v_case
    from public.refund_cases rc
   where rc.id = p_case_id
   for update;

  if v_case.id is null then
    raise exception 'Refund case not found.' using errcode = '22023';
  end if;

  if v_case.status <> 'approved' then
    raise exception 'Only an approved refund can be restocked.'
      using errcode = '23514';
  end if;

  if v_case.return_path <> 'physical_return' then
    raise exception 'This refund was approved without a physical return.'
      using errcode = '23514';
  end if;

  if v_case.received_at is null then
    raise exception 'Confirm the returned item was received before restocking it.'
      using errcode = '23514';
  end if;

  if v_case.restocked_at is not null then
    raise exception 'This return was already restocked.' using errcode = '23514';
  end if;

  for v_item in
    select oi.product_id, oi.quantity
      from public.order_items oi
     where oi.order_vendor_id = v_case.order_vendor_id
     order by oi.product_id
  loop
    perform public.adjust_product_stock(
      v_item.product_id,
      v_item.quantity,
      'Refund case ' || p_case_id::text
        || ' — returned item restocked after inspection'
    );
  end loop;

  update public.refund_cases
     set restocked_at = now(),
         restocked_by = auth.uid()
   where id = p_case_id;
end;
$$;

revoke all on function public.restock_refund_case(uuid) from public, anon;
grant execute on function public.restock_refund_case(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- escalate_refund_case — one-shot dispute escalation (signed-in owner)
-- ---------------------------------------------------------------------------

create or replace function public.escalate_refund_case(
  p_case_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case record;
  v_owner uuid;
begin
  if p_note is null or length(trim(p_note)) not between 5 and 1000 then
    raise exception 'Explain why you disagree in 5-1000 characters.'
      using errcode = '22023';
  end if;

  select rc.*
    into v_case
    from public.refund_cases rc
   where rc.id = p_case_id
   for update;

  if v_case.id is null then
    raise exception 'Refund case not found.' using errcode = '22023';
  end if;

  select o.user_id into v_owner
    from public.orders o
   where o.id = v_case.order_id;

  if v_owner is distinct from auth.uid() then
    raise exception 'You can only escalate a refund for your own order.'
      using errcode = '42501';
  end if;

  if v_case.status <> 'rejected' then
    raise exception 'Only a rejected refund can be escalated.' using errcode = '23514';
  end if;

  if v_case.escalation_count >= 1 then
    raise exception 'This refund was already escalated once. The next decision is final.'
      using errcode = '23514';
  end if;

  begin
    update public.refund_cases
       set status = 'open',
           refund_amount_minor = null,
           resolution_note = null,
           resolved_by = null,
           resolved_at = null,
           first_resolved_by = v_case.resolved_by,
           first_resolved_at = v_case.resolved_at,
           first_resolution_note = v_case.resolution_note,
           escalation_count = 1,
           escalated_at = now(),
           escalation_note = trim(p_note)
     where id = p_case_id;
  exception when unique_violation then
    raise exception 'There is already an open refund case for this shop in your order.'
      using errcode = '23514';
  end;
end;
$$;

revoke all on function public.escalate_refund_case(uuid, text) from public, anon;
grant execute on function public.escalate_refund_case(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- escalate_guest_refund_case — one-shot dispute escalation (guest, token)
-- ---------------------------------------------------------------------------

create or replace function public.escalate_guest_refund_case(
  p_order_id uuid,
  p_token_hash text,
  p_case_id uuid,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case record;
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

  if p_note is null or length(trim(p_note)) not between 5 and 1000 then
    raise exception 'Explain why you disagree in 5-1000 characters.'
      using errcode = '22023';
  end if;

  select rc.*
    into v_case
    from public.refund_cases rc
   where rc.id = p_case_id
     and rc.order_id = p_order_id
   for update;

  if v_case.id is null then
    raise exception 'Refund case not found.' using errcode = '22023';
  end if;

  if v_case.status <> 'rejected' then
    raise exception 'Only a rejected refund can be escalated.' using errcode = '23514';
  end if;

  if v_case.escalation_count >= 1 then
    raise exception 'This refund was already escalated once. The next decision is final.'
      using errcode = '23514';
  end if;

  begin
    update public.refund_cases
       set status = 'open',
           refund_amount_minor = null,
           resolution_note = null,
           resolved_by = null,
           resolved_at = null,
           first_resolved_by = v_case.resolved_by,
           first_resolved_at = v_case.resolved_at,
           first_resolution_note = v_case.resolution_note,
           escalation_count = 1,
           escalated_at = now(),
           escalation_note = trim(p_note)
     where id = p_case_id;
  exception when unique_violation then
    raise exception 'There is already an open refund case for this shop in your order.'
      using errcode = '23514';
  end;
end;
$$;

revoke all on function public.escalate_guest_refund_case(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.escalate_guest_refund_case(uuid, text, uuid, text)
  to service_role;

comment on function public.resolve_refund_case(uuid, boolean, int, text, boolean) is
  'Admin refund resolution (P1-04): approval records return_path physical_return (default) or no_return; commission adjustment and N-01 settlement raise unchanged from migration 30.';
comment on function public.confirm_refund_receipt(uuid, text) is
  'Vendor inspection confirmation (P1-04, D-09): records receipt and moves the suborder to returned through the audited status path. Never touches stock.';
comment on function public.restock_refund_case(uuid) is
  'Manual admin restock after vendor inspection (P1-04, D-09): restocks through adjust_product_stock, exactly once. A damaged item is never restocked.';
comment on function public.escalate_refund_case(uuid, text) is
  'One-shot dispute escalation (P1-04): a rejected case reopens once with the first decision stashed; the second decision is final.';
