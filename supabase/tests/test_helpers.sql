-- Test-only order-creation helpers (R-03, migration 51).
--
-- Loaded by scripts/run-rls-suites.sh and the concurrency runners AFTER all
-- migrations, before each suite. NEVER apply this file to a hosted project:
-- these helpers exist only so the RLS suites can create orders through the
-- only checkout path a real caller can reach (the price-check RPCs), after
-- migration 51 dropped the legacy no-check RPCs (place_order,
-- place_order_with_idempotency, place_guest_order).
--
-- Each helper mirrors one dropped legacy signature, builds the expected
-- prices from the LIVE product rows at call time, and calls the matching
-- price-check RPC with a fresh (or the caller's) idempotency key. If any
-- cart item's product is missing from the products table, or an item id
-- is not a UUID, the helper passes NULL expected prices so _create_order's
-- own validation ("no longer available" / "invalid product") fires instead
-- of a misleading PRICE_CHANGED. For an empty cart it likewise passes
-- NULL, so the "Your cart is empty" check fires.
--
-- The helpers are SECURITY DEFINER: they run as the migration role, so a
-- test that did SET ROLE authenticated / service_role can still call them,
-- and auth.uid() is read from the test's request.jwt.claim.sub GUC exactly
-- as the price-check RPCs read it. Grant is limited to the two API roles
-- the suites use; anon has no EXECUTE on them.

create schema if not exists gifto_test;

-- The suites SET ROLE authenticated / service_role before calling the
-- helpers, so those roles need USAGE on this schema as well as EXECUTE
-- on the individual functions.
grant usage on schema gifto_test to authenticated, service_role;

-- Build the expected-prices payload for a cart, or NULL when the cart
-- cannot be priced (empty, or an item whose product does not exist).
create or replace function gifto_test._expected_prices(
  p_items jsonb,
  out p_expected jsonb,
  out p_total int
)
language plpgsql
as $$
declare
  v_distinct int;
  v_matched  int;
begin
  p_expected := null;
  p_total := null;

  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
     or jsonb_array_length(p_items) = 0 then
    return;
  end if;

  select count(distinct (e.value ->> 'product_id'))
    into v_distinct
    from jsonb_array_elements(p_items) as e;

  -- Only UUID-shaped ids are cast: the regex filter runs in a CTE first,
  -- so a malformed id can never raise a cast error here — _create_order
  -- reports it with its own "invalid product" message instead.
  select count(distinct v.pid)
    into v_matched
    from (
      select (e.value ->> 'product_id')::uuid as pid
        from jsonb_array_elements(p_items) as e
       where (e.value ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) as v
    join public.products p on p.id = v.pid;

  if v_matched is distinct from v_distinct then
    return;
  end if;

  select
    jsonb_agg(jsonb_build_object(
      'product_id', p.id,
      'unit_price_minor', p.price_minor
    ) order by p.id),
    sum(p.price_minor * (e.value ->> 'quantity')::int)
    into p_expected, p_total
    from jsonb_array_elements(p_items) as e
    join public.products p
      on p.id = (e.value ->> 'product_id')::uuid;
end;
$$;

revoke all on function gifto_test._expected_prices(jsonb)
  from public, anon, authenticated, service_role;

-- Signed-in checkout, mirroring the dropped place_order (7 arguments).
create or replace function gifto_test.place_order(
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
set search_path = public, gifto_test
as $$
declare
  v_expected jsonb;
  v_total    int;
begin
  select * into v_expected, v_total
    from gifto_test._expected_prices(p_items);

  return public.place_order_with_price_check(
    p_items, p_recipient_name, p_contact_phone, null,
    p_address_line, p_city, p_governorate, p_notes,
    gen_random_uuid(), v_expected, v_total
  );
end;
$$;

revoke all on function gifto_test.place_order(jsonb, text, text, text, text, text, text)
  from public, anon;
grant execute on function gifto_test.place_order(jsonb, text, text, text, text, text, text)
  to authenticated, service_role;

-- Signed-in checkout with an idempotency key, mirroring the dropped
-- place_order_with_idempotency (9 arguments).
create or replace function gifto_test.place_order_with_idempotency(
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
set search_path = public, gifto_test
as $$
declare
  v_expected jsonb;
  v_total    int;
begin
  select * into v_expected, v_total
    from gifto_test._expected_prices(p_items);

  return public.place_order_with_price_check(
    p_items, p_recipient_name, p_contact_phone, p_contact_email,
    p_address_line, p_city, p_governorate, p_notes,
    p_idempotency_key, v_expected, v_total
  );
end;
$$;

revoke all on function gifto_test.place_order_with_idempotency(
  jsonb, text, text, text, text, text, text, text, uuid
) from public, anon;
grant execute on function gifto_test.place_order_with_idempotency(
  jsonb, text, text, text, text, text, text, text, uuid
) to authenticated, service_role;

-- Guest checkout, mirroring the dropped place_guest_order (10 arguments).
create or replace function gifto_test.place_guest_order(
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
set search_path = public, gifto_test
as $$
declare
  v_expected jsonb;
  v_total    int;
begin
  select * into v_expected, v_total
    from gifto_test._expected_prices(p_items);

  return public.place_guest_order_with_price_check(
    p_items, p_recipient_name, p_contact_phone, p_contact_email,
    p_address_line, p_city, p_governorate, p_notes,
    p_idempotency_key, p_guest_token_hash, v_expected, v_total
  );
end;
$$;

revoke all on function gifto_test.place_guest_order(
  jsonb, text, text, text, text, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function gifto_test.place_guest_order(
  jsonb, text, text, text, text, text, text, text, uuid, text
) to service_role;
