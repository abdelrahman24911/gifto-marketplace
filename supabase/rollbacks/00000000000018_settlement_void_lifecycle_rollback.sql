-- Rollback for 00000000000018_settlement_void_lifecycle.sql.
--
-- A rollback would restore the destructive delete-lines void behaviour. It is
-- therefore refused whenever any permanent void/release history exists.
-- Run rollback 18 before rollback 17 and rollback 16.

do $$
begin
  if exists (
    select 1 from public.settlements
     where status = 'voided'
        or voided_at is not null
        or void_reason is not null
  ) then
    raise exception 'Refusing to roll back 18: voided settlement history exists. Preserve/export the audit trail and resolve it manually first.';
  end if;

  if exists (
    select 1 from public.settlement_lines
     where released_at is not null
        or release_reason is not null
  ) then
    raise exception 'Refusing to roll back 18: released settlement-line history exists. Preserve/export the audit trail and resolve it manually first.';
  end if;
end $$;

drop function if exists public.void_settlement(uuid, text);

create or replace function public.void_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status    public.settlement_status;
  v_voided_at timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can void a settlement.'
      using errcode = '42501';
  end if;

  select status, voided_at into v_status, v_voided_at
    from public.settlements
   where id = p_settlement_id
     for update;

  if v_status is null then
    raise exception 'Settlement not found.' using errcode = '22023';
  end if;

  if v_status = 'paid' then
    raise exception 'A paid settlement cannot be voided.' using errcode = '23514';
  end if;

  if v_voided_at is not null then
    raise exception 'This settlement is already voided.' using errcode = '23514';
  end if;

  delete from public.settlement_lines where settlement_id = p_settlement_id;

  update public.settlements
     set voided_at = now(), voided_by = auth.uid()
   where id = p_settlement_id;
end;
$$;

revoke all on function public.void_settlement(uuid) from public, anon;
grant execute on function public.void_settlement(uuid) to authenticated;

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
       and voided_at is null
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

  if v_voided_at is not null then
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

create or replace function public.reverse_commission_on_return()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_settled  boolean;
begin
  if new.status <> 'returned' or old.status = 'returned' then
    return null;
  end if;

  select ce.id,
         exists (
           select 1 from public.settlement_lines l
            where l.commission_entry_id = ce.id
         )
    into v_entry_id, v_settled
    from public.commission_entries ce
   where ce.order_vendor_id = new.id;

  if v_entry_id is null then
    return null;
  end if;

  if v_settled then
    raise exception 'This order''s commission is already part of a settlement and cannot be reversed automatically.'
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

drop index if exists public.settlement_lines_one_active_per_entry;

alter table public.settlement_lines
  drop constraint if exists settlement_lines_release_audit_matches,
  add constraint settlement_lines_commission_entry_id_key
    unique (commission_entry_id);

alter table public.settlements
  drop constraint if exists settlements_void_state_matches,
  drop constraint if exists settlements_void_reason_required,
  drop constraint if exists settlements_voided_at_matches,
  add constraint settlements_voided_at_matches
    check (voided_at is null or status = 'open');
