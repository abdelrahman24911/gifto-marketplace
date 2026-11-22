-- Rollback for 00000000000034_price_change_consent.sql.
--
-- Drops the price-check wrappers and restores the migration-22 definition
-- of _create_order (11 arguments, no price check, vendor pause check
-- intact). Checkout reverts to live-price-only ordering, as before P1-03.
-- No order data is altered.

drop function if exists public.place_guest_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int
);
drop function if exists public.place_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, jsonb, int
);
drop function if exists public._create_order(
  uuid, jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int
);

-- The 11-argument wrapper defined by migration 34 delegates to the dropped
-- 13-argument version, so it must be restored to the migration-22 body
-- (migration 22 added the vendor pause check on top of migration 11).
-- (Full body copied from supabase/migrations/00000000000022_vendor_pause_checkout.sql.)
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
  p_guest_token_hash text
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
  v_rate       numeric(5,4);
  v_ov_id      uuid;
  v_ov_sub     int;
  v_email      text;
  v_ref        text;
  v_attempt    int;
  v_existing_id   uuid;
  v_existing_user uuid;
  v_existing_hash text;
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
  -- Product locks come first (above), then vendor locks in id order. This both
  -- avoids deadlocks and makes the pause check authoritative: a concurrent
  -- owner toggle must wait for this transaction, so it cannot slip between the
  -- check and the order insert.
  for v_vendor_id in
    select distinct vid from unnest(v_ok_vendors) as u(vid) order by vid
  loop
    select v.name, v.status, v.is_accepting_orders
      into v_vendor_name, v_vendor_status, v_accepting
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
  end loop;

  select coalesce(sum(t.price * t.qty), 0)
    into v_subtotal
    from unnest(v_ok_prices, v_ok_qtys) as t(price, qty);

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

revoke all on function public._create_order(
  uuid, jsonb, text, text, text, text, text, text, text, uuid, text
) from public, anon, authenticated, service_role;
