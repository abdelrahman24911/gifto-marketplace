-- Migration 62 — Consent audit trail (re-audit v6, MEDIUM): record the
-- price consent for every placed order, append-only, and surface it on
-- the admin order detail page.
--
-- Until now the expected prices the customer saw were validated by
-- _create_order and then discarded: the order kept only the charged
-- prices (order_items), so a dispute ("I was shown X, charged Y")
-- could not be answered from the system. This migration records the
-- consent at the only reachable choke point — the two price-check
-- wrappers — in a new append-only table:
--   * price_consent_events: one row per order (unique on order_id),
--     who consented (user_id for signed-in, guest_token_hash for
--     guests), the expected prices as submitted, the expected total,
--     and the live total actually charged (sum of order_items line
--     totals at creation). At creation the two totals are equal by
--     construction — the RPC refuses the order otherwise — so a later
--     mismatch between them would itself be evidence of tampering.
--   * Writes happen only through _record_price_consent_event, a
--     SECURITY DEFINER helper revoked from every API role; RLS grants
--     select only (admin, owning customer, member vendors). No
--     insert/update/delete policy exists, so the trail cannot be
--     edited through the API.
--   * Idempotency retries return the existing order id without
--     re-running the price check; the insert is ON CONFLICT DO NOTHING
--     on order_id, so a retry records the same consent exactly once.
--   * Refusals are NOT recorded: a PRICE_CHANGED refusal raises inside
--     _create_order, so its transaction rolls back — an audit row
--     written in the same transaction would roll back with it. The
--     checkout UI already shows the old-vs-new diff on refusal; the
--     trail covers accepted consents, which is what a dispute needs.
--   * The wrappers are redefined (migration 47 bodies + one
--     _record_price_consent_event call each); _create_order itself is
--     untouched.

-- ---------------------------------------------------------------------------
-- price_consent_events — append-only consent trail, one row per order
-- ---------------------------------------------------------------------------

create table public.price_consent_events (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders (id) on delete cascade,
  user_id              uuid references public.profiles (id) on delete set null,
  guest_token_hash     text,
  expected_prices      jsonb not null,
  expected_total_minor int not null check (expected_total_minor >= 0),
  live_total_minor     int not null check (live_total_minor >= 0),
  created_at           timestamptz not null default now(),
  constraint price_consent_events_one_per_order unique (order_id),
  constraint price_consent_events_actor_matches check (
    (user_id is not null and guest_token_hash is null)
    or (user_id is null and guest_token_hash is not null
        and guest_token_hash ~ '^[0-9a-f]{64}$')
  )
);

comment on table public.price_consent_events is
  'Price-change consent trail (P1-03, migration 62): one append-only row per placed order recording who consented (signed-in user or guest token hash), the expected prices as submitted at checkout, the expected total, and the live total actually charged. Refusals are not recorded — a PRICE_CHANGED refusal rolls its transaction back.';

alter table public.price_consent_events enable row level security;

create index price_consent_events_order_idx
  on public.price_consent_events (order_id);

create policy "price_consent_events: customer read"
  on public.price_consent_events for select
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_id
        and o.user_id = auth.uid()
    )
  );

create policy "price_consent_events: vendor read"
  on public.price_consent_events for select
  using (
    exists (
      select 1
      from public.order_vendors ov
      where ov.order_id = order_id
        and public.is_vendor_member(ov.vendor_id)
    )
  );

create policy "price_consent_events: platform admin read"
  on public.price_consent_events for select
  using (public.is_platform_admin());

revoke all on table public.price_consent_events from public, anon, authenticated;
grant select on table public.price_consent_events to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- _record_price_consent_event — internal helper, never callable by API roles
-- ---------------------------------------------------------------------------

create or replace function public._record_price_consent_event(
  p_order_id uuid,
  p_user_id uuid,
  p_guest_token_hash text,
  p_expected_prices jsonb,
  p_expected_total_minor int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_total int;
begin
  select coalesce(sum(oi.line_total_minor), 0)
    into v_live_total
    from public.order_items oi
    join public.order_vendors ov on ov.id = oi.order_vendor_id
   where ov.order_id = p_order_id;

  insert into public.price_consent_events (
    order_id, user_id, guest_token_hash,
    expected_prices, expected_total_minor, live_total_minor
  ) values (
    p_order_id, p_user_id, p_guest_token_hash,
    p_expected_prices, p_expected_total_minor, v_live_total
  )
  on conflict (order_id) do nothing;
end;
$$;

revoke all on function public._record_price_consent_event(uuid, uuid, text, jsonb, int)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Signed-in checkout with price consent + gift options (migration 47 body
-- + consent recording)
-- ---------------------------------------------------------------------------

drop function if exists public.place_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, jsonb, int,
  boolean, text, date, text
);

create or replace function public.place_order_with_price_check(
  p_items jsonb,
  p_recipient_name text,
  p_contact_phone text,
  p_contact_email text,
  p_address_line text,
  p_city text,
  p_governorate text,
  p_notes text,
  p_idempotency_key uuid,
  p_expected_prices jsonb,
  p_expected_total_minor int,
  p_gift_wrap boolean default false,
  p_gift_message text default null,
  p_preferred_delivery_date date default null,
  p_delivery_time_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_oid uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to place an order.'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'A checkout attempt key is required.' using errcode = '22023';
  end if;

  perform public._validate_gift_options(
    p_gift_wrap, p_gift_message,
    p_preferred_delivery_date, p_delivery_time_note
  );

  v_oid := public._create_order(
    v_uid, p_items, p_recipient_name, p_contact_phone, p_contact_email,
    p_address_line, p_city, p_governorate, p_notes, p_idempotency_key, null,
    p_expected_prices, p_expected_total_minor
  );

  update public.orders
     set gift_wrap = coalesce(p_gift_wrap, false),
         gift_message = nullif(trim(p_gift_message), ''),
         preferred_delivery_date = p_preferred_delivery_date,
         delivery_time_note = nullif(trim(p_delivery_time_note), '')
   where id = v_oid;

  -- Consent trail (migration 62): the customer necessarily submitted the
  -- exact prices charged — the RPC refused anything else — and this row
  -- is the durable proof of what they saw.
  perform public._record_price_consent_event(
    v_oid, v_uid, null, p_expected_prices, p_expected_total_minor
  );

  return v_oid;
end;
$$;

revoke all on function public.place_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, jsonb, int,
  boolean, text, date, text
) from public, anon;
grant execute on function public.place_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, jsonb, int,
  boolean, text, date, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Guest checkout with price consent + gift options (migration 47 body
-- + consent recording)
-- ---------------------------------------------------------------------------

drop function if exists public.place_guest_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int,
  boolean, text, date, text
);

create or replace function public.place_guest_order_with_price_check(
  p_items jsonb,
  p_recipient_name text,
  p_contact_phone text,
  p_contact_email text,
  p_address_line text,
  p_city text,
  p_governorate text,
  p_notes text,
  p_idempotency_key uuid,
  p_guest_token_hash text,
  p_expected_prices jsonb,
  p_expected_total_minor int,
  p_gift_wrap boolean default false,
  p_gift_message text default null,
  p_preferred_delivery_date date default null,
  p_delivery_time_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oid uuid;
begin
  -- The service role has no end-user JWT. If this is ever called from a signed
  -- in context, reject it so a caller cannot attach the order to a real user.
  if auth.uid() is not null then
    raise exception 'Guest checkout cannot be used from a signed-in session.'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'A checkout attempt key is required.' using errcode = '22023';
  end if;

  if p_guest_token_hash is null or p_guest_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid guest order credential.' using errcode = '22023';
  end if;

  perform public._validate_gift_options(
    p_gift_wrap, p_gift_message,
    p_preferred_delivery_date, p_delivery_time_note
  );

  v_oid := public._create_order(
    null, p_items, p_recipient_name, p_contact_phone, p_contact_email,
    p_address_line, p_city, p_governorate, p_notes,
    p_idempotency_key, p_guest_token_hash,
    p_expected_prices, p_expected_total_minor
  );

  update public.orders
     set gift_wrap = coalesce(p_gift_wrap, false),
         gift_message = nullif(trim(p_gift_message), ''),
         preferred_delivery_date = p_preferred_delivery_date,
         delivery_time_note = nullif(trim(p_delivery_time_note), '')
   where id = v_oid;

  -- Consent trail (migration 62): guest consent is keyed by the token
  -- hash, never the raw token.
  perform public._record_price_consent_event(
    v_oid, null, p_guest_token_hash, p_expected_prices, p_expected_total_minor
  );

  return v_oid;
end;
$$;

revoke all on function public.place_guest_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int,
  boolean, text, date, text
) from public, anon, authenticated;
grant execute on function public.place_guest_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int,
  boolean, text, date, text
) to service_role;
