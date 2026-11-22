-- Gifto Marketplace - UX Batch 1: gift-shopper data (wishlist, saved
-- addresses, gift options, delivery-date preference).
--
--   * wishlists — one row per (signed-in customer, product). Guests use the
--     browser-local wishlist (same pattern as the cart); this table is the
--     signed-in customer's cross-device copy. No money, no trust boundary:
--     prices and stock are still re-checked by place_order at checkout.
--   * saved_addresses — the signed-in customer's address book. Checkout
--     offers these as one-tap fills; the order itself still stores a plain
--     address snapshot, so editing or deleting a saved address never
--     rewrites a placed order.
--   * orders.gift_wrap / gift_message / preferred_delivery_date /
--     delivery_time_note — order-level gift and delivery-preference fields,
--     carried by the price-check checkout wrappers below.
--
-- Deliberately NOT invented here:
--   * Gift wrap carries NO fee and changes NO commission: there is no
--     owner decision for a wrap charge, and the wrap is done by the shop
--     that already prepares the gift (D-06 delivery is free through
--     launch). If a wrap fee is ever decided, it must be priced by the
--     database like every other money field, not added here.
--   * There is NO courier slot system. The existing delivery model is that
--     each shop delivers its own suborder and contacts the customer by
--     phone to arrange delivery (see checkout copy and migration 29
--     coverage). `preferred_delivery_date` is a *preference* the shop sees
--     — a date from tomorrow through 14 days out — and
--     `delivery_time_note` is free text (e.g. "evenings"). Neither is a
--     booked slot and neither is promised to the customer; a real slot
--     system needs a courier decision first and is recorded OPEN in
--     docs/HOSTED_STATE.md.
--
-- The price-check wrappers are dropped and recreated with four extra
-- parameters WITH DEFAULTS, so every existing 11-argument caller (including
-- the RLS suites) keeps working unchanged. The trusted order-creation body
-- (`_create_order`, migration 34) is NOT duplicated: the wrappers validate
-- the gift fields, call it, then apply the gift fields to the new order in
-- the same transaction — no concurrent reader can see the intermediate
-- state, and a validation failure rolls the whole checkout back.
--
-- Rollback (run manually on the disposable database only; migrations are
-- forward-only in this repo):
--   drop function public._validate_gift_options(boolean, text, date, text);
--   drop function public.place_guest_order_with_price_check(jsonb, text,
--     text, text, text, text, text, text, uuid, text, jsonb, int, boolean,
--     text, date, text);
--   drop function public.place_order_with_price_check(jsonb, text, text,
--     text, text, text, text, text, uuid, jsonb, int, boolean, text, date,
--     text);
--   -- then re-run migration 34's two wrapper definitions to restore the
--   -- 11-argument versions.
--   alter table public.orders drop column if exists delivery_time_note,
--     drop column if exists preferred_delivery_date,
--     drop column if exists gift_message, drop column if exists gift_wrap;
--   drop table if exists public.saved_addresses;
--   drop table if exists public.wishlists;

-- ---------------------------------------------------------------------------
-- wishlists
-- ---------------------------------------------------------------------------

create table public.wishlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint wishlists_one_per_product unique (user_id, product_id)
);

alter table public.wishlists enable row level security;

create index wishlists_user_idx on public.wishlists (user_id, created_at desc);

-- Owner-only: a customer reads, adds and removes only their own rows.
-- Vendors and admins have no wishlist access by design (there is no
-- business need for anyone else to read a customer's wishlist).
create policy "wishlists: owner read"
  on public.wishlists for select
  using (user_id = auth.uid());

create policy "wishlists: owner insert"
  on public.wishlists for insert
  with check (user_id = auth.uid());

create policy "wishlists: owner delete"
  on public.wishlists for delete
  using (user_id = auth.uid());

revoke all on table public.wishlists from public, anon, authenticated;
grant select, insert, delete on table public.wishlists
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- saved_addresses
-- ---------------------------------------------------------------------------

create table public.saved_addresses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  label           text not null check (length(trim(label)) between 2 and 40),
  recipient_name  text not null check (length(trim(recipient_name)) between 2 and 120),
  contact_phone   text not null check (length(trim(contact_phone)) between 5 and 30),
  address_line    text not null check (length(trim(address_line)) between 5 and 300),
  city            text not null check (length(trim(city)) between 2 and 80),
  governorate     text not null check (length(trim(governorate)) between 2 and 80),
  notes           text check (notes is null or length(notes) <= 1000),
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.saved_addresses enable row level security;

create trigger saved_addresses_set_updated_at
  before update on public.saved_addresses
  for each row execute function public.set_updated_at();

create index saved_addresses_user_idx
  on public.saved_addresses (user_id, created_at desc);

-- One default address per customer, enforced by the database rather than
-- by the app: the server action clears the old default first, and this
-- index is the backstop against a race.
create unique index saved_addresses_one_default_uidx
  on public.saved_addresses (user_id)
  where is_default;

-- Same length rules place_order enforces (migration 05 / 34), so an
-- address that is saved can always be used at checkout.
create policy "saved_addresses: owner read"
  on public.saved_addresses for select
  using (user_id = auth.uid());

create policy "saved_addresses: owner insert"
  on public.saved_addresses for insert
  with check (user_id = auth.uid());

create policy "saved_addresses: owner update"
  on public.saved_addresses for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "saved_addresses: owner delete"
  on public.saved_addresses for delete
  using (user_id = auth.uid());

revoke all on table public.saved_addresses from public, anon, authenticated;
grant select, insert, update, delete on table public.saved_addresses
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- orders: gift + delivery-preference columns
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists gift_wrap boolean not null default false,
  add column if not exists gift_message text,
  add column if not exists preferred_delivery_date date,
  add column if not exists delivery_time_note text;

alter table public.orders
  add constraint orders_gift_message_check check (
    gift_message is null or length(gift_message) <= 500
  ),
  add constraint orders_delivery_time_note_check check (
    delivery_time_note is null or length(delivery_time_note) <= 200
  );

-- The preferred-date window (tomorrow through 14 days out) is enforced in
-- the checkout wrappers below, not by a CHECK: a CHECK cannot reference
-- current_date (not immutable), and the window is a checkout rule, not a
-- property of a stored order.

-- ---------------------------------------------------------------------------
-- _validate_gift_options — shared gift-field validation for both wrappers
-- ---------------------------------------------------------------------------

create or replace function public._validate_gift_options(
  p_gift_wrap boolean,
  p_gift_message text,
  p_preferred_delivery_date date,
  p_delivery_time_note text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_message text := nullif(trim(p_gift_message), '');
  v_note    text := nullif(trim(p_delivery_time_note), '');
begin
  if v_message is not null and length(v_message) > 500 then
    raise exception 'Gift message must be 500 characters or fewer.'
      using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 200 then
    raise exception 'Delivery time note must be 200 characters or fewer.'
      using errcode = '22023';
  end if;
  if p_preferred_delivery_date is not null
     and (p_preferred_delivery_date < current_date + 1
          or p_preferred_delivery_date > current_date + 14) then
    raise exception 'Choose a delivery date between tomorrow and 14 days from today.'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public._validate_gift_options(boolean, text, date, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Signed-in checkout with price consent + gift options (P1-03 + UX Batch 1)
-- ---------------------------------------------------------------------------

drop function if exists public.place_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, jsonb, int
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
-- Guest checkout with price consent + gift options (P1-03 + UX Batch 1)
-- ---------------------------------------------------------------------------

drop function if exists public.place_guest_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int
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
