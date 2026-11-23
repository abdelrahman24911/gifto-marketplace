-- Migration 71 — Final full-site test pass: make the last N-02
-- fallthrough explicit (REMAINING_AFTER_V10 item 8).
--
-- resolve_refund_case's no-earned-entry arm recorded a pending
-- commission adjustment only while the suborder was shipped. A case
-- opened while shipped, then cancelled before approval, fell through
-- that arm silently: no entry, no pending row, no record anywhere
-- that the commission path was considered. The outcome was already
-- correct — a cancelled suborder can never be delivered, so no
-- commission is ever earned on it and there is nothing to reduce —
-- but the fallthrough was implicit and untested.
--
-- This migration changes no behaviour. It adds an explicit
-- 'cancelled' branch (with the reasoning in the comment) and an
-- explicit else for the delivered/returned anomaly, so every status
-- that can reach this arm is named. RLS TEST 14f proves the
-- cancelled-approval path: the case approves, and no pending row,
-- commission entry, or commission adjustment appears.
--
-- The refund window (7 days from delivery) is deliberately NOT
-- enforced at resolve: the window governs the customer's right to
-- OPEN a case, not the admin's processing time. A case validly opened
-- on day 6 must not be rejected because the admin resolved it on day
-- 8. That is a policy decision for the owner, recorded in
-- docs/MUSE_TEST_RESULTS.md (F-04), not a silent flip here.

CREATE OR REPLACE FUNCTION public.resolve_refund_case(p_case_id uuid, p_approved boolean, p_refund_amount_minor integer DEFAULT 0, p_note text DEFAULT NULL::text, p_return_required boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_case        record;
  v_subtotal    int;
  v_entry       record;
  v_adjusted    int;
  v_remaining   int;
  v_reduction   int;
  -- Renamed in N-01: the old name (v_active_paid) suggested "paid" while
  -- firing for ANY unreleased settlement line, open or paid. Behaviour
  -- for the open-settlement path is unchanged.
  v_has_unreleased_settlement_line boolean;
  v_line_settlement_status public.settlement_status;
  v_paid_line_amount int;
  v_prior_clawed int;
  v_remaining_paid int;
  v_approved_total int;
  v_prior_pending int;
  v_eventual_earn int;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can resolve refunds.'
      using errcode = '42501';
  end if;

  if p_note is not null and length(p_note) > 1000 then
    raise exception 'A resolution note must be 1000 characters or fewer.'
      using errcode = '22023';
  end if;

  select rc.*, ov.subtotal_minor, ov.status as suborder_status,
         ov.commission_rate
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
    -- Distinguish the settlement state of the entry's unreleased line.
    -- A voided settlement's lines are released, so they never match here.
    select s.status, l.amount_minor
      into v_line_settlement_status, v_paid_line_amount
      from public.settlement_lines l
      join public.settlements s on s.id = l.settlement_id
     where l.commission_entry_id = v_entry.id
       and l.released_at is null;

    v_has_unreleased_settlement_line := v_line_settlement_status is not null;

    if v_has_unreleased_settlement_line
       and v_line_settlement_status = 'open' then
      raise exception 'This commission is part of an active settlement. Void or release it before approving the refund.'
        using errcode = '23514';
    end if;

    if v_has_unreleased_settlement_line
       and v_line_settlement_status = 'paid' then
      -- N-01 paid path (D-08): the commission already left Gifto, so the
      -- reduction is recorded as a clawback carried to the vendor's next
      -- settlement. The paid settlement and its lines are never touched,
      -- and the entry stays 'earned' — it was earned and paid; the
      -- clawback is the reversal record.
      select coalesce(sum(abs(amount_minor)), 0)
        into v_prior_clawed
        from public.commission_clawbacks
       where commission_entry_id = v_entry.id;

      v_remaining_paid := v_paid_line_amount - v_prior_clawed;

      if v_remaining_paid > 0 then
        v_reduction := least(
          round(p_refund_amount_minor * v_entry.rate)::int,
          v_remaining_paid
        );

        if v_reduction > 0 then
          insert into public.commission_clawbacks (
            commission_entry_id, refund_case_id, vendor_id, amount_minor,
            reason, created_by
          ) values (
            v_entry.id, v_case.id, v_entry.vendor_id, -v_reduction,
            'Refund case approved after payout — clawback to next settlement',
            auth.uid()
          );
        end if;
      end if;
    elsif not v_has_unreleased_settlement_line then
      -- No settlement line: today's behaviour (adjustment against the
      -- earned entry) — unchanged.
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
    else
      -- Defensive: a line in a settlement state this function does not
      -- know. Fail closed rather than guessing a money path.
      raise exception 'This commission is part of a settlement in an unexpected state.'
        using errcode = '23514';
    end if;
  elsif v_entry.id is null then
    -- N-02: no commission earned yet. If the suborder is still shipped,
    -- record a pending adjustment that converts into an ordinary
    -- adjustment when delivery earns the commission. The rate is the
    -- suborder's frozen snapshot (D-01): it cannot change before
    -- delivery, so the approval-time rate is the earn-time rate.
    -- A delivered/returned suborder with no entry is a data anomaly
    -- with no future earn — record nothing for it (see the explicit
    -- cancelled branch below).
    if v_case.suborder_status = 'shipped' then
      select coalesce(sum(abs(amount_minor)), 0)
        into v_prior_pending
        from public.pending_commission_adjustments
       where order_vendor_id = v_case.order_vendor_id
         and status in ('pending', 'applied');

      v_eventual_earn := round(v_case.subtotal_minor * v_case.commission_rate)::int;

      v_reduction := least(
        round(p_refund_amount_minor * v_case.commission_rate)::int,
        greatest(v_eventual_earn - v_prior_pending, 0)
      );

      if v_reduction > 0 then
        insert into public.pending_commission_adjustments (
          refund_case_id, order_vendor_id, vendor_id, amount_minor,
          refund_amount_minor, rate, created_by
        ) values (
          v_case.id, v_case.order_vendor_id, v_case.vendor_id, -v_reduction,
          p_refund_amount_minor, v_case.commission_rate, auth.uid()
        );
      end if;
    elsif v_case.suborder_status = 'cancelled' then
      -- N-02 (final pass): a case opened while shipped, then cancelled
      -- before approval, reaches this branch with no earned entry and no
      -- pending row. A cancelled suborder can never be delivered, so no
      -- commission is ever earned on it and there is nothing to reduce:
      -- the approval stands and the customer refund is handled
      -- off-system. This branch exists so the fallthrough is explicit
      -- and tested (TEST 14f), never silent. Behaviour is unchanged —
      -- the previous code fell through this same path implicitly.
      null;
    else
      -- A delivered/returned suborder with no entry is a data anomaly
      -- with no future earn — record nothing for it.
      null;
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
$function$;

revoke all on function public.resolve_refund_case(uuid, boolean, int, text, boolean)
  from public, anon;
grant execute on function public.resolve_refund_case(uuid, boolean, int, text, boolean)
  to authenticated;

comment on function public.resolve_refund_case(uuid, boolean, int, text, boolean) is
  'Admin refund resolution (N-02): approval with no earned entry yet records a pending adjustment when the suborder is shipped, converted at delivery (N-02); approval on a cancelled suborder records nothing explicitly, because a cancelled suborder never earns (migration 71, TEST 14f); approval on a paid settlement records a clawback carried to the vendor''s next settlement (D-08, N-01); the open-settlement raise and the no-settlement adjustment path are unchanged from migration 43.';
