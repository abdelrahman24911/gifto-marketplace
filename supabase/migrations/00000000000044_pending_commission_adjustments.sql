-- Gifto Marketplace — N-02: pending commission adjustment for
-- pre-delivery refunds (re-audit N-02, High)
--
-- THE BUG (re-audit N-02, code-verified): in resolve_refund_case the
-- commission adjustment ran only inside `if v_entry.id is not null and
-- v_entry.status = 'earned'`. For a shipped suborder no earned entry
-- exists yet, so the block was silently skipped, the case was still
-- marked approved — and when the suborder later reached delivered,
-- record_commission_on_delivery earned the FULL commission on the
-- refunded subtotal. The platform silently over-earned on refunded
-- orders with no error anywhere.
--
-- DESIGN (storage shape — why a dedicated pending table):
--   * A pending adjustment cannot be a commission_adjustments row: that
--     table's FK requires a commission_entries row, which does not exist
--     yet for a shipped suborder, and its scope trigger requires the
--     case's suborder to match the entry's suborder. A dedicated table
--     mirrors migration 30's scope-trigger discipline instead of
--     weakening it: refund_case_id unique (one pending row per case),
--     order_vendor_id + vendor_id bound to the case, rate frozen at
--     approval, amount negative, and a BEFORE INSERT scope trigger
--     that re-checks the case/suborder/vendor/rate/cap from the live
--     rows — so a pending row can never be recorded twice, for the
--     wrong vendor, or for more than the eventual earn.
--   * Rate: taken from order_vendors.commission_rate at approval time.
--     D-01 freezes that rate at placement, so it cannot change before
--     delivery — the approval-time rate IS the earn-time rate by
--     construction. (STOP RULE: if the rate could not be determined
--     deterministically, this prompt would stop; it is determined.)
--   * Earn-time application: record_commission_on_delivery converts
--     each pending row into an ordinary commission_adjustments row in
--     the same transaction that creates the entry. The entry keeps its
--     FULL amount, so the commission_amount_matches CHECK
--     (amount = round(base x rate)) still holds; the entry's EFFECTIVE
--     amount is amount + adjustments. create_settlement's snapshot
--     formula (migration 30, carried by migration 43) is
--     `ce.amount_minor + coalesce(adj.total_minor, 0)` per line, with
--     lines included only when that net is > 0 — so the snapshot sees
--     the already-correct net, and a fully-refunded entry (net 0) is
--     excluded exactly as migration 30 already handles net <= 0.
--     Each pending row converts exactly once (status flips to
--     'applied' with applied_entry_id; the conversion loop locks the
--     pending rows FOR UPDATE).
--   * Terminal states: if the suborder is CANCELLED or RETURNED
--     instead of delivered, no earn ever happens. A trigger voids the
--     pending rows visibly (status 'voided') so nothing lingers and
--     nothing can apply to a different order. The refund case itself
--     stays approved — the customer refund is handled off-system; only
--     the commission effect is voided, because no commission was
--     earned.
--   * Cap: the reduction is least(round(refund x rate), eventual earn
--     minus already-recorded reductions). Two sequential partial
--     refunds accumulate as separate rows (one per case) and can never
--     exceed the eventual earn.
--   * No-entry anomaly: a delivered/returned suborder with no entry is
--     a data anomaly with no future earn — resolve records nothing for
--     it (same as before; the case is still approved).
--
-- P1-04 interaction: shipped-state cases remain openable (canRequestRefund
-- allows shipped; the 7-day window has not started before delivery), so
-- this prompt ships as written and its tests cover the shipped state.

-- ---------------------------------------------------------------------------
-- pending_commission_adjustments — one row per pre-delivery refund case
-- ---------------------------------------------------------------------------

create table public.pending_commission_adjustments (
  id                  uuid primary key default gen_random_uuid(),
  -- One pending row per refund case. The unique key makes approval
  -- idempotent per case: re-approving cannot double-record.
  refund_case_id      uuid not null unique
                        references public.refund_cases (id) on delete restrict,
  order_vendor_id     uuid not null
                        references public.order_vendors (id) on delete cascade,
  vendor_id           uuid not null references public.vendors (id) on delete restrict,
  currency            text not null default 'EGP' check (currency = 'EGP'),
  -- Negative: the reduction to apply at earn time.
  amount_minor        int not null check (amount_minor < 0),
  refund_amount_minor int not null check (refund_amount_minor > 0),
  -- Frozen commission rate at approval time (order_vendors snapshot).
  rate                numeric(5,4) not null check (rate >= 0 and rate <= 1),
  status              text not null default 'pending'
                        check (status in ('pending', 'applied', 'voided')),
  applied_entry_id    uuid references public.commission_entries (id) on delete restrict,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint pending_adjustment_applied_matches check (
    (status = 'applied') = (applied_entry_id is not null)
  )
);

alter table public.pending_commission_adjustments enable row level security;

create index pending_adjustments_suborder_idx
  on public.pending_commission_adjustments (order_vendor_id, status);
create index pending_adjustments_vendor_idx
  on public.pending_commission_adjustments (vendor_id, created_at desc);

-- Mirror migration 30's scope-trigger discipline: a pending row must
-- match its case, its suborder, the suborder's frozen rate, and the
-- eventual-earn cap — checked from the live rows, not trusted from the
-- caller.
create or replace function public.assert_pending_commission_adjustment_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_suborder uuid;
  v_case_vendor   uuid;
  v_suborder_status text;
  v_suborder_rate numeric(5,4);
  v_subtotal      int;
  v_prior         int;
begin
  select rc.order_vendor_id, rc.vendor_id
    into v_case_suborder, v_case_vendor
    from public.refund_cases rc
   where rc.id = new.refund_case_id;

  if v_case_suborder is null or v_case_suborder <> new.order_vendor_id then
    raise exception 'A pending commission adjustment must match its refund case.'
      using errcode = '23514';
  end if;

  if v_case_vendor is null or v_case_vendor <> new.vendor_id then
    raise exception 'A pending commission adjustment must match the refund vendor.'
      using errcode = '23514';
  end if;

  select ov.status, ov.commission_rate, ov.subtotal_minor
    into v_suborder_status, v_suborder_rate, v_subtotal
    from public.order_vendors ov
   where ov.id = new.order_vendor_id;

  if v_suborder_status is null or v_suborder_status <> 'shipped' then
    raise exception 'A pending commission adjustment can only be recorded while the suborder is shipped.'
      using errcode = '23514';
  end if;

  if new.rate <> v_suborder_rate then
    raise exception 'A pending commission adjustment must use the suborder''s frozen commission rate.'
      using errcode = '23514';
  end if;

  select coalesce(sum(abs(amount_minor)), 0)
    into v_prior
    from public.pending_commission_adjustments
   where order_vendor_id = new.order_vendor_id
     and status in ('pending', 'applied');

  if abs(new.amount_minor) + v_prior > round(v_subtotal * v_suborder_rate)::int then
    raise exception 'Pending commission adjustments cannot exceed the commission the suborder will earn.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.assert_pending_commission_adjustment_scope()
  from public, anon, authenticated;

create trigger pending_adjustments_assert_scope
  before insert on public.pending_commission_adjustments
  for each row execute function public.assert_pending_commission_adjustment_scope();

-- RLS: vendors read their shop's pending rows, admins read all. Writes
-- happen only through the SECURITY DEFINER RPCs/triggers below.
create policy "pending_adjustments: vendor read"
  on public.pending_commission_adjustments for select
  using (public.is_vendor_member(vendor_id));

create policy "pending_adjustments: platform admin read"
  on public.pending_commission_adjustments for select
  using (public.is_platform_admin());

revoke all on table public.pending_commission_adjustments
  from public, anon, authenticated;
grant select on table public.pending_commission_adjustments
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- record_commission_on_delivery — redefined to convert pending adjustments
-- at earn time (migration 06 body + N-02 conversion; trigger unchanged)
-- ---------------------------------------------------------------------------

create or replace function public.record_commission_on_delivery()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_pending  record;
begin
  -- Only on the transition *into* delivered. The BEFORE trigger
  -- `assert_order_vendor_transition` already stamped `delivered_at`.
  if new.status <> 'delivered' or old.status = 'delivered' then
    return null;
  end if;

  insert into public.commission_entries (
    order_vendor_id, vendor_id, rate, base_minor, amount_minor, earned_at
  ) values (
    new.id,
    new.vendor_id,
    new.commission_rate,
    new.subtotal_minor,
    round(new.subtotal_minor * new.commission_rate)::int,
    coalesce(new.delivered_at, now())
  )
  on conflict (order_vendor_id) do nothing
  returning id into v_entry_id;

  -- Defensive: the insert above can only conflict if an entry already
  -- exists for this suborder (a repeated delivery write). Fetch it so
  -- the conversion below still runs against the right entry.
  if v_entry_id is null then
    select id into v_entry_id
      from public.commission_entries
     where order_vendor_id = new.id;
  end if;

  -- N-02: convert each pending adjustment recorded while the suborder
  -- was shipped into an ordinary commission_adjustments row against the
  -- new entry, in the same transaction. The entry keeps its full amount
  -- (the amount = round(base x rate) CHECK); the net is amount +
  -- adjustments, which create_settlement already snapshots. The
  -- adjustment's created_by is the admin who approved the refund (the
  -- pending row's creator), not the actor who marked the delivery.
  -- Each pending row converts exactly once: the loop locks the rows
  -- FOR UPDATE and flips them to 'applied' with the entry linked.
  if v_entry_id is not null then
    for v_pending in
      select id, refund_case_id, vendor_id, amount_minor, created_by
        from public.pending_commission_adjustments
       where order_vendor_id = new.id
         and status = 'pending'
       order by created_at asc, id asc
       for update
    loop
      insert into public.commission_adjustments (
        commission_entry_id, refund_case_id, vendor_id, amount_minor,
        reason, created_by
      ) values (
        v_entry_id,
        v_pending.refund_case_id,
        v_pending.vendor_id,
        v_pending.amount_minor,
        'Refund approved before delivery — pending adjustment applied at earn',
        v_pending.created_by
      );

      update public.pending_commission_adjustments
         set status = 'applied',
             applied_entry_id = v_entry_id
       where id = v_pending.id;
    end loop;
  end if;

  return null;
end;
$$;

revoke all on function public.record_commission_on_delivery()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Void pending adjustments when the suborder reaches a terminal state
-- without ever being delivered (cancelled / returned). The void is the
-- visible record — the row stays, status 'voided', never applied.
-- ---------------------------------------------------------------------------

create or replace function public.void_pending_commission_adjustments()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status in ('cancelled', 'returned')
     and old.status not in ('cancelled', 'returned') then
    update public.pending_commission_adjustments
       set status = 'voided'
     where order_vendor_id = new.id
       and status = 'pending';
  end if;

  return null;
end;
$$;

revoke all on function public.void_pending_commission_adjustments()
  from public, anon, authenticated;

create trigger order_vendors_void_pending_adjustments
  after update of status on public.order_vendors
  for each row execute function public.void_pending_commission_adjustments();


-- ---------------------------------------------------------------------------
-- resolve_refund_case — redefined with the N-02 pending path (migration 43
-- body + pending adjustment for pre-delivery refunds; signature unchanged)
-- ---------------------------------------------------------------------------

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
    -- with no future earn — record nothing for it.
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

comment on function public.resolve_refund_case(uuid, boolean, int, text, boolean) is
  'Admin refund resolution (N-02): approval with no earned entry yet records a pending adjustment when the suborder is shipped, converted at delivery (N-02); approval on a paid settlement records a clawback carried to the vendor''s next settlement (D-08, N-01); the open-settlement raise and the no-settlement adjustment path are unchanged from migration 43.';

