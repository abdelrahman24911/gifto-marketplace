-- Phase 2B.1.1 — settlement void lifecycle, part 2 of 2.
--
-- This migration makes voiding append-only:
--   * the settlement keeps every line and its original total;
--   * voiding releases the lines instead of deleting them;
--   * released entries can be allocated to a later settlement;
--   * only one active allocation per commission entry is possible;
--   * voiding requires an admin and a non-empty reason.

-- Migration 17 must have committed before the new enum value can be used here.
do $$
begin
  if not exists (
    select 1
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
     where t.oid = 'public.settlement_status'::regtype
       and e.enumlabel = 'voided'
  ) then
    raise exception 'Migration 17 must be applied before the void lifecycle migration.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Backfill legacy soft-voided rows
-- ---------------------------------------------------------------------------

alter table public.settlements
  drop constraint if exists settlements_voided_at_matches;

update public.settlements
   set status = 'voided',
       void_reason = coalesce(
         nullif(btrim(void_reason), ''),
         'Legacy void (reason not recorded).'
       )
 where voided_at is not null
   and status <> 'voided';

update public.settlement_lines l
   set released_at = coalesce(s.voided_at, now()),
       released_by = s.voided_by,
       release_reason = s.void_reason
  from public.settlements s
 where l.settlement_id = s.id
   and s.status = 'voided'
   and l.released_at is null;

-- ---------------------------------------------------------------------------
-- Replace the global line uniqueness with active-allocation uniqueness
-- ---------------------------------------------------------------------------

do $$
declare
  v_attnum  smallint;
  v_conname name;
begin
  select attnum
    into v_attnum
    from pg_attribute
   where attrelid = 'public.settlement_lines'::regclass
     and attname = 'commission_entry_id'
     and not attisdropped;

  for v_conname in
    select conname
      from pg_constraint
     where conrelid = 'public.settlement_lines'::regclass
       and contype = 'u'
       and conkey = array[v_attnum]
  loop
    execute format(
      'alter table public.settlement_lines drop constraint %I',
      v_conname
    );
  end loop;
end $$;

do $$
declare
  v_duplicates text;
begin
  select string_agg(commission_entry_id::text || ' (' || count::text || ')', ', ' order by commission_entry_id)
    into v_duplicates
    from (
      select commission_entry_id, count(*)
        from public.settlement_lines
       where released_at is null
       group by commission_entry_id
      having count(*) > 1
    ) duplicates;

  if v_duplicates is not null then
    raise exception
      'Cannot enforce one active settlement line per commission entry. Resolve duplicate active allocations first: %',
      v_duplicates
      using errcode = '23505';
  end if;
end $$;

create unique index if not exists settlement_lines_one_active_per_entry
  on public.settlement_lines (commission_entry_id)
  where released_at is null;

-- ---------------------------------------------------------------------------
-- State and audit invariants
-- ---------------------------------------------------------------------------

alter table public.settlements
  drop constraint if exists settlements_void_state_matches,
  drop constraint if exists settlements_void_reason_required,
  add constraint settlements_void_state_matches
    check ((status = 'voided') = (voided_at is not null)),
  add constraint settlements_void_reason_required
    check (
      status <> 'voided'
      or (
        void_reason is not null
        and length(btrim(void_reason)) between 1 and 500
      )
    );

alter table public.settlement_lines
  drop constraint if exists settlement_lines_release_audit_matches,
  add constraint settlement_lines_release_audit_matches
    check (
      (released_at is null and release_reason is null)
      or (
        released_at is not null
        and release_reason is not null
        and length(btrim(release_reason)) between 1 and 500
      )
    );

-- ---------------------------------------------------------------------------
-- Returns only block while an allocation is active
-- ---------------------------------------------------------------------------

create or replace function public.reverse_commission_on_return()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_entry_id      uuid;
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

-- ---------------------------------------------------------------------------
-- create_settlement — only active allocations make an entry unavailable
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

-- ---------------------------------------------------------------------------
-- mark_settlement_paid — voided batches are never payable
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- void_settlement — explicit void with required reason and preserved history
-- ---------------------------------------------------------------------------

drop function if exists public.void_settlement(uuid);

create or replace function public.void_settlement(
  p_settlement_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status    public.settlement_status;
  v_voided_at timestamptz;
  v_reason    text;
  v_now       timestamptz := now();
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can void a settlement.'
      using errcode = '42501';
  end if;

  v_reason := nullif(btrim(p_reason), '');

  if v_reason is null then
    raise exception 'A reason is required to void a settlement.'
      using errcode = '22023';
  end if;

  if length(v_reason) > 500 then
    raise exception 'A void reason must be 500 characters or fewer.'
      using errcode = '22023';
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

  if v_status = 'voided' or v_voided_at is not null then
    raise exception 'This settlement is already voided.' using errcode = '23514';
  end if;

  update public.settlement_lines
     set released_at = v_now,
         released_by = auth.uid(),
         release_reason = v_reason
   where settlement_id = p_settlement_id
     and released_at is null;

  update public.settlements
     set status = 'voided',
         voided_at = v_now,
         voided_by = auth.uid(),
         void_reason = v_reason
   where id = p_settlement_id;
end;
$$;

revoke all on function public.void_settlement(uuid, text) from public, anon;
grant execute on function public.void_settlement(uuid, text) to authenticated;
