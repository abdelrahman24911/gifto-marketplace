-- Gifto Phase 11 verification: guest checkout.
-- Runs after all migrations (1–18) against a bare `supabase/postgres` container.
-- Any failure RAISEs and, with `psql -v ON_ERROR_STOP=1`, aborts non-zero.
--
-- The service role is the only caller allowed to reach `place_guest_order`,
-- `get_guest_order` and `consume_checkout_quota`. Tests therefore `set role
-- service_role` to simulate the server-only Next.js code path, and separately
-- assert that no weaker role can execute those functions.

\set ON_ERROR_STOP on

-- Safety: this suite is destructive. Require an explicitly disposable database
-- and roll everything back even when the suite succeeds.
do $$
begin
  if current_setting('gifto.rls_test_disposable', true) is distinct from 'yes' then
    raise exception 'Refusing to run destructive RLS tests. Start a disposable database and SET gifto.rls_test_disposable = ''yes'' in the same psql session.';
  end if;
end $$;

begin;

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
    if has_function_privilege(r, 'public.get_guest_order(uuid,text)', 'execute')
       or has_function_privilege(r, 'public.consume_checkout_quota(text,integer,integer)', 'execute') then
      raise exception 'TEST 1 FAILED: % can execute a guest/service-only function', r;
    end if;
  end loop;

  -- R-03: the legacy 11-argument _create_order wrapper is dropped
  -- (migration 57), so it must not exist at all — and the surviving
  -- 13-argument price-checked implementation stays private to the
  -- migration role (no API role may execute it).
  if to_regprocedure('public._create_order(uuid,jsonb,text,text,text,text,text,text,text,uuid,text)') is not null then
    raise exception 'TEST 1 FAILED: legacy 11-arg _create_order still exists';
  end if;

  if has_function_privilege('anon', 'public._create_order(uuid,jsonb,text,text,text,text,text,text,text,uuid,text,jsonb,int)', 'execute')
     or has_function_privilege('authenticated', 'public._create_order(uuid,jsonb,text,text,text,text,text,text,text,uuid,text,jsonb,int)', 'execute')
     or has_function_privilege('service_role', 'public._create_order(uuid,jsonb,text,text,text,text,text,text,text,uuid,text,jsonb,int)', 'execute') then
    raise exception 'TEST 1 FAILED: _create_order is executable by an API role';
  end if;

  -- R-03: the legacy no-check place_guest_order is dropped (migration 51);
  -- no API role can execute it, and the price-check guest RPC is the only
  -- guest checkout path, executable by service_role only.
  if to_regprocedure('public.place_guest_order(jsonb,text,text,text,text,text,text,text,uuid,text)') is not null then
    raise exception 'TEST 1 FAILED: legacy place_guest_order still exists';
  end if;

  if not has_function_privilege('service_role', 'public.place_guest_order_with_price_check(jsonb,text,text,text,text,text,text,text,uuid,text,jsonb,int,boolean,text,date,text)', 'execute') then
    raise exception 'TEST 1 FAILED: service_role cannot execute place_guest_order_with_price_check';
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
    perform gifto_test.place_guest_order(
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
  v_oid := gifto_test.place_guest_order(
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
    perform gifto_test.place_guest_order(
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
  v_again := gifto_test.place_guest_order(
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
    perform gifto_test.place_guest_order(
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
-- TEST 7b (P1-15, H-08): the guest order payload carries the handover record
-- once the shop ships with courier and tracking.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '31100000-0000-0000-0000-000000000101';
set request.jwt.claims = '{"sub":"31100000-0000-0000-0000-000000000101"}';
do $$
declare
  v_oid uuid := current_setting('gifto_test.guest_order_id')::uuid;
  v_ov uuid;
begin
  select id into v_ov from public.order_vendors where order_id = v_oid;
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(
    v_ov, 'shipped', 'confirmed', null, null, 'Bosta', 'BST-77881');
end $$;

reset role;
set role service_role;
do $$
declare
  v_oid uuid := current_setting('gifto_test.guest_order_id')::uuid;
  v_doc jsonb;
begin
  v_doc := public.get_guest_order(v_oid, current_setting('gifto_test.guest_hash'));
  if (v_doc -> 'vendors' -> 0 ->> 'courier_name') <> 'Bosta' then
    raise exception 'TEST 7b FAILED: guest payload has no courier';
  end if;
  if (v_doc -> 'vendors' -> 0 ->> 'tracking_ref') <> 'BST-77881' then
    raise exception 'TEST 7b FAILED: guest payload has no tracking reference';
  end if;
  if (v_doc -> 'vendors' -> 0 ->> 'handed_over_at') is null then
    raise exception 'TEST 7b FAILED: guest payload has no handover time';
  end if;
  raise notice 'TEST 7b PASSED: guest order shows courier, tracking and handover time';
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
    perform gifto_test.place_guest_order(
      '"nope"'::jsonb, 'Guest', '01001112233', null,
      '12 Main Street', 'Alexandria', 'Alexandria', null, gen_random_uuid(), v_hash);
    raise exception 'TEST 9a FAILED: accepted a non-array cart';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;

  -- invalid email
  begin
    perform gifto_test.place_guest_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
      'Guest', '01001112233', 'not-an-email',
      '12 Main Street', 'Alexandria', 'Alexandria', null, gen_random_uuid(), v_hash);
    raise exception 'TEST 9b FAILED: accepted an invalid email';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;

  -- missing recipient
  begin
    perform gifto_test.place_guest_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
      'G', '01001112233', null,
      '12 Main Street', 'Alexandria', 'Alexandria', null, gen_random_uuid(), v_hash);
    raise exception 'TEST 9c FAILED: accepted a short recipient name';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;

  -- invalid token hash
  begin
    perform gifto_test.place_guest_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
      'Guest Buyer', '01001112233', null,
      '12 Main Street', 'Alexandria', 'Alexandria', null, gen_random_uuid(), 'XYZ');
    raise exception 'TEST 9d FAILED: accepted a malformed token hash';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;

  -- oversized quantity
  begin
    perform gifto_test.place_guest_order(
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
  v_oid := gifto_test.place_guest_order(
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
  v_oid := gifto_test.place_order(
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
  v_again := gifto_test.place_order_with_idempotency(
    '[{"product_id":"51100000-0000-0000-0000-000000000102","quantity":1}]'::jsonb,
    'Owner Buyer', '01001112233', null, '12 Main Street', 'Alexandria', 'Alexandria',
    null, v_key);
  if gifto_test.place_order_with_idempotency(
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
    -- R-03: the only authenticated checkout RPC is place_order_with_price_check;
    -- anon has no EXECUTE on it (the legacy place_order_with_idempotency was dropped).
    perform public.place_order_with_price_check(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
      'Anon', '01001112233', null, '12 Main Street', 'Alexandria', 'Alexandria',
      null, gen_random_uuid(), null, null);
    raise exception 'TEST 14 FAILED: anon called place_order_with_price_check';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 14 PASSED: anon cannot reach the authenticated checkout RPC';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 15: cancel_guest_order is executable only by service_role (P0-05)
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.cancel_guest_order(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.cancel_guest_order(uuid,text)', 'execute') then
    raise exception 'TEST 15 FAILED: a weaker role can execute cancel_guest_order';
  end if;
  if not has_function_privilege('service_role', 'public.cancel_guest_order(uuid,text)', 'execute') then
    raise exception 'TEST 15 FAILED: service_role cannot execute cancel_guest_order';
  end if;
  raise notice 'TEST 15 PASSED: cancel_guest_order is service_role-only';
end $$;
-- ---------------------------------------------------------------------------
-- TEST 16: correct token cancels a placed guest order and restocks once (P0-05)
-- ---------------------------------------------------------------------------
-- Table reads run as the superuser (service_role holds no SELECT on
-- products); only the RPC calls run as service_role.
reset role;
do $$
declare v_stock_before int;
begin
  select stock into v_stock_before from public.products
   where id = '51100000-0000-0000-0000-000000000101';
  perform set_config('gifto_test.cancel_stock_before', v_stock_before::text, false);
end $$;

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-token-cancel', 'sha256'), 'hex');
  v_oid uuid;
begin
  v_oid := gifto_test.place_guest_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
    'Cancel Guest', '01001112233', null,
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(), v_hash);
  perform set_config('gifto_test.cancel_order_id', v_oid::text, false);
  perform set_config('gifto_test.cancel_hash', v_hash, false);
  raise notice 'TEST 16a PASSED: fresh placed guest order created for cancellation';
end $$;

reset role;
do $$
declare
  v_stock_before int := current_setting('gifto_test.cancel_stock_before')::int;
begin
  if (select stock from public.products where id = '51100000-0000-0000-0000-000000000101') <> v_stock_before - 1 then
    raise exception 'TEST 16 FAILED: stock was not decremented on placement';
  end if;
end $$;

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
begin
  perform public.cancel_guest_order(
    current_setting('gifto_test.cancel_order_id')::uuid,
    current_setting('gifto_test.cancel_hash'));
end $$;

reset role;
do $$
declare
  v_oid uuid := current_setting('gifto_test.cancel_order_id')::uuid;
  v_stock_before int := current_setting('gifto_test.cancel_stock_before')::int;
begin
  if (select status from public.orders where id = v_oid) <> 'cancelled' then
    raise exception 'TEST 16 FAILED: parent order was not cancelled';
  end if;
  if (select count(*) from public.order_vendors where order_id = v_oid and status <> 'cancelled') <> 0 then
    raise exception 'TEST 16 FAILED: a suborder was not cancelled';
  end if;
  if (select stock from public.products where id = '51100000-0000-0000-0000-000000000101') <> v_stock_before then
    raise exception 'TEST 16 FAILED: stock was not restocked exactly once';
  end if;
  if (select count(*) from public.inventory_movements
       where order_id = v_oid and reason = 'order_cancelled') <> 1 then
    raise exception 'TEST 16 FAILED: restock movement not recorded exactly once';
  end if;
  if (select count(*) from public.order_status_events e
       join public.order_vendors ov on ov.id = e.order_vendor_id
      where ov.order_id = v_oid and e.to_status = 'cancelled'
        and e.actor_role = 'system') <> 1 then
    raise exception 'TEST 16 FAILED: cancellation audit event missing or wrong actor';
  end if;
  raise notice 'TEST 16 PASSED: correct token cancels, restocks once, audit event recorded (system)';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 17: a wrong token is rejected and changes nothing (P0-05)
-- ---------------------------------------------------------------------------
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-token-cancel-two', 'sha256'), 'hex');
  v_oid uuid;
begin
  v_oid := gifto_test.place_guest_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
    'Cancel Guest Two', '01001112233', null,
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(), v_hash);
  perform set_config('gifto_test.cancel2_order_id', v_oid::text, false);
end $$;

do $$
declare v_oid uuid := current_setting('gifto_test.cancel2_order_id')::uuid;
begin
  begin
    perform public.cancel_guest_order(v_oid, repeat('f', 64));
    raise exception 'TEST 17 FAILED: a wrong token cancelled the order';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
do $$
declare
  v_oid uuid := current_setting('gifto_test.cancel2_order_id')::uuid;
  v_stock_before int := current_setting('gifto_test.cancel_stock_before')::int;
begin
  if (select status from public.orders where id = v_oid) <> 'placed' then
    raise exception 'TEST 17 FAILED: order status changed after a wrong-token attempt';
  end if;
  if (select stock from public.products where id = '51100000-0000-0000-0000-000000000101') <> v_stock_before - 1 then
    raise exception 'TEST 17 FAILED: stock changed after a wrong-token attempt';
  end if;
  raise notice 'TEST 17 PASSED: wrong token rejected with a generic error, nothing changed';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 18: a signed-in user's order cannot be cancelled through this RPC (P0-05)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '31100000-0000-0000-0000-000000000101';
set request.jwt.claims = '{"sub":"31100000-0000-0000-0000-000000000101"}';
do $$
declare v_oid uuid;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
    'Owner Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria', null);
  perform set_config('gifto_test.signed_order_id', v_oid::text, false);
end $$;

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare v_oid uuid := current_setting('gifto_test.signed_order_id')::uuid;
begin
  begin
    perform public.cancel_guest_order(v_oid, repeat('a', 64));
    raise exception 'TEST 18 FAILED: a signed-in order was cancelled via the guest RPC';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
do $$
declare v_oid uuid := current_setting('gifto_test.signed_order_id')::uuid;
begin
  if (select status from public.orders where id = v_oid) <> 'placed' then
    raise exception 'TEST 18 FAILED: signed-in order status changed';
  end if;
  raise notice 'TEST 18 PASSED: signed-in orders cannot be cancelled through cancel_guest_order';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 19: a non-placed guest order is rejected; a second call on a
-- cancelled order is a no-op that never restocks twice (P0-05)
-- ---------------------------------------------------------------------------
-- Earlier tests consumed the seed stock of product 101 (5 units); top it up
-- so this test can place its own order. The suite rolls everything back.
reset role;
update public.products set stock = stock + 2
 where id = '51100000-0000-0000-0000-000000000101';

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-token-cancel-three', 'sha256'), 'hex');
  v_oid uuid;
begin
  v_oid := gifto_test.place_guest_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
    'Cancel Guest Three', '01001112233', null,
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(), v_hash);
  perform set_config('gifto_test.cancel3_order_id', v_oid::text, false);
  perform set_config('gifto_test.cancel3_hash', v_hash, false);
end $$;

set role authenticated;
set request.jwt.claim.sub = '31100000-0000-0000-0000-000000000101';
set request.jwt.claims = '{"sub":"31100000-0000-0000-0000-000000000101"}';
do $$
declare v_ov uuid;
begin
  select id into v_ov from public.order_vendors
   where order_id = current_setting('gifto_test.cancel3_order_id')::uuid;
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
end $$;

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_oid uuid := current_setting('gifto_test.cancel3_order_id')::uuid;
  v_hash text := current_setting('gifto_test.cancel3_hash');
begin
  begin
    perform public.cancel_guest_order(v_oid, v_hash);
    raise exception 'TEST 19 FAILED: a confirmed order was cancelled';
  exception when check_violation then
    null;
  end;
end $$;

reset role;
do $$
declare v_oid uuid := current_setting('gifto_test.cancel3_order_id')::uuid;
begin
  if (select status from public.orders where id = v_oid) <> 'confirmed' then
    raise exception 'TEST 19 FAILED: confirmed order status changed';
  end if;
  raise notice 'TEST 19a PASSED: non-placed guest order rejected';
end $$;

-- Second call on the TEST 16 cancelled order: must succeed and change nothing.
reset role;
do $$
declare v_stock_now int;
begin
  select stock into v_stock_now from public.products
   where id = '51100000-0000-0000-0000-000000000101';
  perform set_config('gifto_test.cancel_stock_now', v_stock_now::text, false);
end $$;

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
begin
  perform public.cancel_guest_order(
    current_setting('gifto_test.cancel_order_id')::uuid,
    current_setting('gifto_test.cancel_hash'));
end $$;

reset role;
do $$
declare
  v_oid uuid := current_setting('gifto_test.cancel_order_id')::uuid;
  v_stock_now int := current_setting('gifto_test.cancel_stock_now')::int;
begin
  if (select status from public.orders where id = v_oid) <> 'cancelled' then
    raise exception 'TEST 19 FAILED: second call changed the cancelled order';
  end if;
  if (select stock from public.products where id = '51100000-0000-0000-0000-000000000101') <> v_stock_now then
    raise exception 'TEST 19 FAILED: second call restocked again (double restock)';
  end if;
  if (select count(*) from public.inventory_movements
       where order_id = v_oid and reason = 'order_cancelled') <> 1 then
    raise exception 'TEST 19 FAILED: second call recorded another restock movement';
  end if;
  raise notice 'TEST 19 PASSED: second call on a cancelled order is a no-op, no double restock';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 20: guest token expiry is stamped at placement and enforced (P1-02)
-- ---------------------------------------------------------------------------
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-token-expiry', 'sha256'), 'hex');
  v_oid uuid;
begin
  v_oid := gifto_test.place_guest_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
    'Expiry Guest', '01001112233', 'expiry@guest.gifto.test',
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(), v_hash);
  perform set_config('gifto_test.expiry_order_id', v_oid::text, false);
  perform set_config('gifto_test.expiry_hash', v_hash, false);
end $$;

reset role;
do $$
declare
  v_oid uuid := current_setting('gifto_test.expiry_order_id')::uuid;
  v_expires timestamptz;
begin
  select guest_token_expires_at into v_expires
    from public.orders where id = v_oid;
  if v_expires is null then
    raise exception 'TEST 20 FAILED: no expiry stamped at placement';
  end if;
  if v_expires <= now() or v_expires > now() + interval '7 days 1 minute' then
    raise exception 'TEST 20 FAILED: expiry is not now()+7d (got %)', v_expires;
  end if;
  raise notice 'TEST 20a PASSED: placement stamps a 7-day token expiry';
end $$;

-- Expire the token; every guest path must now reject it.
reset role;
do $$
begin
  update public.orders
     set guest_token_expires_at = now() - interval '1 day'
   where id = current_setting('gifto_test.expiry_order_id')::uuid;
end $$;

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_view jsonb;
  v_rejected boolean := false;
begin
  select public.get_guest_order(
    current_setting('gifto_test.expiry_order_id')::uuid,
    current_setting('gifto_test.expiry_hash'))
    into v_view;
  if v_view is not null then
    raise exception 'TEST 20 FAILED: expired token can still view the order';
  end if;

  begin
    perform public.cancel_guest_order(
      current_setting('gifto_test.expiry_order_id')::uuid,
      current_setting('gifto_test.expiry_hash'));
  exception when sqlstate '42501' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'TEST 20 FAILED: expired token can still cancel the order';
  end if;
  raise notice 'TEST 20b PASSED: expired token rejected on view and cancel';
end $$;

-- Restore the expiry; the same token works again (no rotation needed).
reset role;
do $$
begin
  update public.orders
     set guest_token_expires_at = now() + interval '7 days'
   where id = current_setting('gifto_test.expiry_order_id')::uuid;
end $$;

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_view jsonb;
begin
  select public.get_guest_order(
    current_setting('gifto_test.expiry_order_id')::uuid,
    current_setting('gifto_test.expiry_hash'))
    into v_view;
  if v_view is null then
    raise exception 'TEST 20 FAILED: live token cannot view the order';
  end if;
  raise notice 'TEST 20 PASSED: expiry stamped and enforced, live token still works';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 21: recovery by reference + phone/email, single-use, rotation (P1-02)
-- ---------------------------------------------------------------------------
reset role;
do $$
declare
  v_ref text;
begin
  select public_reference into v_ref from public.orders
   where id = current_setting('gifto_test.expiry_order_id')::uuid;
  perform set_config('gifto_test.expiry_reference', v_ref, false);
end $$;

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_rows int;
  v_token text;
  v_oid uuid;
  v_email text;
begin
  -- Wrong phone: silent empty result, no token issued.
  select count(*) into v_rows
    from public.request_guest_order_recovery(
      current_setting('gifto_test.expiry_reference'), '01999999999');
  if v_rows <> 0 then
    raise exception 'TEST 21 FAILED: wrong phone issued a recovery token';
  end if;

  -- Correct phone: one token, emailed to the checkout address.
  select order_id, recovery_token, contact_email
    into v_oid, v_token, v_email
    from public.request_guest_order_recovery(
      current_setting('gifto_test.expiry_reference'), '01001112233');
  if v_oid is null or v_token is null or v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'TEST 21 FAILED: correct recovery issued no usable token';
  end if;
  if v_email <> 'expiry@guest.gifto.test' then
    raise exception 'TEST 21 FAILED: recovery email address is wrong';
  end if;
  perform set_config('gifto_test.recovery_token', v_token, false);

  -- A second request invalidates the first token.
  perform public.request_guest_order_recovery(
    current_setting('gifto_test.expiry_reference'), 'expiry@guest.gifto.test');
  if exists (
    select 1 from public.guest_recovery_tokens
     where order_id = v_oid
       and token_hash = encode(digest(v_token, 'sha256'), 'hex')
  ) then
    raise exception 'TEST 21 FAILED: re-issue did not invalidate the old token';
  end if;
  select recovery_token into v_token
    from public.request_guest_order_recovery(
      current_setting('gifto_test.expiry_reference'), '01001112233');
  perform set_config('gifto_test.recovery_token', v_token, false);
  raise notice 'TEST 21a PASSED: recovery needs reference + contact, re-issue invalidates';
end $$;

-- Redeem once: old guest token dies, new one works, expiry refreshes.
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_oid uuid := current_setting('gifto_test.expiry_order_id')::uuid;
  v_old_hash text := current_setting('gifto_test.expiry_hash');
  v_new_token text := encode(gen_random_bytes(32), 'hex');
  v_new_hash text := encode(digest(v_new_token, 'sha256'), 'hex');
  v_view jsonb;
  v_reused boolean := false;
begin
  perform public.redeem_guest_recovery_token(
    v_oid,
    encode(digest(current_setting('gifto_test.recovery_token'), 'sha256'), 'hex'),
    v_new_hash);

  select public.get_guest_order(v_oid, v_old_hash) into v_view;
  if v_view is not null then
    raise exception 'TEST 21 FAILED: old guest token still works after recovery';
  end if;

  select public.get_guest_order(v_oid, v_new_hash) into v_view;
  if v_view is null then
    raise exception 'TEST 21 FAILED: rotated guest token cannot view the order';
  end if;

  -- The same recovery link cannot be used twice.
  begin
    perform public.redeem_guest_recovery_token(
      v_oid,
      encode(digest(current_setting('gifto_test.recovery_token'), 'sha256'), 'hex'),
      encode(digest('another-token', 'sha256'), 'hex'));
  exception when sqlstate '42501' then
    v_reused := true;
  end;
  if not v_reused then
    raise exception 'TEST 21 FAILED: recovery link was reusable';
  end if;

  perform set_config('gifto_test.expiry_hash', v_new_hash, false);
  raise notice 'TEST 21 PASSED: recovery rotates the token once and refreshes expiry';
end $$;

-- Table reads run as the superuser (service_role holds no SELECT on orders).
reset role;
do $$
declare
  v_oid uuid := current_setting('gifto_test.expiry_order_id')::uuid;
begin
  if (select guest_token_expires_at from public.orders where id = v_oid)
     <= now() + interval '6 days' then
    raise exception 'TEST 21 FAILED: recovery did not refresh the expiry';
  end if;
end $$;

-- An expired recovery link is rejected.
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_oid uuid := current_setting('gifto_test.expiry_order_id')::uuid;
  v_token text;
begin
  select recovery_token into v_token
    from public.request_guest_order_recovery(
      current_setting('gifto_test.expiry_reference'), '01001112233');
  perform set_config('gifto_test.expired_recovery_token', v_token, false);
end $$;

reset role;
do $$
begin
  update public.guest_recovery_tokens
     set expires_at = now() - interval '1 minute'
   where order_id = current_setting('gifto_test.expiry_order_id')::uuid
     and used_at is null;
end $$;

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_oid uuid := current_setting('gifto_test.expiry_order_id')::uuid;
  v_expired boolean := false;
begin
  begin
    perform public.redeem_guest_recovery_token(
      v_oid,
      encode(digest(current_setting('gifto_test.expired_recovery_token'), 'sha256'), 'hex'),
      encode(digest('fresh-token', 'sha256'), 'hex'));
  exception when sqlstate '42501' then
    v_expired := true;
  end;
  if not v_expired then
    raise exception 'TEST 21 FAILED: expired recovery link was accepted';
  end if;
  raise notice 'TEST 21b PASSED: expired recovery link rejected';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 22: claiming a guest order attaches it to the account (P1-02)
-- ---------------------------------------------------------------------------
-- Earlier tests placed (and mostly kept) orders against the shared G One
-- stock of 5; restore it so this test is independent of their consumption.
reset role;
update public.products set stock = 5
 where id = '51100000-0000-0000-0000-000000000101';

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-token-claim', 'sha256'), 'hex');
  v_oid uuid;
begin
  v_oid := gifto_test.place_guest_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
    'Claim Guest', '01001112234', null,
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(), v_hash);
  perform set_config('gifto_test.claim_order_id', v_oid::text, false);
  perform set_config('gifto_test.claim_hash', v_hash, false);
end $$;

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_oid uuid := current_setting('gifto_test.claim_order_id')::uuid;
  v_wrong boolean := false;
begin
  -- Wrong token cannot claim.
  begin
    perform public.claim_guest_order(
      v_oid,
      encode(digest('not-the-token', 'sha256'), 'hex'),
      '11100000-0000-0000-0000-000000000101');
  exception when sqlstate '42501' then
    v_wrong := true;
  end;
  if not v_wrong then
    raise exception 'TEST 22 FAILED: wrong token claimed the order';
  end if;

  perform public.claim_guest_order(
    v_oid,
    current_setting('gifto_test.claim_hash'),
    '11100000-0000-0000-0000-000000000101');
end $$;

-- Table reads run as the superuser (service_role holds no SELECT on orders).
reset role;
do $$
declare
  v_oid uuid := current_setting('gifto_test.claim_order_id')::uuid;
begin
  if (select user_id from public.orders where id = v_oid)
     <> '11100000-0000-0000-0000-000000000101' then
    raise exception 'TEST 22 FAILED: order was not attached to the account';
  end if;
  if (select guest_token_hash from public.orders where id = v_oid) is not null then
    raise exception 'TEST 22 FAILED: guest token was not cleared on claim';
  end if;
end $$;

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_oid uuid := current_setting('gifto_test.claim_order_id')::uuid;
begin
  if (select public.get_guest_order(v_oid, current_setting('gifto_test.claim_hash'))) is not null then
    raise exception 'TEST 22 FAILED: old guest token still opens a claimed order';
  end if;
  raise notice 'TEST 22 PASSED: claim attaches the order and clears the guest token';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 23: price-change consent on the guest path (P1-03)
-- ---------------------------------------------------------------------------
reset role;
update public.products set stock = 5, price_minor = 30000
 where id = '51100000-0000-0000-0000-000000000101';

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-token-price', 'sha256'), 'hex');
  v_oid uuid;
  v_total int;
begin
  -- Unchanged prices place normally for a guest.
  v_oid := public.place_guest_order_with_price_check(
    '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
    'Price Guest', '01001112233', null,
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(), v_hash,
    '[{"product_id":"51100000-0000-0000-0000-000000000101","unit_price_minor":30000}]'::jsonb,
    30000);
  if v_oid is null then
    raise exception 'TEST 23 FAILED: unchanged guest prices did not place';
  end if;
  select (public.get_guest_order(v_oid, v_hash) ->> 'total_minor')::int
    into v_total;
  if v_total <> 30000 then
    raise exception 'TEST 23 FAILED: guest placed total is % not 30000', v_total;
  end if;
  raise notice 'TEST 23a PASSED: unchanged guest prices place normally';
end $$;

-- The vendor changes the price between cart and submit.
reset role;
update public.products set price_minor = 32000
 where id = '51100000-0000-0000-0000-000000000101';

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-token-price-2', 'sha256'), 'hex');
  v_oid uuid;
  v_blocked boolean := false;
  v_total int;
begin
  -- A changed price blocks the guest order with PRICE_CHANGED.
  begin
    perform public.place_guest_order_with_price_check(
      '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
      'Price Guest', '01001112233', null,
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      gen_random_uuid(), v_hash,
      '[{"product_id":"51100000-0000-0000-0000-000000000101","unit_price_minor":30000}]'::jsonb,
      30000);
  exception when check_violation then
    if sqlerrm like 'PRICE_CHANGED:%' then
      v_blocked := true;
    else
      raise exception 'TEST 23 FAILED: wrong error for a guest price change: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 23 FAILED: changed guest price did not block';
  end if;

  -- Re-confirming with the new price places at the new price.
  v_oid := public.place_guest_order_with_price_check(
    '[{"product_id":"51100000-0000-0000-0000-000000000101","quantity":1}]'::jsonb,
    'Price Guest', '01001112233', null,
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(), v_hash,
    '[{"product_id":"51100000-0000-0000-0000-000000000101","unit_price_minor":32000}]'::jsonb,
    32000);
  if v_oid is null then
    raise exception 'TEST 23 FAILED: guest re-confirm did not place';
  end if;
  select (public.get_guest_order(v_oid, v_hash) ->> 'total_minor')::int
    into v_total;
  if v_total <> 32000 then
    raise exception 'TEST 23 FAILED: guest re-confirmed total is % not 32000', v_total;
  end if;
  raise notice 'TEST 23 PASSED: guest price consent blocks and re-confirms at the new price';
end $$;

reset role;

rollback;
