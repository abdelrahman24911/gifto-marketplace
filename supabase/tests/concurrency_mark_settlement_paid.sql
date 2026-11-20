-- Gifto P0-03: two-session concurrency test for mark_settlement_paid().
--
-- Run by scripts/run-settlement-concurrency.mjs on a disposable database.
-- Can also be run standalone for the sequential cases only:
--   psql -v ON_ERROR_STOP=1 -c "set gifto.rls_test_disposable = 'yes';" \
--     -f supabase/tests/concurrency_mark_settlement_paid.sql
--
-- What it does (all against the current mark_settlement_paid definition,
-- migration 30, lines ~686-785 — never the migration-25 original alone):
--   1. Seeds an admin, vendor A (8%), vendor B (15%), vendor C (0% rate),
--      products, and one delivered order per vendor (earned entries:
--      A = 800, B = 1125, C = 0).
--   2. Creates one OPEN settlement per vendor. The vendor-A settlement is
--      left open for the runner's two concurrent mark_settlement_paid calls
--      and its id is printed as CONCURRENCY_SETTLEMENT_ID=<uuid>.
--   3. Sequential mismatch case: corrupts vendor B's settlement-line amount
--      by +1 and asserts mark_settlement_paid raises (23514) and the
--      settlement stays open.
--   4. Sequential zero-value case: pays vendor C's zero-value settlement and
--      asserts status paid with paid_at and paid_by stamped.
-- The two-session concurrency assertions live in the runner, not here:
-- a single psql session cannot call the same function concurrently.
--
-- Safety: destructive. Refuses to run unless gifto.rls_test_disposable =
-- 'yes' is set in the same psql session. Never run against a hosted project.

\set ON_ERROR_STOP on

do $$
begin
  if current_setting('gifto.rls_test_disposable', true) is distinct from 'yes' then
    raise exception 'Refusing to run destructive settlement tests. Start a disposable database and SET gifto.rls_test_disposable = ''yes'' in the same psql session.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed (as superuser; bypasses RLS)
-- ---------------------------------------------------------------------------
delete from public.settlements;
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
delete from auth.users where email like '%@conc.gifto.test';

insert into auth.users (id, email) values
  ('c1110000-0000-0000-0000-0000000000a1', 'buyer@conc.gifto.test'),
  ('c2110000-0000-0000-0000-0000000000a1', 'owner-a@conc.gifto.test'),
  ('c2110000-0000-0000-0000-0000000000a3', 'owner-b@conc.gifto.test'),
  ('c2110000-0000-0000-0000-0000000000a5', 'owner-c@conc.gifto.test'),
  ('c3110000-0000-0000-0000-0000000000a1', 'admin@conc.gifto.test');

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = 'c3110000-0000-0000-0000-0000000000a1';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (id, name, slug, status, commission_rate) values
  ('41100000-0000-0000-0000-000000000001', 'Shop A', 'shop-a', 'active', 0.0800),
  ('41100000-0000-0000-0000-000000000002', 'Shop B', 'shop-b', 'active', 0.1500),
  ('41100000-0000-0000-0000-000000000003', 'Shop C', 'shop-c', 'active', 0.1500);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('41100000-0000-0000-0000-000000000001', 'c2110000-0000-0000-0000-0000000000a1', 'owner'),
  ('41100000-0000-0000-0000-000000000002', 'c2110000-0000-0000-0000-0000000000a3', 'owner'),
  ('41100000-0000-0000-0000-000000000003', 'c2110000-0000-0000-0000-0000000000a5', 'owner');

insert into public.products (id, vendor_id, name, slug, price_minor, stock, status) values
  ('51100000-0000-0000-0000-0000000000a1', '41100000-0000-0000-0000-000000000001',
   'A One', 'a-one', 10000, 10, 'active'),
  ('51100000-0000-0000-0000-0000000000a4', '41100000-0000-0000-0000-000000000002',
   'B One', 'b-one', 7500, 10, 'active'),
  ('51100000-0000-0000-0000-0000000000a7', '41100000-0000-0000-0000-000000000003',
   'C One', 'c-one', 10000, 10, 'active');

-- One delivered order per vendor, each earning exactly rate x subtotal:
-- A: 1 x 10000 at 8%  -> 800; B: 1 x 7500 at 15% -> 1125; C: 1 x 10000 at 15% -> 1500.
-- (Vendor C's entry is zeroed by hand in the zero-value case below, the way
-- rls_commissions_test.sql TEST 17 does it: create_settlement refuses a
-- zero-total settlement, so zero-value is reached by zeroing the entry and
-- its line after creation, not by creating one.)
set role authenticated;
set request.jwt.claim.sub = 'c1110000-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-0000000000a1"}';
do $$
declare
  v_oid uuid;
  v_ov  uuid;
begin
  v_oid := public.place_order(
    '[{"product_id":"51100000-0000-0000-0000-0000000000a1","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.conc_order_a', v_oid::text, false);
  v_oid := public.place_order(
    '[{"product_id":"51100000-0000-0000-0000-0000000000a4","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.conc_order_b', v_oid::text, false);
  v_oid := public.place_order(
    '[{"product_id":"51100000-0000-0000-0000-0000000000a7","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.conc_order_c', v_oid::text, false);
end $$;

-- Deliver each suborder as its vendor owner.
set request.jwt.claim.sub = 'c2110000-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-0000000000a1"}';
do $$
declare v_ov uuid;
begin
  select id into v_ov from public.order_vendors
   where order_id = current_setting('gifto_test.conc_order_a')::uuid;
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-0000000000a3';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-0000000000a3"}';
do $$
declare v_ov uuid;
begin
  select id into v_ov from public.order_vendors
   where order_id = current_setting('gifto_test.conc_order_b')::uuid;
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-0000000000a5';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-0000000000a5"}';
do $$
declare v_ov uuid;
begin
  select id into v_ov from public.order_vendors
   where order_id = current_setting('gifto_test.conc_order_c')::uuid;
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

reset role;
do $$
declare
  v_a int; v_b int; v_c int;
begin
  select count(*) into v_a from public.commission_entries ce
    join public.order_vendors ov on ov.id = ce.order_vendor_id
   where ov.order_id = current_setting('gifto_test.conc_order_a')::uuid
     and ce.status = 'earned' and ce.amount_minor = 800;
  select count(*) into v_b from public.commission_entries ce
    join public.order_vendors ov on ov.id = ce.order_vendor_id
   where ov.order_id = current_setting('gifto_test.conc_order_b')::uuid
     and ce.status = 'earned' and ce.amount_minor = 1125;
  select count(*) into v_c from public.commission_entries ce
    join public.order_vendors ov on ov.id = ce.order_vendor_id
   where ov.order_id = current_setting('gifto_test.conc_order_c')::uuid
     and ce.status = 'earned' and ce.amount_minor = 1500;
  if v_a <> 1 or v_b <> 1 or v_c <> 1 then
    raise exception 'SETUP FAILED: earned entries A=% B=% C=% (expected 1/1/1)', v_a, v_b, v_c;
  end if;
  raise notice 'SETUP PASSED: earned entries A=800, B=1125, C=1500';
end $$;

-- Create one open settlement per vendor, as the platform admin.
set role authenticated;
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-0000000000a1"}';
do $$
declare v_sid uuid;
begin
  v_sid := public.create_settlement('41100000-0000-0000-0000-000000000001');
  perform set_config('gifto_test.conc_settlement_a', v_sid::text, false);
  raise notice 'CONCURRENCY_SETTLEMENT_ID=%', v_sid;
  v_sid := public.create_settlement('41100000-0000-0000-0000-000000000002');
  perform set_config('gifto_test.conc_settlement_b', v_sid::text, false);
  v_sid := public.create_settlement('41100000-0000-0000-0000-000000000003');
  perform set_config('gifto_test.conc_settlement_c', v_sid::text, false);
end $$;

-- ---------------------------------------------------------------------------
-- Sequential case 1: mismatch — a line whose amount does not match its
-- entry plus adjustments must be rejected and the settlement stays open.
-- ---------------------------------------------------------------------------
reset role;
update public.settlement_lines
   set amount_minor = amount_minor + 1
 where settlement_id = current_setting('gifto_test.conc_settlement_b')::uuid;

set role authenticated;
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-0000000000a1"}';
do $$
declare v_status text;
begin
  begin
    perform public.mark_settlement_paid(
      current_setting('gifto_test.conc_settlement_b')::uuid,
      1126, 'bank_transfer', 'CONC-B-001');
    raise exception 'MISMATCH FAILED: payout was accepted for a mismatched line';
  exception when check_violation then
    raise notice 'MISMATCH PASSED: mismatched line rejected (23514)';
  end;
  select status::text into v_status from public.settlements
   where id = current_setting('gifto_test.conc_settlement_b')::uuid;
  if v_status <> 'open' then
    raise exception 'MISMATCH FAILED: settlement status=% after rejection (expected open)', v_status;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Sequential case 2: zero-value — a valid zero-value settlement pays and
-- stamps paid_at and paid_by. Reached the TEST 17 way: zero the entry and
-- its line after creation (create_settlement itself refuses zero totals).
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  update public.settlement_lines
     set amount_minor = 0
   where settlement_id = current_setting('gifto_test.conc_settlement_c')::uuid;
  update public.commission_entries ce
     set base_minor = 0,
         amount_minor = 0
    from public.settlement_lines l
   where l.settlement_id = current_setting('gifto_test.conc_settlement_c')::uuid
     and l.commission_entry_id = ce.id;
  -- P1-05: the stored total must match the lines, so zero it as well.
  update public.settlements
     set total_minor = 0
   where id = current_setting('gifto_test.conc_settlement_c')::uuid;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-0000000000a1';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-0000000000a1"}';
do $$
declare v_status text; v_paid_at timestamptz; v_paid_by uuid;
begin
  perform public.mark_settlement_paid(
    current_setting('gifto_test.conc_settlement_c')::uuid,
    0, 'bank_transfer', 'CONC-C-000');
  select status::text, paid_at, paid_by into v_status, v_paid_at, v_paid_by
    from public.settlements
   where id = current_setting('gifto_test.conc_settlement_c')::uuid;
  if v_status <> 'paid' or v_paid_at is null
     or v_paid_by <> 'c3110000-0000-0000-0000-0000000000a1'::uuid then
    raise exception 'ZERO-VALUE FAILED: status=% paid_at=% paid_by=%',
      v_status, v_paid_at, v_paid_by;
  end if;
  raise notice 'ZERO-VALUE PASSED: zero-value settlement paid, paid_at/paid_by stamped';
end $$;

reset role;
do $$
begin
  raise notice 'CONCURRENCY SETUP DONE: vendor-A settlement % is open for the two-session run',
    current_setting('gifto_test.conc_settlement_a');
end $$;
