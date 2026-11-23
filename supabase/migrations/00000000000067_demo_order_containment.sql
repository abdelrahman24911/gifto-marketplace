-- Migration 67 — P0 demo containment (autonomous mission, Batch 1):
-- demo vendors must not receive NEW production orders.
--
-- Why a code check, not just the pause flag: the five demo vendors are
-- paused in production by setting is_accepting_orders = false (a data
-- write, applied by the owner), but any demo shop owner can toggle that
-- flag back on from vendor settings, so the flag alone is not a durable
-- boundary. This migration adds the durable check at the single trusted
-- choke point, _create_order, next to the pause check, inside the locked
-- vendor loop: a demo vendor's order is rejected with the exact paused
-- message, so the customer experience is identical to a paused shop and
-- no demo label ever leaks to the storefront.
--
-- The switch is app_settings.demo_orders_allowed (default false):
--   * Production keeps it false — demo vendors cannot be ordered from.
--   * The separate demo environment (Phase 1B, later batch) sets it to
--     true as part of its own setup, so the same code serves demos there.
-- The setting is a plain row, readable only by service_role: RLS is
-- enabled with no policies, so anon/authenticated cannot read or change
-- it, and demo_orders_allowed() is SECURITY DEFINER and revoked from
-- every API role (it is only callable from inside _create_order).
--
-- What is preserved: existing demo orders stay readable (no order or
-- vendor rows are touched), non-demo vendors are unaffected, the
-- storefront keeps showing demo shops and products (the app layer folds
-- the containment into the existing paused treatment), and admin can
-- still inspect all demo data. The four owner-confirmed test orders are
-- untouched.
--
-- Deployment order: apply this migration BEFORE deploying the app code
-- that reads app_settings. If the table is absent, the app layer treats
-- the setting as unknown and does not block (the database is the
-- authority once this migration is applied) — so a deploy without the
-- migration is the status quo, not a silent containment failure.
-- Never apply rollbacks outside a disposable database.
--
-- Rollback (disposable database only):
-- supabase/rollbacks/00000000000067_demo_order_containment_rollback.sql
-- restores migration 59's _create_order exactly and drops the setting
-- table + function.

-- ---------------------------------------------------------------------------
-- app_settings — environment switches owned by the platform
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  constraint app_settings_value_is_json_boolean check (
    value = 'true'::jsonb or value = 'false'::jsonb
  )
);

comment on table public.app_settings is
  'Platform-owned environment switches (migration 67). Only service_role can read/write: RLS is enabled with no policies. Add new keys only with a migration, never ad hoc.';

alter table public.app_settings enable row level security;

revoke all on table public.app_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.app_settings to service_role;

insert into public.app_settings (key, value)
values ('demo_orders_allowed', 'false'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- demo_orders_allowed — the containment switch, fail-closed when missing
-- ---------------------------------------------------------------------------

create or replace function public.demo_orders_allowed()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select case when s.value = 'true'::jsonb then true else false end
       from public.app_settings s
      where s.key = 'demo_orders_allowed'),
    false
  );
$$;

revoke all on function public.demo_orders_allowed() from public, anon, authenticated, service_role;

comment on function public.demo_orders_allowed() is
  'P0 demo containment (migration 67): true only when app_settings.demo_orders_allowed is the JSON boolean true. Missing row or any other value means false. SECURITY DEFINER, revoked from every API role; called only from inside _create_order.';

-- ---------------------------------------------------------------------------
-- _create_order — migration 59 body verbatim + demo-vendor rejection
-- ---------------------------------------------------------------------------

create or replace function public._create_order(
  p_user_id uuid,
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
  p_expected_total_minor int
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_line       record;
  v_json       jsonb;
  v_pids       uuid[] := array[]::uuid[];
  v_qtys       int[] := array[]::int[];
  v_distinct   int;
  v_product    record;
  v_idx        int;
  v_qty        int;
  v_ok_pids    uuid[] := array[]::uuid[];
  v_ok_vendors uuid[] := array[]::uuid[];
  v_ok_prices  int[] := array[]::int[];
  v_ok_names   text[] := array[]::text[];
  v_ok_slugs   text[] := array[]::text[];
  v_ok_qtys    int[] := array[]::int[];
  v_subtotal   int;
  v_order_id   uuid;
  v_vendor_id  uuid;
  v_vendor_name text;
  v_vendor_status public.vendor_status;
  v_accepting  boolean;
  v_is_demo    boolean;
  v_rate       numeric(5,4);
  v_ov_id      uuid;
  v_ov_sub     int;
  v_email      text;
  v_ref        text;
  v_attempt    int;
  v_existing_id   uuid;
  v_existing_user uuid;
  v_existing_hash text;
  v_expected_price int;
  v_expected     jsonb;
  i            int;
begin
  -- ------------------------------------------------------------ idempotency
  -- Serialise attempts that share a key before looking it up. The unique index
  -- is the second line of defence if anything bypasses this lock.
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

    select id, user_id, guest_token_hash
      into v_existing_id, v_existing_user, v_existing_hash
      from public.orders
     where idempotency_key = p_idempotency_key;

    if v_existing_id is not null then
      -- A retry must prove it is the same caller. For signed-in orders the
      -- user must match; for guest orders the token hash must match.
      if v_existing_user is distinct from p_user_id
         or (p_guest_token_hash is not null
             and v_existing_hash is distinct from p_guest_token_hash) then
        raise exception 'This checkout attempt does not belong to you.'
          using errcode = '42501';
      end if;

      return v_existing_id;
    end if;
  end if;

  -- ---------------------------------------------------------- address checks
  if p_recipient_name is null or length(trim(p_recipient_name)) not between 2 and 120 then
    raise exception 'Enter the recipient name (2–120 characters).' using errcode = '22023';
  end if;
  if p_contact_phone is null or length(trim(p_contact_phone)) not between 5 and 30 then
    raise exception 'Enter a contact phone number (5–30 characters).' using errcode = '22023';
  end if;

  v_email := nullif(lower(trim(p_contact_email)), '');
  if v_email is not null then
    if length(v_email) > 254
       or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'Enter a valid email address.' using errcode = '22023';
    end if;
  end if;

  if p_address_line is null or length(trim(p_address_line)) not between 5 and 300 then
    raise exception 'Enter the delivery address (5–300 characters).' using errcode = '22023';
  end if;
  if p_city is null or length(trim(p_city)) not between 2 and 80 then
    raise exception 'Enter the city (2–80 characters).' using errcode = '22023';
  end if;
  if p_governorate is null or length(trim(p_governorate)) not between 2 and 80 then
    raise exception 'Enter the governorate (2–80 characters).' using errcode = '22023';
  end if;
  if p_notes is not null and length(p_notes) > 1000 then
    raise exception 'Delivery notes must be 1000 characters or fewer.' using errcode = '22023';
  end if;

  -- ------------------------------------------------------------ cart checks
  if coalesce(jsonb_typeof(p_items), 'null') <> 'array' then
    raise exception 'Your cart is empty.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'An order can contain at most 50 different products.' using errcode = '22023';
  end if;

  for v_line in select e.value as v from jsonb_array_elements(p_items) as e(value) loop
    v_json := v_line.v;

    if coalesce(v_json ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Your cart contains an invalid product.' using errcode = '22023';
    end if;

    begin
      v_qty := (v_json ->> 'quantity')::int;
    exception when others then
      raise exception 'Your cart contains an invalid quantity.' using errcode = '22023';
    end;

    if v_qty is null or v_qty < 1 or v_qty > 20 then
      raise exception 'Quantity must be between 1 and 20.' using errcode = '22023';
    end if;

    v_pids := array_append(v_pids, (v_json ->> 'product_id')::uuid);
    v_qtys := array_append(v_qtys, v_qty);
  end loop;

  select count(*) into v_distinct from (select unnest(v_pids) as pid group by pid) t;
  if v_distinct <> array_length(v_pids, 1) then
    raise exception 'Each product can appear only once in the cart.' using errcode = '22023';
  end if;

  -- ------------------------------------------------- lock, price and validate
  for v_product in
    select p.id, p.vendor_id, p.price_minor, p.stock, p.name, p.slug, p.status
      from public.products p
     where p.id = any (v_pids)
     order by p.id
       for update
  loop
    v_idx := array_position(v_pids, v_product.id);
    v_qty := v_qtys[v_idx];

    if v_product.status <> 'active' or not public.is_public_vendor(v_product.vendor_id) then
      raise exception '“%” is no longer available.', v_product.name using errcode = '22023';
    end if;

    if v_product.stock < v_qty then
      raise exception 'Only % of “%” are in stock.', v_product.stock, v_product.name
        using errcode = '22023';
    end if;

    v_ok_pids    := array_append(v_ok_pids, v_product.id);
    v_ok_vendors := array_append(v_ok_vendors, v_product.vendor_id);
    v_ok_prices  := array_append(v_ok_prices, v_product.price_minor);
    v_ok_names   := array_append(v_ok_names, v_product.name);
    v_ok_slugs   := array_append(v_ok_slugs, v_product.slug);
    v_ok_qtys    := array_append(v_ok_qtys, v_qty);
  end loop;

  if array_length(v_ok_pids, 1) is distinct from array_length(v_pids, 1) then
    raise exception 'One or more products are no longer available.' using errcode = '22023';
  end if;

  -- ------------------------------------------------- lock vendor and pause
  -- (Migrations 22, 67.) Product locks come first (above), then vendor locks in id
  -- order. This both avoids deadlocks and makes the pause check authoritative:
  -- a concurrent owner toggle must wait for this transaction, so it cannot
  -- slip between the check and the order insert.
  for v_vendor_id in
    select distinct vid from unnest(v_ok_vendors) as u(vid) order by vid
  loop
    select v.name, v.status, v.is_accepting_orders, v.is_demo
      into v_vendor_name, v_vendor_status, v_accepting, v_is_demo
      from public.vendors v
     where v.id = v_vendor_id
       for update;

    if v_vendor_status <> 'active'
       or not public.is_public_vendor(v_vendor_id) then
      raise exception '“%” is no longer available.', v_vendor_name
        using errcode = '22023';
    end if;

    if not v_accepting then
      raise exception '“%” is not accepting orders right now.', v_vendor_name
        using errcode = '22023';
    end if;

    -- P0 demo containment (migration 67): a demo vendor never accepts new
    -- orders in production, regardless of its pause flag. The flag alone
    -- is not a durable boundary — a demo shop owner can toggle
    -- is_accepting_orders themselves (vendor settings) — so the demo
    -- marker is checked here, inside the locked vendor loop, next to the
    -- pause check. The demo environment flips
    -- app_settings.demo_orders_allowed to true. The message deliberately
    -- reuses the paused wording: the customer sees a paused shop, never
    -- a demo label, and no order row is created.
    if v_is_demo and not public.demo_orders_allowed() then
      raise exception '“%” is not accepting orders right now.', v_vendor_name
        using errcode = '22023';
    end if;
  end loop;

  select coalesce(sum(t.price * t.qty), 0)
    into v_subtotal
    from unnest(v_ok_prices, v_ok_qtys) as t(price, qty);

  -- -------------------------------------------- price-change consent (P1-03)
  -- When the caller supplies the prices the customer saw (the cart prices),
  -- they must match the live prices locked above, and the live subtotal must
  -- match the expected total. Any difference raises PRICE_CHANGED and
  -- creates nothing; checkout shows the diff and asks the customer to
  -- confirm the new prices before resubmitting. A missing or malformed
  -- expected price is a verification failure, not a price change.
  -- S-01 (re-audit v5): expected prices are REQUIRED once the cart has
  -- valid priced lines. A null here is a consent bypass, not an empty or
  -- unpriceable cart: empty, invalid and missing-product carts were
  -- already rejected above (cart checks, then the v_ok length check), so
  -- reaching this point means every line is a locked, priced product.
  -- The test helpers deliberately pass NULL for empty / missing-product
  -- carts so _create_order's own validation fires — those paths raise
  -- before this point and are unaffected.
  if p_expected_prices is null or p_expected_total_minor is null then
    raise exception 'The prices you saw could not be verified. Refresh the cart and try again.'
      using errcode = '22023';
  end if;

  if p_expected_prices is not null then
    if coalesce(jsonb_typeof(p_expected_prices), 'null') <> 'array'
       or jsonb_array_length(p_expected_prices) <> v_distinct
       or (select count(distinct (value ->> 'product_id'))
             from jsonb_array_elements(p_expected_prices)) <> v_distinct then
      raise exception 'The prices you saw could not be verified. Refresh the cart and try again.'
        using errcode = '22023';
    end if;

    for v_expected in select * from jsonb_array_elements(p_expected_prices) loop
      if (v_expected ->> 'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or (v_expected ->> 'unit_price_minor') !~ '^[0-9]+$' then
        raise exception 'The prices you saw could not be verified. Refresh the cart and try again.'
          using errcode = '22023';
      end if;
    end loop;

    for i in 1 .. coalesce(array_length(v_ok_pids, 1), 0) loop
      select (e.value ->> 'unit_price_minor')::int
        into v_expected_price
        from jsonb_array_elements(p_expected_prices) as e(value)
       where (e.value ->> 'product_id')::uuid = v_ok_pids[i];

      if v_expected_price is null then
        raise exception 'The prices you saw could not be verified. Refresh the cart and try again.'
          using errcode = '22023';
      end if;

      if v_expected_price <> v_ok_prices[i] then
        raise exception 'PRICE_CHANGED: The price of “%” changed since you saw it. Please confirm the new price.'
          , v_ok_names[i] using errcode = '23514';
      end if;
    end loop;

    if p_expected_total_minor <> v_subtotal then
      raise exception 'PRICE_CHANGED: The order total changed since you saw it. Please confirm the new total.'
        using errcode = '23514';
    end if;
  end if;

  -- ---------------------------------------------------------- write the order
  -- Reference collisions are astronomically unlikely; retry a few times rather
  -- than failing a real customer checkout.
  for v_attempt in 1..5 loop
    v_ref := 'GFT-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 12));

    begin
      insert into public.orders (
        user_id, status, payment_method, subtotal_minor, delivery_fee_minor, total_minor,
        recipient_name, contact_phone, contact_email, address_line, city, governorate, notes,
        idempotency_key, guest_token_hash, public_reference
      ) values (
        p_user_id, 'placed', 'cod', v_subtotal, 0, v_subtotal,
        trim(p_recipient_name), trim(p_contact_phone), v_email,
        trim(p_address_line), trim(p_city), trim(p_governorate),
        nullif(trim(p_notes), ''),
        p_idempotency_key, p_guest_token_hash, v_ref
      )
      returning id into v_order_id;

      exit;
    exception when unique_violation then
      if v_attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  if v_order_id is null then
    raise exception 'The order could not be placed.' using errcode = '23514';
  end if;

  -- ------------------------------------------- split into per-vendor suborders
  for v_vendor_id in select distinct vid from unnest(v_ok_vendors) as u(vid) loop
    select coalesce(sum(v_ok_prices[n] * v_ok_qtys[n]), 0)
      into v_ov_sub
      from generate_subscripts(v_ok_pids, 1) as g(n)
     where v_ok_vendors[n] = v_vendor_id;

    -- The vendor row is already locked above; read the rate after locking so a
    -- concurrent commission change cannot split the transaction's view.
    select commission_rate into v_rate from public.vendors where id = v_vendor_id;
    if v_rate is null then
      v_rate := 0;
    end if;

    insert into public.order_vendors (
      order_id, vendor_id, status, subtotal_minor, delivery_fee_minor, commission_rate
    ) values (
      v_order_id, v_vendor_id, 'placed', v_ov_sub, 0, v_rate
    )
    returning id into v_ov_id;

    for i in select n from generate_subscripts(v_ok_pids, 1) as g(n)
             where v_ok_vendors[n] = v_vendor_id
    loop
      insert into public.order_items (
        order_vendor_id, product_id, product_name, product_slug,
        unit_price_minor, quantity, line_total_minor
      ) values (
        v_ov_id, v_ok_pids[i], v_ok_names[i], v_ok_slugs[i],
        v_ok_prices[i], v_ok_qtys[i], v_ok_prices[i] * v_ok_qtys[i]
      );

      update public.products
         set stock = stock - v_ok_qtys[i]
       where id = v_ok_pids[i];

      insert into public.inventory_movements (product_id, delta, reason, order_id, created_by)
      values (v_ok_pids[i], -v_ok_qtys[i], 'order_placed', v_order_id, p_user_id);
    end loop;
  end loop;

  return v_order_id;
end;
$$;

comment on function public._create_order(
  uuid, jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int
) is
  'Single trusted order-creation implementation (P1-03, R-03, S-01, P0-67): expected prices are REQUIRED for carts with valid priced lines and must match the locked live prices or the order is refused with PRICE_CHANGED; a null expected price/total is a verification failure. Only place_order_with_price_check / place_guest_order_with_price_check can reach this function from an API role. Migration 67: a demo vendor (vendors.is_demo) is rejected inside the locked vendor loop unless app_settings.demo_orders_allowed is true.';
