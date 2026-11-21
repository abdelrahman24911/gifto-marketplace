-- Rollback for migration 61 (R-05 residual: explicit inspection
-- condition at receipt).
--
-- Restores migration 52's confirm_refund_receipt (3 arguments, p_condition
-- defaulting to 'good', null/empty falling back to 'good'). Rolling back
-- REINTRODUCES the R-05 residual: a receipt without an explicit condition
-- silently records a good return, charging the customer the return courier
-- and making a damaged item restockable. Only roll back if the explicit-
-- condition requirement itself must be removed. The vendor form's
-- pre-checked "good" radio and the server action's `?? "good"` fallback
-- are TS changes in the same commit and must be reverted separately if
-- this rollback is ever applied.

drop function if exists public.confirm_refund_receipt(uuid, text, text);

create or replace function public.confirm_refund_receipt(
  p_case_id uuid,
  p_note text default null,
  p_condition text default 'good'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case      record;
  v_suborder  record;
  v_condition text;
begin
  if p_note is not null and length(p_note) > 1000 then
    raise exception 'A receipt note must be 1000 characters or fewer.'
      using errcode = '22023';
  end if;

  -- R-05: the vendor records what actually arrived. Anything else is a
  -- verification failure, not a condition.
  v_condition := nullif(lower(trim(coalesce(p_condition, ''))), '');
  if v_condition is null then
    v_condition := 'good';
  end if;
  if v_condition not in ('good', 'wrong_item', 'damaged') then
    raise exception 'Describe the returned item as good, wrong item, or damaged.'
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

  -- R-05: condition and courier payer are recorded in the same UPDATE as
  -- the receipt, so refund_cases_courier_payer_matches is never violated:
  -- good -> the customer pays the return courier; wrong/damaged -> the
  -- vendor pays (D-09).
  update public.refund_cases
     set received_at = now(),
         received_by = auth.uid(),
         receipt_note = nullif(trim(p_note), ''),
         inspection_condition = v_condition,
         return_courier_paid_by = case when v_condition = 'good'
                                       then 'customer'::text
                                       else 'vendor'::text end
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

revoke all on function public.confirm_refund_receipt(uuid, text, text) from public, anon;
grant execute on function public.confirm_refund_receipt(uuid, text, text) to authenticated;

comment on function public.confirm_refund_receipt(uuid, text, text) is
  'Vendor inspection confirmation (P1-04, D-09; R-05): records receipt, the inspected condition (good / wrong_item / damaged) and the derived return-courier payer (customer for good, vendor for wrong/damaged), and moves the suborder to returned through the audited status path. Never touches stock.';
