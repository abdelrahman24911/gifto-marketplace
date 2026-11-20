-- Gifto Marketplace - N-01 (CR-01 x CR-03): paid-return commission
-- clawback.
--
-- D-08 (DECIDED 2026-11-20) is the recovery route: a refund approved after
-- its settlement was paid is recovered by clawback from the vendor's next
-- settlement, or by direct repayment if there is no next settlement. Until
-- now the system had a dead end: resolve_refund_case raised "This
-- commission is part of an active settlement..." for ANY unreleased line
-- (the misleadingly named v_active_paid fired for paid lines too, because
-- mark_settlement_paid never sets released_at), and void_settlement refuses
-- paid settlements. The first paid-then-returned order forced off-system
-- handling.
--
-- Design choices (pack step 1/2):
--   * Clawbacks live in their own append-only table (commission_clawbacks),
--     NOT as commission_adjustments rows. A clawback is a liability against
--     the vendor's future settlements, not a reduction of an already-paid
--     entry's net: the entry was paid at its net, its settlement's lines
--     are immutable, and mark_settlement_paid's per-line invariant
--     (line = entry + adjustments) must keep seeing exactly the adjustments
--     that were netted when the settlement was built. Mixing clawbacks
--     into that ledger would change what a paid line means.
--   * Cap: a clawback can never exceed what was actually paid out for the
--     entry — the paid settlement line's amount, less clawbacks already
--     recorded for the entry. Enforced twice: in resolve_refund_case
--     ("remaining" = paid line - prior clawbacks) and by the
--     assert_commission_clawback_scope trigger below, mirroring migration
--     30's adjustment-cap discipline.
--   * Carry rule (pack step 2): create_settlement applies outstanding
--     clawbacks oldest-first against the new batch's gross lines, each
--     application recorded in clawback_applications. A clawback is applied
--     only up to the remaining gross; a clawback that does not fit in full
--     stays outstanding for the next settlement (its applied part is
--     recorded, the remainder carries forward). A settlement whose net
--     would go negative is created with total 0 and the remainder carried
--     forward — never a negative payout. Each application is recorded
--     exactly once (unique clawback+settlement) and a clawback flips to
--     'consumed' only when fully applied.
--   * Zero-net settlements: when clawbacks applied to a batch fully
--     offset it, the vendor remits nothing, so there is no transfer to
--     attest. mark_settlement_paid accepts paid amount 0 with NO transfer
--     method/reference/proof for such a batch, and the payout-proof CHECK
--     gains a third branch for exactly that shape (paid 0, total 0,
--     clawback > 0, no proof). A zero-net batch with NO clawbacks (e.g.
--     zero-valued lines) still requires proof exactly as before — the
--     exception is for clawback offsets only. Requiring a reference for a
--     transfer that never happened would falsify the record.
--   * The paid settlement itself is never edited, voided, or rewritten:
--     the clawback is a new row, the paid rows are byte-identical after
--     approval (asserted in the refunds suite).
--   * Direct repayment (D-08 fallback, no next settlement) is recorded by
--     record_clawback_direct_repayment below: admin-only, reference
--     required. No admin UI for it yet (RPC-only); see HOSTED_STATE.
--
-- Redefinitions in this migration only (never edit 30/35/36 in place):
--   * resolve_refund_case (migration 35, 5-arg): the paid path is new;
--     the open-settlement raise and the no-settlement path are unchanged.
--     v_active_paid is renamed v_has_unreleased_settlement_line — the old
--     name suggested "paid" while firing for any unreleased line.
--   * create_settlement (migration 30): nets outstanding clawbacks.
--   * mark_settlement_paid (migration 36, 5-arg): the derived net is now
--     sum(lines) minus clawbacks applied to THIS settlement; the stored
--     total and the paid amount must equal that net, and the stored
--     clawback total must equal the recorded applications. The per-line
--     validation is unchanged (it genuinely cannot see clawbacks — they
--     are settlement-level, not line-level — so the net check is extended
--     here, as the pack allows).

-- ---------------------------------------------------------------------------
-- commission_clawbacks - append-only paid-return liability (N-01, D-08)
-- ---------------------------------------------------------------------------

create table public.commission_clawbacks (
  id                  uuid primary key default gen_random_uuid(),
  commission_entry_id uuid not null references public.commission_entries (id) on delete restrict,
  refund_case_id      uuid not null unique references public.refund_cases (id) on delete restrict,
  vendor_id           uuid not null references public.vendors (id) on delete restrict,
  currency            text not null default 'EGP' check (currency = 'EGP'),
  -- Negative piastres: the commission Gifto already paid out that the
  -- vendor now owes back. One row per approved refund case, ever.
  amount_minor        int not null check (amount_minor < 0),
  reason              text check (reason is null or length(reason) <= 500),
  status              text not null default 'outstanding'
                      check (status in ('outstanding', 'consumed', 'direct_repayment')),
  -- Reference for a D-08 direct repayment (vendor repaid Gifto directly
  -- because there is no next settlement). Set only on that path.
  direct_repayment_reference text
                      check (direct_repayment_reference is null
                             or length(direct_repayment_reference) between 3 and 200),
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  consumed_at         timestamptz,
  constraint commission_clawbacks_status_matches check (
    (status = 'outstanding'
     and consumed_at is null
     and direct_repayment_reference is null)
    or (status = 'consumed'
        and consumed_at is not null
        and direct_repayment_reference is null)
    or (status = 'direct_repayment'
        and consumed_at is not null
        and direct_repayment_reference is not null)
  )
);

alter table public.commission_clawbacks enable row level security;

create index commission_clawbacks_entry_idx
  on public.commission_clawbacks (commission_entry_id);
create index commission_clawbacks_vendor_idx
  on public.commission_clawbacks (vendor_id, created_at desc);
create index commission_clawbacks_status_idx
  on public.commission_clawbacks (vendor_id, status, created_at desc);

-- A clawback names its refund case and its entry, matches the entry's
-- vendor, and can never exceed what was actually paid out for the entry:
-- the paid settlement line's amount less clawbacks already recorded.
create or replace function public.assert_commission_clawback_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_vendor uuid;
  v_case_suborder uuid;
  v_line_amount int;
  v_line_status public.settlement_status;
  v_existing int;
begin
  select vendor_id
    into v_entry_vendor
    from public.commission_entries
   where id = new.commission_entry_id
   for update;

  if v_entry_vendor is null then
    raise exception 'Commission entry not found.' using errcode = '22023';
  end if;

  select order_vendor_id
    into v_case_suborder
    from public.refund_cases
   where id = new.refund_case_id;

  if v_case_suborder is null or not exists (
    select 1 from public.commission_entries ce
     where ce.id = new.commission_entry_id
       and ce.order_vendor_id = v_case_suborder
  ) then
    raise exception 'A commission clawback must match its refund case.'
      using errcode = '23514';
  end if;

  if new.vendor_id <> v_entry_vendor then
    raise exception 'A commission clawback must match the commission vendor.'
      using errcode = '23514';
  end if;

  -- The clawback exists only because this entry was paid out. Find the
  -- entry's unreleased settlement line and its settlement's status.
  select l.amount_minor, s.status
    into v_line_amount, v_line_status
    from public.settlement_lines l
    join public.settlements s on s.id = l.settlement_id
   where l.commission_entry_id = new.commission_entry_id
     and l.released_at is null;

  if v_line_amount is null or v_line_status <> 'paid' then
    raise exception 'A commission clawback needs a paid settlement line.'
      using errcode = '23514';
  end if;

  select coalesce(sum(abs(amount_minor)), 0)
    into v_existing
    from public.commission_clawbacks
   where commission_entry_id = new.commission_entry_id;

  if abs(new.amount_minor) + v_existing > v_line_amount then
    raise exception 'A commission clawback cannot exceed the amount paid out.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.assert_commission_clawback_scope()
  from public, anon, authenticated;

create trigger commission_clawbacks_assert_scope
  before insert on public.commission_clawbacks
  for each row execute function public.assert_commission_clawback_scope();

-- ---------------------------------------------------------------------------
-- clawback_applications - which settlement consumed how much of a clawback
-- ---------------------------------------------------------------------------

create table public.clawback_applications (
  id            uuid primary key default gen_random_uuid(),
  clawback_id   uuid not null references public.commission_clawbacks (id) on delete restrict,
  settlement_id uuid not null references public.settlements (id) on delete restrict,
  -- Positive piastres applied from the clawback to this settlement.
  amount_minor  int not null check (amount_minor > 0),
  created_at    timestamptz not null default now(),
  constraint clawback_applications_one_per_settlement unique (clawback_id, settlement_id)
);

alter table public.clawback_applications enable row level security;

create index clawback_applications_settlement_idx
  on public.clawback_applications (settlement_id);
create index clawback_applications_clawback_idx
  on public.clawback_applications (clawback_id);

-- ---------------------------------------------------------------------------
-- RLS: vendors see their own clawbacks, admins see all. Writes happen only
-- through the SECURITY DEFINER RPCs below.
-- ---------------------------------------------------------------------------

create policy "commission_clawbacks: vendor read"
  on public.commission_clawbacks for select
  using (public.is_vendor_member(vendor_id));

create policy "commission_clawbacks: platform admin read"
  on public.commission_clawbacks for select
  using (public.is_platform_admin());

create policy "clawback_applications: vendor read"
  on public.clawback_applications for select
  using (exists (
    select 1 from public.commission_clawbacks cb
     where cb.id = clawback_id and public.is_vendor_member(cb.vendor_id)
  ));

create policy "clawback_applications: platform admin read"
  on public.clawback_applications for select
  using (public.is_platform_admin());

revoke all on table public.commission_clawbacks, public.clawback_applications
  from public, anon, authenticated;
grant select on table public.commission_clawbacks, public.clawback_applications
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- settlements: clawbacks applied to this batch (N-01)
-- ---------------------------------------------------------------------------

alter table public.settlements
  add column if not exists clawback_minor int not null default 0
    check (clawback_minor >= 0);

comment on column public.settlements.clawback_minor is
  'N-01 (D-08): piastres of outstanding paid-return clawbacks netted against this batch. total_minor = sum(lines) - clawback_minor; the remainder of any clawback that did not fit stays outstanding for the next settlement.';

-- A batch fully offset by clawbacks has no transfer to attest: paid
-- amount 0, total 0, clawbacks applied, and no proof columns. Every other
-- paid settlement still requires proof (including a zero-valued batch
-- with no clawbacks, which keeps the migration-36 behaviour).
alter table public.settlements
  drop constraint if exists settlements_payout_proof_matches;

alter table public.settlements
  add constraint settlements_payout_proof_matches check (
    (status <> 'paid'
     and paid_amount_minor is null
     and transfer_method is null
     and transfer_reference is null
     and proof_note is null)
    or (status = 'paid'
        and paid_amount_minor is not null
        and transfer_method is not null
        and transfer_reference is not null)
    or (status = 'paid'
        and paid_amount_minor = 0
        and total_minor = 0
        and clawback_minor > 0
        and transfer_method is null
        and transfer_reference is null
        and proof_note is null)
  );

-- ---------------------------------------------------------------------------
-- resolve_refund_case — redefined with the N-01 paid path (migration 35
-- body + paid-settlement clawback; signature unchanged)
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
  'Admin refund resolution (N-01): approval on a paid settlement records a clawback carried to the vendor''s next settlement (D-08) instead of raising; the open-settlement raise and the no-settlement adjustment path are unchanged from migration 35.';

-- ---------------------------------------------------------------------------
-- create_settlement — redefined so a vendor's outstanding clawbacks are
-- netted against their next settlement (migration 30 body + N-01 carry)
-- ---------------------------------------------------------------------------

create or replace function public.create_settlement(
  p_vendor_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement_id uuid;
  v_total         int;
  v_count         int;
  v_clawback_total int := 0;
  v_claw        record;
  v_outstanding int;
  v_apply       int;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can create settlements.'
      using errcode = '42501';
  end if;

  if p_vendor_id is null or not exists (select 1 from public.vendors where id = p_vendor_id) then
    raise exception 'Choose a shop that exists.' using errcode = '22023';
  end if;

  if p_note is not null and length(p_note) > 500 then
    raise exception 'A settlement note must be 500 characters or fewer.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.settlements
     where vendor_id = p_vendor_id
       and status = 'open'
  ) then
    raise exception 'This shop already has an open settlement.' using errcode = '23514';
  end if;

  begin
    insert into public.settlements (vendor_id, note, created_by)
    values (p_vendor_id, nullif(trim(p_note), ''), auth.uid())
    returning id into v_settlement_id;
  exception when unique_violation then
    raise exception 'This shop already has an open settlement.' using errcode = '23514';
  end;

  perform 1
    from public.commission_entries ce
   where ce.vendor_id = p_vendor_id
     and ce.status = 'earned'
     and not exists (
       select 1
         from public.settlement_lines l
        where l.commission_entry_id = ce.id
          and l.released_at is null
     )
   order by ce.id
   for update;

  insert into public.settlement_lines (settlement_id, commission_entry_id, amount_minor)
  select v_settlement_id,
         ce.id,
         ce.amount_minor + coalesce(adj.total_minor, 0)
    from public.commission_entries ce
    left join (
      select commission_entry_id, sum(amount_minor) as total_minor
        from public.commission_adjustments
       group by commission_entry_id
    ) adj on adj.commission_entry_id = ce.id
   where ce.vendor_id = p_vendor_id
     and ce.status = 'earned'
     and not exists (
       select 1
         from public.settlement_lines l
        where l.commission_entry_id = ce.id
          and l.released_at is null
     )
     and ce.amount_minor + coalesce(adj.total_minor, 0) > 0
   order by ce.id;

  select coalesce(sum(amount_minor), 0), count(*)
    into v_total, v_count
    from public.settlement_lines
   where settlement_id = v_settlement_id;

  if v_count = 0 then
    raise exception 'There is nothing to settle for this shop.' using errcode = '23514';
  end if;

  -- N-01 carry (D-08): net outstanding clawbacks against this batch,
  -- oldest first. Each application is recorded exactly once; a clawback
  -- that does not fit in full stays outstanding for the next settlement,
  -- and a batch whose net would go negative is created with total 0.
  for v_claw in
    select cb.id, cb.amount_minor
      from public.commission_clawbacks cb
     where cb.vendor_id = p_vendor_id
       and cb.status = 'outstanding'
     order by cb.created_at, cb.id
     for update of cb
  loop
    exit when v_total - v_clawback_total <= 0;

    select abs(v_claw.amount_minor)
           - coalesce(sum(amount_minor), 0)
      into v_outstanding
      from public.clawback_applications
     where clawback_id = v_claw.id;

    v_apply := least(v_outstanding, v_total - v_clawback_total);

    if v_apply > 0 then
      insert into public.clawback_applications
        (clawback_id, settlement_id, amount_minor)
      values (v_claw.id, v_settlement_id, v_apply);

      v_clawback_total := v_clawback_total + v_apply;

      if v_apply = v_outstanding then
        update public.commission_clawbacks
           set status = 'consumed', consumed_at = now()
         where id = v_claw.id;
      end if;
    end if;
  end loop;

  update public.settlements
     set total_minor = v_total - v_clawback_total,
         clawback_minor = v_clawback_total
   where id = v_settlement_id;

  return v_settlement_id;
end;
$$;

revoke all on function public.create_settlement(uuid, text) from public, anon;
grant execute on function public.create_settlement(uuid, text) to authenticated;

comment on function public.create_settlement(uuid, text) is
  'Admin settlement batch (N-01): the net snapshot nets ordinary refund adjustments per line (migration 30) and outstanding paid-return clawbacks against the batch total, oldest first; a batch whose net would go negative is created with total 0 and the remainder carried forward.';

-- ---------------------------------------------------------------------------
-- mark_settlement_paid — redefined with the clawback-aware net (migration
-- 36 body + N-01). The per-line validation is unchanged; the derived net
-- is now sum(lines) minus clawbacks applied to THIS settlement, and the
-- stored total, the stored clawback total and the paid amount must all
-- match it. A zero-net batch (fully offset by clawbacks) is paid with
-- amount 0 and no transfer proof — no transfer took place.
-- ---------------------------------------------------------------------------

drop function if exists public.mark_settlement_paid(uuid, int, text, text, text);

create or replace function public.mark_settlement_paid(
  p_settlement_id uuid,
  p_paid_amount_minor int,
  p_transfer_method text,
  p_transfer_reference text,
  p_proof_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status        public.settlement_status;
  v_voided_at     timestamptz;
  v_vendor_id     uuid;
  v_stored_total  int;
  v_stored_clawback int;
  v_lines_total   int;
  v_clawback_applied int;
  v_net_due       int;
  v_line_count    int;
  v_valid_count   int := 0;
  v_line          record;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can mark a settlement paid.'
      using errcode = '42501';
  end if;

  -- Payout proof (P1-05, D-08): the amount is part of the attestation.
  -- Whether a method/reference are required depends on the derived net,
  -- checked below once the batch is read.
  if p_paid_amount_minor is null or p_paid_amount_minor < 0 then
    raise exception 'Enter the amount received, in piastres, of zero or more.'
      using errcode = '23514';
  end if;

  if p_proof_note is not null and length(p_proof_note) > 500 then
    raise exception 'A proof note must be 500 characters or fewer.'
      using errcode = '23514';
  end if;

  select status, voided_at, vendor_id, total_minor, clawback_minor
    into v_status, v_voided_at, v_vendor_id, v_stored_total, v_stored_clawback
    from public.settlements
   where id = p_settlement_id
   for update;

  if v_status is null then
    raise exception 'Settlement not found.' using errcode = '22023';
  end if;

  if v_status = 'voided' or v_voided_at is not null then
    raise exception 'This settlement was voided and cannot be marked paid.'
      using errcode = '23514';
  end if;

  if v_status = 'paid' then
    raise exception 'This settlement is already paid.' using errcode = '23514';
  end if;

  select count(*)
    into v_line_count
    from public.settlement_lines
   where settlement_id = p_settlement_id;

  if v_line_count = 0 then
    raise exception 'A settlement with no lines cannot be marked paid.'
      using errcode = '23514';
  end if;

  for v_line in
    select l.id,
           l.commission_entry_id,
           l.amount_minor,
           l.currency,
           l.released_at,
           l.release_reason,
           ce.vendor_id as entry_vendor_id,
           ce.status as entry_status,
           ce.currency as entry_currency,
           ce.amount_minor as entry_amount_minor,
           coalesce((
             select sum(ca.amount_minor)
               from public.commission_adjustments ca
              where ca.commission_entry_id = ce.id
           ), 0) as adjustment_minor
      from public.settlement_lines l
      join public.commission_entries ce
        on ce.id = l.commission_entry_id
     where l.settlement_id = p_settlement_id
     order by l.commission_entry_id
     for update of l, ce
  loop
    if v_line.entry_vendor_id <> v_vendor_id
       or v_line.currency <> v_line.entry_currency
       or v_line.entry_status <> 'earned'
       or v_line.released_at is not null
       or v_line.release_reason is not null
       or v_line.amount_minor
          <> v_line.entry_amount_minor + v_line.adjustment_minor then
      raise exception 'Settlement commission data is inconsistent and cannot be marked paid.'
        using errcode = '23514';
    end if;

    v_valid_count := v_valid_count + 1;
  end loop;

  if v_valid_count <> v_line_count then
    raise exception 'Settlement commission data is incomplete and cannot be marked paid.'
      using errcode = '23514';
  end if;

  -- The derived D-08 amount is the net commission: the lines' snapshot
  -- less the clawbacks applied to this batch. The stored total and the
  -- stored clawback total must equal the recorded figures, and the amount
  -- received must equal the net — a wrong amount, a tampered total, or a
  -- tampered clawback figure cannot be paid.
  select coalesce(sum(amount_minor), 0)
    into v_lines_total
    from public.settlement_lines
   where settlement_id = p_settlement_id;

  select coalesce(sum(amount_minor), 0)
    into v_clawback_applied
    from public.clawback_applications
   where settlement_id = p_settlement_id;

  v_net_due := v_lines_total - v_clawback_applied;

  if v_stored_total <> v_net_due then
    raise exception 'The stored settlement total (%) does not match its lines net of clawbacks (%), so it cannot be marked paid.'
      , v_stored_total, v_net_due
      using errcode = '23514';
  end if;

  if v_stored_clawback <> v_clawback_applied then
    raise exception 'The stored settlement clawback total (%) does not match its recorded clawbacks (%), so it cannot be marked paid.'
      , v_stored_clawback, v_clawback_applied
      using errcode = '23514';
  end if;

  if p_paid_amount_minor <> v_net_due then
    raise exception 'The amount received (%) does not match the commission due (%), so it cannot be marked paid.'
      , p_paid_amount_minor, v_net_due
      using errcode = '23514';
  end if;

  if v_clawback_applied > 0 and v_net_due = 0 then
    -- N-01: the batch is fully offset by clawbacks, so no transfer took
    -- place and there is nothing to attest. Any proof supplied for such
    -- a batch is rejected rather than recorded.
    if p_transfer_method is not null
       or p_transfer_reference is not null
       or p_proof_note is not null then
      raise exception 'This settlement is fully offset by clawbacks, so no transfer took place and no proof is recorded.'
        using errcode = '23514';
    end if;
  else
    -- A real transfer took place (or a zero-valued batch with no
    -- clawbacks, which keeps the migration-36 proof rule): method and
    -- reference are required.
    if p_transfer_method is null
       or p_transfer_method not in ('bank_transfer', 'cash', 'other') then
      raise exception 'Choose how the commission was transferred.'
        using errcode = '23514';
    end if;

    if p_transfer_reference is null
       or length(trim(p_transfer_reference)) not between 3 and 200 then
      raise exception 'Enter the transfer reference (3–200 characters).'
        using errcode = '23514';
    end if;
  end if;

  update public.settlements
     set status = 'paid',
         paid_at = now(),
         paid_by = auth.uid(),
         paid_amount_minor = p_paid_amount_minor,
         transfer_method = p_transfer_method,
         transfer_reference = case when p_transfer_reference is null
                                   then null
                                   else trim(p_transfer_reference) end,
         proof_note = nullif(trim(p_proof_note), '')
   where id = p_settlement_id;
end;
$$;

revoke all on function public.mark_settlement_paid(uuid, int, text, text, text)
  from public, anon;
grant execute on function public.mark_settlement_paid(uuid, int, text, text, text)
  to authenticated;

comment on function public.mark_settlement_paid(uuid, int, text, text, text) is
  'D-08 payout attestation (P1-05, N-01): records that Gifto received the net commission — sum of lines less clawbacks applied to this batch — with transfer method, reference and optional proof note. Rejects a wrong amount, a stored total that does not match its lines net of clawbacks, or a tampered clawback total. A zero-net batch (fully offset by clawbacks) is paid with amount 0 and no proof.';

-- ---------------------------------------------------------------------------
-- record_clawback_direct_repayment — D-08 fallback when there is no next
-- settlement: the vendor repaid Gifto directly. Admin-only; the reference
-- is the vendor's repayment reference (e.g. a bank receipt number).
-- ---------------------------------------------------------------------------

create or replace function public.record_clawback_direct_repayment(
  p_clawback_id uuid,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can record a direct clawback repayment.'
      using errcode = '42501';
  end if;

  if p_reference is null
     or length(trim(p_reference)) not between 3 and 200 then
    raise exception 'Enter the direct repayment reference (3–200 characters).'
      using errcode = '23514';
  end if;

  select status into v_status
    from public.commission_clawbacks
   where id = p_clawback_id
   for update;

  if v_status is null then
    raise exception 'Clawback not found.' using errcode = '22023';
  end if;

  if v_status <> 'outstanding' then
    raise exception 'This clawback is already resolved.' using errcode = '23514';
  end if;

  update public.commission_clawbacks
     set status = 'direct_repayment',
         consumed_at = now(),
         direct_repayment_reference = trim(p_reference)
   where id = p_clawback_id;
end;
$$;

revoke all on function public.record_clawback_direct_repayment(uuid, text)
  from public, anon;
grant execute on function public.record_clawback_direct_repayment(uuid, text)
  to authenticated;

comment on function public.record_clawback_direct_repayment(uuid, text) is
  'D-08 fallback (N-01): records that a vendor repaid a paid-return clawback directly because there is no next settlement to carry it into. The clawback keeps its original amount; the reference is the repayment proof.';
