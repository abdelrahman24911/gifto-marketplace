-- Gifto Phase 6.1 — atomic settlement payout integrity.
--
-- The application verifies commission completeness before calling
-- mark_settlement_paid, but a direct RPC caller must receive the same
-- protection. This migration also coordinates payout verification with return
-- reversal and settlement creation through commission-entry row locks.

-- ---------------------------------------------------------------------------
-- reverse_commission_on_return — lock the commission entry before deciding
-- whether an active settlement allocation exists.
-- ---------------------------------------------------------------------------

create or replace function public.reverse_commission_on_return()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_entry_id       uuid;
  v_active_settled boolean;
begin
  if new.status <> 'returned' or old.status = 'returned' then
    return null;
  end if;

  select ce.id
    into v_entry_id
    from public.commission_entries ce
   where ce.order_vendor_id = new.id
   for update;

  if v_entry_id is null then
    return null;
  end if;

  select exists (
    select 1
      from public.settlement_lines l
     where l.commission_entry_id = v_entry_id
       and l.released_at is null
  )
    into v_active_settled;

  if v_active_settled then
    raise exception 'This order''s commission is already part of an active settlement and cannot be reversed automatically.'
      using errcode = '23514';
  end if;

  update public.commission_entries
     set status = 'reversed', reversed_at = now()
   where id = v_entry_id and status = 'earned';

  return null;
end;
$$;

revoke all on function public.reverse_commission_on_return()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_settlement — lock eligible commission entries before snapshotting
-- them. The ORDER BY gives concurrent callers a deterministic lock order.
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

  -- Lock every candidate before copying its amount into a settlement line.
  -- reverse_commission_on_return uses this same lock, so a return either wins
  -- before the snapshot or observes the active allocation after it commits.
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
  select v_settlement_id, ce.id, ce.amount_minor
    from public.commission_entries ce
   where ce.vendor_id = p_vendor_id
     and ce.status = 'earned'
     and not exists (
       select 1
         from public.settlement_lines l
        where l.commission_entry_id = ce.id
          and l.released_at is null
     )
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

-- ---------------------------------------------------------------------------
-- mark_settlement_paid — lock and validate every line and commission snapshot
-- before changing the settlement status.
-- ---------------------------------------------------------------------------

create or replace function public.mark_settlement_paid(p_settlement_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_status        public.settlement_status;
  v_voided_at     timestamptz;
  v_vendor_id     uuid;
  v_line_count    int;
  v_valid_count   int := 0;
  v_line          record;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can mark a settlement paid.'
      using errcode = '42501';
  end if;

  select status, voided_at, vendor_id
    into v_status, v_voided_at, v_vendor_id
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

  -- Lock line and commission rows in commission-entry ID order. The inner
  -- join makes every line with a missing reference fail the count check below;
  -- the foreign key normally prevents such a row from existing.
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
           ce.amount_minor as entry_amount_minor
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
       or v_line.amount_minor <> v_line.entry_amount_minor then
      raise exception 'Settlement commission data is inconsistent and cannot be marked paid.'
        using errcode = '23514';
    end if;

    v_valid_count := v_valid_count + 1;
  end loop;

  if v_valid_count <> v_line_count then
    raise exception 'Settlement commission data is incomplete and cannot be marked paid.'
      using errcode = '23514';
  end if;

  update public.settlements
     set status = 'paid',
         paid_at = now(),
         paid_by = auth.uid()
   where id = p_settlement_id;
end;
$$;

revoke all on function public.mark_settlement_paid(uuid) from public, anon;
grant execute on function public.mark_settlement_paid(uuid) to authenticated;
