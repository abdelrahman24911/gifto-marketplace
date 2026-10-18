-- Gifto Marketplace — Phase 6: commission ledger and settlements
--
-- Business decisions encoded here (docs/DECISIONS.md):
--   D-01  Commission is per-vendor; the rate is snapshotted onto
--         `order_vendors.commission_rate` at placement by `place_order`.
--   D-02  The commission base is the *product subtotal only*
--         (`order_vendors.subtotal_minor`). Delivery fees and discounts are
--         excluded by construction: delivery is free at launch and no discount
--         columns exist yet.
--   D-08  Commission is *earned* when a suborder reaches `delivered` (COD cash
--         is collected on delivery, so the two coincide).
--
-- Amounts are integer piastres and are always computed in the database. No
-- client ever supplies a rate, a base or an amount.
--
-- What this migration deliberately does NOT decide: settlement cadence and
-- payout reconciliation (D-08 is still open there). Settlements here are a
-- manual, admin-driven batch of already-earned entries.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- `earned` after delivery; `reversed` if a delivered suborder is later returned
-- before its commission is settled.
create type public.commission_status as enum ('earned', 'reversed');
create type public.settlement_status as enum ('open', 'paid');

-- ---------------------------------------------------------------------------
-- commission_entries — one immutable row per delivered suborder
-- ---------------------------------------------------------------------------

create table public.commission_entries (
  id               uuid primary key default gen_random_uuid(),
  -- One entry per suborder. The unique key makes the delivery trigger
  -- idempotent: a repeated status write cannot double-charge commission.
  order_vendor_id  uuid not null unique
                     references public.order_vendors (id) on delete cascade,
  vendor_id        uuid not null references public.vendors (id) on delete restrict,
  status           public.commission_status not null default 'earned',
  currency         text not null default 'EGP' check (currency = 'EGP'),
  -- Snapshot of the suborder's frozen rate, copied so the ledger is readable on
  -- its own even if `order_vendors` is pruned.
  rate             numeric(5,4) not null check (rate >= 0 and rate <= 1),
  base_minor       int not null check (base_minor >= 0),
  amount_minor     int not null check (amount_minor >= 0),
  earned_at        timestamptz not null default now(),
  reversed_at      timestamptz,
  created_at       timestamptz not null default now(),
  -- The amount is always rate x base, rounded to the nearest piastre. Enforced
  -- so no code path can write a mismatched ledger row.
  constraint commission_amount_matches check (
    amount_minor = round(base_minor * rate)::int
  ),
  constraint commission_reversed_at_matches check (
    (status = 'reversed') = (reversed_at is not null)
  )
);

alter table public.commission_entries enable row level security;

create index commission_entries_vendor_idx
  on public.commission_entries (vendor_id, status);

-- ---------------------------------------------------------------------------
-- settlements — one payout batch for one vendor
-- ---------------------------------------------------------------------------

create table public.settlements (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors (id) on delete restrict,
  status        public.settlement_status not null default 'open',
  currency      text not null default 'EGP' check (currency = 'EGP'),
  total_minor   int not null default 0 check (total_minor >= 0),
  note          text check (note is null or length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  paid_at       timestamptz,
  constraint settlements_paid_at_matches check (
    (status = 'paid') = (paid_at is not null)
  )
);

alter table public.settlements enable row level security;

create trigger settlements_set_updated_at
  before update on public.settlements
  for each row execute function public.set_updated_at();

create index settlements_vendor_idx on public.settlements (vendor_id, status);

-- ---------------------------------------------------------------------------
-- settlement_lines — which earned entries a settlement pays for
-- ---------------------------------------------------------------------------

create table public.settlement_lines (
  id                  uuid primary key default gen_random_uuid(),
  settlement_id       uuid not null references public.settlements (id) on delete cascade,
  -- An entry can appear in at most one settlement, ever.
  commission_entry_id uuid not null unique
                        references public.commission_entries (id) on delete restrict,
  amount_minor        int not null check (amount_minor >= 0),
  currency            text not null default 'EGP' check (currency = 'EGP'),
  created_at          timestamptz not null default now()
);

alter table public.settlement_lines enable row level security;

create index settlement_lines_settlement_idx
  on public.settlement_lines (settlement_id);
create index settlement_lines_entry_idx
  on public.settlement_lines (commission_entry_id);

-- ---------------------------------------------------------------------------
-- Earn commission when a suborder is delivered (D-08)
-- ---------------------------------------------------------------------------

create or replace function public.record_commission_on_delivery()
returns trigger
language plpgsql security definer
set search_path = public
as $$
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
  on conflict (order_vendor_id) do nothing;

  return null;
end;
$$;

revoke all on function public.record_commission_on_delivery()
  from public, anon, authenticated;

create trigger order_vendors_record_commission
  after update of status on public.order_vendors
  for each row execute function public.record_commission_on_delivery();

-- ---------------------------------------------------------------------------
-- Reverse commission when a delivered suborder is returned
--
-- Only an unsettled entry can be reversed; once a payout includes the entry the
-- money has left the platform, so that case raises instead of guessing (a
-- documented follow-up).
-- ---------------------------------------------------------------------------

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
    -- Nothing was earned (should not happen for a delivered suborder).
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

create trigger order_vendors_reverse_commission
  after update of status on public.order_vendors
  for each row execute function public.reverse_commission_on_return();

-- ---------------------------------------------------------------------------
-- create_settlement — platform admin batches a vendor's earned entries
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

  -- One open settlement per vendor keeps payouts unambiguous.
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
-- mark_settlement_paid — platform admin records the payout
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- RLS POLICIES
-- ---------------------------------------------------------------------------

create policy "commission_entries: vendor read"
  on public.commission_entries for select
  using (public.is_vendor_member(vendor_id));

create policy "commission_entries: platform admin read"
  on public.commission_entries for select
  using (public.is_platform_admin());

create policy "settlements: vendor read"
  on public.settlements for select
  using (public.is_vendor_member(vendor_id));

create policy "settlements: platform admin read"
  on public.settlements for select
  using (public.is_platform_admin());

create policy "settlement_lines: vendor read"
  on public.settlement_lines for select
  using (exists (
    select 1 from public.settlements s
     where s.id = settlement_id and public.is_vendor_member(s.vendor_id)
  ));

create policy "settlement_lines: platform admin read"
  on public.settlement_lines for select
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Least-privilege grants
--
-- The ledger is append-only from the database's own triggers, and settlements
-- are written only by the SECURITY DEFINER RPCs above. So `authenticated` gets
-- read access only — there is deliberately no INSERT/UPDATE/DELETE grant.
-- ---------------------------------------------------------------------------

grant select on table
  public.commission_entries, public.settlements, public.settlement_lines
  to authenticated;
