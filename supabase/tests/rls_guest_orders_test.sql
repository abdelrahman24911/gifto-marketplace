-- Gifto Phase 11 verification: guest checkout.
-- Runs after migrations 1–11 against a bare `supabase/postgres` container.
-- Any failure RAISEs and, with `psql -v ON_ERROR_STOP=1`, aborts non-zero.
--
-- The service role is the only caller allowed to reach `place_guest_order`,
-- `get_guest_order` and `consume_checkout_quota`. Tests therefore `set role
-- service_role` to simulate the server-only Next.js code path, and separately
-- assert that no weaker role can execute those functions.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Seed (as superuser; bypasses RLS)
-- ---------------------------------------------------------------------------
delete from public.orders;
delete from public.products where vendor_id = '41100000-0000-0000-0000-000000000101';
delete from public.vendors where id = '41100000-0000-0000-0000-000000000101';
delete from auth.users where email like '%@guest.gifto.test';

insert into auth.users (id, email) values
  ('31100000-0000-0000-0000-000000000101', 'admin@guest.gifto.test'),
  ('11100000-0000-0000-0000-000000000101', 'shopper@guest.gifto.test');

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = '31100000-0000-0000-0000-000000000101';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (id, name, slug, status, commission_rate) values
  ('41100000-0000-0000-0000-000000000101', 'Guest Shop', 'guest-shop', 'active', 0.1000);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('41100000-0000-0000-0000-000000000101', '31100000-0000-0000-0000-000000000101', 'owner');

insert into public.products (id, vendor_id, name, slug, price_minor, stock, status) values
  ('51100000-0000-0000-0000-000000000101', '41100000-0000-0000-0000-000000000101',
   'G One', 'g-one', 30000, 5, 'active'),
  ('51100000-0000-0000-0000-000000000102', '41100000-0000-0000-0000-000000000101',
   'G Two', 'g-two', 12000, 2, 'active'),
  ('51100000-0000-0000-0000-000000000103', '41100000-0000-0000-0000-000000000101',
   'G Draft', 'g-draft', 45000, 3, 'draft');

-- ---------------------------------------------------------------------------
-- TEST 1: the guest RPCs are executable only by service_role
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
begin
  for r in select unnest(array['anon', 'authenticated']) loop
    if has_function_privilege(r, 'public.place_guest_order(jsonb,text,text,text,text,text,text,text,uuid,text)', 'execute')
       or has_function_privilege(r, 'public.get_guest_order(uuid,text)', 'execute')
       or has_function_privilege(r, 'public.consume_checkout_quota(text,integer,integer)', 'execute') then
      raise exception 'TEST 1 FAILED: % can execute a guest/service-only function', r;
    end if;
  end loop;

  if has_function_privilege('authenticated', 'public._create_order(uuid,jsonb,text,text,text,text,text,text,text,uuid,text)', 'execute')
     or has_function_privilege('service_role', 'public._create_order(uuid,jsonb,text,text,text,text,text,text,text,uuid,text)', 'execute') then
    raise exception 'TEST 1 FAILED: _create_order is executable by an API role';
  end if;

  if not has_function_privilege('service_role', 'public.place_guest_order(jsonb,text,text,text,text,text,text,text,uuid,text)', 'execute') then
    raise exception 'TEST 1 FAILED: service_role cannot execute place_guest_order';
  end if;

  raise notice 'TEST 1 PASSED: guest RPCs are service_role-only and _create_order is private';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: a signed-in caller cannot use the guest path
-- ---------------------------------------------------------------------------
set role service_role;
set request.jwt.claim.sub = '31100000-0000-0000-0000-000000000101';
set request.jwt.claims = '{"sub":"31100000-0000-0000-0000-000000000101"}';
do $$
declare v_hash text := repeat('a', 64);
begin
  begin
    perform public.place_guest_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
      'Guest Buyer', '01001112233', null, '12 Main Street', 'Alexandria', 'Alexandria',
      null, gen_random_uuid(), v_hash);
    raise exception 'TEST 2 FAILED: guest checkout accepted a signed-in session';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 2 PASSED: guest checkout refuses a signed-in context';
end $$;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';

-- ---------------------------------------------------------------------------
-- TEST 3: a guest places a COD order with no Auth user
-- ---------------------------------------------------------------------------
do $$
declare
  v_hash   text := encode(digest('guest-token-one', 'sha256'), 'hex');
  v_key    uuid := gen_random_uuid();
  v_oid    uuid;
begin
  v_oid := public.place_guest_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1},
      {"product_id":"51100000-0000-0000-0000-000000000102","quantity":1}]'::jsonb,
    'Nour Guest', '01001112233', 'Nour@Example.com',
    '12 Main Street', 'Alexandria', 'Alexandria', 'Ring the bell',
    v_key, v_hash);

  if v_oid is null then
    raise exception 'TEST 3 FAILED: place_guest_order returned no id';
  end if;
  perform set_config('gifto_test.guest_order_id', v_oid::text, false);
  perform set_config('gifto_test.guest_hash', v_hash, false);
  perform set_config('gifto_test.guest_key', v_key::text, false);

  raise notice 'TEST 3a PASSED: place_guest_order returned an id';
end $$;

-- The assertions read the tables as the superuser (service_role has no RLS
-- bypass for SELECT here; the schema grants are what PostgREST uses).
reset role;
do $$
declare
  v_oid    uuid := current_setting('gifto_test.guest_order_id')::uuid;
  v_hash   text := current_setting('gifto_test.guest_hash');
  v_user   uuid;
  v_status public.order_status;
  v_pay    text;
  v_sub    int;
  v_total  int;
  v_subs   int;
  v_ref    text;
begin
  select user_id, status, payment_method, subtotal_minor, total_minor, public_reference
    into v_user, v_status, v_pay, v_sub, v_total, v_ref
    from public.orders where id = v_oid;

  if v_user is not null then
    raise exception 'TEST 3 FAILED: guest order has a user_id';
  end if;
  if v_status <> 'placed' or v_pay <> 'cod' then
    raise exception 'TEST 3 FAILED: status=% payment=%', v_status, v_pay;
  end if;
  -- 1 x 30000 + 1 x 12000 = 42000
  if v_sub <> 42000 or v_total <> 42000 then
    raise exception 'TEST 3 FAILED: subtotal=% total=%', v_sub, v_total;
  end if;
  if v_ref !~ '^GFT-[0-9A-F]{12}$' then
    raise exception 'TEST 3 FAILED: public_reference=%', v_ref;
  end if;
  if (select guest_token_hash from public.orders where id = v_oid) <> v_hash then
    raise exception 'TEST 3 FAILED: token hash not stored';
  end if;
  if (select lower(contact_email) from public.orders where id = v_oid) <> 'nour@example.com' then
    raise exception 'TEST 3 FAILED: contact email not normalised';
  end if;

  select count(*) into v_subs from public.order_vendors where order_id = v_oid;
  if v_subs <> 1 then
    raise exception 'TEST 3 FAILED: % suborders (expected 1)', v_subs;
  end if;

  -- commission snapshot and stock decrement still apply to guest orders
  if (select commission_rate from public.order_vendors where order_id = v_oid) <> 0.10 then
    raise exception 'TEST 3 FAILED: commission not snapshotted';
  end if;
  if (select stock from public.products where id = '51100000-0000-0000-0000-000000000101') <> 4 then
    raise exception 'TEST 3 FAILED: stock not decremented';
  end if;
  if (select count(*) from public.inventory_movements where order_id = v_oid) <> 2 then
    raise exception 'TEST 3 FAILED: inventory movements not recorded';
  end if;

  raise notice 'TEST 3 PASSED: guest order created with no Auth user, priced from the catalog';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: a cart line without a product id is rejected outright
-- ---------------------------------------------------------------------------
set role service_role;
do $$
declare v_hash text := encode(digest('guest-token-bad', 'sha256'), 'hex');
begin
  begin
    perform public.place_guest_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1},
        {"quantity":1}]'::jsonb,
      'Nour Guest', '01001112233', null,
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      gen_random_uuid(), v_hash);
    raise exception 'TEST 4 FAILED: a cart line without a product id was accepted';
  exception when others then
    if sqlstate <> '22023' or sqlerrm not like '%invalid product%' then
      raise;
    end if;
  end;
  raise notice 'TEST 4 PASSED: malformed cart lines reject the whole checkout';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: idempotent retry returns the same order
-- ---------------------------------------------------------------------------
set role service_role;
do $$
declare
  v_key uuid := current_setting('gifto_test.guest_key')::uuid;
  v_hash text := current_setting('gifto_test.guest_hash');
  v_first uuid := current_setting('gifto_test.guest_order_id')::uuid;
  v_again uuid;
begin
  v_again := public.place_guest_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1},
      {"product_id":"51100000-0000-0000-0000-000000000102","quantity":1}]'::jsonb,
    'Nour Guest', '01001112233', null,
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    v_key, v_hash);

  if v_again <> v_first then
    raise exception 'TEST 5 FAILED: retry created a second order';
  end if;
  raise notice 'TEST 5a PASSED: retry returned the same order id';
end $$;

reset role;
do $$
declare v_first uuid := current_setting('gifto_test.guest_order_id')::uuid; v_stock int;
begin
  if (select count(*) from public.orders) <> 1 then
    raise exception 'TEST 5 FAILED: % orders after a retry', (select count(*) from public.orders);
  end if;
  v_stock := (select stock from public.products where id = '51100000-0000-0000-0000-000000000101');
  if v_stock <> 4 then
    raise exception 'TEST 5 FAILED: retry double-decremented stock (stock=%)', v_stock;
  end if;
  raise notice 'TEST 5 PASSED: retry with the same key returned the same order';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: the same key with a different token hash is rejected
-- ---------------------------------------------------------------------------
set role service_role;
do $$
declare
  v_key uuid := current_setting('gifto_test.guest_key')::uuid;
begin
  begin
    perform public.place_guest_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
      'Nour Guest', '01001112233', null,
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      v_key, encode(digest('some-other-token', 'sha256'), 'hex'));
    raise exception 'TEST 6 FAILED: key reuse with another token was accepted';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 6 PASSED: idempotency key cannot be hijacked by another caller';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 7: get_guest_order requires the correct token hash
-- ---------------------------------------------------------------------------
do $$
declare
  v_oid uuid := current_setting('gifto_test.guest_order_id')::uuid;
  v_good text := current_setting('gifto_test.guest_hash');
  v_doc jsonb;
begin
  v_doc := public.get_guest_order(v_oid, v_good);
  if v_doc is null then
    raise exception 'TEST 7 FAILED: correct token hash returned no order';
  end if;
  if v_doc ->> 'id' <> v_oid::text then
    raise exception 'TEST 7 FAILED: returned the wrong order';
  end if;
  if (v_doc -> 'vendors' -> 0 ->> 'vendor_name') <> 'Guest Shop' then
    raise exception 'TEST 7 FAILED: vendor details missing';
  end if;
  if jsonb_array_length(v_doc -> 'vendors' -> 0 -> 'items') <> 2 then
    raise exception 'TEST 7 FAILED: item details missing';
  end if;

  -- never leak privileged/secret fields
  if v_doc ? 'guest_token_hash' or v_doc ? 'idempotency_key' or v_doc ? 'user_id' then
    raise exception 'TEST 7 FAILED: response leaks internal columns';
  end if;
  if (v_doc ->> 'contact_email') is not null then
    raise exception 'TEST 7 FAILED: unexpected field in payload';
  end if;

  -- a wrong or malformed hash yields nothing
  if public.get_guest_order(v_oid, encode(digest('wrong', 'sha256'), 'hex')) is not null then
    raise exception 'TEST 7 FAILED: wrong token hash returned an order';
  end if;
  if public.get_guest_order(v_oid, 'not-a-hash') is not null then
    raise exception 'TEST 7 FAILED: malformed token hash returned an order';
  end if;

  raise notice 'TEST 7 PASSED: guest confirmation is token-gated and leaks no secrets';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 8: the service role cannot read a guest order without the token hash
-- via the generic table path (guests are opaque to other RPCs is out of scope;
-- this asserts the RPC gate is the access control, and anon/authenticated have
-- no table access at all)
-- ---------------------------------------------------------------------------
reset role;
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare v_oid uuid;
begin
  v_oid := current_setting('gifto_test.guest_order_id')::uuid;
  begin
    perform count(*) from public.orders where id = v_oid;
    raise exception 'TEST 8 FAILED: anon read a guest order';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.get_guest_order(v_oid, current_setting('gifto_test.guest_hash'));
    raise exception 'TEST 8 FAILED: anon called get_guest_order';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 8 PASSED: anon cannot read or retrieve a guest order';
end $$;

set role authenticated;
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000101';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000101"}';
do $$
declare v_oid uuid; v_seen int;
begin
  v_oid := current_setting('gifto_test.guest_order_id')::uuid;
  select count(*) into v_seen from public.orders where id = v_oid;
  if v_seen <> 0 then
    raise exception 'TEST 8 FAILED: a signed-in customer sees a guest order';
  end if;
  begin
    perform public.get_guest_order(v_oid, current_setting('gifto_test.guest_hash'));
    raise exception 'TEST 8 FAILED: authenticated called get_guest_order';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 8 PASSED: authenticated users cannot see or retrieve a guest order';
end $$;

-- The platform admin still has oversight of guest orders.
set request.jwt.claim.sub = '31100000-0000-0000-0000-000000000101';
set request.jwt.claims = '{"sub":"31100000-0000-0000-0000-000000000101"}';
do $$
declare v_oid uuid; v_seen int;
begin
  v_oid := current_setting('gifto_test.guest_order_id')::uuid;
  select count(*) into v_seen from public.orders where id = v_oid;
  if v_seen <> 1 then
    raise exception 'TEST 8 FAILED: platform admin cannot see a guest order';
  end if;
  raise notice 'TEST 8 PASSED: platform admin retains full oversight';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 9: guest checkout rejects invalid contact details and payloads
-- ---------------------------------------------------------------------------
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare v_hash text := encode(digest('guest-token-two', 'sha256'), 'hex');
begin
  -- message that is not valid JSON / not an array
  begin
    perform public.place_guest_order(
      '"nope"'::jsonb, 'Guest', '01001112233', null,
      '12 Main Street', 'Alexandria', 'Alexandria', null, gen_random_uuid(), v_hash);
    raise exception 'TEST 9a FAILED: accepted a non-array cart';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;

  -- invalid email
  begin
    perform public.place_guest_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
      'Guest', '01001112233', 'not-an-email',
      '12 Main Street', 'Alexandria', 'Alexandria', null, gen_random_uuid(), v_hash);
    raise exception 'TEST 9b FAILED: accepted an invalid email';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;

  -- missing recipient
  begin
    perform public.place_guest_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
      'G', '01001112233', null,
      '12 Main Street', 'Alexandria', 'Alexandria', null, gen_random_uuid(), v_hash);
    raise exception 'TEST 9c FAILED: accepted a short recipient name';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;

  -- invalid token hash
  begin
    perform public.place_guest_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
      'Guest Buyer', '01001112233', null,
      '12 Main Street', 'Alexandria', 'Alexandria', null, gen_random_uuid(), 'XYZ');
    raise exception 'TEST 9d FAILED: accepted a malformed token hash';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;

  -- oversized quantity
  begin
    perform public.place_guest_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":999}]'::jsonb,
      'Guest Buyer', '01001112233', null,
      '12 Main Street', 'Alexandria', 'Alexandria', null, gen_random_uuid(), v_hash);
    raise exception 'TEST 9e FAILED: accepted an oversized quantity';
  exception when others then
    if sqlstate not in ('22023') then raise; end if;
  end;

  raise notice 'TEST 9a PASSED: invalid guest payloads are rejected';
end $$;

reset role;
do $$
begin
  if (select count(*) from public.orders) <> 1 then
    raise exception 'TEST 9 FAILED: a rejected guest checkout created an order';
  end if;

  raise notice 'TEST 9 PASSED: invalid guest payloads are rejected with no side effects';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 10: a client-supplied price is ignored
-- ---------------------------------------------------------------------------
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-token-three', 'sha256'), 'hex');
  v_oid uuid;
begin
  v_oid := public.place_guest_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1,"price_minor":1,"total_minor":1}]'::jsonb,
    'Guest Buyer', '01001112233', null,
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(), v_hash);

  perform set_config('gifto_test.price_order_id', v_oid::text, false);
  raise notice 'TEST 10a PASSED: order with a client price field was accepted';
end $$;

reset role;
do $$
declare
  v_oid uuid := current_setting('gifto_test.price_order_id')::uuid;
  v_price int;
begin
  select i.unit_price_minor into v_price
    from public.order_items i
    join public.order_vendors v on v.id = i.order_vendor_id
   where v.order_id = v_oid;

  if v_price <> 30000 then
    raise exception 'TEST 10 FAILED: client price leaked (unit_price=%)', v_price;
  end if;
  if (select total_minor from public.orders where id = v_oid) <> 30000 then
    raise exception 'TEST 10 FAILED: client total leaked';
  end if;
  raise notice 'TEST 10 PASSED: prices and totals are always taken from the catalog';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 11: the checkout quota increments and reports a windowed count
-- ---------------------------------------------------------------------------
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_bucket text := repeat('b', 64);
  v_first int;
  v_second int;
  v_third int;
begin
  v_first := public.consume_checkout_quota(v_bucket, 2, 3600);
  v_second := public.consume_checkout_quota(v_bucket, 2, 3600);
  v_third := public.consume_checkout_quota(v_bucket, 2, 3600);

  if v_first <> 1 or v_second <> 2 or v_third <> 3 then
    raise exception 'TEST 11 FAILED: counts % % %', v_first, v_second, v_third;
  end if;

  -- another bucket is independent
  if public.consume_checkout_quota(repeat('c', 64), 2, 3600) <> 1 then
    raise exception 'TEST 11 FAILED: buckets are not isolated';
  end if;

  raise notice 'TEST 11a PASSED: checkout quota is per-bucket and windowed';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 12: the quota table is not reachable by weaker roles
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  if has_table_privilege('anon', 'public.checkout_rate_limits', 'select')
     or has_table_privilege('authenticated', 'public.checkout_rate_limits', 'select')
     or has_table_privilege('anon', 'public.checkout_rate_limits', 'insert')
     or has_table_privilege('authenticated', 'public.checkout_rate_limits', 'update') then
    raise exception 'TEST 12 FAILED: a weaker role holds privileges on checkout_rate_limits';
  end if;

  if (select attempts from public.checkout_rate_limits where bucket = repeat('b', 64)) <> 3 then
    raise exception 'TEST 12 FAILED: persisted quota count is wrong';
  end if;

  raise notice 'TEST 12 PASSED: checkout_rate_limits is service-role only and persisted';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 13: the authenticated checkout path still works and is unchanged
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '31100000-0000-0000-0000-000000000101';
set request.jwt.claims = '{"sub":"31100000-0000-0000-0000-000000000101"}';
do $$
declare
  v_oid uuid;
  v_user uuid;
  v_key uuid := gen_random_uuid();
  v_again uuid;
begin
  v_oid := public.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
    'Owner Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria', null);

  select user_id into v_user from public.orders where id = v_oid;
  if v_user <> '31100000-0000-0000-0000-000000000101' then
    raise exception 'TEST 13 FAILED: place_order did not attach the signed-in user';
  end if;
  if (select guest_token_hash from public.orders where id = v_oid) is not null then
    raise exception 'TEST 13 FAILED: authenticated order stored a guest token hash';
  end if;

  -- the idempotent variant returns the same order for the same key
  v_again := public.place_order_with_idempotency(
    '[{"product_id":"51100000-0000-0000-0000-000000000102","quantity":1}]'::jsonb,
    'Owner Buyer', '01001112233', null, '12 Main Street', 'Alexandria', 'Alexandria',
    null, v_key);
  if public.place_order_with_idempotency(
    '[{"product_id":"51100000-0000-0000-0000-000000000102","quantity":1}]'::jsonb,
    'Owner Buyer', '01001112233', null, '12 Main Street', 'Alexandria', 'Alexandria',
    null, v_key) <> v_again then
    raise exception 'TEST 13 FAILED: authenticated idempotent retry created a second order';
  end if;

  raise notice 'TEST 13 PASSED: authenticated checkout behaviour is unchanged';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 14: anon still cannot call the authenticated checkout RPCs
-- ---------------------------------------------------------------------------
reset role;
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
begin
  begin
    perform public.place_order_with_idempotency(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
      'Anon', '01001112233', null, '12 Main Street', 'Alexandria', 'Alexandria',
      null, gen_random_uuid());
    raise exception 'TEST 14 FAILED: anon called place_order_with_idempotency';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 14 PASSED: anon cannot reach the authenticated checkout RPC';
end $$;

reset role;
