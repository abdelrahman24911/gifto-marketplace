-- Rollback for 00000000000016_settlement_integrity.sql.
--
-- This restores the pre-16 settlement RPCs, removes the one-open unique index
-- and drops the audit/void columns. Run it only after confirming that the
-- payout UI and any reporting that reads those columns are no longer active.
--
-- Refuse when a newer void-lifecycle migration or any void history exists:
-- turning a voided batch back into an open/payable row would be a financial
-- integrity failure.

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and (
         (table_name = 'settlements' and column_name = 'void_reason')
         or (
           table_name = 'settlement_lines'
           and column_name in ('released_at', 'released_by', 'release_reason')
         )
       )
  ) then
    raise exception 'Refusing to roll back 16: roll back migrations 18 and 17 first.';
  end if;

  if exists (
    select 1 from public.settlements where voided_at is not null
  ) then
    raise exception 'Refusing to roll back 16: voided settlement history exists. Preserve/export the audit trail and resolve it manually first.';
  end if;
end $$;

drop function if exists public.void_settlement(uuid);

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
     where vendor_id = p_vendor_id and status = 'open'
  ) then
    raise exception 'This shop already has an open settlement.' using errcode = '23514';
  end if;

  insert into public.settlements (vendor_id, note)
  values (p_vendor_id, nullif(trim(p_note), ''))
  returning id into v_settlement_id;

  insert into public.settlement_lines (settlement_id, commission_entry_id, amount_minor)
  select v_settlement_id, ce.id, ce.amount_minor
    from public.commission_entries ce
   where ce.vendor_id = p_vendor_id
     and ce.status = 'earned'
     and not exists (
       select 1 from public.settlement_lines l
        where l.commission_entry_id = ce.id
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.settlement_status;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can mark a settlement paid.'
      using errcode = '42501';
  end if;

  select status into v_status
    from public.settlements
   where id = p_settlement_id
     for update;

  if v_status is null then
    raise exception 'Settlement not found.' using errcode = '42501';
  end if;

  if v_status = 'paid' then
    raise exception 'This settlement is already paid.' using errcode = '23514';
  end if;

  update public.settlements
     set status = 'paid', paid_at = now()
   where id = p_settlement_id;
end;
$$;

revoke all on function public.mark_settlement_paid(uuid) from public, anon;
grant execute on function public.mark_settlement_paid(uuid) to authenticated;

-- Intentionally keep the financial tables read-only after rollback. Re-granting
-- the broad default ACL would restore the least-privilege defect migration 16
-- repairs.
revoke all on table
  public.commission_entries,
  public.settlements,
  public.settlement_lines
  from public, anon, authenticated;

grant select on table
  public.commission_entries,
  public.settlements,
  public.settlement_lines
  to authenticated;

drop index if exists public.settlements_one_open_per_vendor;

alter table public.settlements
  drop constraint if exists settlements_voided_at_matches,
  drop column if exists voided_by,
  drop column if exists voided_at,
  drop column if exists paid_by,
  drop column if exists created_by;
