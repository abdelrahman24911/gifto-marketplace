-- Rollback for 00000000000022_vendor_pause_checkout.sql.
--
-- Restores the pre-22 checkout function from migration 11 and removes the pause
-- column and public projection field. Orders placed while paused remain valid;
-- they are ordinary historical rows.
--
-- Refuse unless migration 23 has been rolled back. Remove the pause toggle and
-- paused-storefront UI before running this, otherwise the app will read a
-- column that no longer exists.

do $$
begin
  if to_regclass('public.support_requests') is not null then
    raise exception 'Refusing to roll back 22: roll back migration 23 first.';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'vendors'
       and column_name = 'is_accepting_orders'
  ) then
    raise exception 'Refusing to roll back 22: migration 22 is not applied.';
  end if;
end $$;

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

drop view if exists public.public_vendors;

create view public.public_vendors as
  select
    v.id,
    v.name,
    v.slug,
    v.description,
    v.logo_path,
    v.city,
    v.governorate,
    v.created_at,
    v.cover_path,
    v.working_hours,
    v.prep_time_min_days,
    v.prep_time_max_days
  from public.vendors v
  where v.status = 'active';

revoke all on table public.public_vendors from public, anon, authenticated;
grant select on table public.public_vendors to anon, authenticated;

alter table public.vendors
  drop column if exists is_accepting_orders;
