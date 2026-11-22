-- Gifto P0-04 (H-01): parent-order status race regression test.
--
-- Migration 31 locks the parent orders row FOR UPDATE BEFORE counting its
-- suborders in sync_parent_order_status(). Before the fix the function
-- counted first and locked afterwards, so two concurrent vendor transitions
-- could each count the other's old state and leave the parent stuck on
-- "placed" after every suborder was terminal.
--
-- Run by scripts/run-parent-status-concurrency.mjs on a disposable database
-- (two concurrent sessions, one suborder delivered and one cancelled; the
-- parent must end partially_completed, not placed).
--
-- Standalone (sequential cases only):
--   psql -v ON_ERROR_STOP=1 -c "set gifto.rls_test_disposable = 'yes';" \
--     -f supabase/tests/concurrency_parent_status_test.sql
--
-- Safety: destructive. Refuses to run unless gifto.rls_test_disposable =
-- 'yes' is set in the same psql session. Never run against a hosted project.

\set ON_ERROR_STOP on
-- Default to the sequential run unless the runner passes
-- -v concurrency_setup_only=true (the \set below must not clobber it).
\if :{?concurrency_setup_only}
\else
\set concurrency_setup_only false
\endif

do $$
begin
  if current_setting('gifto.rls_test_disposable', true) is distinct from 'yes' then
    raise exception 'Refusing to run destructive order tests. Start a disposable database and SET gifto.rls_test_disposable = ''yes'' in the same psql session.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed (as superuser; bypasses RLS)
-- ---------------------------------------------------------------------------
delete from public.orders;
delete from public.products where vendor_id in (
  '41100000-0000-0000-0000-000000000001',
  '41100000-0000-0000-0000-000000000002'
);
delete from public.vendors where id in (
  '41100000-0000-0000-0000-000000000001',
  '41100000-0000-0000-0000-000000000002'
);
delete from auth.users where email like '%@pstat.gifto.test';

insert into auth.users (id, email) values
  ('c1110000-0000-0000-0000-0000000000b1', 'buyer@pstat.gifto.test'),
  ('c2110000-0000-0000-0000-0000000000b1', 'owner-a@pstat.gifto.test'),
  ('c2110000-0000-0000-0000-0000000000b3', 'owner-b@pstat.gifto.test'),
  ('c3110000-0000-0000-0000-0000000000b1', 'admin@pstat.gifto.test');

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = 'c3110000-0000-0000-0000-0000000000b1';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (id, name, slug, status, commission_rate) values
  ('41100000-0000-0000-0000-000000000001', 'Shop A', 'shop-a', 'active', 0.0800),
  ('41100000-0000-0000-0000-000000000002', 'Shop B', 'shop-b', 'active', 0.1500);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('41100000-0000-0000-0000-000000000001', 'c2110000-0000-0000-0000-0000000000b1', 'owner'),
  ('41100000-0000-0000-0000-000000000002', 'c2110000-0000-0000-0000-0000000000b3', 'owner');

insert into public.products (id, vendor_id, name, slug, price_minor, stock, status) values
  ('51100000-0000-0000-0000-0000000000b1', '41100000-0000-0000-0000-000000000001',
   'A One', 'a-one', 10000, 10, 'active'),
  ('51100000-0000-0000-0000-0000000000b4', '41100000-0000-0000-0000-000000000002',
   'B One', 'b-one', 7500, 10, 'active');

-- Order 1: two suborders, both delivered sequentially.
set role authenticated;
set request.jwt.claim.sub = 'c1110000-0000-0000-0000-0000000000b1';
set request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-0000000000b1"}';
do $$
declare v_oid uuid;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-0000000000b1","quantity":1},
      {"product_id":"51100000-0000-0000-0000-0000000000b4","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.pstat_order1', v_oid::text, false);
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-0000000000b1';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-0000000000b1"}';
do $$
declare v_ov uuid;
begin
  select id into v_ov from public.order_vendors
   where order_id = current_setting('gifto_test.pstat_order1')::uuid
     and vendor_id = '41100000-0000-0000-0000-000000000001';
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-0000000000b3';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-0000000000b3"}';
do $$
declare v_ov uuid;
begin
  select id into v_ov from public.order_vendors
   where order_id = current_setting('gifto_test.pstat_order1')::uuid
     and vendor_id = '41100000-0000-0000-0000-000000000002';
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

reset role;
do $$
declare v_status text; v_events int;
begin
  select status::text into v_status from public.orders
   where id = current_setting('gifto_test.pstat_order1')::uuid;
  select count(*) into v_events from public.order_status_events
   where order_id = current_setting('gifto_test.pstat_order1')::uuid;
  if v_status <> 'delivered' then
    raise exception 'SEQUENTIAL FAILED: parent status=% after both suborders delivered (expected delivered)', v_status;
  end if;
  if v_events <> 6 then
    raise exception 'SEQUENTIAL FAILED: order_status_events=% for order 1 (expected 6)', v_events;
  end if;
  raise notice 'SEQUENTIAL PASSED: both delivered -> parent delivered, 6 audit events';
end $$;

-- Order 2: two suborders, left placed for the concurrent run / mixed case.
set role authenticated;
set request.jwt.claim.sub = 'c1110000-0000-0000-0000-0000000000b1';
set request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-0000000000b1"}';
do $$
declare v_oid uuid; v_a uuid; v_b uuid;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-0000000000b1","quantity":1},
      {"product_id":"51100000-0000-0000-0000-0000000000b4","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.pstat_order2', v_oid::text, false);
  select id into v_a from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000001';
  select id into v_b from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000002';
  raise notice 'CONCURRENCY_ORDER_ID=%', v_oid;
  raise notice 'CONCURRENCY_SUBORDER_A=%', v_a;
  raise notice 'CONCURRENCY_SUBORDER_B=%', v_b;
end $$;

\if :concurrency_setup_only
\echo CONCURRENCY SETUP ONLY — stopping before the sequential mixed case.
\quit
\endif

-- Sequential mixed case (standalone runs only): deliver A, cancel B.
reset role;
set role authenticated;
set request.jwt.claim.sub = 'c2110000-0000-0000-0000-0000000000b1';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-0000000000b1"}';
do $$
declare v_ov uuid;
begin
  select id into v_ov from public.order_vendors
   where order_id = current_setting('gifto_test.pstat_order2')::uuid
     and vendor_id = '41100000-0000-0000-0000-000000000001';
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-0000000000b3';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-0000000000b3"}';
do $$
declare v_ov uuid;
begin
  select id into v_ov from public.order_vendors
   where order_id = current_setting('gifto_test.pstat_order2')::uuid
     and vendor_id = '41100000-0000-0000-0000-000000000002';
  perform public.set_order_vendor_status(v_ov, 'cancelled', 'placed');
end $$;

reset role;
do $$
declare v_status text; v_events int;
begin
  select status::text into v_status from public.orders
   where id = current_setting('gifto_test.pstat_order2')::uuid;
  select count(*) into v_events from public.order_status_events
   where order_id = current_setting('gifto_test.pstat_order2')::uuid;
  if v_status <> 'partially_completed' then
    raise exception 'SEQUENTIAL FAILED: parent status=% after delivered+cancelled (expected partially_completed)', v_status;
  end if;
  if v_events <> 4 then
    raise exception 'SEQUENTIAL FAILED: order_status_events=% for order 2 (expected 4)', v_events;
  end if;
  raise notice 'SEQUENTIAL PASSED: delivered+cancelled -> parent partially_completed, 4 audit events';
end $$;
