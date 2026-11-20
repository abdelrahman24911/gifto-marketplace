-- Gifto Phase 2 verification: refund cases, RLS, commission adjustments.
-- Run after all migrations against a disposable database.

\set ON_ERROR_STOP on

do $$
begin
  if current_setting('gifto.rls_test_disposable', true) is distinct from 'yes' then
    raise exception 'Refusing to run destructive RLS tests. Start a disposable database and SET gifto.rls_test_disposable = ''yes'' in the same psql session.';
  end if;
end $$;

begin;

delete from public.settlements where vendor_id = '42200000-0000-0000-0000-000000000001';
delete from public.orders where id = '62200000-0000-0000-0000-000000000001';
delete from public.vendors where id = '42200000-0000-0000-0000-000000000001';
delete from auth.users where email in (
  'buyer-a@refunds.gifto.test',
  'buyer-b@refunds.gifto.test',
  'admin@refunds.gifto.test'
);

insert into auth.users (id, email) values
  ('12200000-0000-0000-0000-000000000001', 'buyer-a@refunds.gifto.test'),
  ('12200000-0000-0000-0000-000000000002', 'buyer-b@refunds.gifto.test'),
  ('12200000-0000-0000-0000-000000000003', 'admin@refunds.gifto.test');

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles
   set is_platform_admin = true
 where id = '12200000-0000-0000-0000-000000000003';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (id, name, slug, status, commission_rate)
values (
  '42200000-0000-0000-0000-000000000001',
  'Refund Shop', 'refund-shop', 'active', 0.1000
);

insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values (
  '62200000-0000-0000-0000-000000000001',
  '12200000-0000-0000-0000-000000000001',
  'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
  '12 Road 9, Maadi', 'Maadi', 'Cairo'
);

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values (
  '72200000-0000-0000-0000-000000000001',
  '62200000-0000-0000-0000-000000000001',
  '42200000-0000-0000-0000-000000000001',
  'delivered', 10000, 0.1000, now()
);

insert into public.commission_entries (
  id, order_vendor_id, vendor_id, rate, base_minor, amount_minor, earned_at
) values (
  '82200000-0000-0000-0000-000000000001',
  '72200000-0000-0000-0000-000000000001',
  '42200000-0000-0000-0000-000000000001',
  0.1000, 10000, 1000, now()
);

-- ---------------------------------------------------------------------------
-- TEST 1: a customer opens one case on their own delivered suborder
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';

create temp table refund_test_ids (name text primary key, id uuid);
insert into refund_test_ids
select 'case_one', public.open_refund_case(
  '72200000-0000-0000-0000-000000000001',
  'One item arrived broken',
  4000
);

do $$
begin
  if not exists (select 1 from refund_test_ids where name = 'case_one') then
    raise exception 'TEST 1 FAILED: customer could not open a refund case';
  end if;

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'case_one')
       and status = 'open'
       and source = 'customer'
       and opened_by = '12200000-0000-0000-0000-000000000001'
  ) then
    raise exception 'TEST 1 FAILED: case audit fields are wrong';
  end if;
  raise notice 'TEST 1 PASSED: customer opened an audited refund case';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: another customer cannot read or open cases on this order
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000002"}';

do $$
declare
  v_count int;
  v_blocked boolean := false;
begin
  select count(*) into v_count from public.refund_cases;
  if v_count <> 0 then
    raise exception 'TEST 2 FAILED: another customer can read the case';
  end if;

  begin
    perform public.open_refund_case(
      '72200000-0000-0000-0000-000000000001', 'I should not be able to do this', 100
    );
  exception when insufficient_privilege then
    v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST 2 FAILED: another customer could open a case';
  end if;
  raise notice 'TEST 2 PASSED: refund cases are scoped to the buyer';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: admin approval records the amount and a negative ledger adjustment
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.refund_cases;
  if v_count <> 1 then
    raise exception 'TEST 3 FAILED: admin cannot read the queue';
  end if;

  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'case_one'), true, 4000, 'Courier damage confirmed'
  );

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'case_one')
       and status = 'approved'
       and refund_amount_minor = 4000
       and resolved_by = '12200000-0000-0000-0000-000000000003'
       and resolved_at is not null
  ) then
    raise exception 'TEST 3 FAILED: approval was not recorded';
  end if;

  if not exists (
    select 1 from public.commission_adjustments
     where refund_case_id = (select id from refund_test_ids where name = 'case_one')
       and commission_entry_id = '82200000-0000-0000-0000-000000000001'
       and amount_minor = -400
  ) then
    raise exception 'TEST 3 FAILED: commission adjustment is wrong';
  end if;
  raise notice 'TEST 3 PASSED: approval records amount and commission adjustment';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: settlements snapshot the net commission (1000 - 400 = 600)
-- ---------------------------------------------------------------------------
insert into refund_test_ids
select 'settlement', public.create_settlement(
  '42200000-0000-0000-0000-000000000001', 'Refund adjustment test'
);

do $$
begin
  if not exists (
    select 1
      from public.settlement_lines l
     where l.settlement_id = (select id from refund_test_ids where name = 'settlement')
       and l.commission_entry_id = '82200000-0000-0000-0000-000000000001'
       and l.amount_minor = 600
  ) then
    raise exception 'TEST 4 FAILED: settlement did not use net commission';
  end if;

  perform public.mark_settlement_paid(
    (select id from refund_test_ids where name = 'settlement'),
    600, 'bank_transfer', 'REF-TEST4-001', 'Weekly commission remittance');
  raise notice 'TEST 4 PASSED: settlement uses net commission and can be paid';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: another refund cannot bypass an active settlement
-- ---------------------------------------------------------------------------
insert into refund_test_ids
select 'case_two', public.open_refund_case(
  '72200000-0000-0000-0000-000000000001',
  'Second issue after the first refund',
  1000
);

do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.resolve_refund_case(
      (select id from refund_test_ids where name = 'case_two'), true, 1000, 'Should require voiding the settlement'
    );
  exception when check_violation then
    v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST 5 FAILED: refund was approved despite active settlement';
  end if;

  perform public.resolve_refund_case((select id from refund_test_ids where name = 'case_two'), false, 0, 'Duplicate claim');
  raise notice 'TEST 5 PASSED: active settlement blocks automatic adjustment';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: an expired guest token is rejected by the guest refund RPCs (P1-02)
-- ---------------------------------------------------------------------------
reset role;
insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, contact_email, address_line, city, governorate,
  guest_token_hash, public_reference
) values (
  '62200000-0000-0000-0000-000000000002',
  null, 'delivered', 10000, 10000, 'Guest Refund Buyer', '01001112233',
  'guest@refunds.gifto.test', '12 Road 9, Maadi', 'Maadi', 'Cairo',
  encode(digest('guest-refund-token', 'sha256'), 'hex'), 'GFT-ABCDEF123456'
);

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values (
  '72200000-0000-0000-0000-000000000002',
  '62200000-0000-0000-0000-000000000002',
  '42200000-0000-0000-0000-000000000001',
  'delivered', 10000, 0.1000, now()
);

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-refund-token', 'sha256'), 'hex');
  v_case uuid;
begin
  -- Live token: a guest case opens.
  v_case := public.open_guest_refund_case(
    '62200000-0000-0000-0000-000000000002', v_hash,
    '72200000-0000-0000-0000-000000000002', 'Item arrived damaged', 5000);
  if v_case is null then
    raise exception 'TEST 6 FAILED: live guest token could not open a case';
  end if;
  raise notice 'TEST 6a PASSED: live guest token opens a refund case';
end $$;

-- Expire the token (as superuser; service_role holds no UPDATE on orders).
reset role;
update public.orders
   set guest_token_expires_at = now() - interval '1 day'
 where id = '62200000-0000-0000-0000-000000000002';

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-refund-token', 'sha256'), 'hex');
  v_rejected boolean := false;
begin
  -- Expire the token: opening and listing are both rejected.
  begin
    perform public.open_guest_refund_case(
      '62200000-0000-0000-0000-000000000002', v_hash,
      '72200000-0000-0000-0000-000000000002', 'Second attempt', 1000);
  exception when sqlstate '42501' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'TEST 6 FAILED: expired token opened a guest refund case';
  end if;

  v_rejected := false;
  begin
    perform public.get_guest_refund_cases(
      '62200000-0000-0000-0000-000000000002', v_hash);
  exception when sqlstate '42501' then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'TEST 6 FAILED: expired token listed guest refund cases';
  end if;

  raise notice 'TEST 6 PASSED: expired guest token rejected on refund open and list';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 7: the D-09 return window (P1-04) — signed-in and guest
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (id, email) values
  ('12200000-0000-0000-0000-000000000004', 'vendor-owner@refunds.gifto.test'),
  ('12200000-0000-0000-0000-000000000005', 'vendor-b-owner@refunds.gifto.test'),
  ('12200000-0000-0000-0000-000000000006', 'admin2@refunds.gifto.test');

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles
   set is_platform_admin = true
 where id = '12200000-0000-0000-0000-000000000006';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (id, name, slug, status, commission_rate)
values (
  '42200000-0000-0000-0000-000000000002',
  'Second Shop', 'second-shop', 'active', 0.1000
);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('42200000-0000-0000-0000-000000000001', '12200000-0000-0000-0000-000000000004', 'owner'),
  ('42200000-0000-0000-0000-000000000002', '12200000-0000-0000-0000-000000000005', 'owner');

insert into public.products (id, vendor_id, name, slug, price_minor, stock, status)
values (
  '52200000-0000-0000-0000-000000000001',
  '42200000-0000-0000-0000-000000000001',
  'Refund Gift', 'refund-gift', 10000, 5, 'active'
);

-- 722...003: delivered 8 days ago — window expired.
-- 722...004: shipped, not yet delivered — window has not started.
-- 722...005: delivered 6 days ago — inside the window.
insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values
  ('62200000-0000-0000-0000-000000000003',
   '12200000-0000-0000-0000-000000000001',
   'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
   '12 Road 9, Maadi', 'Maadi', 'Cairo'),
  ('62200000-0000-0000-0000-000000000004',
   '12200000-0000-0000-0000-000000000001',
   'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
   '12 Road 9, Maadi', 'Maadi', 'Cairo'),
  ('62200000-0000-0000-0000-000000000005',
   '12200000-0000-0000-0000-000000000001',
   'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
   '12 Road 9, Maadi', 'Maadi', 'Cairo');

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values
  ('72200000-0000-0000-0000-000000000003',
   '62200000-0000-0000-0000-000000000003',
   '42200000-0000-0000-0000-000000000001',
   'delivered', 10000, 0.1000, now() - interval '8 days'),
  ('72200000-0000-0000-0000-000000000004',
   '62200000-0000-0000-0000-000000000004',
   '42200000-0000-0000-0000-000000000001',
   'shipped', 10000, 0.1000, null),
  ('72200000-0000-0000-0000-000000000005',
   '62200000-0000-0000-0000-000000000005',
   '42200000-0000-0000-0000-000000000001',
   'delivered', 10000, 0.1000, now() - interval '6 days');

insert into public.order_items (
  order_vendor_id, product_id, product_name, product_slug,
  unit_price_minor, quantity, line_total_minor
) values
  ('72200000-0000-0000-0000-000000000004',
   '52200000-0000-0000-0000-000000000001', 'Refund Gift', 'refund-gift',
   10000, 1, 10000),
  ('72200000-0000-0000-0000-000000000005',
   '52200000-0000-0000-0000-000000000001', 'Refund Gift', 'refund-gift',
   10000, 1, 10000);

insert into public.commission_entries (
  id, order_vendor_id, vendor_id, rate, base_minor, amount_minor, earned_at
) values
  ('82200000-0000-0000-0000-000000000004',
   '72200000-0000-0000-0000-000000000004',
   '42200000-0000-0000-0000-000000000001',
   0.1000, 10000, 1000, now()),
  ('82200000-0000-0000-0000-000000000005',
   '72200000-0000-0000-0000-000000000005',
   '42200000-0000-0000-0000-000000000001',
   0.1000, 10000, 1000, now());

set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
do $$
declare
  v_blocked boolean := false;
begin
  -- (a) Delivered 8 days ago: the window has closed.
  begin
    perform public.open_refund_case(
      '72200000-0000-0000-0000-000000000003', 'Too late for a return', 1000);
  exception when check_violation then
    if sqlerrm like '%7-day return window%' then
      v_blocked := true;
    else
      raise exception 'TEST 7 FAILED: wrong error for an expired window: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 7 FAILED: case opened after the 7-day window';
  end if;
  raise notice 'TEST 7a PASSED: case after the window is rejected with the window named';

  -- (b) Shipped, not yet delivered: the window has not started.
  insert into refund_test_ids
  select 'case_shipped', public.open_refund_case(
    '72200000-0000-0000-0000-000000000004', 'Changed my mind before delivery', 1000);
  raise notice 'TEST 7b PASSED: shipped (undelivered) case stays openable';

  -- (c) Delivered 6 days ago: inside the window.
  insert into refund_test_ids
  select 'case_window', public.open_refund_case(
    '72200000-0000-0000-0000-000000000005', 'Gift arrived scratched', 4000);
  raise notice 'TEST 7c PASSED: case inside the window opens';
end $$;

-- (d) Guest path: expired window rejected, in-window opens.
reset role;
insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, contact_email, address_line, city, governorate,
  guest_token_hash, public_reference
) values
  ('62200000-0000-0000-0000-000000000006',
   null, 'delivered', 10000, 10000, 'Guest Window Buyer', '01001112233',
   'guest6@refunds.gifto.test', '12 Road 9, Maadi', 'Maadi', 'Cairo',
   encode(digest('guest-window-6', 'sha256'), 'hex'), 'GFT-111111222222'),
  ('62200000-0000-0000-0000-000000000007',
   null, 'delivered', 10000, 10000, 'Guest Window Buyer', '01001112233',
   'guest7@refunds.gifto.test', '12 Road 9, Maadi', 'Maadi', 'Cairo',
   encode(digest('guest-window-7', 'sha256'), 'hex'), 'GFT-333333444444');

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values
  ('72200000-0000-0000-0000-000000000006',
   '62200000-0000-0000-0000-000000000006',
   '42200000-0000-0000-0000-000000000001',
   'delivered', 10000, 0.1000, now() - interval '8 days'),
  ('72200000-0000-0000-0000-000000000007',
   '62200000-0000-0000-0000-000000000007',
   '42200000-0000-0000-0000-000000000001',
   'delivered', 10000, 0.1000, now() - interval '2 days');

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash6 text := encode(digest('guest-window-6', 'sha256'), 'hex');
  v_hash7 text := encode(digest('guest-window-7', 'sha256'), 'hex');
  v_blocked boolean := false;
  v_case uuid;
begin
  begin
    perform public.open_guest_refund_case(
      '62200000-0000-0000-0000-000000000006', v_hash6,
      '72200000-0000-0000-0000-000000000006', 'Too late for a return', 1000);
  exception when check_violation then
    if sqlerrm like '%7-day return window%' then
      v_blocked := true;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 7 FAILED: guest case opened after the 7-day window';
  end if;

  v_case := public.open_guest_refund_case(
    '62200000-0000-0000-0000-000000000007', v_hash7,
    '72200000-0000-0000-0000-000000000007', 'Gift arrived scratched', 4000);
  if v_case is null then
    raise exception 'TEST 7 FAILED: guest case inside the window did not open';
  end if;
  raise notice 'TEST 7 PASSED: window enforced on both paths, shipped stays openable';
end $$;

-- The temp id table belongs to the authenticated role; record the guest case
-- as superuser instead of inside the service_role block.
reset role;
insert into refund_test_ids
select 'case_guest_window', id from public.refund_cases
 where order_vendor_id = '72200000-0000-0000-0000-000000000007';

-- ---------------------------------------------------------------------------
-- TEST 8: approved + received return -> suborder returned (audited),
-- then manual restock exactly once (P1-04, D-09)
-- ---------------------------------------------------------------------------
-- Admin approves the in-window case from TEST 7c (physical return required).
set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
do $$
begin
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'case_window'), true, 4000, 'Return approved, please send the item back'
  );

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'case_window')
       and status = 'approved'
       and return_path = 'physical_return'
       and refund_amount_minor = 4000
  ) then
    raise exception 'TEST 8 FAILED: approval did not record the physical-return path';
  end if;

  if not exists (
    select 1 from public.commission_adjustments
     where refund_case_id = (select id from refund_test_ids where name = 'case_window')
       and amount_minor = -400
  ) then
    raise exception 'TEST 8 FAILED: commission adjustment changed by P1-04';
  end if;

  -- Restock before receipt is refused: nothing has been inspected yet.
  begin
    perform public.restock_refund_case(
      (select id from refund_test_ids where name = 'case_window'));
    raise exception 'TEST 8 FAILED: restock succeeded before receipt';
  exception when check_violation then
    null;
  end;
  raise notice 'TEST 8a PASSED: approval records physical-return path and commission; restock before receipt refused';
end $$;

-- Vendor acknowledges, then confirms receipt: suborder -> returned, audited.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000004"}';
do $$
begin
  perform public.acknowledge_refund_case(
    (select id from refund_test_ids where name = 'case_window'));

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'case_window')
       and acknowledged_by = '12200000-0000-0000-0000-000000000004'
       and acknowledged_at is not null
  ) then
    raise exception 'TEST 8 FAILED: acknowledgement was not recorded';
  end if;

  perform public.confirm_refund_receipt(
    (select id from refund_test_ids where name = 'case_window'), 'Item back in good condition');

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'case_window')
       and received_by = '12200000-0000-0000-0000-000000000004'
       and received_at is not null
       and receipt_note = 'Item back in good condition'
  ) then
    raise exception 'TEST 8 FAILED: receipt was not recorded';
  end if;

  if (select status from public.order_vendors
       where id = '72200000-0000-0000-0000-000000000005') <> 'returned' then
    raise exception 'TEST 8 FAILED: suborder did not move to returned';
  end if;

  if not exists (
    select 1 from public.order_status_events
     where order_vendor_id = '72200000-0000-0000-0000-000000000005'
       and from_status = 'delivered'
       and to_status = 'returned'
       and actor_role = 'vendor'
       and reason_code = 'customer_request'
       and note like '%refund case%'
  ) then
    raise exception 'TEST 8 FAILED: returned transition was not audited';
  end if;

  -- Receipt alone never touches stock.
  if (select stock from public.products
       where id = '52200000-0000-0000-0000-000000000001') <> 5 then
    raise exception 'TEST 8 FAILED: receipt changed stock';
  end if;
  raise notice 'TEST 8b PASSED: vendor receipt moves the suborder to returned with an audit event, stock untouched';
end $$;

-- Admin restocks manually: stock +1, one movement naming the case.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
do $$
declare
  v_blocked boolean := false;
begin
  perform public.restock_refund_case(
    (select id from refund_test_ids where name = 'case_window'));

  if (select stock from public.products
       where id = '52200000-0000-0000-0000-000000000001') <> 6 then
    raise exception 'TEST 8 FAILED: restock did not return one unit to stock';
  end if;

  -- adjust_product_stock writes no order_id; the note names the case.
  if (select count(*) from public.inventory_movements
       where product_id = '52200000-0000-0000-0000-000000000001'
         and delta = 1
         and reason = 'manual_adjustment'
         and note like '%Refund case%') <> 1 then
    raise exception 'TEST 8 FAILED: restock movement missing or not exactly once';
  end if;

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'case_window')
       and restocked_by = '12200000-0000-0000-0000-000000000003'
       and restocked_at is not null
  ) then
    raise exception 'TEST 8 FAILED: restock was not recorded on the case';
  end if;

  -- A second restock is refused: never restock twice for one case.
  begin
    perform public.restock_refund_case(
      (select id from refund_test_ids where name = 'case_window'));
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 8 FAILED: second restock was allowed';
  end if;
  if (select stock from public.products
       where id = '52200000-0000-0000-0000-000000000001') <> 6 then
    raise exception 'TEST 8 FAILED: second restock changed stock';
  end if;
  raise notice 'TEST 8 PASSED: approved + received return is returned (audited) and restocked exactly once';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 9: refund without a physical return does neither (P1-04)
-- ---------------------------------------------------------------------------
-- Admin approves the shipped case from TEST 7b with no return required.
do $$
begin
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'case_shipped'), true, 1000, 'Goodwill refund, keep the item', false
  );

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'case_shipped')
       and status = 'approved'
       and return_path = 'no_return'
  ) then
    raise exception 'TEST 9 FAILED: approval did not record the no-return path';
  end if;

  if (select status from public.order_vendors
       where id = '72200000-0000-0000-0000-000000000004') <> 'shipped' then
    raise exception 'TEST 9 FAILED: no-return refund moved the suborder';
  end if;
  raise notice 'TEST 9a PASSED: no-return approval leaves the suborder alone';
end $$;

-- Receipt and restock are both refused on a no-return case.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000004"}';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.confirm_refund_receipt(
      (select id from refund_test_ids where name = 'case_shipped'), 'No item to receive');
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 9 FAILED: receipt confirmed on a no-return case';
  end if;
  raise notice 'TEST 9b PASSED: receipt refused on a no-return case';
end $$;

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.restock_refund_case(
      (select id from refund_test_ids where name = 'case_shipped'));
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 9 FAILED: restock ran on a no-return case';
  end if;
  if (select stock from public.products
       where id = '52200000-0000-0000-0000-000000000001') <> 6 then
    raise exception 'TEST 9 FAILED: no-return refund changed stock';
  end if;
  raise notice 'TEST 9 PASSED: refund without a physical return restocks nothing and moves nothing';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 10: vendor receipt is own-suborder only (P1-04)
-- ---------------------------------------------------------------------------
-- The other shop's owner cannot acknowledge, confirm receipt, or restock
-- vendor A's cases; a non-vendor customer cannot either.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000005';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000005"}';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.acknowledge_refund_case(
      (select id from refund_test_ids where name = 'case_window'));
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 10 FAILED: another shop acknowledged the case';
  end if;

  v_blocked := false;
  begin
    perform public.confirm_refund_receipt(
      (select id from refund_test_ids where name = 'case_window'), 'Not my shop');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 10 FAILED: another shop confirmed receipt';
  end if;
  raise notice 'TEST 10a PASSED: another vendor cannot touch this shop''s case';
end $$;

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000002"}';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.confirm_refund_receipt(
      (select id from refund_test_ids where name = 'case_window'), 'A customer should not do this');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 10 FAILED: a customer confirmed receipt';
  end if;
  raise notice 'TEST 10 PASSED: vendor receipt is own-suborder only';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 11: one-shot dispute escalation (P1-04)
-- ---------------------------------------------------------------------------
-- case_two was rejected by admin 122...003 in TEST 5. Buyer A escalates it
-- once; admin 122...006 (a different admin) makes the final decision.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
do $$
begin
  perform public.escalate_refund_case(
    (select id from refund_test_ids where name = 'case_two'),
    'The item really was broken, here is what happened');

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'case_two')
       and status = 'open'
       and escalation_count = 1
       and escalated_at is not null
       and escalation_note = 'The item really was broken, here is what happened'
       and first_resolved_by = '12200000-0000-0000-0000-000000000003'
       and first_resolved_at is not null
       and first_resolution_note = 'Duplicate claim'
       and resolved_by is null
       and refund_amount_minor is null
  ) then
    raise exception 'TEST 11 FAILED: escalation did not reopen the case with the first decision stashed';
  end if;
  raise notice 'TEST 11a PASSED: rejected case escalates once and reopens';
end $$;

-- The second decision is final and both decision-makers are recorded.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000006';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000006"}';
do $$
begin
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'case_two'), false, 0, 'Final: no refund after review');

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'case_two')
       and status = 'rejected'
       and resolved_by = '12200000-0000-0000-0000-000000000006'
       and first_resolved_by = '12200000-0000-0000-0000-000000000003'
       and escalation_count = 1
  ) then
    raise exception 'TEST 11 FAILED: final decision did not record both decision-makers';
  end if;
  raise notice 'TEST 11b PASSED: second decision is final, both decision-makers recorded';
end $$;

-- No second escalation.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.escalate_refund_case(
      (select id from refund_test_ids where name = 'case_two'), 'Trying again');
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 11 FAILED: second escalation was allowed';
  end if;
  raise notice 'TEST 11 PASSED: escalation works once and only once';
end $$;

reset role;

rollback;
