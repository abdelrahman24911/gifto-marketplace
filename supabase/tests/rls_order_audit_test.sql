-- Gifto order status audit verification (migration 28).
--
-- Covers:
--   * revoked direct status writes and the single RPC transition path
--   * stale-page, invalid-transition, reason and note enforcement
--   * vendor, admin, customer and system actor attribution
--   * append-only event RLS for customers, vendors and administrators
--   * failed-delivery restock still flowing through the existing trigger
--
-- Runs after all migrations against a bare `supabase/postgres` container.
-- The suite is destructive and requires gifto.rls_test_disposable = 'yes' in
-- the same psql session. All fixtures are rolled back at the end.

\set ON_ERROR_STOP on

do $$
begin
  if current_setting('gifto.rls_test_disposable', true) is distinct from 'yes' then
    raise exception 'Refusing to run destructive RLS tests. Start a disposable database and SET gifto.rls_test_disposable = ''yes'' in the same psql session.';
  end if;
end $$;

begin;

-- ---------------------------------------------------------------------------
-- Fixtures (as superuser; bypasses RLS)
-- ---------------------------------------------------------------------------

delete from public.orders;
delete from public.products where vendor_id in (
  'a1100000-0000-0000-0000-0000000000a1',
  'a1100000-0000-0000-0000-0000000000b2'
);
delete from public.vendors where id in (
  'a1100000-0000-0000-0000-0000000000a1',
  'a1100000-0000-0000-0000-0000000000b2'
);
delete from auth.users where email like '%@audit.gifto.test';

insert into auth.users (id, email) values
  ('a1110000-0000-0000-0000-000000000001', 'buyer@audit.gifto.test'),
  ('a1110000-0000-0000-0000-000000000002', 'stranger@audit.gifto.test'),
  ('a2110000-0000-0000-0000-000000000001', 'owner-a@audit.gifto.test'),
  ('a2110000-0000-0000-0000-000000000002', 'staff-a@audit.gifto.test'),
  ('a2110000-0000-0000-0000-000000000003', 'owner-b@audit.gifto.test'),
  ('a3110000-0000-0000-0000-000000000001', 'admin@audit.gifto.test');

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = 'a3110000-0000-0000-0000-000000000001';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (id, name, slug, status, commission_rate) values
  ('a1100000-0000-0000-0000-0000000000a1', 'Audit Shop A', 'audit-shop-a', 'active', 0.0800),
  ('a1100000-0000-0000-0000-0000000000b2', 'Audit Shop B', 'audit-shop-b', 'active', 0.1500);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('a1100000-0000-0000-0000-0000000000a1', 'a2110000-0000-0000-0000-000000000001', 'owner'),
  ('a1100000-0000-0000-0000-0000000000a1', 'a2110000-0000-0000-0000-000000000002', 'staff'),
  ('a1100000-0000-0000-0000-0000000000b2', 'a2110000-0000-0000-0000-000000000003', 'owner');

insert into public.products (id, vendor_id, name, slug, price_minor, stock, status) values
  ('a5110000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-0000000000a1',
   'Audit Product A', 'audit-product-a', 10000, 20, 'active'),
  ('a5110000-0000-0000-0000-000000000002', 'a1100000-0000-0000-0000-0000000000b2',
   'Audit Product B', 'audit-product-b', 7500, 20, 'active');

-- ---------------------------------------------------------------------------
-- TEST 1: clients can read events but cannot write them, and direct status
-- updates are no longer granted.
-- ---------------------------------------------------------------------------

do $$
begin
  if has_table_privilege('anon', 'public.order_status_events', 'select')
     or has_table_privilege('anon', 'public.order_status_events', 'insert')
     or has_table_privilege('authenticated', 'public.order_status_events', 'insert')
     or has_table_privilege('authenticated', 'public.order_status_events', 'update')
     or has_table_privilege('authenticated', 'public.order_status_events', 'delete') then
    raise exception 'TEST 1 FAILED: event table privileges are too broad';
  end if;

  if not has_table_privilege('authenticated', 'public.order_status_events', 'select') then
    raise exception 'TEST 1 FAILED: authenticated cannot read events';
  end if;

  if has_column_privilege('authenticated', 'public.order_vendors', 'status', 'update')
     or has_column_privilege('authenticated', 'public.order_vendors', 'updated_at', 'update') then
    raise exception 'TEST 1 FAILED: authenticated can still update status columns directly';
  end if;

  if has_function_privilege('anon', 'public.set_order_vendor_status(uuid, public.order_status, public.order_status, text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_order_vendor_status(uuid, public.order_status, public.order_status, text, text)', 'execute') then
    raise exception 'TEST 1 FAILED: transition RPC grants are wrong';
  end if;

  raise notice 'TEST 1 PASSED: events are read-only and status moves only through the RPC';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: a placed order; the vendor can read its line but cannot update it
-- directly.
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = 'a1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := public.place_order(
    '[{"product_id":"a5110000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Audit Buyer', '01001112233', '12 Audit Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.audit_order1', v_oid::text, false);
end $$;

reset role;
do $$
declare v_oid uuid; v_ov uuid;
begin
  v_oid := current_setting('gifto_test.audit_order1')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = 'a1100000-0000-0000-0000-0000000000a1';
  perform set_config('gifto_test.audit_ov1', v_ov::text, false);
end $$;

set role authenticated;
set request.jwt.claim.sub = 'a2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a2110000-0000-0000-0000-000000000001"}';
do $$
declare v_ov uuid;
begin
  v_ov := current_setting('gifto_test.audit_ov1')::uuid;
  begin
    update public.order_vendors set status = 'confirmed' where id = v_ov;
    raise exception 'TEST 2 FAILED: direct status update was accepted';
  exception when insufficient_privilege then
    null;
  end;

  if (select status from public.order_vendors where id = v_ov) <> 'placed' then
    raise exception 'TEST 2 FAILED: direct update changed the status';
  end if;
  raise notice 'TEST 2 PASSED: shop owner cannot bypass the transition RPC';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: vendor transitions are stale-safe, audited and reason-enforced.
-- ---------------------------------------------------------------------------

do $$
declare v_ov uuid;
begin
  v_ov := current_setting('gifto_test.audit_ov1')::uuid;

  begin
    perform public.set_order_vendor_status(v_ov, 'confirmed', 'confirmed');
    raise exception 'TEST 3 FAILED: stale transition was accepted';
  exception when serialization_failure then
    null;
  end;

  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed');

  begin
    perform public.set_order_vendor_status(v_ov, 'cancelled', 'shipped');
    raise exception 'TEST 3 FAILED: failed delivery without a reason was accepted';
  exception when check_violation then
    null;
  end;

  begin
    perform public.set_order_vendor_status(
      v_ov, 'cancelled', 'shipped', 'not-a-reason');
    raise exception 'TEST 3 FAILED: unknown reason was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.set_order_vendor_status(
      v_ov, 'cancelled', 'shipped', 'other');
    raise exception 'TEST 3 FAILED: other without a note was accepted';
  exception when check_violation then
    null;
  end;

  perform public.set_order_vendor_status(
    v_ov, 'cancelled', 'shipped', 'unreachable', 'Customer did not answer');
  raise notice 'TEST 3 PASSED: vendor transitions are stale-safe and audited';
end $$;

reset role;
do $$
declare
  v_oid   uuid;
  v_ov    uuid;
  v_event public.order_status_events;
  v_stock int;
begin
  v_oid := current_setting('gifto_test.audit_order1')::uuid;
  v_ov := current_setting('gifto_test.audit_ov1')::uuid;

  select * into v_event from public.order_status_events
   where order_vendor_id = v_ov
   order by created_at desc, id desc
   limit 1;

  if v_event.from_status <> 'shipped' or v_event.to_status <> 'cancelled'
     or v_event.actor_role <> 'vendor'
     or v_event.actor_id <> 'a2110000-0000-0000-0000-000000000001'
     or v_event.reason_code <> 'unreachable'
     or v_event.note <> 'Customer did not answer' then
    raise exception 'TEST 3 FAILED: cancellation event was not attributed correctly';
  end if;

  if (select status from public.orders where id = v_oid) <> 'cancelled' then
    raise exception 'TEST 3 FAILED: parent order did not become cancelled';
  end if;

  select stock into v_stock from public.products
   where id = 'a5110000-0000-0000-0000-000000000001';
  if v_stock <> 20 then
    raise exception 'TEST 3 FAILED: failed delivery did not restock (stock %)', v_stock;
  end if;

  raise notice 'TEST 3 PASSED: failed delivery restocked and recorded the actor, reason and note';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: an administrator must give a reason to cancel or return, and the
-- event identifies the administrator.
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = 'a1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := public.place_order(
    '[{"product_id":"a5110000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Audit Buyer', '01001112233', '12 Audit Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.audit_order2', v_oid::text, false);
end $$;

reset role;
do $$
declare v_oid uuid; v_ov uuid;
begin
  v_oid := current_setting('gifto_test.audit_order2')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = 'a1100000-0000-0000-0000-0000000000a1';
  perform set_config('gifto_test.audit_ov2', v_ov::text, false);
end $$;

set role authenticated;
set request.jwt.claim.sub = 'a2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a2110000-0000-0000-0000-000000000001"}';
do $$
declare v_ov uuid;
begin
  v_ov := current_setting('gifto_test.audit_ov2')::uuid;
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

set request.jwt.claim.sub = 'a3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a3110000-0000-0000-0000-000000000001"}';
do $$
declare v_ov uuid;
begin
  v_ov := current_setting('gifto_test.audit_ov2')::uuid;

  begin
    perform public.set_order_vendor_status(v_ov, 'returned', 'delivered');
    raise exception 'TEST 4 FAILED: admin return without a reason was accepted';
  exception when check_violation then
    null;
  end;

  perform public.set_order_vendor_status(
    v_ov, 'returned', 'delivered', 'damaged', 'Item arrived broken');
  raise notice 'TEST 4 PASSED: admin cancels/returns require a reason';
end $$;

reset role;
do $$
declare v_event public.order_status_events;
begin
  select * into v_event from public.order_status_events
   where order_vendor_id = current_setting('gifto_test.audit_ov2')::uuid
   order by created_at desc, id desc
   limit 1;

  if v_event.to_status <> 'returned'
     or v_event.actor_role <> 'admin'
     or v_event.actor_id <> 'a3110000-0000-0000-0000-000000000001'
     or v_event.reason_code <> 'damaged' then
    raise exception 'TEST 4 FAILED: admin return event was not attributed correctly';
  end if;
  raise notice 'TEST 4 PASSED: admin return recorded the administrator and reason';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: customer cancellation through cancel_order() is audited as customer.
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = 'a1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := public.place_order(
    '[{"product_id":"a5110000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Audit Buyer', '01001112233', '12 Audit Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.audit_order3', v_oid::text, false);
  perform public.cancel_order(v_oid);
end $$;

reset role;
do $$
declare v_oid uuid; v_event public.order_status_events;
begin
  v_oid := current_setting('gifto_test.audit_order3')::uuid;

  select * into v_event from public.order_status_events
   where order_id = v_oid
   order by created_at desc, id desc
   limit 1;

  if v_event.from_status <> 'placed' or v_event.to_status <> 'cancelled'
     or v_event.actor_role <> 'customer'
     or v_event.actor_id <> 'a1110000-0000-0000-0000-000000000001' then
    raise exception 'TEST 5 FAILED: customer cancellation was not attributed correctly';
  end if;
  raise notice 'TEST 5 PASSED: customer cancellation is audited as customer';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: a failed admin cancellation leaves no event; customers, other
-- vendors and administrators only see the events they are entitled to read.
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = 'a1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := public.place_order(
    '[{"product_id":"a5110000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Audit Buyer', '01001112233', '12 Audit Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.audit_order4', v_oid::text, false);
end $$;

reset role;
do $$
declare v_oid uuid; v_ov uuid;
begin
  v_oid := current_setting('gifto_test.audit_order4')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = 'a1100000-0000-0000-0000-0000000000a1';
  perform set_config('gifto_test.audit_ov4', v_ov::text, false);
end $$;

set role authenticated;
set request.jwt.claim.sub = 'a3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a3110000-0000-0000-0000-000000000001"}';
do $$
declare v_ov uuid;
begin
  v_ov := current_setting('gifto_test.audit_ov4')::uuid;
  begin
    perform public.set_order_vendor_status(v_ov, 'cancelled', 'placed');
    raise exception 'TEST 6 FAILED: admin cancellation without a reason was accepted';
  exception when check_violation then
    null;
  end;

  if (select status from public.order_vendors where id = v_ov) <> 'placed' then
    raise exception 'TEST 6 FAILED: rejected admin cancellation changed the status';
  end if;

  if exists (
    select 1 from public.order_status_events where order_vendor_id = v_ov
  ) then
    raise exception 'TEST 6 FAILED: rejected transition wrote an event';
  end if;
  raise notice 'TEST 6 PASSED: rejected admin cancellation left no event';
end $$;

set request.jwt.claim.sub = 'a1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a1110000-0000-0000-0000-000000000001"}';
do $$
declare v_n int;
begin
  select count(*) into v_n from public.order_status_events;
  if v_n <> 8 then
    raise exception 'TEST 6 FAILED: buyer sees % events (expected 8)', v_n;
  end if;

  begin
    insert into public.order_status_events (
      order_vendor_id, order_id, vendor_id, from_status, to_status, actor_role
    ) values (
      current_setting('gifto_test.audit_ov1')::uuid,
      current_setting('gifto_test.audit_order1')::uuid,
      'a1100000-0000-0000-0000-0000000000a1',
      'placed', 'cancelled', 'customer'
    );
    raise exception 'TEST 6 FAILED: a client inserted an event';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 6 PASSED: buyer reads own events and cannot insert';
end $$;

set request.jwt.claim.sub = 'a1110000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"a1110000-0000-0000-0000-000000000002"}';
do $$
begin
  if (select count(*) from public.order_status_events) <> 0 then
    raise exception 'TEST 6 FAILED: a stranger read order events';
  end if;
  raise notice 'TEST 6 PASSED: a stranger sees no events';
end $$;

set request.jwt.claim.sub = 'a2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a2110000-0000-0000-0000-000000000001"}';
do $$
begin
  if (select count(*) from public.order_status_events) <> 8 then
    raise exception 'TEST 6 FAILED: shop A sees the wrong event count';
  end if;
  raise notice 'TEST 6 PASSED: shop A reads its own event history';
end $$;

set request.jwt.claim.sub = 'a2110000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"a2110000-0000-0000-0000-000000000003"}';
do $$
begin
  if (select count(*) from public.order_status_events) <> 0 then
    raise exception 'TEST 6 FAILED: shop B read another shop''s events';
  end if;
  raise notice 'TEST 6 PASSED: shop B sees no cross-vendor events';
end $$;

set request.jwt.claim.sub = 'a3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a3110000-0000-0000-0000-000000000001"}';
do $$
begin
  if (select count(*) from public.order_status_events) <> 8 then
    raise exception 'TEST 6 FAILED: admin sees the wrong event count';
  end if;
  raise notice 'TEST 6 PASSED: admin reads every event';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 7 (P1-13, H-10): an admin corrects the address on a placed order;
-- the audit row records actor, reason and before/after values, and the
-- correction writes no status event.
-- ---------------------------------------------------------------------------

reset role;
do $$
begin
  if has_function_privilege('anon',
      'public.correct_order_address(uuid, text, text, text, text, text, text, text, boolean)',
      'execute')
     or not has_function_privilege('authenticated',
      'public.correct_order_address(uuid, text, text, text, text, text, text, text, boolean)',
      'execute') then
    raise exception 'TEST 7 FAILED: address-correction RPC grants are wrong';
  end if;

  if has_table_privilege('authenticated', 'public.order_address_corrections', 'insert')
     or has_table_privilege('authenticated', 'public.order_address_corrections', 'update')
     or has_table_privilege('authenticated', 'public.order_address_corrections', 'delete')
     or not has_table_privilege('authenticated', 'public.order_address_corrections', 'select') then
    raise exception 'TEST 7 FAILED: correction audit table privileges are too broad';
  end if;
  raise notice 'TEST 7 PASSED: correction RPC and audit table grants are least-privilege';
end $$;

set role authenticated;
set request.jwt.claim.sub = 'a1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := public.place_order(
    '[{"product_id":"a5110000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Audit Buyer', '01001112233', '12 Audit Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.addr_order1', v_oid::text, false);
end $$;

set request.jwt.claim.sub = 'a3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a3110000-0000-0000-0000-000000000001"}';
do $$
declare
  v_oid uuid;
  v_result jsonb;
  v_correction public.order_address_corrections;
  v_events int;
begin
  v_oid := current_setting('gifto_test.addr_order1')::uuid;
  v_events := (select count(*) from public.order_status_events where order_id = v_oid);

  v_result := public.correct_order_address(
    v_oid, 'Audit Buyer', '01009998877', '14 Corrected Street',
    'Smouha', 'Alexandria', 'wrong_address', null);

  if not (v_result ->> 'ok')::boolean then
    raise exception 'TEST 7 FAILED: admin correction was rejected: %', v_result;
  end if;

  if (select address_line from public.orders where id = v_oid) <> '14 Corrected Street'
     or (select contact_phone from public.orders where id = v_oid) <> '01009998877'
     or (select city from public.orders where id = v_oid) <> 'Smouha' then
    raise exception 'TEST 7 FAILED: corrected address was not stored';
  end if;

  select * into v_correction from public.order_address_corrections
   where order_id = v_oid
   order by created_at desc, id desc
   limit 1;

  if v_correction.actor_id <> 'a3110000-0000-0000-0000-000000000001'
     or v_correction.reason_code <> 'wrong_address'
     or v_correction.before ->> 'address_line' <> '12 Audit Street'
     or v_correction.before ->> 'contact_phone' <> '01001112233'
     or v_correction.after ->> 'address_line' <> '14 Corrected Street'
     or v_correction.after ->> 'city' <> 'Smouha'
     or v_correction.coverage_warning_acknowledged then
    raise exception 'TEST 7 FAILED: correction audit row is wrong';
  end if;

  if (select count(*) from public.order_status_events where order_id = v_oid) <> v_events then
    raise exception 'TEST 7 FAILED: address correction wrote a status event';
  end if;

  raise notice 'TEST 7 PASSED: admin correction stored with actor, reason and before/after audit';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 8 (P1-13, H-10): vendors, customers and bad input cannot correct.
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = 'a2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a2110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := current_setting('gifto_test.addr_order1')::uuid;
  begin
    perform public.correct_order_address(
      v_oid, 'Audit Buyer', '01009998877', '15 Another Street',
      'Smouha', 'Alexandria', 'wrong_address', null);
    raise exception 'TEST 8 FAILED: vendor correction was accepted';
  exception when insufficient_privilege then
    null;
  end;
end $$;

set request.jwt.claim.sub = 'a1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := current_setting('gifto_test.addr_order1')::uuid;
  begin
    perform public.correct_order_address(
      v_oid, 'Audit Buyer', '01009998877', '15 Another Street',
      'Smouha', 'Alexandria', 'wrong_address', null);
    raise exception 'TEST 8 FAILED: customer correction was accepted';
  exception when insufficient_privilege then
    null;
  end;
end $$;

set request.jwt.claim.sub = 'a3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a3110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := current_setting('gifto_test.addr_order1')::uuid;

  begin
    perform public.correct_order_address(
      v_oid, 'Audit Buyer', '01009998877', '15 Another Street',
      'Smouha', 'Alexandria', 'not-a-reason', null);
    raise exception 'TEST 8 FAILED: unknown correction reason was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.correct_order_address(
      v_oid, 'Audit Buyer', '01009998877', '15 Another Street',
      'Smouha', 'Alexandria', 'other', null);
    raise exception 'TEST 8 FAILED: other without a note was accepted';
  exception when check_violation then
    null;
  end;

  begin
    perform public.correct_order_address(
      v_oid, 'Audit Buyer', '01009998877', '15 Another Street',
      'Smouha', 'Alexandria', 'other', repeat('x', 1001));
    raise exception 'TEST 8 FAILED: over-long correction note was accepted';
  exception when string_data_right_truncation then
    null;
  end;

  if (select address_line from public.orders where id = v_oid) <> '14 Corrected Street' then
    raise exception 'TEST 8 FAILED: rejected correction changed the address';
  end if;

  raise notice 'TEST 8 PASSED: non-admins and invalid corrections are rejected';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 9 (P1-13, H-10): correction after delivery is rejected.
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = 'a2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a2110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid; v_ov uuid;
begin
  v_oid := current_setting('gifto_test.addr_order1')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = 'a1100000-0000-0000-0000-0000000000a1';
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

set request.jwt.claim.sub = 'a3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a3110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid; v_before int;
begin
  v_oid := current_setting('gifto_test.addr_order1')::uuid;
  v_before := (select count(*) from public.order_address_corrections where order_id = v_oid);

  begin
    perform public.correct_order_address(
      v_oid, 'Audit Buyer', '01009998877', '16 Too Late Street',
      'Smouha', 'Alexandria', 'wrong_address', null);
    raise exception 'TEST 9 FAILED: post-delivery correction was accepted';
  exception when check_violation then
    null;
  end;

  if (select address_line from public.orders where id = v_oid) <> '14 Corrected Street' then
    raise exception 'TEST 9 FAILED: rejected post-delivery correction changed the address';
  end if;
  if (select count(*) from public.order_address_corrections where order_id = v_oid) <> v_before then
    raise exception 'TEST 9 FAILED: rejected post-delivery correction wrote an audit row';
  end if;

  raise notice 'TEST 9 PASSED: correction after delivery is rejected';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 10 (P1-13, H-10): a coverage-breaking correction needs an explicit
-- second confirmation naming the affected shop, and never applies silently.
-- ---------------------------------------------------------------------------

reset role;
do $$
begin
  -- Shop A now delivers to Alexandria only.
  update public.vendors
     set delivery_coverage = '{"governorates": ["Alexandria"]}'::jsonb
   where id = 'a1100000-0000-0000-0000-0000000000a1';
end $$;

set role authenticated;
set request.jwt.claim.sub = 'a1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := public.place_order(
    '[{"product_id":"a5110000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Audit Buyer', '01001112233', '22 Audit Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.addr_order2', v_oid::text, false);
end $$;

set request.jwt.claim.sub = 'a3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a3110000-0000-0000-0000-000000000001"}';
do $$
declare
  v_oid uuid;
  v_result jsonb;
  v_correction public.order_address_corrections;
begin
  v_oid := current_setting('gifto_test.addr_order2')::uuid;

  -- Without the second confirmation: rejected, nothing changes.
  v_result := public.correct_order_address(
    v_oid, 'Audit Buyer', '01001112233', '22 Audit Street',
    'Nasr City', 'Cairo', 'customer_request', 'Customer moved to Cairo');
  if (v_result ->> 'ok')::boolean
     or v_result ->> 'error' <> 'coverage_break'
     or not (v_result -> 'vendors' ? 'Audit Shop A') then
    raise exception 'TEST 10 FAILED: coverage break was not reported: %', v_result;
  end if;

  if (select governorate from public.orders where id = v_oid) <> 'Alexandria' then
    raise exception 'TEST 10 FAILED: unconfirmed coverage-breaking correction changed the address';
  end if;
  if exists (select 1 from public.order_address_corrections where order_id = v_oid) then
    raise exception 'TEST 10 FAILED: unconfirmed coverage-breaking correction wrote an audit row';
  end if;

  -- With the explicit confirmation: applies, and the audit row records it.
  v_result := public.correct_order_address(
    v_oid, 'Audit Buyer', '01001112233', '22 Audit Street',
    'Nasr City', 'Cairo', 'customer_request', 'Customer moved to Cairo', true);
  if not (v_result ->> 'ok')::boolean then
    raise exception 'TEST 10 FAILED: confirmed correction was rejected: %', v_result;
  end if;

  if (select governorate from public.orders where id = v_oid) <> 'Cairo' then
    raise exception 'TEST 10 FAILED: confirmed correction was not stored';
  end if;

  select * into v_correction from public.order_address_corrections
   where order_id = v_oid
   order by created_at desc, id desc
   limit 1;
  if not v_correction.coverage_warning_acknowledged
     or v_correction.reason_code <> 'customer_request'
     or v_correction.after ->> 'governorate' <> 'Cairo' then
    raise exception 'TEST 10 FAILED: confirmed correction audit row is wrong';
  end if;

  raise notice 'TEST 10 PASSED: coverage break needs confirmation naming the shop, then applies audited';
end $$;

reset role;
rollback;


