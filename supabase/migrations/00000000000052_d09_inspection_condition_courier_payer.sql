-- Gifto Marketplace - R-05 (re-audit v3): enforce the two D-09 policy
-- points that existed only as comments in migration 35.
--
-- D-09 (DECIDED 2026-11-20): return courier paid by the customer unless
-- wrong/damaged, then the vendor pays; a damaged item is never restocked.
--
-- Until now both were unenforced:
--   * restock_refund_case restocked whatever the vendor had received —
--     the "damaged item is never restocked" rule lived only in a comment
--     and in the admin's discipline (not pressing the button).
--   * No field recorded who pays the return courier, so nothing in the
--     system could ever show or settle it.
--
-- This migration makes both structural:
--   * refund_cases gains inspection_condition ('good' | 'wrong_item' |
--     'damaged'), recorded by the vendor at receipt — the inspection
--     point, when the condition is actually known — and
--     return_courier_paid_by ('customer' | 'vendor'), derived from it.
--   * A CHECK constraint ties the three together: no receipt means no
--     condition and no payer; 'good' means the customer pays; 'wrong_item'
--     or 'damaged' means the vendor pays. No path can record a
--     contradictory allocation.
--   * restock_refund_case refuses a case whose inspection_condition is
--     'damaged' (D-09: never restocked) or 'wrong_item' (the returned
--     item is not the product the customer ordered, so it cannot be
--     restocked against this order's items; the shop restocks the actual
--     item manually via adjust_product_stock if it is saleable).
--   * confirm_refund_receipt gains p_condition (default 'good', so every
--     existing caller keeps working unchanged) and records the condition
--     and the derived payer in the same UPDATE as the receipt, so the
--     constraint is never transiently violated.
--
-- Backfill: cases already received before this migration recorded no
-- condition, so they are backfilled as 'good' / customer-pays — the
-- behaviour the old code implied (receipt was treated as a good return).
-- No-return cases keep both columns null: nothing was received, no
-- courier ran.

alter table public.refund_cases
  add column if not exists inspection_condition text
    check (inspection_condition is null
           or inspection_condition in ('good', 'wrong_item', 'damaged')),
  add column if not exists return_courier_paid_by text
    check (return_courier_paid_by is null
           or return_courier_paid_by in ('customer', 'vendor'));

-- Pre-migration receipts implied a good return paid by the customer.
update public.refund_cases
   set inspection_condition = 'good',
       return_courier_paid_by = 'customer'
 where received_at is not null
   and inspection_condition is null;

alter table public.refund_cases
  add constraint refund_cases_courier_payer_matches check (
    (received_at is null
     and inspection_condition is null
     and return_courier_paid_by is null)
    or (received_at is not null
        and inspection_condition = 'good'
        and return_courier_paid_by = 'customer')
    or (received_at is not null
        and inspection_condition in ('wrong_item', 'damaged')
        and return_courier_paid_by = 'vendor')
  );

-- ---------------------------------------------------------------------------
-- confirm_refund_receipt — redefined with the inspection condition
-- (signature changed, so drop first; migration 35 body + p_condition)
-- ---------------------------------------------------------------------------

drop function if exists public.confirm_refund_receipt(uuid, text);

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
    -- Gate the transition trigger (see migration 35): the flag names this
    -- approved physical-return case for this suborder, and is cleared
    -- right after.
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

-- ---------------------------------------------------------------------------
-- restock_refund_case — redefined with the D-09 restock bans
-- (migration 35 body + condition checks, before the first stock write)
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

  -- R-05 (D-09): a damaged item is never restocked, and a wrong item is
  -- not the product the customer ordered, so it cannot be restocked
  -- against this order's items either. The shop restocks the actual item
  -- manually via adjust_product_stock if it is saleable.
  if v_case.inspection_condition = 'damaged' then
    raise exception 'A damaged return is never restocked (D-09). The item stays out of stock.'
      using errcode = '23514';
  end if;

  if v_case.inspection_condition = 'wrong_item' then
    raise exception 'A wrong item cannot be restocked against this order — it is not the product the customer ordered.'
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

comment on function public.confirm_refund_receipt(uuid, text, text) is
  'Vendor inspection confirmation (P1-04, D-09; R-05): records receipt, the inspected condition (good / wrong_item / damaged) and the derived return-courier payer (customer for good, vendor for wrong/damaged), and moves the suborder to returned through the audited status path. Never touches stock.';
comment on function public.restock_refund_case(uuid) is
  'Manual admin restock after vendor inspection (P1-04, D-09; R-05): restocks through adjust_product_stock, exactly once. A damaged return is never restocked, and a wrong item cannot be restocked against this order.';
