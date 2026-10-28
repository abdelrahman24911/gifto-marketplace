-- Gifto Marketplace — Guest checkout
--
-- Adds the minimum data needed for secure guest COD checkout:
--   * optional customer contact email
--   * SHA-256 hash of a high-entropy guest access token (the raw token never
--     reaches the database; it lives only in an HttpOnly cookie)
--   * a caller-supplied idempotency key with a database-enforced unique index
--   * a human-readable public order reference
--   * a small, Postgres-backed checkout quota table for abuse protection
--
-- The trusted order-creation logic is moved into the private helper
-- `_create_order`, which both the existing authenticated RPC and the new
-- service-role-only guest RPC call. No money/stock/commission logic is
-- duplicated and the existing `place_order` signature and behaviour are kept.
--
-- Security boundary:
--   * anon and authenticated keep zero INSERT/UPDATE/DELETE privileges on the
--     order group; no RLS policy is added or weakened.
--   * `place_guest_order`, `get_guest_order` and `consume_checkout_quota` are
--     executable only by `service_role`, which is used exclusively from
--     server-only Next.js code (Server Actions / Server Components).
--   * `get_guest_order` additionally requires the SHA-256 hash of the guest's
--     access token, so an order UUID alone is never sufficient.
--   * `_create_order` is not executable by any API role.

-- ---------------------------------------------------------------------------
-- Orders: guest checkout columns
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists contact_email     text,
  add column if not exists guest_token_hash  text,
  add column if not exists idempotency_key   uuid,
  add column if not exists public_reference  text;

alter table public.orders
  add constraint orders_contact_email_check check (
    contact_email is null
    or (
      length(contact_email) <= 254
      and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  );

-- Only a 64-character lowercase hex SHA-256 digest is accepted. The raw token
-- is never stored, so a database leak cannot be replayed as an order credential.
alter table public.orders
  add constraint orders_guest_token_hash_check check (
    guest_token_hash is null
    or guest_token_hash ~ '^[0-9a-f]{64}$'
  );

alter table public.orders
  add constraint orders_public_reference_check check (
    public_reference is null
    or public_reference ~ '^GFT-[0-9A-F]{12}$'
  );

-- Idempotency is enforced by the database, not only by the UI. The partial
-- index keeps existing rows (which have no key) valid.
create unique index if not exists orders_idempotency_key_uidx
  on public.orders (idempotency_key)
  where idempotency_key is not null;

create unique index if not exists orders_public_reference_uidx
  on public.orders (public_reference)
  where public_reference is not null;

-- Give historical orders a stable, human-readable reference without changing
-- any existing column or constraint. 48 bits of md5 is ample for a reference
-- that is not a security credential.
update public.orders
   set public_reference = 'GFT-' || upper(substr(md5(id::text), 1, 12))
 where public_reference is null;

comment on column public.orders.contact_email is
  'Optional customer email. Never used for authentication; guest orders may have none.';
comment on column public.orders.guest_token_hash is
  'SHA-256 hex digest of the guest access token. Raw token is never stored.';
comment on column public.orders.idempotency_key is
  'Client attempt key; unique across orders so a retry returns the same order.';
comment on column public.orders.public_reference is
  'Customer-facing order reference (GFT-XXXXXXXXXXXX). Not an access credential.';

-- ---------------------------------------------------------------------------
-- Checkout quota — distributed, Postgres-backed abuse protection
-- ---------------------------------------------------------------------------

create table if not exists public.checkout_rate_limits (
  bucket        text primary key,
  window_start  timestamptz not null default now(),
  attempts      integer not null default 0 check (attempts >= 0)
);

alter table public.checkout_rate_limits enable row level security;

-- No policies: only the service role (which bypasses RLS) needs this table.
revoke all on table public.checkout_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.checkout_rate_limits to service_role;

-- Returns the attempt count inside the current window and records the attempt.
-- The caller (server action) compares it with its limit, so the increment is
-- committed even when the request is rejected. Buckets are SHA-256 hashes of
-- the caller IP, never raw addresses.
create or replace function public.consume_checkout_quota(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
begin
  if p_bucket is null or length(p_bucket) not between 16 and 128 then
    raise exception 'Invalid checkout bucket.' using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Invalid checkout limit.' using errcode = '22023';
  end if;

  if p_window_seconds is null or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'Invalid checkout window.' using errcode = '22023';
  end if;

  -- Opportunistic cleanup keeps the table tiny without a scheduled job.
  delete from public.checkout_rate_limits
   where window_start < now() - interval '2 days';

  insert into public.checkout_rate_limits (bucket, window_start, attempts)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set attempts = case
          when public.checkout_rate_limits.window_start
               < now() - make_interval(secs => p_window_seconds)
            then 1
          else public.checkout_rate_limits.attempts + 1
        end,
        window_start = case
          when public.checkout_rate_limits.window_start
               < now() - make_interval(secs => p_window_seconds)
            then now()
          else public.checkout_rate_limits.window_start
        end
  returning attempts into v_attempts;

  return v_attempts;
end;
$$;

revoke all on function public.consume_checkout_quota(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_checkout_quota(text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- _create_order — the single trusted order-creation implementation
--
-- `p_user_id` is supplied only by the private wrappers below, never by an API
-- client. Prices, availability, stock, splits, commission rates and totals are
-- all read from the database under row locks.
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

-- Private helper: only the wrappers below (owned by the migration role) may
-- execute it. No API role has EXECUTE, so PostgREST cannot expose it.
revoke all on function public._create_order(
  uuid, jsonb, text, text, text, text, text, text, text, uuid, text
) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Existing authenticated checkout — unchanged public signature and behaviour
-- ---------------------------------------------------------------------------

create or replace function public.place_order(
  p_items jsonb,
  p_recipient_name text,
  p_contact_phone text,
  p_address_line text,
  p_city text,
  p_governorate text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to place an order.'
      using errcode = '42501';
  end if;

  return public._create_order(
    v_uid, p_items, p_recipient_name, p_contact_phone, null,
    p_address_line, p_city, p_governorate, p_notes, null, null
  );
end;
$$;

revoke all on function public.place_order(jsonb, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text, text, text)
  to authenticated;

-- Authenticated checkout with an idempotency key (used by the current Server
-- Action). Kept separate so the long-standing 7-argument signature is stable.
create or replace function public.place_order_with_idempotency(
  p_items jsonb,
  p_recipient_name text,
  p_contact_phone text,
  p_contact_email text,
  p_address_line text,
  p_city text,
  p_governorate text,
  p_notes text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to place an order.'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'A checkout attempt key is required.' using errcode = '22023';
  end if;

  return public._create_order(
    v_uid, p_items, p_recipient_name, p_contact_phone, p_contact_email,
    p_address_line, p_city, p_governorate, p_notes, p_idempotency_key, null
  );
end;
$$;

revoke all on function public.place_order_with_idempotency(
  jsonb, text, text, text, text, text, text, text, uuid
) from public, anon;
grant execute on function public.place_order_with_idempotency(
  jsonb, text, text, text, text, text, text, text, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- Guest checkout — service-role only, no Auth user is created
-- ---------------------------------------------------------------------------

create or replace function public.place_guest_order(
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
set search_path = public
as $$
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

  return public._create_order(
    null, p_items, p_recipient_name, p_contact_phone, p_contact_email,
    p_address_line, p_city, p_governorate, p_notes,
    p_idempotency_key, p_guest_token_hash
  );
end;
$$;

revoke all on function public.place_guest_order(
  jsonb, text, text, text, text, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.place_guest_order(
  jsonb, text, text, text, text, text, text, text, uuid, text
) to service_role;

-- ---------------------------------------------------------------------------
-- Guest confirmation — token-hash gated, service-role only
-- ---------------------------------------------------------------------------

create or replace function public.get_guest_order(
  p_order_id uuid,
  p_token_hash text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'reference', o.public_reference,
    'status', o.status,
    'currency', o.currency,
    'subtotal_minor', o.subtotal_minor,
    'delivery_fee_minor', o.delivery_fee_minor,
    'total_minor', o.total_minor,
    'recipient_name', o.recipient_name,
    'contact_phone', o.contact_phone,
    'address_line', o.address_line,
    'city', o.city,
    'governorate', o.governorate,
    'notes', o.notes,
    'created_at', o.created_at,
    'vendors', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ov.id,
          'status', ov.status,
          'subtotal_minor', ov.subtotal_minor,
          'vendor_name', v.name,
          'vendor_slug', v.slug,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'product_name', i.product_name,
                'product_slug', i.product_slug,
                'unit_price_minor', i.unit_price_minor,
                'quantity', i.quantity,
                'line_total_minor', i.line_total_minor
              )
              order by i.created_at, i.id
            )
            from public.order_items i
            where i.order_vendor_id = ov.id
          ), '[]'::jsonb)
        )
        order by ov.created_at, ov.id
      )
      from public.order_vendors ov
      join public.vendors v on v.id = ov.vendor_id
      where ov.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id
    and o.guest_token_hash is not null
    and o.guest_token_hash = lower(p_token_hash)
    and p_token_hash ~ '^[0-9a-f]{64}$';
$$;

revoke all on function public.get_guest_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_guest_order(uuid, text)
  to service_role;
