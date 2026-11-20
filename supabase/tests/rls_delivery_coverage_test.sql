-- Gifto Phase 2 verification: vendor delivery coverage blocks checkout.
-- Run after all migrations against a disposable database.

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
  'Coverage Shop',
  'coverage-shop',
  'active',
  0.1000,
  '{"governorates":["Cairo"],"areas":["Maadi"]}'::jsonb
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
-- TEST 1: helper treats unconfigured coverage as open
-- ---------------------------------------------------------------------------
do $$
begin
  if not public.delivery_coverage_allows(
    '{}'::jsonb, 'Alexandria', 'Alexandria', '1 Sea Road'
  ) then
    raise exception 'TEST 1 FAILED: empty coverage blocked an address';
  end if;
  raise notice 'TEST 1 PASSED: empty coverage allows checkout';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: helper matches governorate and area case-insensitively
-- ---------------------------------------------------------------------------
do $$
begin
  if not public.delivery_coverage_allows(
    '{"governorates":[" cairo "],"areas":["MAADI"]}'::jsonb,
    'maadi', 'CAIRO', '12 Road 9'
  ) then
    raise exception 'TEST 2 FAILED: valid coverage was rejected';
  end if;
  if public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["Maadi"]}'::jsonb,
    'Nasr City', 'Cairo', '12 Abbas El Akkad'
  ) then
    raise exception 'TEST 2 FAILED: out-of-area city was allowed';
  end if;
  raise notice 'TEST 2 PASSED: coverage matches governorates and areas';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: checkout rolls back when any shop does not cover the address
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11200000-0000-0000-0000-000000000001"}';

do $$
declare
  v_order_id uuid;
  v_blocked  boolean := false;
begin
  begin
    perform public.place_order(
      '[{"product_id":"51200000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'Coverage Buyer', '01001112233', '12 Pyramid Street',
      'Giza', 'Giza', null
    );
  exception when sqlstate '23514' then
    v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST 3 FAILED: out-of-coverage checkout was accepted';
  end if;

  v_order_id := public.place_order(
    '[{"product_id":"51200000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Coverage Buyer', '01001112233', '12 Road 9, Maadi',
    'Maadi', 'Cairo', null
  );

  if v_order_id is null then
    raise exception 'TEST 3 FAILED: covered checkout returned no order';
  end if;

  raise notice 'TEST 3 PASSED: coverage is enforced inside checkout';
end $$;

rollback;
