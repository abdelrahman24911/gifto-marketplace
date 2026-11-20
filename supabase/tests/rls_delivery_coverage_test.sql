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

-- ---------------------------------------------------------------------------
-- TEST 4 (P1-06 / N-04): governorate variant tolerance — the old
-- false-reject pair. The checkout dropdown now sends only canonical
-- values, so "Cairo Governorate" can no longer be typed; the tolerance
-- below is the bridge for legacy stored values and direct calls.
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  -- "Cairo Governorate" order vs "Cairo" coverage now allows.
  if not public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["Maadi"]}'::jsonb,
    'Maadi', 'Cairo Governorate', '12 Road 9'
  ) then
    raise exception 'TEST 4 FAILED: "Cairo Governorate" was rejected against "Cairo" coverage';
  end if;

  -- Both directions: "Cairo" order vs "Cairo Governorate" coverage.
  if not public.delivery_coverage_allows(
    '{"governorates":["Cairo Governorate"],"areas":["Maadi"]}'::jsonb,
    'Maadi', 'Cairo', '12 Road 9'
  ) then
    raise exception 'TEST 4 FAILED: "Cairo" was rejected against "Cairo Governorate" coverage';
  end if;

  -- Arabic variants: "محافظة القاهرة" order vs "Cairo" coverage.
  if not public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["Maadi"]}'::jsonb,
    'Maadi', 'محافظة القاهرة', '12 Road 9'
  ) then
    raise exception 'TEST 4 FAILED: Arabic governorate variant was rejected';
  end if;

  -- A genuinely different governorate still fails.
  if public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["Maadi"]}'::jsonb,
    'Maadi', 'Giza', '12 Road 9'
  ) then
    raise exception 'TEST 4 FAILED: Giza was allowed against Cairo coverage';
  end if;

  -- No guessing: a near-miss spelling still fails.
  if public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["Maadi"]}'::jsonb,
    'Maadi', 'Cairoo', '12 Road 9'
  ) then
    raise exception 'TEST 4 FAILED: a near-miss governorate was allowed';
  end if;

  raise notice 'TEST 4 PASSED: governorate variants tolerate, different governorates still fail';
end $$;

-- Checkout-level: the old placeholder example now places an order.
set role authenticated;
set request.jwt.claim.sub = '11200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11200000-0000-0000-0000-000000000001"}';

do $$
declare v_order_id uuid;
begin
  v_order_id := public.place_order(
    '[{"product_id":"51200000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Coverage Buyer', '01001112233', '12 Road 9, Maadi',
    'Maadi', 'Cairo Governorate', null
  );

  if v_order_id is null then
    raise exception 'TEST 4 FAILED: variant-tolerant checkout returned no order';
  end if;

  raise notice 'TEST 4 PASSED: checkout with "Cairo Governorate" places against "Cairo" coverage';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5 (P1-06 / N-04): LIKE escaping — an area containing % or _
-- matches literally only and can no longer widen matching.
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  -- Area "%" matches only an address containing a literal %.
  if not public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["%"]}'::jsonb,
    'Cairo', 'Cairo', '12 100% Street'
  ) then
    raise exception 'TEST 5 FAILED: literal percent area did not match a percent address';
  end if;
  if public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["%"]}'::jsonb,
    'Cairo', 'Cairo', '12 Main Street'
  ) then
    raise exception 'TEST 5 FAILED: percent area widened to an address without percent';
  end if;

  -- Area "a_b": the underscore is literal, not a single-character wildcard.
  if not public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["a_b"]}'::jsonb,
    'Cairo', 'Cairo', 'Flat a_b, 5 Road'
  ) then
    raise exception 'TEST 5 FAILED: literal a_b area did not match';
  end if;
  if public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["a_b"]}'::jsonb,
    'Cairo', 'Cairo', 'Flat axb, 5 Road'
  ) then
    raise exception 'TEST 5 FAILED: _ in an area acted as a wildcard';
  end if;

  -- A backslash in an area is literal too.
  if not public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["a\\b"]}'::jsonb,
    'Cairo', 'Cairo', 'Flat a\b, 5 Road'
  ) then
    raise exception 'TEST 5 FAILED: literal backslash area did not match';
  end if;
  if public.delivery_coverage_allows(
    '{"governorates":["Cairo"],"areas":["a\\b"]}'::jsonb,
    'Cairo', 'Cairo', 'Flat axb, 5 Road'
  ) then
    raise exception 'TEST 5 FAILED: backslash in an area acted as an escape';
  end if;

  raise notice 'TEST 5 PASSED: percent and underscore in areas match literally only';
end $$;

-- Checkout-level: the wildcard can no longer smuggle an out-of-area order
-- through the trigger, and a literal match still places.
reset role;
insert into public.vendors (
  id, name, slug, status, commission_rate, delivery_coverage
) values (
  '41200000-0000-0000-0000-000000000002',
  'Wildcard Shop',
  'wildcard-shop',
  'active',
  0.1000,
  '{"governorates":["Cairo"],"areas":["%", "a_b"]}'::jsonb
);

insert into public.products (
  id, vendor_id, name, slug, price_minor, stock, status
) values (
  '51200000-0000-0000-0000-000000000002',
  '41200000-0000-0000-0000-000000000002',
  'Wildcard Gift',
  'wildcard-gift',
  10000,
  5,
  'active'
);

set role authenticated;
set request.jwt.claim.sub = '11200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11200000-0000-0000-0000-000000000001"}';

do $$
declare
  v_order_id uuid;
  v_blocked  boolean := false;
  v_stock    int;
begin
  -- "axb" must not match the "a_b" area: blocked, nothing ordered.
  begin
    perform public.place_order(
      '[{"product_id":"51200000-0000-0000-0000-000000000002","quantity":1}]'::jsonb,
      'Coverage Buyer', '01001112233', 'Flat axb, 5 Road',
      'Cairo', 'Cairo', null
    );
  exception when sqlstate '23514' then
    v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST 5 FAILED: wildcard _ allowed an out-of-area checkout';
  end if;

  select stock into v_stock from public.products
   where id = '51200000-0000-0000-0000-000000000002';
  if v_stock <> 5 then
    raise exception 'TEST 5 FAILED: blocked checkout changed stock to %', v_stock;
  end if;

  -- A literal "a_b" in the address places.
  v_order_id := public.place_order(
    '[{"product_id":"51200000-0000-0000-0000-000000000002","quantity":1}]'::jsonb,
    'Coverage Buyer', '01001112233', 'Flat a_b, 5 Road',
    'Cairo', 'Cairo', null
  );

  if v_order_id is null then
    raise exception 'TEST 5 FAILED: literal area checkout returned no order';
  end if;

  raise notice 'TEST 5 PASSED: wildcard areas cannot smuggle checkout through the trigger';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6 (P1-06): out-of-coverage still raises 23514 and rolls back —
-- no order, no stock change — and a later in-coverage order still works.
-- ---------------------------------------------------------------------------
do $$
declare
  v_blocked  boolean := false;
  v_stock    int;
  v_orders   int;
  v_order_id uuid;
begin
  select stock into v_stock from public.products
   where id = '51200000-0000-0000-0000-000000000001';
  -- TEST 3 placed 1 and TEST 4 placed 1 of the original 5.
  if v_stock <> 3 then
    raise exception 'TEST 6 FAILED: expected stock 3 before the block, got %', v_stock;
  end if;

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
    raise exception 'TEST 6 FAILED: out-of-coverage checkout was accepted';
  end if;

  select stock into v_stock from public.products
   where id = '51200000-0000-0000-0000-000000000001';
  if v_stock <> 3 then
    raise exception 'TEST 6 FAILED: blocked checkout changed stock to %', v_stock;
  end if;

  select count(*) into v_orders from public.orders
   where id in (
     select order_id from public.order_vendors
      where vendor_id = '41200000-0000-0000-0000-000000000001'
   );
  if v_orders <> 2 then
    raise exception 'TEST 6 FAILED: expected 2 orders for the shop, got %', v_orders;
  end if;

  v_order_id := public.place_order(
    '[{"product_id":"51200000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Coverage Buyer', '01001112233', '12 Road 9, Maadi',
    'Maadi', 'Cairo', null
  );

  if v_order_id is null then
    raise exception 'TEST 6 FAILED: in-coverage checkout after a block returned no order';
  end if;

  raise notice 'TEST 6 PASSED: out-of-coverage rolls back cleanly; in-coverage still passes';
end $$;

rollback;
