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
-- TEST 5 (N-01, D-08): a refund on a PAID settlement no longer dead-ends —
-- approval succeeds and records a clawback carried to the next settlement.
-- The paid settlement's rows must be byte-identical afterwards.
-- ---------------------------------------------------------------------------
insert into refund_test_ids
select 'case_two', public.open_refund_case(
  '72200000-0000-0000-0000-000000000001',
  'Second issue after the first refund',
  1000
);

do $$
declare
  v_sid uuid := (select id from refund_test_ids where name = 'settlement');
begin
  -- Snapshot the paid settlement and its lines before the approval.
  create temp table n01_paid_snapshot as
    select status, total_minor, paid_amount_minor, transfer_method,
           transfer_reference, paid_at, paid_by, updated_at, clawback_minor
      from public.settlements where id = v_sid;
  create temp table n01_paid_lines_snapshot as
    select commission_entry_id, amount_minor, currency, released_at,
           release_reason, released_by
      from public.settlement_lines where settlement_id = v_sid;

  -- Approval succeeds now (N-01): pro-rata reduction round(1000 x 0.10)
  -- = 100 against the 600 still paid out for this entry.
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'case_two'), true, 1000, 'Second issue confirmed'
  );

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'case_two')
       and status = 'approved'
       and refund_amount_minor = 1000
       and return_path = 'physical_return'
  ) then
    raise exception 'TEST 5 FAILED: refund on a paid settlement was not approved';
  end if;

  if not exists (
    select 1 from public.commission_clawbacks
     where refund_case_id = (select id from refund_test_ids where name = 'case_two')
       and commission_entry_id = '82200000-0000-0000-0000-000000000001'
       and vendor_id = '42200000-0000-0000-0000-000000000001'
       and amount_minor = -100
       and status = 'outstanding'
  ) then
    raise exception 'TEST 5 FAILED: clawback is wrong (expected -100 outstanding)';
  end if;

  -- No ordinary adjustment was written for the paid path.
  if (select count(*) from public.commission_adjustments
       where commission_entry_id = '82200000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'TEST 5 FAILED: paid-path approval wrote a commission adjustment';
  end if;

  -- The entry stays earned: it was earned and paid; the clawback is the
  -- reversal record.
  if (select status from public.commission_entries
       where id = '82200000-0000-0000-0000-000000000001') <> 'earned' then
    raise exception 'TEST 5 FAILED: paid-path approval changed the entry status';
  end if;

  -- The paid settlement is byte-identical.
  if exists (
    (select status, total_minor, paid_amount_minor, transfer_method,
            transfer_reference, paid_at, paid_by, updated_at, clawback_minor
       from public.settlements where id = v_sid)
    except (select * from n01_paid_snapshot)
  ) or exists (
    (select * from n01_paid_snapshot)
    except
    (select status, total_minor, paid_amount_minor, transfer_method,
            transfer_reference, paid_at, paid_by, updated_at, clawback_minor
       from public.settlements where id = v_sid)
  ) then
    raise exception 'TEST 5 FAILED: approving the refund changed the paid settlement';
  end if;

  if exists (
    (select commission_entry_id, amount_minor, currency, released_at,
            release_reason, released_by
       from public.settlement_lines where settlement_id = v_sid)
    except (select * from n01_paid_lines_snapshot)
  ) or exists (
    (select * from n01_paid_lines_snapshot)
    except
    (select commission_entry_id, amount_minor, currency, released_at,
            release_reason, released_by
       from public.settlement_lines where settlement_id = v_sid)
  ) then
    raise exception 'TEST 5 FAILED: approving the refund changed the paid settlement lines';
  end if;

  raise notice 'TEST 5 PASSED: refund on a paid settlement approves with a -100 clawback; paid settlement byte-identical';
end $$;

-- The one-open-case slot is free again: open a third case and reject it,
-- so TEST 11 still has a rejected case to escalate.
insert into refund_test_ids
select 'case_three', public.open_refund_case(
  '72200000-0000-0000-0000-000000000001',
  'Third issue, also a duplicate',
  500
);

do $$
begin
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'case_three'), false, 0, 'Duplicate claim');
  raise notice 'TEST 5b PASSED: a fresh case opens after the clawback approval and can be rejected';
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
-- case_three was rejected by admin 122...003 in TEST 5. Buyer A escalates it
-- once; admin 122...006 (a different admin) makes the final decision.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
do $$
begin
  perform public.escalate_refund_case(
    (select id from refund_test_ids where name = 'case_three'),
    'The item really was broken, here is what happened');

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'case_three')
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
    (select id from refund_test_ids where name = 'case_three'), false, 0, 'Final: no refund after review');

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'case_three')
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
      (select id from refund_test_ids where name = 'case_three'), 'Trying again');
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 11 FAILED: second escalation was allowed';
  end if;
  raise notice 'TEST 11 PASSED: escalation works once and only once';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 12 (N-01, D-08): clawback carry — a paid settlement's clawback is
-- netted against the vendor's next settlement exactly once, never more
-- than was paid, and the open-settlement raise still holds.
-- ---------------------------------------------------------------------------
-- Fresh fixtures: vendor C (rate 10%), subtotal 10000 -> entry 1000.
reset role;
insert into public.vendors (id, name, slug, status, commission_rate)
values (
  '42200000-0000-0000-0000-000000000003',
  'Clawback Shop', 'clawback-shop', 'active', 0.1000
);

insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values (
  '62200000-0000-0000-0000-000000000008',
  '12200000-0000-0000-0000-000000000001',
  'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
  '12 Road 9, Maadi', 'Maadi', 'Cairo'
);

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values (
  '72200000-0000-0000-0000-000000000008',
  '62200000-0000-0000-0000-000000000008',
  '42200000-0000-0000-0000-000000000003',
  'delivered', 10000, 0.1000, now()
);

insert into public.commission_entries (
  id, order_vendor_id, vendor_id, rate, base_minor, amount_minor, earned_at
) values (
  '82200000-0000-0000-0000-000000000008',
  '72200000-0000-0000-0000-000000000008',
  '42200000-0000-0000-0000-000000000003',
  0.1000, 10000, 1000, now()
);

-- (a) Pre-settlement refund 5000: ordinary adjustment -500, no clawback.
set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
insert into refund_test_ids
select 'claw_a', public.open_refund_case(
  '72200000-0000-0000-0000-000000000008', 'First clawback issue', 5000);

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
do $$
begin
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'claw_a'), true, 5000, 'First refund approved');

  if not exists (
    select 1 from public.commission_adjustments
     where refund_case_id = (select id from refund_test_ids where name = 'claw_a')
       and amount_minor = -500
  ) then
    raise exception 'TEST 12 FAILED: pre-settlement adjustment is wrong (expected -500)';
  end if;

  if exists (select 1 from public.commission_clawbacks
              where refund_case_id = (select id from refund_test_ids where name = 'claw_a')) then
    raise exception 'TEST 12 FAILED: pre-settlement approval recorded a clawback';
  end if;
  raise notice 'TEST 12a PASSED: pre-settlement refund adjusts -500, no clawback';
end $$;

-- (b) Settlement nets it: line 500, total 500. Pay it.
insert into refund_test_ids
select 'claw_settlement', public.create_settlement(
  '42200000-0000-0000-0000-000000000003', 'Clawback carry test');

do $$
declare
  v_sid uuid := (select id from refund_test_ids where name = 'claw_settlement');
begin
  if not exists (
    select 1 from public.settlement_lines
     where settlement_id = v_sid
       and commission_entry_id = '82200000-0000-0000-0000-000000000008'
       and amount_minor = 500
  ) then
    raise exception 'TEST 12 FAILED: settlement line is not the net 500';
  end if;

  if (select total_minor from public.settlements where id = v_sid) <> 500 then
    raise exception 'TEST 12 FAILED: settlement total is not 500';
  end if;

  perform public.mark_settlement_paid(
    v_sid, 500, 'bank_transfer', 'CLAW-TEST12-001', 'Weekly remittance');
  raise notice 'TEST 12b PASSED: settlement pays the net 500';
end $$;

-- (c) Post-payment refund 4999: clawback -500 (round(4999 x 0.10) = 500),
-- paid settlement byte-identical, entry still earned.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
insert into refund_test_ids
select 'claw_b', public.open_refund_case(
  '72200000-0000-0000-0000-000000000008', 'Second clawback issue', 4999);

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
do $$
declare
  v_sid uuid := (select id from refund_test_ids where name = 'claw_settlement');
begin
  create temp table claw_paid_snapshot as
    select status, total_minor, paid_amount_minor, transfer_method,
           transfer_reference, paid_at, paid_by, updated_at, clawback_minor
      from public.settlements where id = v_sid;
  create temp table claw_paid_lines_snapshot as
    select commission_entry_id, amount_minor, currency, released_at,
           release_reason, released_by
      from public.settlement_lines where settlement_id = v_sid;

  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'claw_b'), true, 4999, 'Second refund approved');

  if not exists (
    select 1 from public.commission_clawbacks
     where refund_case_id = (select id from refund_test_ids where name = 'claw_b')
       and commission_entry_id = '82200000-0000-0000-0000-000000000008'
       and amount_minor = -500
       and status = 'outstanding'
  ) then
    raise exception 'TEST 12 FAILED: clawback is wrong (expected -500 outstanding)';
  end if;

  if (select count(*) from public.commission_adjustments
       where commission_entry_id = '82200000-0000-0000-0000-000000000008') <> 1 then
    raise exception 'TEST 12 FAILED: paid-path approval wrote a commission adjustment';
  end if;

  if exists (
    (select status, total_minor, paid_amount_minor, transfer_method,
            transfer_reference, paid_at, paid_by, updated_at, clawback_minor
       from public.settlements where id = v_sid)
    except (select * from claw_paid_snapshot)
  ) or exists (
    (select * from claw_paid_snapshot)
    except
    (select status, total_minor, paid_amount_minor, transfer_method,
            transfer_reference, paid_at, paid_by, updated_at, clawback_minor
       from public.settlements where id = v_sid)
  ) then
    raise exception 'TEST 12 FAILED: clawback approval changed the paid settlement';
  end if;

  if exists (
    (select commission_entry_id, amount_minor, currency, released_at,
            release_reason, released_by
       from public.settlement_lines where settlement_id = v_sid)
    except (select * from claw_paid_lines_snapshot)
  ) or exists (
    (select * from claw_paid_lines_snapshot)
    except
    (select commission_entry_id, amount_minor, currency, released_at,
            release_reason, released_by
       from public.settlement_lines where settlement_id = v_sid)
  ) then
    raise exception 'TEST 12 FAILED: clawback approval changed the paid settlement lines';
  end if;

  raise notice 'TEST 12c PASSED: post-payment refund claws back -500; paid settlement byte-identical';
end $$;

-- (d) The paid amount is now fully clawed back (500 of 500). A further
-- refund of 1 piastre still approves — but records NO new clawback.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
insert into refund_test_ids
select 'claw_c', public.open_refund_case(
  '72200000-0000-0000-0000-000000000008', 'Third clawback issue', 1);

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
do $$
begin
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'claw_c'), true, 1, 'One piastre refund approved');

  if exists (select 1 from public.commission_clawbacks
              where refund_case_id = (select id from refund_test_ids where name = 'claw_c')) then
    raise exception 'TEST 12 FAILED: a refund past the paid amount recorded a clawback';
  end if;

  if (select coalesce(sum(abs(amount_minor)), 0) from public.commission_clawbacks
       where commission_entry_id = '82200000-0000-0000-0000-000000000008') <> 500 then
    raise exception 'TEST 12 FAILED: total clawed back exceeds the 500 paid out';
  end if;
  raise notice 'TEST 12d PASSED: no clawback past the amount paid out';
end $$;

-- (e) The scope trigger itself refuses a clawback past the paid amount.
reset role;
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.commission_clawbacks (
      commission_entry_id, refund_case_id, vendor_id, amount_minor, reason
    ) values (
      '82200000-0000-0000-0000-000000000008',
      (select id from refund_test_ids where name = 'claw_c'),
      '42200000-0000-0000-0000-000000000003',
      -1, 'Trigger cap probe'
    );
  exception when check_violation then
    if sqlerrm like '%cannot exceed the amount paid out%' then
      v_blocked := true;
    else
      raise exception 'TEST 12 FAILED: wrong trigger error: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 12 FAILED: clawback past the paid amount was inserted';
  end if;
  raise notice 'TEST 12e PASSED: clawback cap is enforced by the trigger';
end $$;

-- (f) The vendor's next settlement nets the clawback exactly once:
-- new entry 2000, gross 2000, clawback 500 -> total 1500. Paying the
-- gross 2000 is rejected; the net 1500 pays.
reset role;
insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values (
  '62200000-0000-0000-0000-000000000009',
  '12200000-0000-0000-0000-000000000001',
  'delivered', 20000, 20000, 'Refund Buyer', '01001112233',
  '12 Road 9, Maadi', 'Maadi', 'Cairo'
);

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values (
  '72200000-0000-0000-0000-000000000009',
  '62200000-0000-0000-0000-000000000009',
  '42200000-0000-0000-0000-000000000003',
  'delivered', 20000, 0.1000, now()
);

insert into public.commission_entries (
  id, order_vendor_id, vendor_id, rate, base_minor, amount_minor, earned_at
) values (
  '82200000-0000-0000-0000-000000000009',
  '72200000-0000-0000-0000-000000000009',
  '42200000-0000-0000-0000-000000000003',
  0.1000, 20000, 2000, now()
);

set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
insert into refund_test_ids
select 'claw_settlement_2', public.create_settlement(
  '42200000-0000-0000-0000-000000000003', 'Second batch nets the clawback');

do $$
declare
  v_sid uuid := (select id from refund_test_ids where name = 'claw_settlement_2');
  v_blocked boolean := false;
begin
  if (select total_minor from public.settlements where id = v_sid) <> 1500 then
    raise exception 'TEST 12 FAILED: second settlement total is not 1500 (2000 - 500)';
  end if;

  if (select clawback_minor from public.settlements where id = v_sid) <> 500 then
    raise exception 'TEST 12 FAILED: second settlement clawback_minor is not 500';
  end if;

  if (select count(*) from public.clawback_applications
       where settlement_id = v_sid) <> 1 then
    raise exception 'TEST 12 FAILED: clawback was not applied exactly once to the second batch';
  end if;

  if not exists (
    select 1 from public.commission_clawbacks
     where refund_case_id = (select id from refund_test_ids where name = 'claw_b')
       and status = 'consumed'
       and consumed_at is not null
  ) then
    raise exception 'TEST 12 FAILED: fully applied clawback is not consumed';
  end if;

  -- Paying the gross (2000) is rejected: the derived net is 1500.
  begin
    perform public.mark_settlement_paid(
      v_sid, 2000, 'bank_transfer', 'CLAW-TEST12-002');
  exception when check_violation then
    if sqlerrm like '%does not match the commission due (1500)%' then
      v_blocked := true;
    else
      raise exception 'TEST 12 FAILED: wrong error for gross payment: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 12 FAILED: paying the gross instead of the net was accepted';
  end if;

  perform public.mark_settlement_paid(
    v_sid, 1500, 'bank_transfer', 'CLAW-TEST12-002', 'Second batch, net of clawback');
  raise notice 'TEST 12f PASSED: next settlement nets the clawback once; net 1500 pays, gross 2000 rejected';
end $$;

-- (g) A third settlement does not re-apply the consumed clawback.
reset role;
insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values (
  '62200000-0000-0000-0000-000000000010',
  '12200000-0000-0000-0000-000000000001',
  'delivered', 7000, 7000, 'Refund Buyer', '01001112233',
  '12 Road 9, Maadi', 'Maadi', 'Cairo'
);

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values (
  '72200000-0000-0000-0000-000000000010',
  '62200000-0000-0000-0000-000000000010',
  '42200000-0000-0000-0000-000000000003',
  'delivered', 7000, 0.1000, now()
);

insert into public.commission_entries (
  id, order_vendor_id, vendor_id, rate, base_minor, amount_minor, earned_at
) values (
  '82200000-0000-0000-0000-000000000010',
  '72200000-0000-0000-0000-000000000010',
  '42200000-0000-0000-0000-000000000003',
  0.1000, 7000, 700, now()
);

set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
insert into refund_test_ids
select 'claw_settlement_3', public.create_settlement(
  '42200000-0000-0000-0000-000000000003', 'Third batch');

do $$
declare
  v_sid uuid := (select id from refund_test_ids where name = 'claw_settlement_3');
begin
  if (select total_minor from public.settlements where id = v_sid) <> 700 then
    raise exception 'TEST 12 FAILED: third settlement total is not 700';
  end if;

  if (select clawback_minor from public.settlements where id = v_sid) <> 0 then
    raise exception 'TEST 12 FAILED: third settlement netted a clawback again';
  end if;

  if (select count(*) from public.clawback_applications
       where clawback_id = (
         select id from public.commission_clawbacks
          where refund_case_id = (select id from refund_test_ids where name = 'claw_b')
       )) <> 1 then
    raise exception 'TEST 12 FAILED: clawback was applied more than once';
  end if;

  perform public.mark_settlement_paid(
    v_sid, 700, 'bank_transfer', 'CLAW-TEST12-003');
  raise notice 'TEST 12g PASSED: consumed clawback is never re-applied';
end $$;

-- (h) The open-settlement raise still holds (N-01 changes the PAID path
-- only): approve against an open batch raises, then succeeds after void.
reset role;
insert into public.vendors (id, name, slug, status, commission_rate)
values (
  '42200000-0000-0000-0000-000000000004',
  'Open Settlement Shop', 'open-settlement-shop', 'active', 0.1000
);

insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values (
  '62200000-0000-0000-0000-000000000011',
  '12200000-0000-0000-0000-000000000001',
  'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
  '12 Road 9, Maadi', 'Maadi', 'Cairo'
);

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values (
  '72200000-0000-0000-0000-000000000011',
  '62200000-0000-0000-0000-000000000011',
  '42200000-0000-0000-0000-000000000004',
  'delivered', 10000, 0.1000, now()
);

insert into public.commission_entries (
  id, order_vendor_id, vendor_id, rate, base_minor, amount_minor, earned_at
) values (
  '82200000-0000-0000-0000-000000000011',
  '72200000-0000-0000-0000-000000000011',
  '42200000-0000-0000-0000-000000000004',
  0.1000, 10000, 1000, now()
);

set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
insert into refund_test_ids
select 'claw_open_case', public.open_refund_case(
  '72200000-0000-0000-0000-000000000011', 'Open settlement issue', 1000);

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
insert into refund_test_ids
select 'claw_open_settlement', public.create_settlement(
  '42200000-0000-0000-0000-000000000004', 'Open batch for the raise test');

do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.resolve_refund_case(
      (select id from refund_test_ids where name = 'claw_open_case'), true, 1000, 'Should require voiding first'
    );
  exception when check_violation then
    if sqlerrm like '%part of an active settlement%' then
      v_blocked := true;
    else
      raise exception 'TEST 12 FAILED: wrong error for open settlement: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 12 FAILED: refund approved despite an open settlement';
  end if;

  if (select status from public.refund_cases
       where id = (select id from refund_test_ids where name = 'claw_open_case')) <> 'open' then
    raise exception 'TEST 12 FAILED: blocked case changed status';
  end if;

  perform public.void_settlement(
    (select id from refund_test_ids where name = 'claw_open_settlement'), 'Void for the refund test');

  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'claw_open_case'), true, 1000, 'Approved after void');

  if not exists (
    select 1 from public.commission_adjustments
     where refund_case_id = (select id from refund_test_ids where name = 'claw_open_case')
       and amount_minor = -100
  ) then
    raise exception 'TEST 12 FAILED: approval after void did not adjust -100';
  end if;

  if exists (select 1 from public.commission_clawbacks
              where refund_case_id = (select id from refund_test_ids where name = 'claw_open_case')) then
    raise exception 'TEST 12 FAILED: approval after void recorded a clawback';
  end if;
  raise notice 'TEST 12h PASSED: open settlement still blocks approval; voiding restores the ordinary path';
  raise notice 'TEST 12 PASSED: clawback carries exactly once, capped at the amount paid';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 13 (N-01, D-08): zero-net settlement and direct repayment.
-- ---------------------------------------------------------------------------
-- Vendor E: clawback fully offsets the next batch -> total 0, paid with
-- amount 0 and no proof. Vendor F: no next settlement -> direct repayment.
reset role;
insert into public.vendors (id, name, slug, status, commission_rate)
values (
  '42200000-0000-0000-0000-000000000005',
  'Zero Net Shop', 'zero-net-shop', 'active', 0.1000
),
(
  '42200000-0000-0000-0000-000000000006',
  'Direct Repay Shop', 'direct-repay-shop', 'active', 0.1000
);

insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values (
  '62200000-0000-0000-0000-000000000012',
  '12200000-0000-0000-0000-000000000001',
  'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
  '12 Road 9, Maadi', 'Maadi', 'Cairo'
),
(
  '62200000-0000-0000-0000-000000000014',
  '12200000-0000-0000-0000-000000000001',
  'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
  '12 Road 9, Maadi', 'Maadi', 'Cairo'
);

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values (
  '72200000-0000-0000-0000-000000000012',
  '62200000-0000-0000-0000-000000000012',
  '42200000-0000-0000-0000-000000000005',
  'delivered', 10000, 0.1000, now()
),
(
  '72200000-0000-0000-0000-000000000014',
  '62200000-0000-0000-0000-000000000014',
  '42200000-0000-0000-0000-000000000006',
  'delivered', 10000, 0.1000, now()
);

insert into public.commission_entries (
  id, order_vendor_id, vendor_id, rate, base_minor, amount_minor, earned_at
) values (
  '82200000-0000-0000-0000-000000000012',
  '72200000-0000-0000-0000-000000000012',
  '42200000-0000-0000-0000-000000000005',
  0.1000, 10000, 1000, now()
),
(
  '82200000-0000-0000-0000-000000000014',
  '72200000-0000-0000-0000-000000000014',
  '42200000-0000-0000-0000-000000000006',
  0.1000, 10000, 1000, now()
);

-- Vendor E: pre-settlement refund 5000 (-500), settle 500, pay, then a
-- post-payment refund 4999 claws back the whole 500.
set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
insert into refund_test_ids
select 'zero_a', public.open_refund_case(
  '72200000-0000-0000-0000-000000000012', 'Zero-net first issue', 5000);

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
do $$
begin
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'zero_a'), true, 5000, 'First refund approved');
end $$;

insert into refund_test_ids
select 'zero_settlement', public.create_settlement(
  '42200000-0000-0000-0000-000000000005', 'Zero-net first batch');

do $$
begin
  perform public.mark_settlement_paid(
    (select id from refund_test_ids where name = 'zero_settlement'),
    500, 'bank_transfer', 'ZERO-TEST13-001');
end $$;

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
insert into refund_test_ids
select 'zero_b', public.open_refund_case(
  '72200000-0000-0000-0000-000000000012', 'Zero-net second issue', 4999);

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
do $$
begin
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'zero_b'), true, 4999, 'Second refund approved');

  if not exists (
    select 1 from public.commission_clawbacks
     where refund_case_id = (select id from refund_test_ids where name = 'zero_b')
       and amount_minor = -500
       and status = 'outstanding'
  ) then
    raise exception 'TEST 13 FAILED: zero-net clawback is wrong (expected -500 outstanding)';
  end if;
  raise notice 'TEST 13a PASSED: clawback -500 recorded for the zero-net vendor';
end $$;

-- The next batch (new entry 400) is fully offset: total 0.
reset role;
insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values (
  '62200000-0000-0000-0000-000000000013',
  '12200000-0000-0000-0000-000000000001',
  'delivered', 4000, 4000, 'Refund Buyer', '01001112233',
  '12 Road 9, Maadi', 'Maadi', 'Cairo'
);

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values (
  '72200000-0000-0000-0000-000000000013',
  '62200000-0000-0000-0000-000000000013',
  '42200000-0000-0000-0000-000000000005',
  'delivered', 4000, 0.1000, now()
);

insert into public.commission_entries (
  id, order_vendor_id, vendor_id, rate, base_minor, amount_minor, earned_at
) values (
  '82200000-0000-0000-0000-000000000013',
  '72200000-0000-0000-0000-000000000013',
  '42200000-0000-0000-0000-000000000005',
  0.1000, 4000, 400, now()
);

set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
insert into refund_test_ids
select 'zero_settlement_2', public.create_settlement(
  '42200000-0000-0000-0000-000000000005', 'Zero-net second batch');

do $$
declare
  v_sid uuid := (select id from refund_test_ids where name = 'zero_settlement_2');
  v_blocked boolean := false;
begin
  if (select total_minor from public.settlements where id = v_sid) <> 0 then
    raise exception 'TEST 13 FAILED: fully offset settlement total is not 0';
  end if;

  if (select clawback_minor from public.settlements where id = v_sid) <> 400 then
    raise exception 'TEST 13 FAILED: fully offset settlement clawback_minor is not 400';
  end if;

  -- A transfer reference for a transfer that never happened is rejected.
  begin
    perform public.mark_settlement_paid(
      v_sid, 0, 'bank_transfer', 'ZERO-TEST13-002', null);
  exception when check_violation then
    if sqlerrm like '%fully offset by clawbacks%' then
      v_blocked := true;
    else
      raise exception 'TEST 13 FAILED: wrong error for proof on a zero-net batch: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 13 FAILED: proof was accepted for a zero-net batch';
  end if;

  -- Any positive amount is rejected too.
  v_blocked := false;
  begin
    perform public.mark_settlement_paid(v_sid, 1, null, null, null);
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 13 FAILED: a positive amount was paid on a zero-net batch';
  end if;

  perform public.mark_settlement_paid(v_sid, 0, null, null, null);

  if not exists (
    select 1 from public.settlements
     where id = v_sid
       and status = 'paid'
       and paid_amount_minor = 0
       and total_minor = 0
       and transfer_method is null
       and transfer_reference is null
       and proof_note is null
  ) then
    raise exception 'TEST 13 FAILED: zero-net batch was not paid cleanly';
  end if;

  -- The clawback was only PARTIALLY applied (400 of 500): it stays
  -- outstanding with the 100 remainder carried forward.
  if not exists (
    select 1 from public.commission_clawbacks
     where refund_case_id = (select id from refund_test_ids where name = 'zero_b')
       and status = 'outstanding'
  ) then
    raise exception 'TEST 13 FAILED: partially applied clawback is not outstanding';
  end if;

  if (select coalesce(sum(amount_minor), 0) from public.clawback_applications
       where clawback_id = (
         select id from public.commission_clawbacks
          where refund_case_id = (select id from refund_test_ids where name = 'zero_b')
       )) <> 400 then
    raise exception 'TEST 13 FAILED: partial clawback application is not 400';
  end if;
  raise notice 'TEST 13b PASSED: zero-net batch pays with amount 0 and no proof; 100 of the clawback carries forward';
end $$;

-- The 100 remainder applies to the next batch (new entry 200 -> total 100).
reset role;
insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values (
  '62200000-0000-0000-0000-000000000016',
  '12200000-0000-0000-0000-000000000001',
  'delivered', 2000, 2000, 'Refund Buyer', '01001112233',
  '12 Road 9, Maadi', 'Maadi', 'Cairo'
);

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values (
  '72200000-0000-0000-0000-000000000016',
  '62200000-0000-0000-0000-000000000016',
  '42200000-0000-0000-0000-000000000005',
  'delivered', 2000, 0.1000, now()
);

insert into public.commission_entries (
  id, order_vendor_id, vendor_id, rate, base_minor, amount_minor, earned_at
) values (
  '82200000-0000-0000-0000-000000000016',
  '72200000-0000-0000-0000-000000000016',
  '42200000-0000-0000-0000-000000000005',
  0.1000, 2000, 200, now()
);

set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
insert into refund_test_ids
select 'zero_settlement_3', public.create_settlement(
  '42200000-0000-0000-0000-000000000005', 'Zero-net third batch');

do $$
declare
  v_sid uuid := (select id from refund_test_ids where name = 'zero_settlement_3');
begin
  if (select total_minor from public.settlements where id = v_sid) <> 100 then
    raise exception 'TEST 13 FAILED: remainder batch total is not 100 (200 - 100)';
  end if;

  if (select clawback_minor from public.settlements where id = v_sid) <> 100 then
    raise exception 'TEST 13 FAILED: remainder batch clawback_minor is not 100';
  end if;

  if not exists (
    select 1 from public.commission_clawbacks
     where refund_case_id = (select id from refund_test_ids where name = 'zero_b')
       and status = 'consumed'
       and consumed_at is not null
  ) then
    raise exception 'TEST 13 FAILED: clawback is not consumed after the remainder applied';
  end if;

  perform public.mark_settlement_paid(
    v_sid, 100, 'bank_transfer', 'ZERO-TEST13-003');
  raise notice 'TEST 13b2 PASSED: carried-forward remainder 100 nets the next batch; clawback consumed';
end $$;

-- Vendor F: settle 1000 and pay, refund 5000 claws back 500, then the
-- vendor repays directly (no next settlement).
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
insert into refund_test_ids
select 'repay_case', public.open_refund_case(
  '72200000-0000-0000-0000-000000000014', 'Direct repayment issue', 5000);

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
insert into refund_test_ids
select 'repay_settlement', public.create_settlement(
  '42200000-0000-0000-0000-000000000006', 'Direct repayment batch');

do $$
declare
  v_sid uuid := (select id from refund_test_ids where name = 'repay_settlement');
  v_claw uuid;
begin
  perform public.mark_settlement_paid(
    v_sid, 1000, 'bank_transfer', 'REPAY-TEST13-001');

  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'repay_case'), true, 5000, 'Refund approved');

  select id into v_claw from public.commission_clawbacks
   where refund_case_id = (select id from refund_test_ids where name = 'repay_case');
  if v_claw is null then
    raise exception 'TEST 13 FAILED: direct-repayment clawback was not recorded';
  end if;
  perform set_config('gifto_test.repay_clawback_id', v_claw::text, false);
  raise notice 'TEST 13c SETUP PASSED: clawback -500 recorded for the direct-repayment vendor';
end $$;

-- Non-admin direct repayment is refused; a bad reference is refused;
-- a good reference resolves the clawback and it never applies later.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
do $$
declare
  v_claw uuid := current_setting('gifto_test.repay_clawback_id')::uuid;
  v_blocked boolean := false;
begin
  begin
    perform public.record_clawback_direct_repayment(v_claw, 'BANK-REPAY-1');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 13 FAILED: a non-admin recorded a direct repayment';
  end if;
  raise notice 'TEST 13c PASSED: direct repayment is admin-only';
end $$;

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
do $$
declare
  v_claw uuid := current_setting('gifto_test.repay_clawback_id')::uuid;
  v_blocked boolean := false;
begin
  begin
    perform public.record_clawback_direct_repayment(v_claw, 'x');
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 13 FAILED: a one-character repayment reference was accepted';
  end if;

  perform public.record_clawback_direct_repayment(v_claw, 'BANK-REPAY-1');

  if not exists (
    select 1 from public.commission_clawbacks
     where id = v_claw
       and status = 'direct_repayment'
       and direct_repayment_reference = 'BANK-REPAY-1'
       and consumed_at is not null
  ) then
    raise exception 'TEST 13 FAILED: direct repayment was not recorded';
  end if;

  v_blocked := false;
  begin
    perform public.record_clawback_direct_repayment(v_claw, 'BANK-REPAY-2');
  exception when check_violation then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 13 FAILED: a resolved clawback was repaid again';
  end if;
  raise notice 'TEST 13d PASSED: direct repayment recorded with reference, once only';
end $$;

-- The repaid clawback never applies to the vendor's next settlement.
reset role;
insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values (
  '62200000-0000-0000-0000-000000000015',
  '12200000-0000-0000-0000-000000000001',
  'delivered', 20000, 20000, 'Refund Buyer', '01001112233',
  '12 Road 9, Maadi', 'Maadi', 'Cairo'
);

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values (
  '72200000-0000-0000-0000-000000000015',
  '62200000-0000-0000-0000-000000000015',
  '42200000-0000-0000-0000-000000000006',
  'delivered', 20000, 0.1000, now()
);

insert into public.commission_entries (
  id, order_vendor_id, vendor_id, rate, base_minor, amount_minor, earned_at
) values (
  '82200000-0000-0000-0000-000000000015',
  '72200000-0000-0000-0000-000000000015',
  '42200000-0000-0000-0000-000000000006',
  0.1000, 20000, 2000, now()
);

set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
insert into refund_test_ids
select 'repay_settlement_2', public.create_settlement(
  '42200000-0000-0000-0000-000000000006', 'Second batch after direct repayment');

do $$
declare
  v_sid uuid := (select id from refund_test_ids where name = 'repay_settlement_2');
begin
  if (select total_minor from public.settlements where id = v_sid) <> 2000 then
    raise exception 'TEST 13 FAILED: repaid clawback was netted again (total is not 2000)';
  end if;

  if (select clawback_minor from public.settlements where id = v_sid) <> 0 then
    raise exception 'TEST 13 FAILED: repaid clawback left a clawback total';
  end if;

  if exists (select 1 from public.clawback_applications
              where clawback_id = current_setting('gifto_test.repay_clawback_id')::uuid) then
    raise exception 'TEST 13 FAILED: repaid clawback was applied to a settlement';
  end if;

  perform public.mark_settlement_paid(
    v_sid, 2000, 'bank_transfer', 'REPAY-TEST13-002');
  raise notice 'TEST 13e PASSED: directly repaid clawback never applies to a later batch';
  raise notice 'TEST 13 PASSED: zero-net settlement and direct repayment work';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 14: pending commission adjustment for pre-delivery refunds (N-02)
-- ---------------------------------------------------------------------------
-- Four shipped suborders for a fresh shop (vendor G, 10%): none has an
-- earned entry yet, so approvals must record PENDING adjustments — never
-- silently skip the commission effect (re-audit N-02).
reset role;
insert into auth.users (id, email) values
  ('12200000-0000-0000-0000-000000000007', 'vendor-g-owner@refunds.gifto.test');

insert into public.vendors (id, name, slug, status, commission_rate)
values (
  '42200000-0000-0000-0000-000000000007',
  'Seventh Shop', 'seventh-shop', 'active', 0.1000
);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('42200000-0000-0000-0000-000000000007', '12200000-0000-0000-0000-000000000007', 'owner');

insert into public.products (id, vendor_id, name, slug, price_minor, stock, status)
values (
  '52200000-0000-0000-0000-000000000007',
  '42200000-0000-0000-0000-000000000007',
  'Pending Gift', 'pending-gift', 10000, 10, 'active'
);

-- 722...021: approve while shipped, then deliver (the core N-02 path).
-- 722...022: approve while shipped, then cancel (pending must void).
-- 722...023: approve while shipped, then return via receipt (pending voids).
-- 722...024: three partial refunds before delivery (accumulate to the cap).
-- 722...025: stays shipped; used for the scope-trigger probe only.
insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values
  ('62200000-0000-0000-0000-000000000021',
   '12200000-0000-0000-0000-000000000001',
   'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
   '12 Road 9, Maadi', 'Maadi', 'Cairo'),
  ('62200000-0000-0000-0000-000000000022',
   '12200000-0000-0000-0000-000000000001',
   'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
   '12 Road 9, Maadi', 'Maadi', 'Cairo'),
  ('62200000-0000-0000-0000-000000000023',
   '12200000-0000-0000-0000-000000000001',
   'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
   '12 Road 9, Maadi', 'Maadi', 'Cairo'),
  ('62200000-0000-0000-0000-000000000024',
   '12200000-0000-0000-0000-000000000001',
   'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
   '12 Road 9, Maadi', 'Maadi', 'Cairo'),
  ('62200000-0000-0000-0000-000000000025',
   '12200000-0000-0000-0000-000000000001',
   'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
   '12 Road 9, Maadi', 'Maadi', 'Cairo');

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values
  ('72200000-0000-0000-0000-000000000021',
   '62200000-0000-0000-0000-000000000021',
   '42200000-0000-0000-0000-000000000007',
   'shipped', 10000, 0.1000, null),
  ('72200000-0000-0000-0000-000000000022',
   '62200000-0000-0000-0000-000000000022',
   '42200000-0000-0000-0000-000000000007',
   'shipped', 10000, 0.1000, null),
  ('72200000-0000-0000-0000-000000000023',
   '62200000-0000-0000-0000-000000000023',
   '42200000-0000-0000-0000-000000000007',
   'shipped', 10000, 0.1000, null),
  ('72200000-0000-0000-0000-000000000024',
   '62200000-0000-0000-0000-000000000024',
   '42200000-0000-0000-0000-000000000007',
   'shipped', 10000, 0.1000, null),
  ('72200000-0000-0000-0000-000000000025',
   '62200000-0000-0000-0000-000000000025',
   '42200000-0000-0000-0000-000000000007',
   'shipped', 10000, 0.1000, null);

insert into public.order_items (
  order_vendor_id, product_id, product_name, product_slug,
  unit_price_minor, quantity, line_total_minor
) values
  ('72200000-0000-0000-0000-000000000021', '52200000-0000-0000-0000-000000000007', 'Pending Gift', 'pending-gift', 10000, 1, 10000),
  ('72200000-0000-0000-0000-000000000022', '52200000-0000-0000-0000-000000000007', 'Pending Gift', 'pending-gift', 10000, 1, 10000),
  ('72200000-0000-0000-0000-000000000023', '52200000-0000-0000-0000-000000000007', 'Pending Gift', 'pending-gift', 10000, 1, 10000),
  ('72200000-0000-0000-0000-000000000024', '52200000-0000-0000-0000-000000000007', 'Pending Gift', 'pending-gift', 10000, 1, 10000),
  ('72200000-0000-0000-0000-000000000025', '52200000-0000-0000-0000-000000000007', 'Pending Gift', 'pending-gift', 10000, 1, 10000);

-- Open one case per suborder (the shipped window has not started).
set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
do $$
begin
  insert into refund_test_ids
  select 'pending_a', public.open_refund_case(
    '72200000-0000-0000-0000-000000000021', 'Changed my mind before delivery', 4000);
  insert into refund_test_ids
  select 'pending_b', public.open_refund_case(
    '72200000-0000-0000-0000-000000000022', 'Changed my mind before delivery', 2000);
  insert into refund_test_ids
  select 'pending_c', public.open_refund_case(
    '72200000-0000-0000-0000-000000000023', 'Changed my mind before delivery', 3000);
  insert into refund_test_ids
  select 'pending_d1', public.open_refund_case(
    '72200000-0000-0000-0000-000000000024', 'First partial refund', 3000);
  insert into refund_test_ids
  select 'pending_e', public.open_refund_case(
    '72200000-0000-0000-0000-000000000025', 'Scope probe case', 1000);
end $$;

-- Admin approves all four: each must record a pending adjustment (no
-- earned entry exists yet), never silently skip the commission effect.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000006';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000006"}';
do $$
begin
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'pending_a'), true, 4000, 'Approved before delivery');
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'pending_b'), true, 2000, 'Approved before delivery');
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'pending_c'), true, 3000, 'Approved before delivery');
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'pending_d1'), true, 3000, 'First partial approved');

  if (select count(*) from public.pending_commission_adjustments
       where refund_case_id = (select id from refund_test_ids where name = 'pending_a')
         and amount_minor = -400 and rate = 0.1000 and status = 'pending'
         and refund_amount_minor = 4000) <> 1 then
    raise exception 'TEST 14 FAILED: shipped approval did not record a pending -400 adjustment';
  end if;
  if (select count(*) from public.pending_commission_adjustments
       where refund_case_id = (select id from refund_test_ids where name = 'pending_b')
         and amount_minor = -200 and status = 'pending') <> 1 then
    raise exception 'TEST 14 FAILED: shipped approval did not record a pending -200 adjustment';
  end if;
  if (select count(*) from public.pending_commission_adjustments
       where refund_case_id = (select id from refund_test_ids where name = 'pending_c')
         and amount_minor = -300 and status = 'pending') <> 1 then
    raise exception 'TEST 14 FAILED: shipped approval did not record a pending -300 adjustment';
  end if;
  if (select count(*) from public.pending_commission_adjustments
       where refund_case_id = (select id from refund_test_ids where name = 'pending_d1')
         and amount_minor = -300 and status = 'pending') <> 1 then
    raise exception 'TEST 14 FAILED: first partial did not record a pending -300 adjustment';
  end if;
  if exists (select 1 from public.commission_entries
              where order_vendor_id in (
                '72200000-0000-0000-0000-000000000021',
                '72200000-0000-0000-0000-000000000022',
                '72200000-0000-0000-0000-000000000023',
                '72200000-0000-0000-0000-000000000024')) then
    raise exception 'TEST 14 FAILED: approval created a commission entry before delivery';
  end if;
  raise notice 'TEST 14a PASSED: shipped approvals record pending adjustments, no entry yet';
end $$;

-- 14a core path: deliver the first suborder. The pending -400 converts
-- into an ordinary adjustment; the entry keeps its full 1000 amount and
-- the net is 600.
do $$
declare
  v_entry_id uuid;
begin
  perform public.set_order_vendor_status(
    '72200000-0000-0000-0000-000000000021', 'delivered', 'shipped');

  select id into v_entry_id from public.commission_entries
   where order_vendor_id = '72200000-0000-0000-0000-000000000021';
  if v_entry_id is null then
    raise exception 'TEST 14 FAILED: delivery did not earn a commission entry';
  end if;

  if not exists (
    select 1 from public.commission_entries
     where id = v_entry_id and amount_minor = 1000 and status = 'earned'
       and rate = 0.1000 and base_minor = 10000
  ) then
    raise exception 'TEST 14 FAILED: earned entry is not the full 1000';
  end if;

  if not exists (
    select 1 from public.commission_adjustments
     where commission_entry_id = v_entry_id
       and refund_case_id = (select id from refund_test_ids where name = 'pending_a')
       and amount_minor = -400
  ) then
    raise exception 'TEST 14 FAILED: pending adjustment did not convert into an ordinary adjustment';
  end if;

  if not exists (
    select 1 from public.pending_commission_adjustments
     where refund_case_id = (select id from refund_test_ids where name = 'pending_a')
       and status = 'applied'
       and applied_entry_id = v_entry_id
  ) then
    raise exception 'TEST 14 FAILED: pending adjustment was not consumed exactly once with the entry linked';
  end if;

  if (select amount_minor + coalesce((
        select sum(amount_minor) from public.commission_adjustments
         where commission_entry_id = v_entry_id), 0)
       from public.commission_entries where id = v_entry_id) <> 600 then
    raise exception 'TEST 14 FAILED: delivered commission net is not 600';
  end if;
  raise notice 'TEST 14a2 PASSED: delivery earns the reduced net 600, pending consumed once';
end $$;

-- 14b: cancel the second suborder. The pending -200 voids visibly; no
-- entry and no adjustment ever appear.
do $$
begin
  perform public.set_order_vendor_status(
    '72200000-0000-0000-0000-000000000022', 'cancelled', 'shipped',
    'unreachable', 'Customer did not answer');

  if (select status from public.order_vendors
       where id = '72200000-0000-0000-0000-000000000022') <> 'cancelled' then
    raise exception 'TEST 14 FAILED: suborder did not cancel';
  end if;

  if not exists (
    select 1 from public.pending_commission_adjustments
     where refund_case_id = (select id from refund_test_ids where name = 'pending_b')
       and status = 'voided'
  ) then
    raise exception 'TEST 14 FAILED: cancelled suborder left its pending adjustment unvoided';
  end if;

  if exists (select 1 from public.commission_entries
              where order_vendor_id = '72200000-0000-0000-0000-000000000022') then
    raise exception 'TEST 14 FAILED: cancelled suborder earned commission';
  end if;

  if exists (select 1 from public.commission_adjustments
              where refund_case_id = (select id from refund_test_ids where name = 'pending_b')) then
    raise exception 'TEST 14 FAILED: cancelled suborder converted its pending adjustment';
  end if;
  raise notice 'TEST 14b PASSED: cancelled suborder voids its pending adjustment visibly';
end $$;

-- 14c: the vendor confirms receipt for the third suborder (physical
-- return while still shipped). The suborder moves to returned and the
-- pending -300 voids visibly; nothing is ever earned.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000007';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000007"}';
do $$
begin
  perform public.acknowledge_refund_case(
    (select id from refund_test_ids where name = 'pending_c'));
  perform public.confirm_refund_receipt(
    (select id from refund_test_ids where name = 'pending_c'), 'Item back before delivery');

  if (select status from public.order_vendors
       where id = '72200000-0000-0000-0000-000000000023') <> 'returned' then
    raise exception 'TEST 14 FAILED: suborder did not move to returned on receipt';
  end if;

  if not exists (
    select 1 from public.pending_commission_adjustments
     where refund_case_id = (select id from refund_test_ids where name = 'pending_c')
       and status = 'voided'
  ) then
    raise exception 'TEST 14 FAILED: returned suborder left its pending adjustment unvoided';
  end if;

  if exists (select 1 from public.commission_entries
              where order_vendor_id = '72200000-0000-0000-0000-000000000023') then
    raise exception 'TEST 14 FAILED: returned suborder earned commission';
  end if;
  raise notice 'TEST 14c PASSED: returned suborder voids its pending adjustment visibly';
end $$;

-- 14d: two more partial refunds on the fourth suborder (3000 + 4000 +
-- 3000 = the full subtotal; reductions -300, -400, -300 accumulate to
-- exactly the 1000 eventual earn — the cap). Delivery earns zero net
-- and the settlement snapshot excludes the zero-net line.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
do $$
begin
  insert into refund_test_ids
  select 'pending_d2', public.open_refund_case(
    '72200000-0000-0000-0000-000000000024', 'Second partial refund', 4000);
end $$;

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000006';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000006"}';
do $$
begin
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'pending_d2'), true, 4000, 'Second partial approved');
end $$;

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
do $$
begin
  insert into refund_test_ids
  select 'pending_d3', public.open_refund_case(
    '72200000-0000-0000-0000-000000000024', 'Third partial refund', 3000);
end $$;

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000006';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000006"}';
do $$
declare
  v_entry_id uuid;
  v_settlement_id uuid;
begin
  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'pending_d3'), true, 3000, 'Third partial approved');

  if (select coalesce(sum(amount_minor), 0) from public.pending_commission_adjustments
       where order_vendor_id = '72200000-0000-0000-0000-000000000024'
         and status = 'pending') <> -1000 then
    raise exception 'TEST 14 FAILED: partial refunds did not accumulate to -1000';
  end if;

  perform public.set_order_vendor_status(
    '72200000-0000-0000-0000-000000000024', 'delivered', 'shipped');

  select id into v_entry_id from public.commission_entries
   where order_vendor_id = '72200000-0000-0000-0000-000000000024';
  if v_entry_id is null then
    raise exception 'TEST 14 FAILED: full-refund delivery did not earn an entry';
  end if;

  if (select coalesce(sum(amount_minor), 0) from public.commission_adjustments
       where commission_entry_id = v_entry_id) <> -1000 then
    raise exception 'TEST 14 FAILED: full-refund adjustments do not sum to -1000';
  end if;

  if (select count(*) from public.pending_commission_adjustments
       where order_vendor_id = '72200000-0000-0000-0000-000000000024'
         and status = 'applied') <> 3 then
    raise exception 'TEST 14 FAILED: not all three pending rows converted';
  end if;

  -- The settlement snapshot sees the already-correct net: the 600 line
  -- from 14a is included, the zero-net line is excluded.
  insert into refund_test_ids
  select 'pending_settlement', public.create_settlement(
    '42200000-0000-0000-0000-000000000007', 'N-02 test batch');
  v_settlement_id := (select id from refund_test_ids where name = 'pending_settlement');

  if (select total_minor from public.settlements where id = v_settlement_id) <> 600 then
    raise exception 'TEST 14 FAILED: settlement total is not 600 (only the reduced line)';
  end if;

  if (select count(*) from public.settlement_lines
       where settlement_id = v_settlement_id) <> 1 then
    raise exception 'TEST 14 FAILED: settlement does not have exactly one line';
  end if;

  if exists (select 1 from public.settlement_lines
              where settlement_id = v_settlement_id
                and commission_entry_id = v_entry_id) then
    raise exception 'TEST 14 FAILED: zero-net line was included in the settlement';
  end if;
  raise notice 'TEST 14d PASSED: partial refunds accumulate to the cap; full refund earns zero net and is excluded from settlement';
end $$;

-- 14e: scope-trigger probe (defense-in-depth). A direct pending insert
-- with the wrong rate is rejected by the trigger, not recorded.
reset role;
do $$
declare
  v_blocked boolean := false;
begin
  begin
    insert into public.pending_commission_adjustments (
      refund_case_id, order_vendor_id, vendor_id, amount_minor,
      refund_amount_minor, rate, created_by
    ) values (
      (select id from refund_test_ids where name = 'pending_e'),
      '72200000-0000-0000-0000-000000000025',
      '42200000-0000-0000-0000-000000000007',
      -100, 1000, 0.2000,
      '12200000-0000-0000-0000-000000000006'
    );
  exception when check_violation then
    if sqlerrm like '%frozen commission rate%' then
      v_blocked := true;
    else
      raise exception 'TEST 14 FAILED: wrong-rate insert raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 14 FAILED: pending insert with a wrong rate was accepted';
  end if;

  if exists (select 1 from public.pending_commission_adjustments
              where refund_case_id = (select id from refund_test_ids where name = 'pending_e')) then
    raise exception 'TEST 14 FAILED: rejected pending insert left a row behind';
  end if;
  raise notice 'TEST 14e PASSED: scope trigger rejects a pending adjustment with the wrong rate';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 15: cancel_refund_case RPC + UI backing (N-03, D-09)
-- ---------------------------------------------------------------------------
-- D-09 decides the customer may cancel their own open refund case.
-- Fresh shipped/delivered suborders for vendor G (product stock 10).
reset role;
insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values
  ('62200000-0000-0000-0000-000000000031',
   '12200000-0000-0000-0000-000000000001',
   'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
   '12 Road 9, Maadi', 'Maadi', 'Cairo'),
  ('62200000-0000-0000-0000-000000000032',
   '12200000-0000-0000-0000-000000000001',
   'delivered', 10000, 10000, 'Refund Buyer', '01001112233',
   '12 Road 9, Maadi', 'Maadi', 'Cairo');

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values
  ('72200000-0000-0000-0000-000000000031',
   '62200000-0000-0000-0000-000000000031',
   '42200000-0000-0000-0000-000000000007',
   'shipped', 10000, 0.1000, null),
  ('72200000-0000-0000-0000-000000000032',
   '62200000-0000-0000-0000-000000000032',
   '42200000-0000-0000-0000-000000000007',
   'delivered', 10000, 0.1000, now());

insert into public.order_items (
  order_vendor_id, product_id, product_name, product_slug,
  unit_price_minor, quantity, line_total_minor
) values
  ('72200000-0000-0000-0000-000000000031', '52200000-0000-0000-0000-000000000007', 'Pending Gift', 'pending-gift', 10000, 1, 10000),
  ('72200000-0000-0000-0000-000000000032', '52200000-0000-0000-0000-000000000007', 'Pending Gift', 'pending-gift', 10000, 1, 10000);

insert into public.commission_entries (
  id, order_vendor_id, vendor_id, rate, base_minor, amount_minor, earned_at
) values (
  '82200000-0000-0000-0000-000000000032',
  '72200000-0000-0000-0000-000000000032',
  '42200000-0000-0000-0000-000000000007',
  0.1000, 10000, 1000, now()
);

-- 15a: the opener cancels their own open case. No money, stock, or
-- settlement effect; the case records who cancelled and when.
set role authenticated;
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
do $$
declare
  v_stock_before int;
begin
  insert into refund_test_ids
  select 'cancel_a', public.open_refund_case(
    '72200000-0000-0000-0000-000000000031', 'Opened by mistake', 1000);

  -- Stock before the cancel (TEST 14b's suborder cancellation already
  -- restocked one unit of this product to 11; the refund-case cancel
  -- itself must not move it).
  v_stock_before := (select stock from public.products
                      where id = '52200000-0000-0000-0000-000000000007');

  perform public.cancel_refund_case(
    (select id from refund_test_ids where name = 'cancel_a'));

  if not exists (
    select 1 from public.refund_cases
     where id = (select id from refund_test_ids where name = 'cancel_a')
       and status = 'cancelled'
       and resolved_by = '12200000-0000-0000-0000-000000000001'
       and resolved_at is not null
       and refund_amount_minor = 0
  ) then
    raise exception 'TEST 15 FAILED: opener cancel did not record cancelled with resolver and timestamp';
  end if;

  if exists (select 1 from public.commission_entries
              where order_vendor_id = '72200000-0000-0000-0000-000000000031') then
    raise exception 'TEST 15 FAILED: cancelled case earned commission';
  end if;
  if exists (select 1 from public.commission_adjustments
              where refund_case_id = (select id from refund_test_ids where name = 'cancel_a')) then
    raise exception 'TEST 15 FAILED: cancelled case recorded a commission adjustment';
  end if;
  if exists (select 1 from public.pending_commission_adjustments
              where refund_case_id = (select id from refund_test_ids where name = 'cancel_a')) then
    raise exception 'TEST 15 FAILED: cancelled case recorded a pending adjustment';
  end if;
  if (select stock from public.products
       where id = '52200000-0000-0000-0000-000000000007') <> v_stock_before then
    raise exception 'TEST 15 FAILED: cancel changed stock (was %, now %)', v_stock_before, (select stock from public.products where id = '52200000-0000-0000-0000-000000000007');
  end if;
  raise notice 'TEST 15a PASSED: opener cancels an open case with no money or stock effect';
end $$;

-- 15b: the cancelled case frees the one-open-case slot; nobody else can
-- cancel the fresh case — not another customer, not an admin.
do $$
declare
  v_blocked boolean := false;
begin
  insert into refund_test_ids
  select 'cancel_b', public.open_refund_case(
    '72200000-0000-0000-0000-000000000031', 'Trying again after cancelling', 1000);
  raise notice 'TEST 15b0 PASSED: cancelled case frees the open-case slot';
end $$;

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000002"}';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.cancel_refund_case(
      (select id from refund_test_ids where name = 'cancel_b'));
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 15 FAILED: another customer cancelled the case';
  end if;
  raise notice 'TEST 15b1 PASSED: another customer cannot cancel the case';
end $$;

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.cancel_refund_case(
      (select id from refund_test_ids where name = 'cancel_b'));
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 15 FAILED: an admin cancelled the case as a substitute for reject';
  end if;
  raise notice 'TEST 15b2 PASSED: an admin cannot cancel as a substitute for reject';
end $$;

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
do $$
begin
  perform public.cancel_refund_case(
    (select id from refund_test_ids where name = 'cancel_b'));

  if (select status from public.refund_cases
       where id = (select id from refund_test_ids where name = 'cancel_b')) <> 'cancelled' then
    raise exception 'TEST 15 FAILED: opener could not cancel the fresh case';
  end if;
  raise notice 'TEST 15b3 PASSED: opener cancels the fresh case';
end $$;

-- 15c: the resolve-vs-cancel race, both orders, sequentially. Cancel
-- first: a later resolve is rejected and the case stays cancelled.
-- Resolve first: a later cancel is rejected and the case stays approved.
-- (The shared FOR UPDATE lock is the serialisation mechanism; a live
-- two-session run is not part of this suite.)
do $$
begin
  insert into refund_test_ids
  select 'cancel_c', public.open_refund_case(
    '72200000-0000-0000-0000-000000000032', 'Gift arrived scratched', 4000);
end $$;

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.resolve_refund_case(
      (select id from refund_test_ids where name = 'cancel_a'), true, 1000, 'Too late');
  exception when check_violation then
    if sqlerrm like '%already resolved%' then
      v_blocked := true;
    else
      raise exception 'TEST 15 FAILED: resolve of a cancelled case raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 15 FAILED: resolve succeeded on a cancelled case';
  end if;

  if (select status from public.refund_cases
       where id = (select id from refund_test_ids where name = 'cancel_a')) <> 'cancelled' then
    raise exception 'TEST 15 FAILED: failed resolve changed the cancelled case';
  end if;
  raise notice 'TEST 15c1 PASSED: cancel wins the race; a later resolve is rejected';

  perform public.resolve_refund_case(
    (select id from refund_test_ids where name = 'cancel_c'), true, 4000, 'Return approved');

  if not exists (
    select 1 from public.commission_adjustments
     where refund_case_id = (select id from refund_test_ids where name = 'cancel_c')
       and amount_minor = -400
  ) then
    raise exception 'TEST 15 FAILED: approval did not record the -400 adjustment';
  end if;
end $$;

set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000001"}';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.cancel_refund_case(
      (select id from refund_test_ids where name = 'cancel_c'));
  exception when check_violation then
    if sqlerrm like '%no longer open%' then
      v_blocked := true;
    else
      raise exception 'TEST 15 FAILED: cancel of an approved case raised the wrong error: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 15 FAILED: cancel succeeded on an approved case';
  end if;

  if (select status from public.refund_cases
       where id = (select id from refund_test_ids where name = 'cancel_c')) <> 'approved' then
    raise exception 'TEST 15 FAILED: failed cancel changed the approved case';
  end if;

  raise notice 'TEST 15c2 PASSED: resolve wins the race; a later cancel is rejected';
end $$;

-- The buyer cannot read commission_adjustments (RLS: vendor/admin only),
-- so the failed cancel's money effect is verified as an admin.
set request.jwt.claim.sub = '12200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"12200000-0000-0000-0000-000000000003"}';
do $$
begin
  if (select count(*) from public.commission_adjustments
       where refund_case_id = (select id from refund_test_ids where name = 'cancel_c')) <> 1 then
    raise exception 'TEST 15 FAILED: failed cancel changed the commission adjustment';
  end if;
  if (select coalesce(sum(amount_minor), 0) from public.commission_adjustments
       where refund_case_id = (select id from refund_test_ids where name = 'cancel_c')) <> -400 then
    raise exception 'TEST 15 FAILED: failed cancel changed the adjustment amount';
  end if;
  raise notice 'TEST 15c3 PASSED: failed cancel left the -400 adjustment untouched';
end $$;

-- 15d: guest cancel. The signed-in RPC cannot touch a guest case; the
-- guest RPC needs the right token; a correct cancel records resolved_at
-- with resolved_by NULL (the CHECK's guest-cancelled branch).
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.cancel_refund_case(
      (select id from refund_test_ids where name = 'case_guest_window'));
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 15 FAILED: signed-in cancel touched a guest case';
  end if;
  raise notice 'TEST 15d0 PASSED: signed-in cancel cannot touch a guest case';
end $$;

-- The temp id table belongs to the authenticated role; stash the guest
-- case id in a session setting before switching to service_role.
reset role;
do $$
begin
  perform set_config('gifto_test.guest_cancel_case',
    (select id::text from refund_test_ids where name = 'case_guest_window'), false);
end $$;

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-window-7', 'sha256'), 'hex');
  v_case uuid := current_setting('gifto_test.guest_cancel_case')::uuid;
  v_blocked boolean := false;
begin
  begin
    perform public.cancel_guest_refund_case(
      '62200000-0000-0000-0000-000000000007',
      encode(digest('wrong-token', 'sha256'), 'hex'),
      v_case);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 15 FAILED: guest cancel accepted a wrong token';
  end if;

  perform public.cancel_guest_refund_case(
    '62200000-0000-0000-0000-000000000007',
    v_hash,
    v_case);

  if not exists (
    select 1 from public.refund_cases
     where id = v_case
       and status = 'cancelled'
       and resolved_by is null
       and resolved_at is not null
       and refund_amount_minor = 0
  ) then
    raise exception 'TEST 15 FAILED: guest cancel did not record cancelled with no resolver';
  end if;

  if exists (select 1 from public.commission_adjustments
              where refund_case_id = v_case) then
    raise exception 'TEST 15 FAILED: guest cancel recorded a commission adjustment';
  end if;

  -- A cancelled case cannot be cancelled again.
  begin
    perform public.cancel_guest_refund_case(
      '62200000-0000-0000-0000-000000000007',
      v_hash,
      v_case);
    raise exception 'TEST 15 FAILED: guest cancel succeeded twice';
  exception when check_violation then
    if sqlerrm not like '%no longer open%' then
      raise exception 'TEST 15 FAILED: second guest cancel raised the wrong error: %', sqlerrm;
    end if;
  end;
  raise notice 'TEST 15d PASSED: guest cancels with a valid token; resolved_by stays null';
end $$;

reset role;

rollback;
