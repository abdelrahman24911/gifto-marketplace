-- Gifto verification: delivery coverage no longer gates checkout.
-- Run after all migrations against a disposable database.
--
-- Migration 73 keeps the order_vendors trigger but redefines
-- delivery_coverage_allows() as an Egyptian-governorate validity check.
-- Vendor coverage lists are ignored and must remain stored.

\set ON_ERROR_STOP on

do $$
begin
  if current_setting('gifto.rls_test_disposable', true) is distinct from 'yes' then
    raise exception 'Refusing to run destructive RLS tests. Start a disposable database and SET gifto.rls_test_disposable = ''yes'' in the same psql session.';
  end if;
end $$;

begin;

delete from public.orders;
delete from public.products where vendor_id = '41200000-0000-0000-0000-000000000001';
delete from public.vendors where id = '41200000-0000-0000-0000-000000000001';
delete from auth.users where email = 'buyer@coverage.gifto.test';

insert into auth.users (id, email)
values ('11200000-0000-0000-0000-000000000001', 'buyer@coverage.gifto.test');

insert into public.vendors (
  id, name, slug, status, commission_rate, delivery_coverage
) values (
  '41200000-0000-0000-0000-000000000001',
  'Alexandria Toy Corner',
  'alexandria-toy-corner',
  'active',
  0.1000,
  '{"governorates":["Alexandria"],"areas":["Smouha","Sidi Gaber","Gleem","Damanhour"]}'::jsonb
);

insert into public.products (
  id, vendor_id, name, slug, price_minor, stock, status
) values (
  '51200000-0000-0000-0000-000000000001',
  '41200000-0000-0000-0000-000000000001',
  'Coverage Gift',
  'coverage-gift',
  10000,
  5,
  'active'
);

-- ---------------------------------------------------------------------------
-- TEST 1: the reported bug - Cairo customer, Alexandria-only coverage.
-- Also covers Aswan from a Nile Blossoms-style area list.
-- ---------------------------------------------------------------------------
do $$
begin
  if not public.delivery_coverage_allows(
    '{"governorates":["Alexandria"],"areas":["Smouha","Sidi Gaber","Gleem","Damanhour"]}'::jsonb,
    'Cairo', 'Cairo', '12 Road 9, Maadi'
  ) then
    raise exception 'TEST 1 FAILED: Cairo was refused by Alexandria-only coverage';
  end if;

  if not public.delivery_coverage_allows(
    '{"governorates":["Alexandria"],"areas":["Raml Station","Sidi Gaber","Smouha","San Stefano"]}'::jsonb,
    'Aswan', 'Aswan', '1 Corniche El Nil'
  ) then
    raise exception 'TEST 1 FAILED: Aswan was refused by an Alexandria area list';
  end if;

  raise notice 'TEST 1 PASSED: cross-governorate orders are allowed';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: every Egyptian governorate is valid in English and Arabic.
-- ---------------------------------------------------------------------------
do $$
declare
  v_governorate text;
  v_coverage    jsonb := '{"governorates":["Alexandria"],"areas":["Smouha"]}'::jsonb;
begin
  foreach v_governorate in array array[
    'Cairo', 'Alexandria', 'Giza', 'Qalyubia', 'Dakahlia', 'Sharqia',
    'Gharbia', 'Monufia', 'Beheira', 'Kafr El Sheikh', 'Damietta',
    'Port Said', 'Ismailia', 'Suez', 'Faiyum', 'Beni Suef', 'Minya',
    'Asyut', 'Sohag', 'Qena', 'Luxor', 'Aswan', 'Red Sea',
    'New Valley', 'Matrouh', 'North Sinai', 'South Sinai',
    'القاهرة', 'الإسكندرية', 'الجيزة', 'القليوبية', 'الدقهلية', 'الشرقية',
    'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد',
    'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط',
    'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد',
    'مطروح', 'شمال سيناء', 'جنوب سيناء'
  ]
  loop
    if not public.delivery_coverage_allows(
      v_coverage, 'Cairo', v_governorate, '12 Road 9'
    ) then
      raise exception 'TEST 2 FAILED: valid governorate % was refused', v_governorate;
    end if;
  end loop;

  raise notice 'TEST 2 PASSED: all 27 governorates are valid in English and Arabic';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: missing or non-Egyptian governorates still fail.
-- ---------------------------------------------------------------------------
do $$
begin
  if public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["Maadi"]}'::jsonb,
    'Cairo', '', '12 Road 9'
  ) then
    raise exception 'TEST 3 FAILED: an empty governorate was allowed';
  end if;

  if public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["Maadi"]}'::jsonb,
    'Cairo', 'Atlantis', '12 Road 9'
  ) then
    raise exception 'TEST 3 FAILED: a non-Egyptian governorate was allowed';
  end if;

  if public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["Maadi"]}'::jsonb,
    'Cairo', 'Cairoo', '12 Road 9'
  ) then
    raise exception 'TEST 3 FAILED: a near-miss governorate was allowed';
  end if;

  if public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["Maadi"]}'::jsonb,
    'Cairo', 'New Cairo', '12 Road 9'
  ) then
    raise exception 'TEST 3 FAILED: a city name was accepted as a governorate';
  end if;

  raise notice 'TEST 3 PASSED: invalid governorates are still refused';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: checkout places Cairo and Aswan orders through a vendor whose
-- stored coverage is Alexandria-only, and leaves that coverage untouched.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11200000-0000-0000-0000-000000000001"}';

do $$
declare
  v_order_id uuid;
  v_stock    int;
begin
  v_order_id := gifto_test.place_order(
    '[{"product_id":"51200000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Coverage Buyer', '01001112233', '12 Road 9, Maadi',
    'Cairo', 'Cairo', null
  );

  if v_order_id is null then
    raise exception 'TEST 4 FAILED: Cairo checkout returned no order';
  end if;

  v_order_id := gifto_test.place_order(
    '[{"product_id":"51200000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Coverage Buyer', '01001112233', '1 Corniche El Nil',
    'Aswan', 'Aswan', null
  );

  if v_order_id is null then
    raise exception 'TEST 4 FAILED: Aswan checkout returned no order';
  end if;

  select stock into v_stock
    from public.products
   where id = '51200000-0000-0000-0000-000000000001';
  if v_stock <> 3 then
    raise exception 'TEST 4 FAILED: expected stock 3 after two orders, got %', v_stock;
  end if;

  raise notice 'TEST 4 PASSED: cross-coverage checkout places orders';
end $$;

reset role;
do $$
declare
  v_coverage jsonb;
begin
  select delivery_coverage into v_coverage
    from public.vendors
   where id = '41200000-0000-0000-0000-000000000001';
  if v_coverage is distinct from
     '{"governorates":["Alexandria"],"areas":["Smouha","Sidi Gaber","Gleem","Damanhour"]}'::jsonb then
    raise exception 'TEST 4 FAILED: coverage data changed: %', v_coverage;
  end if;

  raise notice 'TEST 4 PASSED: stored coverage data is unchanged';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: invalid governorates still block before anything is written.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11200000-0000-0000-0000-000000000001"}';

do $$
declare
  v_blocked  boolean := false;
  v_stock    int;
  v_orders   int;
begin
  begin
    perform gifto_test.place_order(
      '[{"product_id":"51200000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'Coverage Buyer', '01001112233', '12 Road 9',
      'Cairo', 'Cairoo', null
    );
  exception when sqlstate '23514' then
    v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST 5 FAILED: an unknown governorate placed an order';
  end if;

  v_blocked := false;
  begin
    perform gifto_test.place_order(
      '[{"product_id":"51200000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'Coverage Buyer', '01001112233', '12 Road 9',
      'Cairo', '', null
    );
  exception when sqlstate '22023' then
    v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST 5 FAILED: an empty governorate placed an order';
  end if;

  select stock into v_stock
    from public.products
   where id = '51200000-0000-0000-0000-000000000001';
  if v_stock <> 3 then
    raise exception 'TEST 5 FAILED: refused checkout changed stock to %', v_stock;
  end if;

  select count(*) into v_orders
    from public.order_vendors
   where vendor_id = '41200000-0000-0000-0000-000000000001';
  if v_orders <> 2 then
    raise exception 'TEST 5 FAILED: expected 2 orders, got %', v_orders;
  end if;

  raise notice 'TEST 5 PASSED: invalid governorates roll back cleanly';
end $$;

rollback;
