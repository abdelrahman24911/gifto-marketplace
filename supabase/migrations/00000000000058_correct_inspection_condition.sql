-- Migration 58 — R-05 caveat (re-audit v4, LOW): a correction path for
-- the inspection condition.
--
-- Migration 52 made the vendor's inspection call structural: the
-- condition recorded at receipt ('good' | 'wrong_item' | 'damaged')
-- decides who pays the return courier (customer for good, the shop
-- for wrong/damaged) and whether the item may ever be restocked. But
-- confirm_refund_receipt defaults a missing condition to 'good' and a
-- second receipt is refused, so a vendor who tapped the wrong option
-- — or who only realised the item was damaged after the first look —
-- had no way to fix the misallocation: the courier payer stayed wrong
-- and a damaged item could be restocked as good. The only escape was
-- an admin editing the row by hand.
--
-- This migration adds the correction as a first-class, audited RPC
-- instead of a second receipt:
--   * correct_refund_inspection_condition(p_case_id, p_condition)
--     re-records the condition and re-derives return_courier_paid_by
--     from it, so refund_cases_courier_payer_matches can never be
--     violated by a correction either.
--   * Gates, matching the receipt/restock gates: the caller must be a
--     manager of the shop that owns the case, or a platform admin;
--     the case must be approved and already received (there is
--     nothing to correct before receipt); it must not have been
--     restocked yet — once stock moved, the decision is spent, and
--     correcting good -> damaged afterwards would leave a damaged
--     item on the shelf. An identical value is refused as "already
--     recorded as ...", so a double submit cannot look like a
--     correction.
--   * Audit: the replaced value, the corrector and the time are kept
--     on the row (inspection_condition_previous,
--     inspection_corrected_by, inspection_corrected_at), so the admin
--     refunds list can show that a condition was corrected and from
--     what. History is NOT backfilled differently: cases received
--     before migration 52 were backfilled 'good' / customer-paid as
--     an assumption, and that stands — this path corrects only
--     inspections recorded from now on, by the people who made them.
--   * No other behaviour changes: restock_refund_case still refuses
--     damaged / wrong-item cases, and a case corrected damaged ->
--     good becomes restockable again, because the correction is the
--     inspection.

alter table public.refund_cases
  add column if not exists inspection_condition_previous text
    check (inspection_condition_previous is null
           or inspection_condition_previous in ('good', 'wrong_item', 'damaged')),
  add column if not exists inspection_corrected_at timestamptz,
  add column if not exists inspection_corrected_by uuid
    references public.profiles (id) on delete set null;

create or replace function public.correct_refund_inspection_condition(
  p_case_id uuid,
  p_condition text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case      record;
  v_condition text;
begin
  v_condition := nullif(lower(trim(coalesce(p_condition, ''))), '');
  if v_condition is null or v_condition not in ('good', 'wrong_item', 'damaged') then
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

  if not public.is_vendor_manager(v_case.vendor_id)
     and not public.is_platform_admin() then
    raise exception 'Only the shop that owns this order, or a platform administrator, can correct its inspection.'
      using errcode = '42501';
  end if;

  if v_case.status <> 'approved' then
    raise exception 'Only an approved refund can have its inspection corrected.'
      using errcode = '23514';
  end if;

  if v_case.received_at is null then
    raise exception 'Confirm the returned item was received before correcting its inspection.'
      using errcode = '23514';
  end if;

  if v_case.restocked_at is not null then
    raise exception 'This return was already restocked; its inspection can no longer be corrected.'
      using errcode = '23514';
  end if;

  if v_case.inspection_condition = v_condition then
    raise exception 'This return is already recorded as %.', v_condition
      using errcode = '23514';
  end if;

  -- Re-derive the courier payer from the corrected condition, in the
  -- same UPDATE, so refund_cases_courier_payer_matches is never
  -- violated: good -> the customer pays; wrong/damaged -> the shop
  -- pays (D-09). The replaced value stays on the row for audit.
  update public.refund_cases
     set inspection_condition = v_condition,
         return_courier_paid_by = case when v_condition = 'good'
                                       then 'customer'::text
                                       else 'vendor'::text end,
         inspection_condition_previous = v_case.inspection_condition,
         inspection_corrected_at = now(),
         inspection_corrected_by = auth.uid()
   where id = p_case_id;
end;
$$;

revoke all on function public.correct_refund_inspection_condition(uuid, text)
  from public, anon;
grant execute on function public.correct_refund_inspection_condition(uuid, text)
  to authenticated;

comment on function public.correct_refund_inspection_condition(uuid, text) is
  'Inspection correction (R-05, D-09): the owning shop''s manager, or a platform admin, re-records the inspection condition of an approved, received, not-yet-restocked return, and the return-courier payer is re-derived from it (customer for good, the shop for wrong/damaged). The replaced value, corrector and time stay on the row for audit. A damaged -> good correction makes the return restockable again; a restocked return can no longer be corrected.';
