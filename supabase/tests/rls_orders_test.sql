-- Gifto Phase 4 verification: orders, checkout split, stock and fulfilment.
-- Runs after all migrations (1–18) against a bare `supabase/postgres` container.
-- Any failure RAISEs and, with `psql -v ON_ERROR_STOP=1`, aborts non-zero.
--
-- The order id produced by `place_order` is carried between blocks in a session
-- GUC so it survives SET ROLE.

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
delete from public.products where vendor_id in (
  '41100000-0000-0000-0000-000000000001',
  '41100000-0000-0000-0000-000000000002',
  '41100000-0000-0000-0000-000000000003'
);
delete from public.vendors where id in (
  '41100000-0000-0000-0000-000000000001',
  '41100000-0000-0000-0000-000000000002',
  '41100000-0000-0000-0000-000000000003'
);
delete from auth.users where email like '%@orders.gifto.test';

insert into auth.users (id, email) values
  ('11100000-0000-0000-0000-000000000001', 'buyer@orders.gifto.test'),
  ('11100000-0000-0000-0000-000000000002', 'buyer2@orders.gifto.test'),
  ('21100000-0000-0000-0000-000000000001', 'owner-a@orders.gifto.test'),
  ('21100000-0000-0000-0000-000000000002', 'staff-a@orders.gifto.test'),
  ('21100000-0000-0000-0000-000000000003', 'owner-b@orders.gifto.test'),
  ('21100000-0000-0000-0000-000000000004', 'owner-p@orders.gifto.test'),
  ('31100000-0000-0000-0000-000000000001', 'admin@orders.gifto.test');

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = '31100000-0000-0000-0000-000000000001';
alter table public.profiles enable trigger profiles_protect_platform_admin;

-- Two active shops with deliberately different commission rates (set at insert,
-- before the finance-field guard applies — that guard only fires on UPDATE).
insert into public.vendors (id, name, slug, status, commission_rate) values
  ('41100000-0000-0000-0000-000000000001', 'Shop A', 'shop-a', 'active', 0.0800),
  ('41100000-0000-0000-0000-000000000002', 'Shop B', 'shop-b', 'active', 0.1500),
  ('41100000-0000-0000-0000-000000000003', 'Shop P', 'shop-p', 'pending', 0.1200);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('41100000-0000-0000-0000-000000000001', '21100000-0000-0000-0000-000000000001', 'owner'),
  ('41100000-0000-0000-0000-000000000001', '21100000-0000-0000-0000-000000000002', 'staff'),
  ('41100000-0000-0000-0000-000000000002', '21100000-0000-0000-0000-000000000003', 'owner'),
  ('41100000-0000-0000-0000-000000000003', '21100000-0000-0000-0000-000000000004', 'owner');

insert into public.products (id, vendor_id, name, slug, price_minor, stock, status) values
  ('51100000-0000-0000-0000-000000000001', '41100000-0000-0000-0000-000000000001',
   'A One', 'a-one', 10000, 5, 'active'),
  ('51100000-0000-0000-0000-000000000002', '41100000-0000-0000-0000-000000000001',
   'A Two', 'a-two', 25000, 2, 'active'),
  ('51100000-0000-0000-0000-000000000003', '41100000-0000-0000-0000-000000000001',
   'A Draft', 'a-draft', 99900, 3, 'draft'),
  ('51100000-0000-0000-0000-000000000004', '41100000-0000-0000-0000-000000000002',
   'B One', 'b-one', 7500, 10, 'active'),
  ('51100000-0000-0000-0000-000000000005', '41100000-0000-0000-0000-000000000003',
   'P One', 'p-one', 5000, 4, 'active');

-- ---------------------------------------------------------------------------
-- TEST 1: anon has no privileges at all on the order group
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('anon', 'public.orders', 'select')
     or has_table_privilege('anon', 'public.order_vendors', 'select')
     or has_table_privilege('anon', 'public.order_items', 'select')
     or has_table_privilege('anon', 'public.inventory_movements', 'select')
     or has_table_privilege('anon', 'public.orders', 'insert')
     or has_column_privilege('anon', 'public.order_vendors', 'status', 'update') then
    raise exception 'TEST 1 FAILED: anon holds privileges on order tables';
  end if;
  raise notice 'TEST 1 PASSED: anon has no access to orders, suborders, items or movements';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: anon cannot read orders or call checkout
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
begin
  begin
    perform count(*) from public.orders;
    raise exception 'TEST 2 FAILED: anon read orders';
  exception when insufficient_privilege then
    null;
  end;
  begin
    -- R-03: the only signed-in checkout RPC is place_order_with_price_check;
    -- anon has no EXECUTE on it (the legacy place_order was dropped).
    perform public.place_order_with_price_check(
      '[]'::jsonb, 'A', '123456', null, 'Street 1', 'Alex', 'Alex', null,
      gen_random_uuid(), null, null);
    raise exception 'TEST 2 FAILED: anon called place_order_with_price_check';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 2 PASSED: anon cannot read orders or call place_order_with_price_check';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: checkout requires a signed-in session
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
begin
  begin
    -- R-03: the legacy place_order is dropped; the price-check RPC rejects
    -- a caller with no session (auth.uid() is null) with 42501.
    perform public.place_order_with_price_check(
      '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'A Buyer', '01001112233', null, '12 Main Street', 'Alexandria', 'Alexandria', null,
      gen_random_uuid(), null, null);
    raise exception 'TEST 3 FAILED: placed an order without a session';
  exception when insufficient_privilege then
    raise notice 'TEST 3 PASSED: checkout rejected for a caller with no session';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: a signed-in buyer places a multi-shop order
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
declare
  v_oid     uuid;
  v_status  public.order_status;
  v_sub     int;
  v_total   int;
  v_subs    int;
  v_items   int;
  v_rate    numeric;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":2},
      {"product_id":"51100000-0000-0000-0000-000000000004","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria', null);

  if v_oid is null then
    raise exception 'TEST 4 FAILED: place_order returned no id';
  end if;
  perform set_config('gifto_test.order_id', v_oid::text, false);

  select status, subtotal_minor, total_minor into v_status, v_sub, v_total
    from public.orders where id = v_oid;

  if v_status <> 'placed' then
    raise exception 'TEST 4 FAILED: status=%', v_status;
  end if;
  -- 2 x 10000 (Shop A) + 1 x 7500 (Shop B) = 27500
  if v_sub <> 27500 or v_total <> 27500 then
    raise exception 'TEST 4 FAILED: subtotal=% total=%', v_sub, v_total;
  end if;

  if (select sum(i.unit_price_minor * i.quantity)
        from public.order_items i
        join public.order_vendors v on v.id = i.order_vendor_id
       where v.order_id = v_oid) <> 27500 then
    raise exception 'TEST 4 FAILED: line totals do not add up to the order subtotal';
  end if;

  select count(*) into v_subs from public.order_vendors where order_id = v_oid;
  if v_subs <> 2 then
    raise exception 'TEST 4 FAILED: % suborders (expected 2)', v_subs;
  end if;

  select count(*) into v_items
    from public.order_items i
    join public.order_vendors v on v.id = i.order_vendor_id
   where v.order_id = v_oid;
  if v_items <> 2 then
    raise exception 'TEST 4 FAILED: % items (expected 2)', v_items;
  end if;

  if (select stock from public.products where id = '51100000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'TEST 4 FAILED: shop A stock not decremented';
  end if;
  if (select stock from public.products where id = '51100000-0000-0000-0000-000000000004') <> 9 then
    raise exception 'TEST 4 FAILED: shop B stock not decremented';
  end if;

  -- per-vendor commission snapshots, taken from each vendor row
  if (select commission_rate from public.order_vendors
       where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000001') <> 0.08 then
    raise exception 'TEST 4 FAILED: shop A commission not snapshotted';
  end if;
  if (select commission_rate from public.order_vendors
       where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000002') <> 0.15 then
    raise exception 'TEST 4 FAILED: shop B commission not snapshotted';
  end if;

  -- unit prices come from the database, never from the client payload
  if exists (
    select 1 from public.order_items i
      join public.products p on p.id = i.product_id
     where i.unit_price_minor <> p.price_minor
  ) then
    raise exception 'TEST 4 FAILED: item prices do not match the catalog';
  end if;

  raise notice 'TEST 4 PASSED: multi-shop order split, priced from the catalog and stocked';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4b: the stock ledger — checked by the platform, not by the buyer
-- (inventory_movements is readable only by the shop and by the platform admin)
-- ---------------------------------------------------------------------------
reset role;
do $$
declare v_oid uuid;
begin
  v_oid := current_setting('gifto_test.order_id')::uuid;
  if (select count(*) from public.inventory_movements where order_id = v_oid) <> 2 then
    raise exception 'TEST 4b FAILED: inventory movements not recorded';
  end if;
  if exists (select 1 from public.inventory_movements
              where order_id = v_oid and delta >= 0) then
    raise exception 'TEST 4b FAILED: placement should only decrease stock';
  end if;
  raise notice 'TEST 4b PASSED: placement wrote one stock decrease per line';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: the buyer sees their order, a stranger sees nothing
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid; v_subs int;
begin
  v_oid := current_setting('gifto_test.order_id')::uuid;
  select count(*) into v_subs from public.order_vendors where order_id = v_oid;
  if v_subs <> 2 then
    raise exception 'TEST 5 FAILED: buyer sees % suborders', v_subs;
  end if;
  raise notice 'TEST 5 PASSED: buyer reads both suborders of their own order';
end $$;

set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000002"}';
do $$
declare v_oid uuid; v_subs int; v_orders int;
begin
  v_oid := current_setting('gifto_test.order_id')::uuid;
  select count(*) into v_subs from public.order_vendors where order_id = v_oid;
  select count(*) into v_orders from public.orders;
  if v_subs <> 0 or v_orders <> 0 then
    raise exception 'TEST 5 FAILED: stranger sees subs=% orders=%', v_subs, v_orders;
  end if;
  raise notice 'TEST 5 PASSED: another customer cannot see the order';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: each vendor sees only its own suborder
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid; v_subs int;
begin
  v_oid := current_setting('gifto_test.order_id')::uuid;
  select count(*) into v_subs from public.order_vendors where order_id = v_oid;
  if v_subs <> 1 then
    raise exception 'TEST 6 FAILED: shop A sees % suborders', v_subs;
  end if;
  if not exists (select 1 from public.order_vendors
                  where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000001') then
    raise exception 'TEST 6 FAILED: shop A missing its own suborder';
  end if;
  raise notice 'TEST 6 PASSED: shop A sees only its own suborder';
end $$;

set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000003"}';
do $$
declare v_oid uuid; v_subs int;
begin
  v_oid := current_setting('gifto_test.order_id')::uuid;
  select count(*) into v_subs from public.order_vendors where order_id = v_oid;
  if v_subs <> 1 then
    raise exception 'TEST 6 FAILED: shop B sees % suborders', v_subs;
  end if;
  raise notice 'TEST 6 PASSED: shop B sees only its own suborder';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6b: a vendor reads the delivery address of its own orders only
--
-- A shop must see where its suborders go, so `orders: vendor read` exposes the
-- parent order — but only when it contains one of that shop's suborders.
-- ---------------------------------------------------------------------------
reset role;
do $$
declare v_ov uuid; v_ov_p uuid;
begin
  insert into public.orders (
    id, user_id, status, subtotal_minor, total_minor,
    recipient_name, contact_phone, address_line, city, governorate
  ) values (
    '61100000-0000-0000-0000-000000000001',
    '11100000-0000-0000-0000-000000000002',
    'placed', 7500, 7500,
    'Other Buyer', '01009998877', '9 Other Street', 'Cairo', 'Cairo'
  );

  insert into public.order_vendors (
    order_id, vendor_id, status, subtotal_minor, commission_rate
  ) values (
    '61100000-0000-0000-0000-000000000001',
    '41100000-0000-0000-0000-000000000002',
    'placed', 7500, 0.1500
  )
  returning id into v_ov;

  insert into public.order_items (
    order_vendor_id, product_id, product_name, product_slug,
    unit_price_minor, quantity, line_total_minor
  ) values (
    v_ov, '51100000-0000-0000-0000-000000000004', 'B One', 'b-one', 7500, 1, 7500
  );

  -- A pending shop's historical order. The shop must not read its PII.
  insert into public.orders (
    id, user_id, status, subtotal_minor, total_minor,
    recipient_name, contact_phone, address_line, city, governorate
  ) values (
    '61100000-0000-0000-0000-000000000002',
    '11100000-0000-0000-0000-000000000002',
    'placed', 5000, 5000,
    'Pending Buyer', '01007776655', '5 Pending Street', 'Giza', 'Giza'
  );

  insert into public.order_vendors (
    order_id, vendor_id, status, subtotal_minor, commission_rate
  ) values (
    '61100000-0000-0000-0000-000000000002',
    '41100000-0000-0000-0000-000000000003',
    'placed', 5000, 0.1200
  )
  returning id into v_ov_p;

  insert into public.order_items (
    order_vendor_id, product_id, product_name, product_slug,
    unit_price_minor, quantity, line_total_minor
  ) values (
    v_ov_p, '51100000-0000-0000-0000-000000000005', 'P One', 'p-one', 5000, 1, 5000
  );

  insert into public.inventory_movements (
    product_id, delta, reason, order_id
  ) values (
    '51100000-0000-0000-0000-000000000005', -1, 'order_placed',
    '61100000-0000-0000-0000-000000000002'
  );

  perform set_config(
    'gifto_test.other_order_id',
    '61100000-0000-0000-0000-000000000001',
    false
  );
  perform set_config(
    'gifto_test.pending_order_id',
    '61100000-0000-0000-0000-000000000002',
    false
  );
end $$;

set role authenticated;
set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000001"}';
do $$
declare
  v_own   uuid;
  v_addr  text;
  v_seen  int;
  v_other int;
begin
  v_own := current_setting('gifto_test.order_id')::uuid;

  select address_line into v_addr from public.orders where id = v_own;
  if v_addr is null then
    raise exception 'TEST 6b FAILED: shop A cannot read its own order address';
  end if;

  select count(*) into v_seen from public.orders;
  if v_seen <> 1 then
    raise exception 'TEST 6b FAILED: shop A sees % orders (expected 1)', v_seen;
  end if;

  select count(*) into v_other from public.orders
   where id = current_setting('gifto_test.other_order_id')::uuid;
  if v_other <> 0 then
    raise exception 'TEST 6b FAILED: shop A can read another shop''s order';
  end if;
  raise notice 'TEST 6b PASSED: shop A reads only the order holding its suborder';
end $$;

set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000003"}';
do $$
declare v_seen int;
begin
  select count(*) into v_seen from public.orders;
  if v_seen <> 2 then
    raise exception 'TEST 6b FAILED: shop B sees % orders (expected 2)', v_seen;
  end if;
  raise notice 'TEST 6b PASSED: shop B reads every order that holds its suborders';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6c: a pending shop cannot read order, suborder, item, stock or PII data
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000004"}';
do $$
declare v_oid uuid; v_seen int;
begin
  v_oid := current_setting('gifto_test.pending_order_id')::uuid;

  select count(*) into v_seen from public.orders where id = v_oid;
  if v_seen <> 0 then raise exception 'TEST 6c FAILED: pending shop saw % orders', v_seen; end if;

  select count(*) into v_seen from public.order_vendors where order_id = v_oid;
  if v_seen <> 0 then raise exception 'TEST 6c FAILED: pending shop saw % suborders', v_seen; end if;

  select count(*) into v_seen from public.order_items i
    join public.order_vendors ov on ov.id = i.order_vendor_id
   where ov.order_id = v_oid;
  if v_seen <> 0 then raise exception 'TEST 6c FAILED: pending shop saw % items', v_seen; end if;

  select count(*) into v_seen from public.inventory_movements where order_id = v_oid;
  if v_seen <> 0 then raise exception 'TEST 6c FAILED: pending shop saw % movements', v_seen; end if;

  if public.is_vendor_active_member('41100000-0000-0000-0000-000000000003') then
    raise exception 'TEST 6c FAILED: pending shop is an active member';
  end if;
  raise notice 'TEST 6c PASSED: pending shop order/PII/stock reads denied';
end $$;

set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000003"}';

-- ---------------------------------------------------------------------------
-- TEST 7: a vendor confirms its suborder; the parent order follows
-- ---------------------------------------------------------------------------
do $$
declare
  v_oid   uuid;
  v_ov    uuid;
  v_status public.order_status;
  v_at    timestamptz;
begin
  v_oid := current_setting('gifto_test.order_id')::uuid;

  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000002';

  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');

  select status, confirmed_at into v_status, v_at
    from public.order_vendors where id = v_ov;

  if v_status <> 'confirmed' or v_at is null then
    raise exception 'TEST 7 FAILED: status=% confirmed_at=%', v_status, v_at;
  end if;

  if (select status from public.orders where id = v_oid) <> 'confirmed' then
    raise exception 'TEST 7 FAILED: parent order did not follow';
  end if;
  raise notice 'TEST 7 PASSED: vendor confirmed the suborder and the parent order advanced';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 8: a vendor cannot skip fulfilment stages
-- ---------------------------------------------------------------------------
do $$
declare v_oid uuid; v_ov uuid;
begin
  v_oid := current_setting('gifto_test.order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000002';

  begin
    perform public.set_order_vendor_status(v_ov, 'delivered', 'confirmed');
    raise exception 'TEST 8 FAILED: jumped confirmed -> delivered';
  exception when check_violation then
    raise notice 'TEST 8 PASSED: invalid status transition rejected';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 9: money columns on a suborder are read-only
-- ---------------------------------------------------------------------------
do $$
declare v_oid uuid; v_ov uuid;
begin
  v_oid := current_setting('gifto_test.order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000002';

  begin
    update public.order_vendors set subtotal_minor = 1 where id = v_ov;
    raise exception 'TEST 9 FAILED: vendor changed the subtotal';
  exception when insufficient_privilege then
    raise notice 'TEST 9 PASSED: subtotal/commission columns are not updatable by vendors';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 10: a vendor cannot touch another shop's suborder; staff cannot act
-- ---------------------------------------------------------------------------
do $$
declare v_oid uuid; v_ov uuid; v_status public.order_status;
begin
  v_oid := current_setting('gifto_test.order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000001';

  begin
    perform public.set_order_vendor_status(v_ov, 'cancelled', 'placed');
    raise exception 'TEST 10 FAILED: shop B cancelled shop A''s suborder';
  exception when insufficient_privilege then
    null;
  end;

  select status into v_status from public.order_vendors where id = v_ov;
  if v_status <> 'placed' then
    raise exception 'TEST 10 FAILED: shop B changed shop A''s suborder to %', v_status;
  end if;
  raise notice 'TEST 10 PASSED: cross-vendor status update was denied';
end $$;

set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000002"}';
do $$
declare v_oid uuid; v_ov uuid; v_status public.order_status;
begin
  v_oid := current_setting('gifto_test.order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000001';

  begin
    perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
    raise exception 'TEST 10 FAILED: staff member advanced the suborder';
  exception when insufficient_privilege then
    null;
  end;

  select status into v_status from public.order_vendors where id = v_ov;
  if v_status <> 'placed' then
    raise exception 'TEST 10 FAILED: staff member advanced the suborder to %', v_status;
  end if;
  raise notice 'TEST 10 PASSED: a staff member cannot advance a suborder';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 11: checkout rejects bad input
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
declare v_msg text;
begin
  -- insufficient stock (A Two has 2)
  begin
    perform gifto_test.place_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000002","quantity":3}]'::jsonb,
      'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
    raise exception 'TEST 11 FAILED: ordered more than stock';
  exception when check_violation then
    null; -- not expected
  when others then
    if sqlstate <> '22023' or sqlerrm not like '%in stock%' then
      raise;
    end if;
  end;

  -- a draft product
  begin
    perform gifto_test.place_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000003","quantity":1}]'::jsonb,
      'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
    raise exception 'TEST 11 FAILED: ordered a draft product';
  exception when others then
    if sqlstate <> '22023' or sqlerrm not like '%no longer available%' then
      raise;
    end if;
  end;

  -- a product belonging to a pending vendor
  begin
    perform gifto_test.place_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000005","quantity":1}]'::jsonb,
      'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
    raise exception 'TEST 11 FAILED: ordered from a pending vendor';
  exception when others then
    if sqlstate <> '22023' or sqlerrm not like '%no longer available%' then
      raise;
    end if;
  end;

  -- empty cart
  begin
    perform gifto_test.place_order(
      '[]'::jsonb, 'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
    raise exception 'TEST 11 FAILED: accepted an empty cart';
  exception when others then
    if sqlstate <> '22023' or sqlerrm not like '%empty%' then
      raise;
    end if;
  end;

  -- duplicate lines
  begin
    perform gifto_test.place_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1},
        {"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
    raise exception 'TEST 11 FAILED: accepted duplicate cart lines';
  exception when others then
    if sqlstate <> '22023' or sqlerrm not like '%once%' then
      raise;
    end if;
  end;

  -- missing address
  begin
    perform gifto_test.place_order(
      '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'Sara Buyer', '01001112233', '', 'Alexandria', 'Alexandria');
    raise exception 'TEST 11 FAILED: accepted an empty address';
  exception when others then
    if sqlstate <> '22023' or sqlerrm not like '%address%' then
      raise;
    end if;
  end;

  -- nothing above may have written an order
  if (select count(*) from public.orders) <> 1 then
    raise exception 'TEST 11 FAILED: rejected checkouts still created orders';
  end if;

  raise notice 'TEST 11 PASSED: stock, visibility, cart and address checks all reject';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 12: orders cannot be written directly through PostgREST
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.orders (user_id, subtotal_minor, total_minor,
    recipient_name, contact_phone, address_line, city, governorate)
  values ('11100000-0000-0000-0000-000000000001', 1, 1, 'A', '123456', 'Street', 'Alex', 'Alex');
  raise exception 'TEST 12 FAILED: inserted an order directly';
exception when insufficient_privilege then
  raise notice 'TEST 12 PASSED: orders are written only by the checkout function';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 13: a platform admin can read every order
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '31100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"31100000-0000-0000-0000-000000000001"}';
do $$
declare v_orders int;
begin
  select count(*) into v_orders from public.orders;
  if v_orders < 1 then
    raise exception 'TEST 13 FAILED: admin sees % orders', v_orders;
  end if;
  raise notice 'TEST 13 PASSED: platform admin reads all orders';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 14: fulfilment completes and the parent order becomes delivered
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid; v_ov uuid; v_at timestamptz;
begin
  v_oid := current_setting('gifto_test.order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000001';

  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');

  select delivered_at into v_at from public.order_vendors where id = v_ov;
  if v_at is null then
    raise exception 'TEST 14 FAILED: delivered_at not stamped';
  end if;

  if (select status from public.orders where id = v_oid) <> 'confirmed' then
    raise exception 'TEST 14 FAILED: parent order should stay in progress until both shops finish';
  end if;
  raise notice 'TEST 14 PASSED: shop A completed the full fulfilment chain';
end $$;

set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000003"}';
do $$
declare v_oid uuid; v_ov uuid; v_parent public.order_status;
begin
  v_oid := current_setting('gifto_test.order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000002';

  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');

  select status into v_parent from public.orders where id = v_oid;
  if v_parent <> 'delivered' then
    raise exception 'TEST 14 FAILED: parent order is % after both suborders delivered', v_parent;
  end if;
  raise notice 'TEST 14 PASSED: parent order becomes delivered when every suborder is';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 15: only the owner may cancel, and only before a shop starts
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
declare v_second uuid; v_third uuid; v_stock int;
begin
  -- second order, still cancellable
  v_second := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.second_order_id', v_second::text, false);

  v_stock := (select stock from public.products where id = '51100000-0000-0000-0000-000000000001');
  if v_stock <> 2 then
    raise exception 'TEST 15 FAILED: expected stock 2, got %', v_stock;
  end if;

  perform public.cancel_order(v_second);

  if (select status from public.orders where id = v_second) <> 'cancelled' then
    raise exception 'TEST 15 FAILED: order not cancelled';
  end if;
  if (select count(*) from public.order_vendors where order_id = v_second and status <> 'cancelled') <> 0 then
    raise exception 'TEST 15 FAILED: suborder left alive after cancel';
  end if;
  v_stock := (select stock from public.products where id = '51100000-0000-0000-0000-000000000001');
  if v_stock <> 3 then
    raise exception 'TEST 15 FAILED: stock not restored (expected 3, got %)', v_stock;
  end if;
  -- third order, confirmed by a vendor -> no longer cancellable
  v_third := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000004","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.third_order_id', v_third::text, false);

  raise notice 'TEST 15a PASSED: cancellable order cancelled; stock restored';
end $$;

-- another customer cannot cancel someone else's order
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000002"}';
do $$
begin
  begin
    perform public.cancel_order(current_setting('gifto_test.third_order_id')::uuid);
    raise exception 'TEST 15 FAILED: a stranger cancelled an order';
  exception when insufficient_privilege then
    raise notice 'TEST 15 PASSED: a stranger cannot cancel someone else''s order';
  end;
end $$;

-- once a vendor confirms, the customer can no longer cancel
set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000003"}';
do $$
declare v_third uuid; v_ov uuid;
begin
  v_third := current_setting('gifto_test.third_order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_third and vendor_id = '41100000-0000-0000-0000-000000000002';
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
end $$;

set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
begin
  begin
    perform public.cancel_order(current_setting('gifto_test.third_order_id')::uuid);
    raise exception 'TEST 15 FAILED: cancelled after a vendor confirmed';
  exception when check_violation then
    raise notice 'TEST 15b PASSED: cancellation blocked once processing has started';
  end;
end $$;

-- the restock ledger entry from the cancellation above, read by the platform
reset role;
do $$
declare v_second uuid;
begin
  v_second := current_setting('gifto_test.second_order_id')::uuid;
  if (select count(*) from public.inventory_movements
       where order_id = v_second and delta > 0 and reason = 'order_cancelled') <> 1 then
    raise exception 'TEST 15 FAILED: restock movement not recorded';
  end if;
  raise notice 'TEST 15 PASSED: cancellation logged a restock movement';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- TEST 16: a failed COD delivery after dispatch cancels and restocks
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1},
      {"product_id":"51100000-0000-0000-0000-000000000004","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.failed_delivery_order_id', v_oid::text, false);
end $$;

-- Shop A completes its line.
set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid; v_ov uuid;
begin
  v_oid := current_setting('gifto_test.failed_delivery_order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000001';

  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

-- Shop B dispatches, then the COD delivery fails.
set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000003"}';
do $$
declare
  v_oid          uuid;
  v_ov           uuid;
  v_stock_before int;
  v_stock_after  int;
  v_cancelled_at timestamptz;
  v_parent       public.order_status;
begin
  v_oid := current_setting('gifto_test.failed_delivery_order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000002';

  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');

  select stock into v_stock_before from public.products
   where id = '51100000-0000-0000-0000-000000000004';

  perform public.set_order_vendor_status(
    v_ov, 'cancelled', 'shipped', 'unreachable');

  select stock into v_stock_after from public.products
   where id = '51100000-0000-0000-0000-000000000004';
  if v_stock_after <> v_stock_before + 1 then
    raise exception 'TEST 16 FAILED: failed delivery did not restock (before %, after %)',
      v_stock_before, v_stock_after;
  end if;

  select cancelled_at into v_cancelled_at from public.order_vendors where id = v_ov;
  if v_cancelled_at is null then
    raise exception 'TEST 16 FAILED: cancelled_at not stamped after dispatch';
  end if;

  select status into v_parent from public.orders where id = v_oid;
  if v_parent <> 'partially_completed' then
    raise exception 'TEST 16 FAILED: mixed parent status is % (expected partially_completed)', v_parent;
  end if;

  -- A repeated cancellation must not restock twice.
  begin
    perform public.set_order_vendor_status(v_ov, 'cancelled', 'cancelled');
    raise exception 'TEST 16 FAILED: repeated cancellation was accepted';
  exception when check_violation then
    null;
  end;
  select stock into v_stock_after from public.products
   where id = '51100000-0000-0000-0000-000000000004';
  if v_stock_after <> v_stock_before + 1 then
    raise exception 'TEST 16 FAILED: repeated cancellation restocked twice (stock %)', v_stock_after;
  end if;

  raise notice 'TEST 16 PASSED: failed COD delivery cancelled, restocked once, parent partially_completed';
end $$;

reset role;
do $$
declare v_oid uuid;
begin
  v_oid := current_setting('gifto_test.failed_delivery_order_id')::uuid;
  if (select count(*) from public.inventory_movements
       where order_id = v_oid
         and product_id = '51100000-0000-0000-0000-000000000004'
         and delta = 1
         and reason = 'order_cancelled') <> 1 then
    raise exception 'TEST 16 FAILED: failed-delivery restock movement not recorded once';
  end if;
  raise notice 'TEST 16 PASSED: failed-delivery restock logged exactly one movement';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 17: price-change consent on the signed-in path (P1-03)
-- ---------------------------------------------------------------------------
-- Restore known stock/prices first: earlier tests bought against these rows.
reset role;
update public.products set stock = 5, price_minor = 10000
 where id = '51100000-0000-0000-0000-000000000001';

set role authenticated;
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
declare
  v_oid uuid;
  v_orders_before int;
  v_orders_after int;
  v_blocked boolean := false;
  v_total int;
begin
  -- (a) Unchanged prices place normally.
  v_oid := public.place_order_with_price_check(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', 'buyer@orders.gifto.test',
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(),
    '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
    10000);
  if v_oid is null then
    raise exception 'TEST 17 FAILED: unchanged prices did not place';
  end if;
  select total_minor into v_total from public.orders where id = v_oid;
  if v_total <> 10000 then
    raise exception 'TEST 17 FAILED: placed total is % not 10000', v_total;
  end if;
  raise notice 'TEST 17a PASSED: unchanged prices place normally';
end $$;

-- The vendor changes the price between cart and submit (as superuser;
-- authenticated holds no UPDATE on products).
reset role;
update public.products set price_minor = 12000
 where id = '51100000-0000-0000-0000-000000000001';

set role authenticated;
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
declare
  v_oid uuid;
  v_orders_before int;
  v_orders_after int;
  v_blocked boolean := false;
  v_total int;
begin
  -- (b) A price changed between cart and submit blocks the order.
  select count(*) into v_orders_before from public.orders;
  begin
    perform public.place_order_with_price_check(
      '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'Sara Buyer', '01001112233', 'buyer@orders.gifto.test',
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      gen_random_uuid(),
      '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
      10000);
  exception when check_violation then
    if sqlerrm like 'PRICE_CHANGED:%' then
      v_blocked := true;
    else
      raise exception 'TEST 17 FAILED: wrong error for a price change: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 17 FAILED: changed price did not block the order';
  end if;
  select count(*) into v_orders_after from public.orders;
  if v_orders_after <> v_orders_before then
    raise exception 'TEST 17 FAILED: blocked order still created a row';
  end if;
  if (select stock from public.products where id = '51100000-0000-0000-0000-000000000001') <> 4 then
    raise exception 'TEST 17 FAILED: blocked order changed stock';
  end if;
  raise notice 'TEST 17b PASSED: changed price blocks with PRICE_CHANGED, nothing created';

  -- (c) Re-confirming with the new expected prices places at the new price.
  v_oid := public.place_order_with_price_check(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', 'buyer@orders.gifto.test',
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(),
    '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":12000}]'::jsonb,
    12000);
  if v_oid is null then
    raise exception 'TEST 17 FAILED: re-confirm did not place';
  end if;
  select total_minor into v_total from public.orders where id = v_oid;
  if v_total <> 12000 then
    raise exception 'TEST 17 FAILED: re-confirmed total is % not 12000', v_total;
  end if;
  raise notice 'TEST 17c PASSED: re-confirm places at the new price';

  -- (d) A wrong expected total blocks even when unit prices match.
  v_blocked := false;
  begin
    perform public.place_order_with_price_check(
      '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'Sara Buyer', '01001112233', 'buyer@orders.gifto.test',
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      gen_random_uuid(),
      '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":12000}]'::jsonb,
      10000);
  exception when check_violation then
    if sqlerrm like 'PRICE_CHANGED:%' then
      v_blocked := true;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 17 FAILED: wrong expected total did not block';
  end if;
  raise notice 'TEST 17d PASSED: wrong expected total blocks with PRICE_CHANGED';

  -- (f) S-01: null expected prices for a priceable cart are refused, not
  -- treated as "no check". A signed-in caller reaching the public RPC
  -- directly via PostgREST with p_expected_prices = null must not be
  -- able to order at live prices with no consent. Stock is 3 here
  -- (17a and 17c placed, 17b/17d blocked); the live price is 12000.
  select count(*) into v_orders_before from public.orders;
  v_blocked := false;
  begin
    perform public.place_order_with_price_check(
      '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'Sara Buyer', '01001112233', 'buyer@orders.gifto.test',
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      gen_random_uuid(),
      null,
      null);
  exception when data_exception then
    if sqlerrm like '%could not be verified%' then
      v_blocked := true;
    else
      raise exception 'TEST 17 FAILED: wrong error for null expected prices: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 17 FAILED: null expected prices did not block the order';
  end if;
  select count(*) into v_orders_after from public.orders;
  if v_orders_after <> v_orders_before then
    raise exception 'TEST 17 FAILED: null-price order still created a row';
  end if;
  if (select stock from public.products where id = '51100000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'TEST 17 FAILED: null-price attempt changed stock';
  end if;
  raise notice 'TEST 17f PASSED: null expected prices refused, nothing created';

  -- (g) S-01: a null expected total with real expected prices is refused
  -- the same way — the total is part of the consent, not optional.
  select count(*) into v_orders_before from public.orders;
  v_blocked := false;
  begin
    perform public.place_order_with_price_check(
      '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'Sara Buyer', '01001112233', 'buyer@orders.gifto.test',
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      gen_random_uuid(),
      '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":12000}]'::jsonb,
      null);
  exception when data_exception then
    if sqlerrm like '%could not be verified%' then
      v_blocked := true;
    else
      raise exception 'TEST 17 FAILED: wrong error for null expected total: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 17 FAILED: null expected total did not block the order';
  end if;
  select count(*) into v_orders_after from public.orders;
  if v_orders_after <> v_orders_before then
    raise exception 'TEST 17 FAILED: null-total order still created a row';
  end if;
  if (select stock from public.products where id = '51100000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'TEST 17 FAILED: null-total attempt changed stock';
  end if;
  raise notice 'TEST 17g PASSED: null expected total refused, nothing created';

  -- (e) R-03: the legacy no-check wrapper is gone. An authenticated caller
  -- can no longer reach place_order_with_idempotency at all — the function
  -- does not exist (42883) — and no order is created by the attempt. The
  -- only signed-in checkout path is place_order_with_price_check, covered
  -- in (a)–(d) above.
  select count(*) into v_orders_before from public.orders;
  v_blocked := false;
  begin
    perform public.place_order_with_idempotency(
      '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'Sara Buyer', '01001112233', 'buyer@orders.gifto.test',
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      gen_random_uuid());
  exception when undefined_function then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 17 FAILED: legacy place_order_with_idempotency is still callable';
  end if;
  select count(*) into v_orders_after from public.orders;
  if v_orders_after <> v_orders_before then
    raise exception 'TEST 17 FAILED: legacy checkout attempt created an order';
  end if;
  raise notice 'TEST 17 PASSED: signed-in price consent blocks, re-confirms, and totals are checked';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 18 (P1-15, H-08): shipping records courier, tracking reference and
-- handover time; shipping without them fails; clients cannot write the
-- handover columns directly.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria', null);
  perform set_config('gifto_test.courier_order_id', v_oid::text, false);
end $$;

reset role;
do $$
begin
  -- The new columns are not client-writable: the RPC is the only write path.
  if has_column_privilege('authenticated', 'public.order_vendors', 'courier_name', 'update')
     or has_column_privilege('authenticated', 'public.order_vendors', 'tracking_ref', 'update')
     or has_column_privilege('authenticated', 'public.order_vendors', 'handed_over_at', 'update') then
    raise exception 'TEST 18 FAILED: handover columns are directly updatable';
  end if;
  if has_function_privilege('anon', 'public.set_order_vendor_status(uuid, public.order_status, public.order_status, text, text, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_order_vendor_status(uuid, public.order_status, public.order_status, text, text, text, text)', 'execute') then
    raise exception 'TEST 18 FAILED: transition RPC grants are wrong';
  end if;
  raise notice 'TEST 18 PASSED: handover columns are RPC-only';
end $$;

set role authenticated;
set request.jwt.claim.sub = '21100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"21100000-0000-0000-0000-000000000001"}';
do $$
declare
  v_oid uuid;
  v_ov uuid;
  v_row public.order_vendors;
begin
  v_oid := current_setting('gifto_test.courier_order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000001';

  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');

  -- Shipping without courier/tracking fails and changes nothing.
  begin
    perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed');
    raise exception 'TEST 18 FAILED: shipping without courier was accepted';
  exception when check_violation then
    null;
  end;

  begin
    perform public.set_order_vendor_status(
      v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', null);
    raise exception 'TEST 18 FAILED: shipping without a tracking reference was accepted';
  exception when check_violation then
    null;
  end;

  if (select status from public.order_vendors where id = v_ov) <> 'confirmed' then
    raise exception 'TEST 18 FAILED: rejected shipment changed the status';
  end if;

  -- Shipping with courier + tracking stores the handover record.
  perform public.set_order_vendor_status(
    v_ov, 'shipped', 'confirmed', null, null, 'Bosta', 'BST-77881');

  select * into v_row from public.order_vendors where id = v_ov;
  if v_row.status <> 'shipped'
     or v_row.courier_name <> 'Bosta'
     or v_row.tracking_ref <> 'BST-77881'
     or v_row.handed_over_at is null then
    raise exception 'TEST 18 FAILED: handover record was not stored (status=%, courier=%, tracking=%, handed_over_at=%)',
      v_row.status, v_row.courier_name, v_row.tracking_ref, v_row.handed_over_at;
  end if;
  raise notice 'TEST 18 PASSED: shipping without courier/tracking fails; with them it records the handover';

  -- Courier/tracking passed to a non-ship transition are ignored, never stored.
  perform public.set_order_vendor_status(
    v_ov, 'delivered', 'shipped', null, null, 'Other Courier', 'OTHER-1');
  select * into v_row from public.order_vendors where id = v_ov;
  if v_row.courier_name <> 'Bosta' or v_row.tracking_ref <> 'BST-77881' then
    raise exception 'TEST 18 FAILED: a later transition overwrote the handover record';
  end if;
  raise notice 'TEST 18 PASSED: handover survives the delivery transition unchanged';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 19 (R-03): the legacy no-check checkout RPCs are retired
-- ---------------------------------------------------------------------------
-- Migration 51 dropped place_order, place_order_with_idempotency and
-- place_guest_order. No API role can execute them (they do not exist), and
-- the price-check RPCs are the only checkout paths left.
reset role;
do $$
begin
  if to_regprocedure('public.place_order(jsonb,text,text,text,text,text,text)') is not null
     or to_regprocedure('public.place_order_with_idempotency(jsonb,text,text,text,text,text,text,text,uuid)') is not null
     or to_regprocedure('public.place_guest_order(jsonb,text,text,text,text,text,text,text,uuid,text)') is not null then
    raise exception 'TEST 19 FAILED: a legacy no-check checkout RPC still exists';
  end if;

  if not has_function_privilege('authenticated', 'public.place_order_with_price_check(jsonb,text,text,text,text,text,text,text,uuid,jsonb,int,boolean,text,date,text)', 'execute')
     or has_function_privilege('anon', 'public.place_order_with_price_check(jsonb,text,text,text,text,text,text,text,uuid,jsonb,int,boolean,text,date,text)', 'execute') then
    raise exception 'TEST 19 FAILED: place_order_with_price_check grants are wrong';
  end if;

  if not has_function_privilege('service_role', 'public.place_guest_order_with_price_check(jsonb,text,text,text,text,text,text,text,uuid,text,jsonb,int,boolean,text,date,text)', 'execute')
     or has_function_privilege('authenticated', 'public.place_guest_order_with_price_check(jsonb,text,text,text,text,text,text,text,uuid,text,jsonb,int,boolean,text,date,text)', 'execute') then
    raise exception 'TEST 19 FAILED: place_guest_order_with_price_check grants are wrong';
  end if;

  raise notice 'TEST 19 PASSED: legacy no-check checkout RPCs are gone; only the price-check RPCs remain';
end $$;

-- TEST 20 (migration 62): the price consent is recorded append-only,
-- once per order, for signed-in and guest checkout alike
-- ---------------------------------------------------------------------------
reset role;
update public.products set stock = 5, price_minor = 10000
 where id = '51100000-0000-0000-0000-000000000001';

set role authenticated;
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
declare
  v_oid uuid;
  v_key uuid := gen_random_uuid();
  v_blocked boolean := false;
  v_count int;
begin
  -- (a) A signed-in order records its consent: who, what prices, what
  -- was charged (expected total = live total by construction).
  v_oid := public.place_order_with_price_check(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', 'buyer@orders.gifto.test',
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    v_key,
    '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
    10000);
  if v_oid is null then
    raise exception 'TEST 20 FAILED: signed-in order did not place';
  end if;

  if not exists (
    select 1 from public.price_consent_events
     where order_id = v_oid
       and user_id = '11100000-0000-0000-0000-000000000001'
       and guest_token_hash is null
       and expected_total_minor = 10000
       and live_total_minor = 10000
       and expected_prices @> '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb
  ) then
    raise exception 'TEST 20 FAILED: signed-in consent was not recorded (who/what/charged)';
  end if;
  raise notice 'TEST 20a PASSED: signed-in consent recorded with expected and charged totals';

  -- (b) An idempotency retry returns the same order and records the
  -- consent exactly once.
  if public.place_order_with_price_check(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', 'buyer@orders.gifto.test',
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    v_key,
    '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
    10000) <> v_oid then
    raise exception 'TEST 20 FAILED: idempotency retry did not return the same order';
  end if;

  select count(*) into v_count from public.price_consent_events where order_id = v_oid;
  if v_count <> 1 then
    raise exception 'TEST 20 FAILED: idempotency retry recorded % consent rows, expected 1', v_count;
  end if;
  raise notice 'TEST 20b PASSED: idempotency retry records the consent exactly once';
end $$;

-- (c) A guest order records the consent keyed by the token hash, with
-- no user id.
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-token-consent', 'sha256'), 'hex');
  v_oid uuid;
begin
  v_oid := gifto_test.place_guest_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Nour Guest', '01001112233', 'nour@orders.gifto.test',
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(), v_hash);

  if v_oid is null then
    raise exception 'TEST 20 FAILED: guest order did not place';
  end if;

  if not exists (
    select 1 from public.price_consent_events
     where order_id = v_oid
       and user_id is null
       and guest_token_hash = v_hash
       and expected_total_minor = 10000
       and live_total_minor = 10000
  ) then
    raise exception 'TEST 20 FAILED: guest consent was not recorded by token hash';
  end if;
  raise notice 'TEST 20c PASSED: guest consent recorded by token hash, no user id';
end $$;

-- (d) The trail is append-only: no API role can write it directly, and
-- the internal recorder is not executable by authenticated users.
set role authenticated;
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
declare
  v_blocked boolean := false;
  v_oid uuid := (select order_id from public.price_consent_events limit 1);
begin
  begin
    insert into public.price_consent_events
      (order_id, user_id, expected_prices, expected_total_minor, live_total_minor)
    values (v_oid, '11100000-0000-0000-0000-000000000001', '[]'::jsonb, 0, 0);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 20 FAILED: an authenticated user inserted a consent row';
  end if;

  v_blocked := false;
  begin
    update public.price_consent_events set live_total_minor = 0 where order_id = v_oid;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 20 FAILED: an authenticated user updated a consent row';
  end if;

  v_blocked := false;
  begin
    delete from public.price_consent_events where order_id = v_oid;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 20 FAILED: an authenticated user deleted a consent row';
  end if;

  if has_function_privilege('authenticated', 'public._record_price_consent_event(uuid,uuid,text,jsonb,int)', 'execute') then
    raise exception 'TEST 20 FAILED: _record_price_consent_event is executable by authenticated users';
  end if;
  raise notice 'TEST 20d PASSED: consent trail is append-only; the recorder is not API-callable';
end $$;

-- (e) A PRICE_CHANGED refusal records no consent row — but (migration
-- 64, S-08) it DOES record a refusal row, in a separate transaction:
-- the refusing transaction rolls back, so the refusal is recorded by
-- the checkout server action through _record_price_consent_refusal,
-- which the suite calls here as service_role to simulate it. The old
-- invariant ("a refused order records nothing anywhere") is replaced
-- intentionally: a refused attempt must be auditable.
reset role;
update public.products set price_minor = 12000
 where id = '51100000-0000-0000-0000-000000000001';

set role authenticated;
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
declare
  v_before int;
  v_after int;
  v_key uuid := gen_random_uuid();
  v_blocked boolean := false;
begin
  select count(*) into v_before from public.price_consent_events;

  begin
    perform public.place_order_with_price_check(
      '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'Sara Buyer', '01001112233', 'buyer@orders.gifto.test',
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      v_key,
      '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
      10000);
  exception when check_violation then
    if sqlerrm like 'PRICE_CHANGED:%' then
      v_blocked := true;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 20 FAILED: changed price did not block the order';
  end if;

  select count(*) into v_after from public.price_consent_events;
  if v_after <> v_before then
    raise exception 'TEST 20 FAILED: a refused order recorded a consent row';
  end if;
  raise notice 'TEST 20e PASSED: a PRICE_CHANGED refusal records no consent row';
end $$;

-- The refusal itself is recorded by the service-role recorder, in its
-- own transaction — exactly what the checkout server action does after
-- catching the PRICE_CHANGED error.
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_count int;
begin
  -- No refusal row exists yet for this attempt: the RPC refused the
  -- order, it did not record anything itself.
  select count(*) into v_count from public.price_consent_refusals;
  if v_count <> 0 then
    raise exception 'TEST 20 FAILED: a refusal row existed before recording';
  end if;
end $$;

-- Re-run the refused attempt's key through the recorder: the suite
-- cannot reuse the v_key variable across blocks, so record with a fresh
-- key for the same cart/prices and assert on that key instead.
do $$
declare
  v_key uuid := gen_random_uuid();
  v_count int;
begin
  perform public._record_price_consent_refusal(
    v_key,
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    '11100000-0000-0000-0000-000000000001',
    null,
    '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
    10000);

  if not exists (
    select 1 from public.price_consent_refusals
     where idempotency_key = v_key
       and user_id = '11100000-0000-0000-0000-000000000001'
       and guest_token_hash is null
       and expected_total_minor = 10000
       and live_total_minor = 12000
       and expected_prices @> '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb
  ) then
    raise exception 'TEST 20 FAILED: refusal was not recorded (who/what/expected/live)';
  end if;

  -- A retried recording for the same attempt is a no-op.
  perform public._record_price_consent_refusal(
    v_key,
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    '11100000-0000-0000-0000-000000000001',
    null,
    '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
    10000);
  select count(*) into v_count from public.price_consent_refusals
   where idempotency_key = v_key;
  if v_count <> 1 then
    raise exception 'TEST 20 FAILED: retried recording recorded % refusal rows, expected 1', v_count;
  end if;
  raise notice 'TEST 20e PASSED: a PRICE_CHANGED refusal records exactly one refusal row (expected 10000, live 12000)';
end $$;

-- (f) The refusal trail is append-only and the recorder is
-- self-validating: no API role can write it, it is not executable by
-- authenticated users, and a call with matching prices records nothing.
set role authenticated;
set request.jwt.claim.sub = '11100000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001"}';
do $$
declare
  v_blocked boolean := false;
  v_key uuid := (select idempotency_key from public.price_consent_refusals limit 1);
begin
  begin
    insert into public.price_consent_refusals
      (idempotency_key, user_id, expected_prices, expected_total_minor, live_total_minor)
    values (gen_random_uuid(), '11100000-0000-0000-0000-000000000001', '[]'::jsonb, 0, 0);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 20 FAILED: an authenticated user inserted a refusal row';
  end if;

  v_blocked := false;
  begin
    delete from public.price_consent_refusals where idempotency_key = v_key;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 20 FAILED: an authenticated user deleted a refusal row';
  end if;

  if has_function_privilege('authenticated', 'public._record_price_consent_refusal(uuid,jsonb,uuid,text,jsonb,int)', 'execute') then
    raise exception 'TEST 20 FAILED: _record_price_consent_refusal is executable by authenticated users';
  end if;
  raise notice 'TEST 20f PASSED: refusal trail is append-only; the recorder is not API-callable';
end $$;

-- (f, continued) A recording with matching prices is refused: the
-- recorder only records genuine mismatches.
reset role;
update public.products set price_minor = 10000
 where id = '51100000-0000-0000-0000-000000000001';

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_before int;
  v_after int;
  v_refused boolean := false;
begin
  select count(*) into v_before from public.price_consent_refusals;

  begin
    perform public._record_price_consent_refusal(
      gen_random_uuid(),
      '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      '11100000-0000-0000-0000-000000000001',
      null,
      '[{"product_id":"51100000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
      10000);
  exception when invalid_parameter_value then
    -- The recorder refuses with 22023, not 23514: "No price mismatch
    -- to record." (and its validation refusals share the same code).
    if sqlerrm like 'No price mismatch%' then
      v_refused := true;
    end if;
  end;
  if not v_refused then
    raise exception 'TEST 20 FAILED: a matching-prices recording was not refused';
  end if;

  select count(*) into v_after from public.price_consent_refusals;
  if v_after <> v_before then
    raise exception 'TEST 20 FAILED: a matching-prices call recorded a refusal row';
  end if;
  raise notice 'TEST 20f PASSED: a matching-prices recording is refused and records nothing';
  raise notice 'TEST 20 PASSED: price consent is recorded append-only, once per order';
end $$;

reset role;

rollback;
