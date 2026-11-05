-- Phase 2B.1 — settlement integrity.
--
-- The payout flow is about to become a human-facing admin surface. Before that
-- happens, a settlement must answer who opened it and who recorded the payout,
-- and the "one open settlement per shop" rule must be enforced by the database
-- rather than by a read-then-insert check that concurrent requests can race.

-- ---------------------------------------------------------------------------
-- Audit actors
-- ---------------------------------------------------------------------------

alter table public.settlements
  add column if not exists created_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists paid_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists voided_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists voided_at timestamptz;

alter table public.settlements
  add constraint settlements_voided_at_matches
    check (voided_at is null or status = 'open');

-- ---------------------------------------------------------------------------
-- One open settlement per vendor
--
-- Fail with a readable message before adding the index if existing data already
-- violates the invariant. The hosted project is pre-payout, but an explicit
-- preflight keeps the migration safe to run against any environment.
-- ---------------------------------------------------------------------------

do $$
declare
  v_duplicates text;
begin
  select string_agg(vendor_id::text || ' (' || count::text || ')', ', ' order by vendor_id)
    into v_duplicates
  from (
    select vendor_id, count(*)
    from public.settlements
    where status = 'open' and voided_at is null
    group by vendor_id
    having count(*) > 1
  ) duplicates;

  if v_duplicates is not null then
    raise exception
      'Cannot add one-open-settlement-per-vendor uniqueness. Resolve duplicate open settlements first: %',
      v_duplicates
      using errcode = '23505';
  end if;
end $$;

create unique index if not exists settlements_one_open_per_vendor
  on public.settlements (vendor_id)
  where status = 'open' and voided_at is null;

-- ---------------------------------------------------------------------------
-- create_settlement — stamp the admin who opened the batch
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

  -- One open settlement per vendor keeps payouts unambiguous. The partial
  -- unique index below is the concurrency backstop; this check gives the
  -- ordinary case a friendly message before any insert is attempted.
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
    -- A concurrent request won the one-open race. Surface the same friendly
    -- message instead of a raw unique-index violation.
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
    -- Rolls the whole RPC back, including the settlement row.
    raise exception 'There is nothing to settle for this shop.' using errcode = '23514';
  end if;

  update public.settlements set total_minor = v_total where id = v_settlement_id;

  return v_settlement_id;
end;
$$;

revoke all on function public.create_settlement(uuid, text) from public, anon;
grant execute on function public.create_settlement(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_settlement_paid — stamp the admin who recorded the external payout
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

-- ---------------------------------------------------------------------------
-- void_settlement — release a mistaken open batch without raw SQL
--
-- A void is a soft delete: the settlement row stays for audit, its lines are
-- removed so the commission entries become available again, and the partial
-- unique index ignores it. Paid settlements cannot be voided.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Least-privilege grants for the financial tables
--
-- Supabase's default ACLs otherwise give anon/authenticated ALL on new tables
-- in `public`. RLS still denies writes, but the table-level grants should match
-- the ledger design: authenticated reads, nobody writes directly.
-- ---------------------------------------------------------------------------

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
