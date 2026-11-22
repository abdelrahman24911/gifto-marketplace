-- Rollback for 00000000000043_paid_return_clawback.sql.
--
-- Drops the commission_clawbacks / clawback_applications tables (any
-- recorded clawback is lost — re-approve the refund cases after rolling
-- back if the clawback route is still wanted), restores the migration-35
-- resolve_refund_case (paid settlements block approval again), the
-- migration-30 create_settlement (no clawback netting), and the
-- migration-36 mark_settlement_paid (net = sum of lines, proof always
-- required) with its original payout-proof CHECK. Paid settlements are
-- never touched by this rollback.

drop function if exists public.record_clawback_direct_repayment(uuid, text);

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
  v_lines_total   int;
  v_line_count    int;
  v_valid_count   int := 0;
  v_line          record;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can mark a settlement paid.'
      using errcode = '42501';
  end if;

  if p_paid_amount_minor is null or p_paid_amount_minor < 0 then
    raise exception 'Enter the amount received, in piastres, of zero or more.'
      using errcode = '23514';
  end if;

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

  if p_proof_note is not null and length(p_proof_note) > 500 then
    raise exception 'A proof note must be 500 characters or fewer.'
      using errcode = '23514';
  end if;

  select status, voided_at, vendor_id, total_minor
    into v_status, v_voided_at, v_vendor_id, v_stored_total
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

  select coalesce(sum(amount_minor), 0)
    into v_lines_total
    from public.settlement_lines
   where settlement_id = p_settlement_id;

  if v_stored_total <> v_lines_total then
    raise exception 'The stored settlement total (%) does not match its lines (%), so it cannot be marked paid.'
      , v_stored_total, v_lines_total
      using errcode = '23514';
  end if;

  if p_paid_amount_minor <> v_lines_total then
    raise exception 'The amount received (%) does not match the commission due (%), so it cannot be marked paid.'
      , p_paid_amount_minor, v_lines_total
      using errcode = '23514';
  end if;

  update public.settlements
     set status = 'paid',
         paid_at = now(),
         paid_by = auth.uid(),
         paid_amount_minor = p_paid_amount_minor,
         transfer_method = p_transfer_method,
         transfer_reference = trim(p_transfer_reference),
         proof_note = nullif(trim(p_proof_note), '')
   where id = p_settlement_id;
end;
$$;

revoke all on function public.mark_settlement_paid(uuid, int, text, text, text)
  from public, anon;
grant execute on function public.mark_settlement_paid(uuid, int, text, text, text)
  to authenticated;

-- Restore the migration-30 create_settlement (no clawback netting).
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

  update public.settlements
     set total_minor = v_total
   where id = v_settlement_id;

  return v_settlement_id;
end;
$$;

revoke all on function public.create_settlement(uuid, text) from public, anon;
grant execute on function public.create_settlement(uuid, text) to authenticated;

-- Restore the migration-35 resolve_refund_case (paid settlements block
-- approval again; the v_active_paid name is restored with it).
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

-- Restore the migration-36 payout-proof CHECK (no zero-net branch).
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
  );

drop trigger if exists commission_clawbacks_assert_scope on public.commission_clawbacks;
drop function if exists public.assert_commission_clawback_scope();
drop table if exists public.clawback_applications;
drop table if exists public.commission_clawbacks;

alter table public.settlements
  drop column if exists clawback_minor;
