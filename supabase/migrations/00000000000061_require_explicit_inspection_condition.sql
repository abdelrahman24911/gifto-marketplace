-- Migration 61 — R-05 residual (re-audit v6): require an explicit
-- inspection condition at receipt; no silent default to 'good'.
--
-- Migration 52 made the condition structural (it decides the return
-- courier payer and whether the item may ever be restocked), but
-- confirm_refund_receipt still defaulted a missing condition to
-- 'good' in three places: the RPC parameter default, the null/empty
-- fallback inside the RPC, and the vendor form's pre-checked "good"
-- radio (plus the server action's `?? "good"`). A vendor who submitted
-- the form without looking — or any caller that omitted the argument —
-- silently recorded a good return: the customer was charged the return
-- courier and a damaged item became restockable. The correction path
-- (migration 58) was the only remedy, and only before restock.
--
-- This migration removes the silent default at the choke point and in
-- the UI:
--   * confirm_refund_receipt requires an explicit p_condition: a null,
--     empty or invalid value raises 22023 and records nothing. 'good'
--     must now be chosen explicitly, exactly like 'wrong_item' and
--     'damaged'. The parameter still carries a NULL default in the
--     signature ONLY because Postgres forbids a required parameter after
--     a defaulted one (p_note has a default and precedes it); the body
--     refuses null, so omitting the argument fails exactly like passing
--     null — no caller can succeed without an explicit condition.
--   * The vendor receipt form no longer pre-checks "good" and the
--     server action no longer substitutes "good" for a missing value
--     (companion TS changes in this commit).
--   * The correction path (migration 58) is unchanged and still works:
--     a vendor who picked the wrong condition can correct it before
--     restock; the correction keeps the replaced value for audit.
--   * Pre-migration receipts keep their recorded conditions, including
--     the migration-52 backfill ('good' for receipts that predated the
--     condition field) — this migration does not rewrite history.
--   * restock_refund_case is untouched: it still refuses damaged and
--     wrong-item cases.

drop function if exists public.confirm_refund_receipt(uuid, text, text);

create or replace function public.confirm_refund_receipt(
  p_case_id uuid,
  p_note text default null,
  p_condition text default null
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

  -- R-05 residual (re-audit v6): the condition is an explicit inspection
  -- call, not a default. A missing, empty or invalid value is a
  -- verification failure and records nothing — silently assuming 'good'
  -- misallocated the return courier to the customer and made a damaged
  -- item restockable.
  v_condition := nullif(lower(trim(coalesce(p_condition, ''))), '');
  if v_condition is null then
    raise exception 'Choose the returned item''s condition: good, wrong item, or damaged.'
      using errcode = '22023';
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

comment on function public.confirm_refund_receipt(uuid, text, text) is
  'Vendor inspection confirmation (P1-04, D-09; R-05; migration 61): records receipt, the EXPLICITLY chosen inspected condition (good / wrong_item / damaged — no default) and the derived return-courier payer (customer for good, vendor for wrong/damaged), and moves the suborder to returned through the audited status path. Never touches stock.';
