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

  perform public.mark_settlement_paid((select id from refund_test_ids where name = 'settlement'));
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

reset role;

rollback;
