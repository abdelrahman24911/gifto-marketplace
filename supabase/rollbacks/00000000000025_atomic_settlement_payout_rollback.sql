-- Rollback for 00000000000025_atomic_settlement_payout.sql.
--
-- This restores the exact migration-18 definitions of the three replaced
-- functions. It does not alter settlement or commission data. The rollback
-- removes database-level completeness and commission-row locking protections,
-- so the application guard remains the only completeness check afterward.

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

  select ce.id,
         exists (
           select 1 from public.settlement_lines l
            where l.commission_entry_id = ce.id
              and l.released_at is null
         )
    into v_entry_id, v_active_settled
    from public.commission_entries ce
   where ce.order_vendor_id = new.id;

  if v_entry_id is null then
    return null;
  end if;

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

create or replace function public.create_settlement(
  p_vendor_id uuid,
  p_note text default null
)
returns uuid
language plpgsql security definer
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

  insert into public.settlement_lines (settlement_id, commission_entry_id, amount_minor)
  select v_settlement_id, ce.id, ce.amount_minor
    from public.commission_entries ce
   where ce.vendor_id = p_vendor_id
     and ce.status = 'earned'
     and not exists (
       select 1 from public.settlement_lines l
        where l.commission_entry_id = ce.id
          and l.released_at is null
     );

  select coalesce(sum(amount_minor), 0), count(*)
    into v_total, v_count
    from public.settlement_lines
   where settlement_id = v_settlement_id;

  if v_count = 0 then
    raise exception 'There is nothing to settle for this shop.' using errcode = '23514';
  end if;

  update public.settlements set total_minor = v_total where id = v_settlement_id;

  return v_settlement_id;
end;
$$;

revoke all on function public.create_settlement(uuid, text) from public, anon;
grant execute on function public.create_settlement(uuid, text) to authenticated;

create or replace function public.mark_settlement_paid(p_settlement_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_status    public.settlement_status;
  v_voided_at timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can mark a settlement paid.'
      using errcode = '42501';
  end if;

  select status, voided_at into v_status, v_voided_at
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

  update public.settlements
     set status = 'paid', paid_at = now(), paid_by = auth.uid()
   where id = p_settlement_id;
end;
$$;

revoke all on function public.mark_settlement_paid(uuid) from public, anon;
grant execute on function public.mark_settlement_paid(uuid) to authenticated;
