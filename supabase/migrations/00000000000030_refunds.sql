-- Gifto Phase 2: refunds and disputes (MON-9)
--
-- A customer or admin can open a case against one vendor suborder. An admin
-- resolves it with an amount, and commission is reduced through an append-only
-- adjustment ledger before the entry is settled. Once commission is part of an
-- active settlement the case cannot be approved automatically; the settlement
-- must be voided/released first (the same rule already used for returns).
--
-- COD cash refunds happen between the shop and the customer; this migration
-- records the decision and reduces the platform commission owed by the shop.

create type public.refund_case_status as enum (
  'open', 'approved', 'rejected', 'cancelled'
);
create type public.refund_case_source as enum ('customer', 'guest', 'admin');

create table public.refund_cases (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null references public.orders (id) on delete cascade,
  order_vendor_id        uuid not null references public.order_vendors (id) on delete cascade,
  vendor_id              uuid not null references public.vendors (id) on delete restrict,
  source                 public.refund_case_source not null,
  opened_by              uuid references public.profiles (id) on delete set null,
  reason                 text not null check (length(trim(reason)) between 5 and 1000),
  requested_amount_minor int check (requested_amount_minor is null or requested_amount_minor >= 0),
  status                 public.refund_case_status not null default 'open',
  resolution_note        text check (resolution_note is null or length(resolution_note) <= 1000),
  refund_amount_minor    int check (refund_amount_minor is null or refund_amount_minor >= 0),
  resolved_by            uuid references public.profiles (id) on delete set null,
  resolved_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint refund_cases_opener_matches check (
    (source = 'guest') = (opened_by is null)
  ),
  constraint refund_cases_resolution_matches check (
    (status = 'open'
       and resolved_at is null
       and resolved_by is null
       and refund_amount_minor is null)
    or (status = 'approved'
       and resolved_at is not null
       and resolved_by is not null
       and refund_amount_minor is not null
       and refund_amount_minor > 0)
    or (status in ('rejected', 'cancelled')
       and resolved_at is not null
       and resolved_by is not null
       and refund_amount_minor = 0)
  )
);

alter table public.refund_cases enable row level security;

create trigger refund_cases_set_updated_at
  before update on public.refund_cases
  for each row execute function public.set_updated_at();

create index refund_cases_queue_idx
  on public.refund_cases (status, created_at desc);
create index refund_cases_order_idx
  on public.refund_cases (order_id, created_at desc);
create index refund_cases_vendor_idx
  on public.refund_cases (vendor_id, created_at desc);
create unique index refund_cases_one_open_per_suborder
  on public.refund_cases (order_vendor_id)
  where status = 'open';

-- Keep the redundant order/vendor columns honest even if a future code path
-- forgets to derive them from the suborder.
create or replace function public.assert_refund_case_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id  uuid;
  v_vendor_id uuid;
begin
  select order_id, vendor_id
    into v_order_id, v_vendor_id
    from public.order_vendors
   where id = new.order_vendor_id;

  if v_order_id is null then
    raise exception 'Choose a valid order item group.' using errcode = '22023';
  end if;

  if new.order_id <> v_order_id or new.vendor_id <> v_vendor_id then
    raise exception 'A refund case must match its order item group.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.assert_refund_case_scope()
  from public, anon, authenticated;

create trigger refund_cases_assert_scope
  before insert or update on public.refund_cases
  for each row execute function public.assert_refund_case_scope();

-- ---------------------------------------------------------------------------
-- commission_adjustments - append-only reduction of platform commission
--
-- Amounts are stored as negative piastres. One row per approved refund case.
-- ---------------------------------------------------------------------------

create table public.commission_adjustments (
  id                  uuid primary key default gen_random_uuid(),
  commission_entry_id uuid not null references public.commission_entries (id) on delete restrict,
  refund_case_id      uuid not null unique references public.refund_cases (id) on delete restrict,
  vendor_id           uuid not null references public.vendors (id) on delete restrict,
  currency            text not null default 'EGP' check (currency = 'EGP'),
  amount_minor        int not null check (amount_minor < 0),
  reason              text check (reason is null or length(reason) <= 500),
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);

alter table public.commission_adjustments enable row level security;

create index commission_adjustments_entry_idx
  on public.commission_adjustments (commission_entry_id);
create index commission_adjustments_vendor_idx
  on public.commission_adjustments (vendor_id, created_at desc);

create or replace function public.assert_commission_adjustment_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_id   uuid;
  v_amount      int;
  v_entry_vendor uuid;
  v_existing    int;
  v_case_suborder uuid;
begin
  select vendor_id, amount_minor
    into v_entry_vendor, v_amount
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
    raise exception 'A commission adjustment must match its refund case.'
      using errcode = '23514';
  end if;

  if new.vendor_id <> v_entry_vendor then
    raise exception 'A commission adjustment must match the commission vendor.'
      using errcode = '23514';
  end if;

  select coalesce(sum(amount_minor), 0)
    into v_existing
    from public.commission_adjustments
   where commission_entry_id = new.commission_entry_id;

  if abs(new.amount_minor) > v_amount + v_existing then
    raise exception 'A commission adjustment cannot exceed the earned commission.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.assert_commission_adjustment_scope()
  from public, anon, authenticated;

create trigger commission_adjustments_assert_scope
  before insert on public.commission_adjustments
  for each row execute function public.assert_commission_adjustment_scope();

-- ---------------------------------------------------------------------------
-- RLS: customers see their cases, vendors see their shop's cases, admins all.
-- Writes happen only through the SECURITY DEFINER RPCs below.
-- ---------------------------------------------------------------------------

create policy "refund_cases: customer read"
  on public.refund_cases for select
  using (exists (
    select 1 from public.orders o
     where o.id = order_id and o.user_id = auth.uid()
  ));

create policy "refund_cases: vendor read"
  on public.refund_cases for select
  using (public.is_vendor_member(vendor_id));

create policy "refund_cases: platform admin read"
  on public.refund_cases for select
  using (public.is_platform_admin());

create policy "commission_adjustments: vendor read"
  on public.commission_adjustments for select
  using (public.is_vendor_member(vendor_id));

create policy "commission_adjustments: platform admin read"
  on public.commission_adjustments for select
  using (public.is_platform_admin());

revoke all on table public.refund_cases, public.commission_adjustments
  from public, anon, authenticated;
grant select on table public.refund_cases, public.commission_adjustments
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- open_refund_case - signed-in customer or admin
-- ---------------------------------------------------------------------------

create or replace function public.open_refund_case(
  p_order_vendor_id uuid,
  p_reason text,
  p_requested_amount_minor int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_admin      boolean := public.is_platform_admin();
  v_suborder   record;
  v_case_id    uuid;
  v_source     public.refund_case_source;
begin
  if v_user_id is null then
    raise exception 'Sign in to request a refund.' using errcode = '42501';
  end if;

  select ov.id, ov.order_id, ov.vendor_id, ov.status, ov.subtotal_minor, o.user_id
    into v_suborder
    from public.order_vendors ov
    join public.orders o on o.id = ov.order_id
   where ov.id = p_order_vendor_id;

  if v_suborder.id is null then
    raise exception 'Choose a valid order item group.' using errcode = '22023';
  end if;

  if not v_admin and v_suborder.user_id is distinct from v_user_id then
    raise exception 'You can only request a refund for your own order.'
      using errcode = '42501';
  end if;

  if v_suborder.status not in ('shipped', 'delivered', 'returned') then
    raise exception 'A refund can be requested after the shop ships the order.'
      using errcode = '23514';
  end if;

  if p_reason is null or length(trim(p_reason)) not between 5 and 1000 then
    raise exception 'Describe the problem in 5-1000 characters.'
      using errcode = '22023';
  end if;

  if p_requested_amount_minor is not null
     and (p_requested_amount_minor < 0
          or p_requested_amount_minor > v_suborder.subtotal_minor) then
    raise exception 'The requested amount cannot exceed the shop subtotal.'
      using errcode = '22023';
  end if;

  v_source := case when v_admin then 'admin'::public.refund_case_source
                   else 'customer'::public.refund_case_source end;

  begin
    insert into public.refund_cases (
      order_id, order_vendor_id, vendor_id, source, opened_by,
      reason, requested_amount_minor
    ) values (
      v_suborder.order_id, v_suborder.id, v_suborder.vendor_id, v_source,
      v_user_id, trim(p_reason), p_requested_amount_minor
    )
    returning id into v_case_id;
  exception when unique_violation then
    raise exception 'There is already an open refund case for this shop in your order.'
      using errcode = '23514';
  end;

  return v_case_id;
end;
$$;

revoke all on function public.open_refund_case(uuid, text, int) from public, anon;
grant execute on function public.open_refund_case(uuid, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Guest refunds - only the service role, after token verification
-- ---------------------------------------------------------------------------

create or replace function public.open_guest_refund_case(
  p_order_id uuid,
  p_token_hash text,
  p_order_vendor_id uuid,
  p_reason text,
  p_requested_amount_minor int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suborder record;
  v_case_id  uuid;
begin
  if p_token_hash is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
  ) then
    raise exception 'This order link is not valid.' using errcode = '42501';
  end if;

  select ov.id, ov.order_id, ov.vendor_id, ov.status, ov.subtotal_minor
    into v_suborder
    from public.order_vendors ov
   where ov.id = p_order_vendor_id
     and ov.order_id = p_order_id;

  if v_suborder.id is null then
    raise exception 'Choose a valid order item group.' using errcode = '22023';
  end if;

  if v_suborder.status not in ('shipped', 'delivered', 'returned') then
    raise exception 'A refund can be requested after the shop ships the order.'
      using errcode = '23514';
  end if;

  if p_reason is null or length(trim(p_reason)) not between 5 and 1000 then
    raise exception 'Describe the problem in 5-1000 characters.'
      using errcode = '22023';
  end if;

  if p_requested_amount_minor is not null
     and (p_requested_amount_minor < 0
          or p_requested_amount_minor > v_suborder.subtotal_minor) then
    raise exception 'The requested amount cannot exceed the shop subtotal.'
      using errcode = '22023';
  end if;

  begin
    insert into public.refund_cases (
      order_id, order_vendor_id, vendor_id, source, opened_by,
      reason, requested_amount_minor
    ) values (
      v_suborder.order_id, v_suborder.id, v_suborder.vendor_id, 'guest',
      null, trim(p_reason), p_requested_amount_minor
    )
    returning id into v_case_id;
  exception when unique_violation then
    raise exception 'There is already an open refund case for this shop in your order.'
      using errcode = '23514';
  end;

  return v_case_id;
end;
$$;

revoke all on function public.open_guest_refund_case(uuid, text, uuid, text, int)
  from public, anon, authenticated;
grant execute on function public.open_guest_refund_case(uuid, text, uuid, text, int)
  to service_role;

create or replace function public.get_guest_refund_cases(
  p_order_id uuid,
  p_token_hash text
)
returns table (
  id uuid,
  order_vendor_id uuid,
  status public.refund_case_status,
  reason text,
  requested_amount_minor int,
  refund_amount_minor int,
  resolution_note text,
  created_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token_hash is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
  ) then
    raise exception 'This order link is not valid.' using errcode = '42501';
  end if;

  return query
    select rc.id, rc.order_vendor_id, rc.status, rc.reason,
           rc.requested_amount_minor, rc.refund_amount_minor,
           rc.resolution_note, rc.created_at, rc.resolved_at
      from public.refund_cases rc
     where rc.order_id = p_order_id
     order by rc.created_at desc;
end;
$$;

revoke all on function public.get_guest_refund_cases(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_guest_refund_cases(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- resolve_refund_case - platform admin approves or rejects a case
-- ---------------------------------------------------------------------------

create or replace function public.resolve_refund_case(
  p_case_id uuid,
  p_approved boolean,
  p_refund_amount_minor int default 0,
  p_note text default null
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
         resolved_at = now()
   where id = p_case_id;
end;
$$;

revoke all on function public.resolve_refund_case(uuid, boolean, int, text)
  from public, anon;
grant execute on function public.resolve_refund_case(uuid, boolean, int, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Settlements must use the net commission after refund adjustments.
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

create or replace function public.mark_settlement_paid(p_settlement_id uuid)
returns void
language plpgsql
security definer
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

  update public.settlements
     set status = 'paid',
         paid_at = now(),
         paid_by = auth.uid()
   where id = p_settlement_id;
end;
$$;

revoke all on function public.mark_settlement_paid(uuid) from public, anon;
grant execute on function public.mark_settlement_paid(uuid) to authenticated;
