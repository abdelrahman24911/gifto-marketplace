-- Gifto P0 demo containment (migration 67): demo vendors cannot receive
-- NEW production orders while the containment switch is off, existing demo
-- orders stay readable, non-demo vendors are unaffected, and checkout
-- cannot bypass the restriction (the database, not the app, enforces it).
-- Run after all migrations against a disposable database.

\set ON_ERROR_STOP on

do $$
begin
  if current_setting('gifto.rls_test_disposable', true) is distinct from 'yes' then
    raise exception 'Refusing to run destructive RLS tests. Start a disposable database and SET gifto.rls_test_disposable = ''yes'' in the same psql session.';
  end if;
end $$;

begin;

-- ---------------------------------------------------------------------------
-- Seed: one demo vendor, one non-demo vendor, one paused non-demo vendor,
-- a buyer, a demo-vendor owner, and a platform admin.
-- ---------------------------------------------------------------------------
delete from public.vendors where id in (
  'd1000000-0000-0000-0000-0000000000d1',
  'd2000000-0000-0000-0000-0000000000d2',
  'd3000000-0000-0000-0000-0000000000d3'
);
delete from auth.users where email like '%@containment.gifto.test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('11000000-0000-0000-0000-0000000000b1', 'buyer@containment.gifto.test', '{"full_name":"Buyer"}'::jsonb),
  ('22000000-0000-0000-0000-0000000000b2', 'owner@containment.gifto.test', '{"full_name":"Owner"}'::jsonb),
  ('33000000-0000-0000-0000-0000000000b3', 'admin@containment.gifto.test', '{"full_name":"Admin"}'::jsonb);

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = '33000000-0000-0000-0000-0000000000b3';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (
  id, name, slug, status, commission_rate, is_demo, is_accepting_orders
) values (
  'd1000000-0000-0000-0000-0000000000d1',
  'Demo Shop', 'demo-shop', 'active', 0.1000, true, true
), (
  'd2000000-0000-0000-0000-0000000000d2',
  'Real Shop', 'real-shop', 'active', 0.1000, false, true
), (
  'd3000000-0000-0000-0000-0000000000d3',
  'Paused Shop', 'paused-shop', 'active', 0.1000, false, false
);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('d1000000-0000-0000-0000-0000000000d1', '22000000-0000-0000-0000-0000000000b2', 'owner');

insert into public.products (
  id, vendor_id, name, slug, price_minor, stock, status
) values (
  'd4000000-0000-0000-0000-0000000000d4',
  'd1000000-0000-0000-0000-0000000000d1',
  'Demo Gift', 'demo-gift', 10000, 5, 'active'
), (
  'd5000000-0000-0000-0000-0000000000d5',
  'd2000000-0000-0000-0000-0000000000d2',
  'Real Gift', 'real-gift', 10000, 5, 'active'
), (
  'd6000000-0000-0000-0000-0000000000d6',
  'd3000000-0000-0000-0000-0000000000d3',
  'Paused Gift', 'paused-gift', 10000, 5, 'active'
);

-- ---------------------------------------------------------------------------
-- TEST 1: the containment switch is invisible to API roles
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('anon', 'public.app_settings', 'select')
     or has_table_privilege('authenticated', 'public.app_settings', 'select')
     or has_table_privilege('authenticated', 'public.app_settings', 'insert')
     or has_table_privilege('authenticated', 'public.app_settings', 'update')
     or has_table_privilege('authenticated', 'public.app_settings', 'delete')
     or has_function_privilege('anon', 'public.demo_orders_allowed()', 'execute')
     or has_function_privilege('authenticated', 'public.demo_orders_allowed()', 'execute') then
    raise exception 'TEST 1 FAILED: an API role can read or flip the containment switch';
  end if;

  raise notice 'TEST 1 PASSED: app_settings is service-role only; demo_orders_allowed() is not callable by API roles';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: the switch defaults to containment ON (demo orders not allowed)
-- ---------------------------------------------------------------------------
do $$
begin
  if public.demo_orders_allowed() then
    raise exception 'TEST 2 FAILED: demo_orders_allowed() defaulted to true';
  end if;

  if not exists (
    select 1 from public.app_settings
    where key = 'demo_orders_allowed' and value = 'false'::jsonb
  ) then
    raise exception 'TEST 2 FAILED: the demo_orders_allowed seed row is missing or wrong';
  end if;

  raise notice 'TEST 2 PASSED: containment defaults to ON';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: a demo vendor's checkout is rejected with the paused message
-- and creates no order rows
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11000000-0000-0000-0000-0000000000b1';
set request.jwt.claims = '{"sub":"11000000-0000-0000-0000-0000000000b1"}';

do $$
declare
  v_before int;
  v_after  int;
  v_blocked boolean := false;
  v_message text;
begin
  select count(*) into v_before from public.orders;

  begin
    perform gifto_test.place_order(
      '[{"product_id":"d4000000-0000-0000-0000-0000000000d4","quantity":1}]'::jsonb,
      'Containment Buyer', '01001112233', '12 Sea Road',
      'Alexandria', 'Alexandria', null
    );
  exception when sqlstate '22023' then
    v_blocked := true;
    v_message := sqlerrm;
  end;

  if not v_blocked then
    raise exception 'TEST 3 FAILED: demo-vendor checkout was accepted';
  end if;
  if v_message not like '%not accepting orders right now%' then
    raise exception 'TEST 3 FAILED: demo rejection used the wrong message: %', v_message;
  end if;

  select count(*) into v_after from public.orders;
  if v_after <> v_before then
    raise exception 'TEST 3 FAILED: rejected demo checkout created % order rows', v_after - v_before;
  end if;

  raise notice 'TEST 3 PASSED: demo-vendor checkout refused with the paused message, no rows created';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: a non-demo vendor's checkout still succeeds
-- ---------------------------------------------------------------------------
do $$
declare v_order_id uuid;
begin
  v_order_id := gifto_test.place_order(
    '[{"product_id":"d5000000-0000-0000-0000-0000000000d5","quantity":1}]'::jsonb,
    'Containment Buyer', '01001112233', '12 Sea Road',
    'Alexandria', 'Alexandria', null
  );

  if v_order_id is null then
    raise exception 'TEST 4 FAILED: non-demo checkout returned no order';
  end if;

  raise notice 'TEST 4 PASSED: non-demo checkout succeeds while containment is on';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: flipping the switch ON lets demo checkout through; flipping it
-- back restores the block
-- ---------------------------------------------------------------------------
reset role;

do $$
declare v_order_id uuid;
begin
  update public.app_settings
     set value = 'true'::jsonb
   where key = 'demo_orders_allowed';

  if not public.demo_orders_allowed() then
    raise exception 'TEST 5 FAILED: switch flip to true did not take effect';
  end if;

  raise notice 'TEST 5 (part 1): switch is on';
end $$;

set role authenticated;
set request.jwt.claim.sub = '11000000-0000-0000-0000-0000000000b1';
set request.jwt.claims = '{"sub":"11000000-0000-0000-0000-0000000000b1"}';

do $$
declare
  v_order_id uuid;
  v_blocked boolean := false;
begin
  v_order_id := gifto_test.place_order(
    '[{"product_id":"d4000000-0000-0000-0000-0000000000d4","quantity":1}]'::jsonb,
    'Containment Buyer', '01001112233', '12 Sea Road',
    'Alexandria', 'Alexandria', null
  );

  if v_order_id is null then
    raise exception 'TEST 5 FAILED: demo checkout with the switch on returned no order';
  end if;

  raise notice 'TEST 5 (part 2): demo checkout succeeds while the switch is on';
end $$;

reset role;

do $$
begin
  update public.app_settings
     set value = 'false'::jsonb
   where key = 'demo_orders_allowed';

  if public.demo_orders_allowed() then
    raise exception 'TEST 5 FAILED: switch flip back to false did not take effect';
  end if;

  raise notice 'TEST 5 PASSED: switch flips both ways; containment is back on';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: the demo order placed while the switch was on stays readable
-- by the vendor owner and the admin after containment is back on
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22000000-0000-0000-0000-0000000000b2';
set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-0000000000b2"}';

do $$
declare v_suborders int;
begin
  select count(*) into v_suborders
    from public.order_vendors
   where vendor_id = 'd1000000-0000-0000-0000-0000000000d1';

  if v_suborders < 1 then
    raise exception 'TEST 6 FAILED: demo vendor owner cannot read the existing demo suborder';
  end if;

  raise notice 'TEST 6 (part 1): demo vendor owner still reads the existing demo suborder';
end $$;

set request.jwt.claim.sub = '33000000-0000-0000-0000-0000000000b3';
set request.jwt.claims = '{"sub":"33000000-0000-0000-0000-0000000000b3"}';

do $$
declare v_orders int;
begin
  select count(*) into v_orders
    from public.orders
   where id in (
     select order_id from public.order_vendors
      where vendor_id = 'd1000000-0000-0000-0000-0000000000d1'
   );

  if v_orders < 1 then
    raise exception 'TEST 6 FAILED: admin cannot read the existing demo order';
  end if;

  raise notice 'TEST 6 PASSED: existing demo orders stay readable after containment returns';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- TEST 7: a paused non-demo vendor is still rejected (containment did not
-- change the pause rule)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11000000-0000-0000-0000-0000000000b1';
set request.jwt.claims = '{"sub":"11000000-0000-0000-0000-0000000000b1"}';

do $$
declare
  v_blocked boolean := false;
  v_message text;
begin
  begin
    perform gifto_test.place_order(
      '[{"product_id":"d6000000-0000-0000-0000-0000000000d6","quantity":1}]'::jsonb,
      'Containment Buyer', '01001112233', '12 Sea Road',
      'Alexandria', 'Alexandria', null
    );
  exception when sqlstate '22023' then
    v_blocked := true;
    v_message := sqlerrm;
  end;

  if not v_blocked then
    raise exception 'TEST 7 FAILED: paused non-demo checkout was accepted';
  end if;
  if v_message not like '%not accepting orders right now%' then
    raise exception 'TEST 7 FAILED: paused rejection used the wrong message: %', v_message;
  end if;

  raise notice 'TEST 7 PASSED: paused non-demo vendor still rejected with the paused message';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 8: a demo vendor that is also paused is rejected too
-- ---------------------------------------------------------------------------
reset role;

update public.vendors
   set is_accepting_orders = false
 where id = 'd1000000-0000-0000-0000-0000000000d1';

set role authenticated;
set request.jwt.claim.sub = '11000000-0000-0000-0000-0000000000b1';
set request.jwt.claims = '{"sub":"11000000-0000-0000-0000-0000000000b1"}';

do $$
declare v_blocked boolean := false;
begin
  begin
    perform gifto_test.place_order(
      '[{"product_id":"d4000000-0000-0000-0000-0000000000d4","quantity":1}]'::jsonb,
      'Containment Buyer', '01001112233', '12 Sea Road',
      'Alexandria', 'Alexandria', null
    );
  exception when sqlstate '22023' then
    v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST 8 FAILED: paused demo-vendor checkout was accepted';
  end if;

  raise notice 'TEST 8 PASSED: paused demo vendor is rejected too';
end $$;

reset role;

rollback;
