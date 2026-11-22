-- Gifto Phase 6 verification: commission ledger, reversals and settlements.
-- Runs after all migrations (1–18) against a bare `supabase/postgres` container.
-- Any failure RAISEs and, with `psql -v ON_ERROR_STOP=1`, aborts non-zero.
--
-- Order ids are carried between blocks in session GUCs so they survive SET ROLE.

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
delete from public.settlements;
delete from public.orders;
delete from public.products where vendor_id in (
  '41100000-0000-0000-0000-000000000001',
  '41100000-0000-0000-0000-000000000002'
);
delete from public.vendors where id in (
  '41100000-0000-0000-0000-000000000001',
  '41100000-0000-0000-0000-000000000002'
);
delete from auth.users where email like '%@comm.gifto.test';

insert into auth.users (id, email) values
  ('c1110000-0000-0000-0000-000000000001', 'buyer@comm.gifto.test'),
  ('c1110000-0000-0000-0000-000000000002', 'stranger@comm.gifto.test'),
  ('c2110000-0000-0000-0000-000000000001', 'owner-a@comm.gifto.test'),
  ('c2110000-0000-0000-0000-000000000003', 'owner-b@comm.gifto.test'),
  ('c3110000-0000-0000-0000-000000000001', 'admin@comm.gifto.test');

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = 'c3110000-0000-0000-0000-000000000001';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (id, name, slug, status, commission_rate) values
  ('41100000-0000-0000-0000-000000000001', 'Shop A', 'shop-a', 'active', 0.0800),
  ('41100000-0000-0000-0000-000000000002', 'Shop B', 'shop-b', 'active', 0.1500);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('41100000-0000-0000-0000-000000000001', 'c2110000-0000-0000-0000-000000000001', 'owner'),
  ('41100000-0000-0000-0000-000000000002', 'c2110000-0000-0000-0000-000000000003', 'owner');

insert into public.products (id, vendor_id, name, slug, price_minor, stock, status) values
  ('51100000-0000-0000-0000-000000000001', '41100000-0000-0000-0000-000000000001',
   'A One', 'a-one', 10000, 10, 'active'),
  ('51100000-0000-0000-0000-000000000004', '41100000-0000-0000-0000-000000000002',
   'B One', 'b-one', 7500, 10, 'active');

-- ---------------------------------------------------------------------------
-- TEST 1: anon has no access; authenticated cannot write the ledger directly
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('anon', 'public.commission_entries', 'select')
     or has_table_privilege('anon', 'public.settlements', 'select')
     or has_table_privilege('anon', 'public.settlement_lines', 'select')
     or has_function_privilege('anon', 'public.create_settlement(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.mark_settlement_paid(uuid,int,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.void_settlement(uuid,text)', 'execute') then
    raise exception 'TEST 1 FAILED: anon holds privileges on the commission group';
  end if;

  if has_table_privilege('authenticated', 'public.commission_entries', 'insert')
     or has_table_privilege('authenticated', 'public.commission_entries', 'update')
     or has_table_privilege('authenticated', 'public.commission_entries', 'delete')
     or has_table_privilege('authenticated', 'public.settlements', 'insert')
     or has_table_privilege('authenticated', 'public.settlements', 'update')
     or has_table_privilege('authenticated', 'public.settlements', 'delete')
     or has_table_privilege('authenticated', 'public.settlement_lines', 'insert')
     or has_table_privilege('authenticated', 'public.settlement_lines', 'update')
     or has_table_privilege('authenticated', 'public.settlement_lines', 'delete') then
    raise exception 'TEST 1 FAILED: authenticated can write the ledger directly';
  end if;

  raise notice 'TEST 1 PASSED: ledger is read-only to clients; anon has nothing';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: a multi-shop order earns nothing until it is delivered
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'c1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1},
      {"product_id":"51100000-0000-0000-0000-000000000004","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.comm_order_id', v_oid::text, false);
end $$;

reset role;
do $$
declare v_entries int;
begin
  select count(*) into v_entries from public.commission_entries;
  if v_entries <> 0 then
    raise exception 'TEST 2 FAILED: % entries before delivery', v_entries;
  end if;
  raise notice 'TEST 2 PASSED: no commission before delivery';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: delivering each suborder earns exactly rate x product subtotal (D-02)
--
-- Shop A: 1 x 10000 at 8%  -> 800
-- Shop B: 1 x 7500  at 15% -> 1125
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid; v_ov uuid;
begin
  v_oid := current_setting('gifto_test.comm_order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000001';
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000003"}';
do $$
declare v_oid uuid; v_ov uuid;
begin
  v_oid := current_setting('gifto_test.comm_order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000002';
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

reset role;
do $$
declare
  v_oid     uuid;
  v_a       public.commission_entries;
  v_b       public.commission_entries;
begin
  v_oid := current_setting('gifto_test.comm_order_id')::uuid;

  select ce.* into v_a from public.commission_entries ce
    join public.order_vendors ov on ov.id = ce.order_vendor_id
   where ov.order_id = v_oid and ov.vendor_id = '41100000-0000-0000-0000-000000000001';

  select ce.* into v_b from public.commission_entries ce
    join public.order_vendors ov on ov.id = ce.order_vendor_id
   where ov.order_id = v_oid and ov.vendor_id = '41100000-0000-0000-0000-000000000002';

  if v_a.id is null or v_b.id is null then
    raise exception 'TEST 3 FAILED: expected one entry per delivered suborder';
  end if;

  if v_a.base_minor <> 10000 or v_a.amount_minor <> 800 or v_a.rate <> 0.0800 then
    raise exception 'TEST 3 FAILED: shop A entry base=% amount=% rate=%',
      v_a.base_minor, v_a.amount_minor, v_a.rate;
  end if;

  if v_b.base_minor <> 7500 or v_b.amount_minor <> 1125 or v_b.rate <> 0.1500 then
    raise exception 'TEST 3 FAILED: shop B entry base=% amount=% rate=%',
      v_b.base_minor, v_b.amount_minor, v_b.rate;
  end if;

  if v_a.status <> 'earned' or v_a.currency <> 'EGP' or v_a.earned_at is null then
    raise exception 'TEST 3 FAILED: shop A entry status/currency/earned_at wrong';
  end if;

  if (select count(*) from public.commission_entries) <> 2 then
    raise exception 'TEST 3 FAILED: expected exactly 2 entries';
  end if;
  raise notice 'TEST 3 PASSED: commission earned on delivery, rate x subtotal (D-02)';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: re-writing the delivered status cannot double-charge
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000001"}';
do $$
declare v_ov uuid;
begin
  v_ov := (
    select ov.id from public.order_vendors ov
     where ov.order_id = current_setting('gifto_test.comm_order_id')::uuid
       and ov.vendor_id = '41100000-0000-0000-0000-000000000001'
  );
  begin
    perform public.set_order_vendor_status(v_ov, 'delivered', 'delivered');
    raise exception 'TEST 4 FAILED: repeated delivery was accepted';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.commission_entries (order_vendor_id, vendor_id, rate, base_minor, amount_minor)
    values (v_ov, '41100000-0000-0000-0000-000000000001', 0.08, 10000, 800);
    raise exception 'TEST 4 FAILED: a vendor inserted a ledger row directly';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
do $$
begin
  if (select count(*) from public.commission_entries) <> 2 then
    raise exception 'TEST 4 FAILED: duplicate entry created';
  end if;
  raise notice 'TEST 4 PASSED: delivery is idempotent and direct inserts are denied';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: each shop sees only its own commission; a stranger sees none
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000001"}';
do $$
declare v_n int;
begin
  select count(*) into v_n from public.commission_entries;
  if v_n <> 1 then
    raise exception 'TEST 5 FAILED: shop A sees % entries', v_n;
  end if;
  if not exists (
    select 1 from public.commission_entries
     where vendor_id = '41100000-0000-0000-0000-000000000001'
  ) then
    raise exception 'TEST 5 FAILED: shop A missing its own entry';
  end if;
  raise notice 'TEST 5 PASSED: shop A sees only its own commission';
end $$;

set request.jwt.claim.sub = 'c1110000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-000000000002"}';
do $$
declare v_n int;
begin
  select count(*) into v_n from public.commission_entries;
  if v_n <> 0 then
    raise exception 'TEST 5 FAILED: a stranger sees % entries', v_n;
  end if;
  raise notice 'TEST 5 PASSED: a stranger cannot read the ledger';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: a cancelled order earns nothing
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'c1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.comm_cancelled_id', v_oid::text, false);
  perform public.cancel_order(v_oid);
end $$;

reset role;
do $$
declare v_n int;
begin
  select count(*) into v_n from public.commission_entries
   where order_vendor_id in (
     select id from public.order_vendors
      where order_id = current_setting('gifto_test.comm_cancelled_id')::uuid
   );
  if v_n <> 0 then
    raise exception 'TEST 6 FAILED: a cancelled order earned commission';
  end if;
  raise notice 'TEST 6 PASSED: cancelled orders never earn commission';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 7: a returned suborder reverses its (unsettled) commission
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare v_ov uuid;
begin
  v_ov := (
    select ov.id from public.order_vendors ov
     where ov.order_id = current_setting('gifto_test.comm_order_id')::uuid
       and ov.vendor_id = '41100000-0000-0000-0000-000000000001'
  );
  perform public.set_order_vendor_status(
    v_ov, 'returned', 'delivered', 'damaged');
end $$;

reset role;
do $$
declare v_status public.commission_status; v_at timestamptz;
begin
  select ce.status, ce.reversed_at into v_status, v_at
    from public.commission_entries ce
    join public.order_vendors ov on ov.id = ce.order_vendor_id
   where ov.order_id = current_setting('gifto_test.comm_order_id')::uuid
     and ov.vendor_id = '41100000-0000-0000-0000-000000000001';

  if v_status <> 'reversed' or v_at is null then
    raise exception 'TEST 7 FAILED: status=% reversed_at=%', v_status, v_at;
  end if;
  raise notice 'TEST 7 PASSED: a return reversed the unsettled commission';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 8: settlements are admin-only and batch exactly the vendor's earned rows
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000003"}';
set role authenticated;
set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000003"}';
do $$
begin
  begin
    perform public.create_settlement('41100000-0000-0000-0000-000000000002');
    raise exception 'TEST 8 FAILED: a vendor created a settlement';
  exception when insufficient_privilege then
    null;
  end;
end $$;

set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare
  v_sid        uuid;
  v_total      int;
  v_lines      int;
  v_paid_at    timestamptz;
  v_created_by uuid;
  v_paid_by    uuid;
  v_paid_amount int;
  v_method     text;
  v_reference  text;
  v_proof      text;
begin
  -- shop A has only a reversed entry -> nothing to settle
  begin
    perform public.create_settlement('41100000-0000-0000-0000-000000000001');
    raise exception 'TEST 8 FAILED: settled a vendor with no earned commission';
  exception when check_violation then
    null;
  end;

  v_sid := public.create_settlement('41100000-0000-0000-0000-000000000002');
  perform set_config('gifto_test.comm_settlement_id', v_sid::text, false);

  select total_minor, created_by into v_total, v_created_by
    from public.settlements where id = v_sid;
  select count(*), coalesce(sum(amount_minor), 0) into v_lines, v_total
    from public.settlement_lines where settlement_id = v_sid;

  if v_lines <> 1 or v_total <> 1125 then
    raise exception 'TEST 8 FAILED: % lines, total %', v_lines, v_total;
  end if;

  if v_created_by is distinct from 'c3110000-0000-0000-0000-000000000001' then
    raise exception 'TEST 8 FAILED: created_by was not stamped';
  end if;

  begin
    perform public.mark_settlement_paid(
      v_sid, 1125, 'bank_transfer', 'COMM-TEST8-001', 'Weekly remittance');
  exception when others then
    raise exception 'TEST 8 FAILED: admin could not mark paid: %', sqlerrm;
  end;

  select paid_at, paid_by, paid_amount_minor, transfer_method,
         transfer_reference, proof_note
    into v_paid_at, v_paid_by, v_paid_amount, v_method, v_reference, v_proof
    from public.settlements where id = v_sid;
  if v_paid_at is null then
    raise exception 'TEST 8 FAILED: paid_at not stamped';
  end if;
  if v_paid_by is distinct from 'c3110000-0000-0000-0000-000000000001' then
    raise exception 'TEST 8 FAILED: paid_by was not stamped';
  end if;
  if v_paid_amount <> 1125
     or v_method <> 'bank_transfer'
     or v_reference <> 'COMM-TEST8-001'
     or v_proof <> 'Weekly remittance' then
    raise exception 'TEST 8 FAILED: payout proof was not recorded';
  end if;
  raise notice 'TEST 8 PASSED: admin settled a shop''s earned commission, with audit actors';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 9: a shop reads its own settlement only; settled rows cannot re-settle
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000003"}';
do $$
begin
  if (select count(*) from public.settlements
       where vendor_id = '41100000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'TEST 9 FAILED: shop B cannot read its own settlement';
  end if;
  begin
    perform public.mark_settlement_paid(
      current_setting('gifto_test.comm_settlement_id')::uuid,
      1125, 'bank_transfer', 'COMM-TEST9-001');
    raise exception 'TEST 9 FAILED: a vendor marked a settlement paid';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 9 PASSED: shop B reads its settlement but cannot alter it';
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000001"}';
do $$
begin
  if (select count(*) from public.settlements) <> 0 then
    raise exception 'TEST 9 FAILED: shop A can read another shop''s settlement';
  end if;
  if (select count(*) from public.settlement_lines) <> 0 then
    raise exception 'TEST 9 FAILED: shop A can read another shop''s settlement lines';
  end if;
  raise notice 'TEST 9 PASSED: a shop cannot read another shop''s settlement';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 10: an already-settled commission cannot be reversed automatically
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'c1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000004","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria');
  perform set_config('gifto_test.comm_order3_id', v_oid::text, false);
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000003"}';
do $$
declare v_oid uuid; v_ov uuid;
begin
  v_oid := current_setting('gifto_test.comm_order3_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000002';
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare v_sid uuid; v_oid uuid; v_ov uuid;
begin
  v_oid := current_setting('gifto_test.comm_order3_id')::uuid;
  v_sid := public.create_settlement('41100000-0000-0000-0000-000000000002');
  perform set_config('gifto_test.comm_settlement3_id', v_sid::text, false);

  select ov.id into v_ov from public.order_vendors ov
   where ov.order_id = v_oid and ov.vendor_id = '41100000-0000-0000-0000-000000000002';

  begin
    perform public.set_order_vendor_status(
      v_ov, 'returned', 'delivered', 'damaged');
    raise exception 'TEST 10 FAILED: reversed a settled commission';
  exception when check_violation then
    raise notice 'TEST 10 PASSED: a settled commission cannot be reversed automatically';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 11: the database rejects a mismatched amount (defence in depth)
-- ---------------------------------------------------------------------------
reset role;
do $$
declare v_ov uuid;
begin
  v_ov := (
    select ov.id from public.order_vendors ov
     where ov.order_id = current_setting('gifto_test.comm_order3_id')::uuid
       and ov.vendor_id = '41100000-0000-0000-0000-000000000002'
  );

  begin
    insert into public.commission_entries
      (order_vendor_id, vendor_id, rate, base_minor, amount_minor)
    values (v_ov, '41100000-0000-0000-0000-000000000002', 0.1500, 7500, 1);
    raise exception 'TEST 11 FAILED: an amount that is not rate x base was accepted';
  exception when check_violation then
    raise notice 'TEST 11 PASSED: amount must equal rate x base';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 12: suspending a vendor removes commission/settlement read access
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
update public.vendors set status = 'suspended'
  where id = '41100000-0000-0000-0000-000000000002';

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000003"}';
do $$
declare v_n int;
begin
  select count(*) into v_n from public.commission_entries;
  if v_n <> 0 then
    raise exception 'TEST 12 FAILED: suspended vendor sees % commission rows', v_n;
  end if;
  select count(*) into v_n from public.settlements;
  if v_n <> 0 then
    raise exception 'TEST 12 FAILED: suspended vendor sees % settlements', v_n;
  end if;
  select count(*) into v_n from public.settlement_lines;
  if v_n <> 0 then
    raise exception 'TEST 12 FAILED: suspended vendor sees % settlement lines', v_n;
  end if;
  if public.is_vendor_active_member('41100000-0000-0000-0000-000000000002') then
    raise exception 'TEST 12 FAILED: suspended vendor is an active member';
  end if;
  raise notice 'TEST 12 PASSED: suspended vendor commission/settlement reads denied';
end $$;

set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
update public.vendors set status = 'active'
 where id = '41100000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- TEST 13: a shop cannot have two open settlements at once
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'settlements_one_open_per_vendor'
  ) then
    raise exception 'TEST 13 FAILED: one-open settlement index is missing';
  end if;

  begin
    perform public.create_settlement('41100000-0000-0000-0000-000000000002');
    raise exception 'TEST 13 FAILED: opened a second settlement for one shop';
  exception when check_violation then
    raise notice 'TEST 13 PASSED: one open settlement per shop is enforced';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 14: voiding keeps history, requires a reason and preserves allocation
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000003"}';
do $$
declare v_sid uuid;
begin
  v_sid := current_setting('gifto_test.comm_settlement3_id')::uuid;
  begin
    perform public.void_settlement(v_sid, 'Vendor should not be able to void');
    raise exception 'TEST 14 FAILED: a vendor voided a settlement';
  exception when insufficient_privilege then
    null;
  end;
end $$;

set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare
  v_sid            uuid;
  v_paid_sid       uuid;
  v_new_sid        uuid;
  v_original_total int;
  v_original_lines int;
  v_line_id        uuid;
  v_released_entry uuid;
  v_status         public.settlement_status;
  v_voided         timestamptz;
  v_voided_by      uuid;
  v_void_reason    text;
  v_active         int;
  v_released       int;
begin
  v_sid := current_setting('gifto_test.comm_settlement3_id')::uuid;
  v_paid_sid := current_setting('gifto_test.comm_settlement_id')::uuid;

  begin
    perform public.void_settlement(v_sid, '   ');
    raise exception 'TEST 14 FAILED: a blank void reason was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.void_settlement(v_paid_sid, 'Paid batches are immutable');
    raise exception 'TEST 14 FAILED: a paid settlement was voided';
  exception when check_violation then
    null;
  end;

  select total_minor into v_original_total
    from public.settlements where id = v_sid;
  select count(*) into v_original_lines
    from public.settlement_lines where settlement_id = v_sid;
  select id, commission_entry_id into v_line_id, v_released_entry
    from public.settlement_lines where settlement_id = v_sid
   order by id limit 1;

  if v_original_lines <> 1 then
    raise exception 'TEST 14 FAILED: expected one pre-void line, found %', v_original_lines;
  end if;

  perform public.void_settlement(v_sid, '  Wrong payout week  ');

  select status, voided_at, voided_by, void_reason
    into v_status, v_voided, v_voided_by, v_void_reason
    from public.settlements where id = v_sid;

  if v_status <> 'voided' then
    raise exception 'TEST 14 FAILED: status=% after void', v_status;
  end if;
  if v_voided is null or v_voided_by is distinct from 'c3110000-0000-0000-0000-000000000001' then
    raise exception 'TEST 14 FAILED: void actor/timestamp was not stamped';
  end if;
  if v_void_reason <> 'Wrong payout week' then
    raise exception 'TEST 14 FAILED: void reason was not trimmed/stored: %', v_void_reason;
  end if;

  if (select total_minor from public.settlements where id = v_sid) <> v_original_total then
    raise exception 'TEST 14 FAILED: void changed the original settlement total';
  end if;

  select count(*) filter (where released_at is null),
         count(*) filter (where released_at is not null)
    into v_active, v_released
    from public.settlement_lines
   where settlement_id = v_sid;

  if v_active <> 0 or v_released <> 1 then
    raise exception 'TEST 14 FAILED: void active=% released=% (expected 0/1)', v_active, v_released;
  end if;

  if not exists (
    select 1 from public.settlement_lines
     where id = v_line_id
       and settlement_id = v_sid
       and released_by = 'c3110000-0000-0000-0000-000000000001'
       and release_reason = 'Wrong payout week'
  ) then
    raise exception 'TEST 14 FAILED: released line audit/history was not preserved';
  end if;

  begin
    perform public.mark_settlement_paid(
      v_sid, 1125, 'bank_transfer', 'COMM-TEST14-001');
    raise exception 'TEST 14 FAILED: a voided settlement was marked paid';
  exception when check_violation then
    null;
  end;

  begin
    perform public.void_settlement(v_sid, 'Voided twice');
    raise exception 'TEST 14 FAILED: voided the same settlement twice';
  exception when check_violation then
    null;
  end;

  -- The released allocation no longer blocks the entry, so it can be batched
  -- again while the original released line remains in history.
  v_new_sid := public.create_settlement('41100000-0000-0000-0000-000000000002');
  perform set_config('gifto_test.comm_settlement4_id', v_new_sid::text, false);

  if v_new_sid = v_sid then
    raise exception 'TEST 14 FAILED: re-settlement reused the voided batch';
  end if;

  select count(*) filter (where released_at is null),
         count(*) filter (where released_at is not null)
    into v_active, v_released
    from public.settlement_lines
   where commission_entry_id = v_released_entry;

  if v_active <> 1 or v_released <> 1 then
    raise exception 'TEST 14 FAILED: re-settle active=% released=% (expected 1/1)', v_active, v_released;
  end if;

  if (select count(*) from public.settlement_lines where settlement_id = v_sid) <> v_original_lines then
    raise exception 'TEST 14 FAILED: voided batch lost its preserved lines';
  end if;

  raise notice 'TEST 14 PASSED: void preserves lines, requires a reason and allows one replacement allocation';
end $$;

reset role;
do $$
declare
  v_sid   uuid;
  v_entry uuid;
begin
  v_sid := current_setting('gifto_test.comm_settlement3_id')::uuid;
  select commission_entry_id into v_entry
    from public.settlement_lines where settlement_id = v_sid;

  begin
    insert into public.settlement_lines (settlement_id, commission_entry_id, amount_minor)
    values (v_sid, v_entry, 1125);
    raise exception 'TEST 14 FAILED: two active allocations were accepted for one entry';
  exception when unique_violation then
    raise notice 'TEST 14 PASSED: partial unique index blocks duplicate active allocations';
  end;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare
  v_sid    uuid;
  v_ov     uuid;
  v_entry  uuid;
  v_status public.commission_status;
begin
  v_sid := current_setting('gifto_test.comm_settlement4_id')::uuid;
  perform public.void_settlement(v_sid, 'Replacement batch opened by mistake');

  select ov.id into v_ov
    from public.order_vendors ov
   where ov.order_id = current_setting('gifto_test.comm_order3_id')::uuid
     and ov.vendor_id = '41100000-0000-0000-0000-000000000002';
  select ce.id into v_entry
    from public.commission_entries ce
   where ce.order_vendor_id = v_ov;

  perform public.set_order_vendor_status(
    v_ov, 'returned', 'delivered', 'damaged');

  select status into v_status
    from public.commission_entries where id = v_entry;

  if v_status <> 'reversed' then
    raise exception 'TEST 15 FAILED: released commission was not reversed (status=%)', v_status;
  end if;

  if exists (
    select 1 from public.settlement_lines
     where commission_entry_id = v_entry and released_at is null
  ) then
    raise exception 'TEST 15 FAILED: a returned entry still has an active allocation';
  end if;

  if (select count(*) from public.settlement_lines
       where commission_entry_id = v_entry and released_at is not null) <> 2 then
    raise exception 'TEST 15 FAILED: released-line history was not preserved across re-settlement';
  end if;

  raise notice 'TEST 15 PASSED: fully released commissions can still be reversed on return';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 16: direct payout authorization and explicit empty-settlement rejection
-- ---------------------------------------------------------------------------
reset role;
do $$
declare v_sid uuid;
begin
  insert into public.settlements (vendor_id, status)
  values ('41100000-0000-0000-0000-000000000001', 'open')
  returning id into v_sid;
  perform set_config('gifto_test.comm_empty_settlement_id', v_sid::text, false);
end $$;

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
begin
  begin
    perform public.mark_settlement_paid(
      current_setting('gifto_test.comm_empty_settlement_id')::uuid,
      0, 'bank_transfer', 'COMM-TEST16-001'
    );
    raise exception 'TEST 16 FAILED: anon marked a settlement paid';
  exception when insufficient_privilege then
    null;
  end;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000003"}';
do $$
begin
  begin
    perform public.mark_settlement_paid(
      current_setting('gifto_test.comm_empty_settlement_id')::uuid,
      0, 'bank_transfer', 'COMM-TEST16-001'
    );
    raise exception 'TEST 16 FAILED: a non-admin marked a settlement paid';
  exception when insufficient_privilege then
    null;
  end;
end $$;

set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
begin
  begin
    perform public.mark_settlement_paid(
      current_setting('gifto_test.comm_empty_settlement_id')::uuid,
      0, 'bank_transfer', 'COMM-TEST16-001'
    );
    raise exception 'TEST 16 FAILED: an empty settlement was marked paid';
  exception when check_violation then
    raise notice 'TEST 16 PASSED: authorization and empty-settlement guard hold';
  end;
  perform public.void_settlement(
    current_setting('gifto_test.comm_empty_settlement_id')::uuid,
    'Empty settlement cleanup for the next isolated test'
  );
end $$;

-- ---------------------------------------------------------------------------
-- TEST 17: independent open settlements reject inconsistent snapshots while
-- valid zero-value commission entries remain payable.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'c1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000004","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria'
  );
  perform set_config('gifto_test.comm_order5_id', v_oid::text, false);
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000003"}';
do $$
declare v_ov uuid;
begin
  select id into v_ov
    from public.order_vendors
   where order_id = current_setting('gifto_test.comm_order5_id')::uuid
     and vendor_id = '41100000-0000-0000-0000-000000000002';
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

set role authenticated;
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare v_sid uuid;
begin
  v_sid := public.create_settlement('41100000-0000-0000-0000-000000000002');
  perform set_config('gifto_test.comm_settlement5_id', v_sid::text, false);
end $$;

reset role;
do $$
begin
  update public.settlement_lines
     set amount_minor = 1
   where settlement_id = current_setting('gifto_test.comm_settlement5_id')::uuid;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
begin
  begin
    perform public.mark_settlement_paid(
      current_setting('gifto_test.comm_settlement5_id')::uuid,
      1, 'bank_transfer', 'COMM-TEST17-001'
    );
    raise exception 'TEST 17 FAILED: mismatched settlement snapshot was paid';
  exception when check_violation then
    null;
  end;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'c1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria'
  );
  perform set_config('gifto_test.comm_order6_id', v_oid::text, false);
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000001"}';
do $$
declare v_ov uuid;
begin
  select id into v_ov
    from public.order_vendors
   where order_id = current_setting('gifto_test.comm_order6_id')::uuid
     and vendor_id = '41100000-0000-0000-0000-000000000001';
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare v_sid uuid;
begin
  v_sid := public.create_settlement('41100000-0000-0000-0000-000000000001');
  perform set_config('gifto_test.comm_settlement6_id', v_sid::text, false);
end $$;

reset role;
do $$
begin
  update public.settlement_lines
     set amount_minor = 0
   where settlement_id = current_setting('gifto_test.comm_settlement6_id')::uuid;
  update public.commission_entries ce
     set base_minor = 0,
         amount_minor = 0
    from public.settlement_lines l
   where l.settlement_id = current_setting('gifto_test.comm_settlement6_id')::uuid
     and l.commission_entry_id = ce.id;
  -- P1-05: the stored total must match the lines, so zero it as well.
  update public.settlements
     set total_minor = 0
   where id = current_setting('gifto_test.comm_settlement6_id')::uuid;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare v_paid_at timestamptz; v_paid_by uuid; v_paid_amount int; v_reference text;
begin
  perform public.mark_settlement_paid(
    current_setting('gifto_test.comm_settlement6_id')::uuid,
    0, 'bank_transfer', 'COMM-TEST17-000'
  );
  select paid_at, paid_by, paid_amount_minor, transfer_reference
    into v_paid_at, v_paid_by, v_paid_amount, v_reference
    from public.settlements
   where id = current_setting('gifto_test.comm_settlement6_id')::uuid;
  if v_paid_at is null
     or v_paid_by is distinct from 'c3110000-0000-0000-0000-000000000001' then
    raise exception 'TEST 17 FAILED: zero-value payout audit fields were not stamped';
  end if;
  if v_paid_amount <> 0 or v_reference <> 'COMM-TEST17-000' then
    raise exception 'TEST 17 FAILED: zero-value payout proof was not recorded';
  end if;
  raise notice 'TEST 17 PASSED: mismatch rejects and independent zero-value payout succeeds';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 18: the foreign key rejects an invalid commission reference.
-- A payout-time orphan cannot be seeded without violating this invariant;
-- multiple missing references are the same structural boundary.
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  begin
    insert into public.settlement_lines (
      settlement_id, commission_entry_id, amount_minor
    ) values (
      current_setting('gifto_test.comm_settlement3_id')::uuid,
      '99900000-0000-0000-0000-000000000001',
      0
    );
    raise exception 'TEST 18 FAILED: an invalid commission reference was accepted';
  exception when foreign_key_violation then
    raise notice 'TEST 18 PASSED: missing commission references are blocked by the FK';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 19 (P1-05): payout proof — a wrong amount, no reference, a bad
-- method or a tampered stored total cannot be paid; the exact net
-- commission with a reference pays, is visible to the vendor, and the
-- paid record cannot be edited afterwards.
-- ---------------------------------------------------------------------------

-- One fresh delivered order for shop A (1 x 10000 at 8% -> 800).
set role authenticated;
set request.jwt.claim.sub = 'c1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria'
  );
  perform set_config('gifto_test.comm_order19_id', v_oid::text, false);
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000001"}';
do $$
declare v_ov uuid;
begin
  select id into v_ov
    from public.order_vendors
   where order_id = current_setting('gifto_test.comm_order19_id')::uuid
     and vendor_id = '41100000-0000-0000-0000-000000000001';
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0001');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare v_sid uuid;
begin
  v_sid := public.create_settlement('41100000-0000-0000-0000-000000000001');
  perform set_config('gifto_test.comm_settlement19_id', v_sid::text, false);
end $$;

do $$
declare
  v_sid       uuid := current_setting('gifto_test.comm_settlement19_id')::uuid;
  v_total     int;
begin
  select total_minor into v_total from public.settlements where id = v_sid;
  if v_total <> 800 then
    raise exception 'TEST 19 FAILED: settlement total % (expected 800)', v_total;
  end if;

  -- (a) A wrong amount is impossible.
  begin
    perform public.mark_settlement_paid(
      v_sid, 801, 'bank_transfer', 'COMM-TEST19-001');
    raise exception 'TEST 19 FAILED: a wrong amount was paid';
  exception when check_violation then
    null;
  end;

  -- (b) No transfer reference is impossible.
  begin
    perform public.mark_settlement_paid(v_sid, 800, 'bank_transfer', null);
    raise exception 'TEST 19 FAILED: a payment without a reference was accepted';
  exception when check_violation then
    null;
  end;

  -- (c) A bad transfer method is impossible.
  begin
    perform public.mark_settlement_paid(
      v_sid, 800, 'wire', 'COMM-TEST19-001');
    raise exception 'TEST 19 FAILED: a bad transfer method was accepted';
  exception when check_violation then
    null;
  end;
end $$;

-- (d) A tampered stored total cannot be paid, even with the right amount.
reset role;
do $$
begin
  update public.settlements
     set total_minor = 801
   where id = current_setting('gifto_test.comm_settlement19_id')::uuid;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare v_sid uuid := current_setting('gifto_test.comm_settlement19_id')::uuid;
begin
  begin
    perform public.mark_settlement_paid(
      v_sid, 800, 'bank_transfer', 'COMM-TEST19-001');
    raise exception 'TEST 19 FAILED: a tampered stored total was paid';
  exception when check_violation then
    null;
  end;
end $$;

reset role;
do $$
begin
  update public.settlements
     set total_minor = 800
   where id = current_setting('gifto_test.comm_settlement19_id')::uuid;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare
  v_sid       uuid := current_setting('gifto_test.comm_settlement19_id')::uuid;
  v_status    text;
  v_amount    int;
  v_method    text;
  v_reference text;
  v_proof     text;
begin
  -- (e) The exact net commission with a reference pays, and the proof is stored.
  perform public.mark_settlement_paid(
    v_sid, 800, 'bank_transfer', 'COMM-TEST19-001', 'Weekly remittance');
  select status::text, paid_amount_minor, transfer_method,
         transfer_reference, proof_note
    into v_status, v_amount, v_method, v_reference, v_proof
    from public.settlements where id = v_sid;
  if v_status <> 'paid'
     or v_amount <> 800
     or v_method <> 'bank_transfer'
     or v_reference <> 'COMM-TEST19-001'
     or v_proof <> 'Weekly remittance' then
    raise exception 'TEST 19 FAILED: payout proof was not recorded';
  end if;
end $$;

-- (f) The vendor sees the same numbers admin recorded, to the piaster.
set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000001"}';
do $$
declare
  v_sid       uuid := current_setting('gifto_test.comm_settlement19_id')::uuid;
  v_amount    int;
  v_method    text;
  v_reference text;
begin
  select paid_amount_minor, transfer_method, transfer_reference
    into v_amount, v_method, v_reference
    from public.settlements where id = v_sid;
  if v_amount <> 800
     or v_method <> 'bank_transfer'
     or v_reference <> 'COMM-TEST19-001' then
    raise exception 'TEST 19 FAILED: the vendor cannot see the payout proof';
  end if;

  -- (g) The paid record cannot be edited directly.
  begin
    update public.settlements set paid_amount_minor = 1 where id = v_sid;
    raise exception 'TEST 19 FAILED: a paid settlement was edited directly';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- (h) Paying again is impossible.
set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare v_sid uuid := current_setting('gifto_test.comm_settlement19_id')::uuid;
begin
  begin
    perform public.mark_settlement_paid(
      v_sid, 800, 'bank_transfer', 'COMM-TEST19-001');
    raise exception 'TEST 19 FAILED: a paid settlement was paid again';
  exception when check_violation then
    null;
  end;
  raise notice 'TEST 19 PASSED: payout proof is required, exact and visible to the vendor';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 20 (P1-05, N-01 verification): settlement gross / earned commission
-- / adjustments / net-due reconcile to the piaster, and the payout proof
-- amount must equal the derived net before the RPC accepts it.
-- ---------------------------------------------------------------------------
-- One fresh delivered order for shop A (1 x 10000 at 8% -> 800), then a
-- 2500 refund approval adjusts it by round(2500 x 0.08) = 200, so the net
-- due is 600: earned 800 + adjustments (-200) = lines 600 = stored total
-- 600 = amount that must be paid.
set role authenticated;
set request.jwt.claim.sub = 'c1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-000000000001"}';
do $$
declare v_oid uuid;
begin
  v_oid := gifto_test.place_order(
    '[{"product_id":"51100000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Sara Buyer', '01001112233', '12 Main Street', 'Alexandria', 'Alexandria'
  );
  perform set_config('gifto_test.comm_order20_id', v_oid::text, false);
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000001"}';
do $$
declare v_ov uuid;
begin
  select id into v_ov
    from public.order_vendors
   where order_id = current_setting('gifto_test.comm_order20_id')::uuid
     and vendor_id = '41100000-0000-0000-0000-000000000001';
  perform public.set_order_vendor_status(v_ov, 'confirmed', 'placed');
  perform public.set_order_vendor_status(v_ov, 'shipped', 'confirmed', null, null, 'Test Courier', 'TRK-0020');
  perform public.set_order_vendor_status(v_ov, 'delivered', 'shipped');
end $$;

set request.jwt.claim.sub = 'c1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c1110000-0000-0000-0000-000000000001"}';
do $$
declare
  v_ov uuid;
  v_case uuid;
begin
  select id into v_ov
    from public.order_vendors
   where order_id = current_setting('gifto_test.comm_order20_id')::uuid
     and vendor_id = '41100000-0000-0000-0000-000000000001';
  v_case := public.open_refund_case(v_ov, 'Item arrived damaged', 2500);
  perform set_config('gifto_test.comm_case20_id', v_case::text, false);
end $$;

set request.jwt.claim.sub = 'c3110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"c3110000-0000-0000-0000-000000000001"}';
do $$
declare
  v_sid uuid;
  v_earned int;
  v_adjustments int;
  v_lines int;
  v_total int;
  v_blocked boolean := false;
begin
  perform public.resolve_refund_case(
    current_setting('gifto_test.comm_case20_id')::uuid, true, 2500, 'Damage confirmed');

  v_sid := public.create_settlement('41100000-0000-0000-0000-000000000001');

  select amount_minor into v_earned
    from public.commission_entries
   where order_vendor_id = (
     select id from public.order_vendors
      where order_id = current_setting('gifto_test.comm_order20_id')::uuid
        and vendor_id = '41100000-0000-0000-0000-000000000001');

  select coalesce(sum(amount_minor), 0) into v_adjustments
    from public.commission_adjustments
   where commission_entry_id = (
     select id from public.commission_entries
      where order_vendor_id = (
        select id from public.order_vendors
         where order_id = current_setting('gifto_test.comm_order20_id')::uuid
           and vendor_id = '41100000-0000-0000-0000-000000000001'));

  select coalesce(sum(amount_minor), 0) into v_lines
    from public.settlement_lines where settlement_id = v_sid;

  select total_minor into v_total from public.settlements where id = v_sid;

  -- Gross / earned / adjustments / net reconcile to the piaster.
  if v_earned <> 800 then
    raise exception 'TEST 20 FAILED: earned commission % (expected 800)', v_earned;
  end if;
  if v_adjustments <> -200 then
    raise exception 'TEST 20 FAILED: adjustments % (expected -200)', v_adjustments;
  end if;
  if v_lines <> v_earned + v_adjustments then
    raise exception 'TEST 20 FAILED: lines % <> earned + adjustments %', v_lines, v_earned + v_adjustments;
  end if;
  if v_total <> v_lines then
    raise exception 'TEST 20 FAILED: stored total % <> lines %', v_total, v_lines;
  end if;
  if v_total <> 600 then
    raise exception 'TEST 20 FAILED: net due % (expected 600)', v_total;
  end if;

  -- The proof amount must equal the derived net (600), not the gross
  -- earned commission (800) and not any other figure.
  begin
    perform public.mark_settlement_paid(v_sid, 800, 'bank_transfer', 'COMM-TEST20-001');
    raise exception 'TEST 20 FAILED: paying the gross earned amount was accepted';
  exception when check_violation then
    if sqlerrm not like '%does not match the commission due (600)%' then
      raise exception 'TEST 20 FAILED: wrong error for gross payment: %', sqlerrm;
    end if;
  end;

  begin
    perform public.mark_settlement_paid(v_sid, 599, 'bank_transfer', 'COMM-TEST20-001');
    raise exception 'TEST 20 FAILED: paying one piastre short was accepted';
  exception when check_violation then
    null;
  end;

  perform public.mark_settlement_paid(
    v_sid, 600, 'bank_transfer', 'COMM-TEST20-001', 'Weekly remittance');

  if not exists (
    select 1 from public.settlements
     where id = v_sid
       and status = 'paid'
       and total_minor = 600
       and paid_amount_minor = 600
       and transfer_reference = 'COMM-TEST20-001'
  ) then
    raise exception 'TEST 20 FAILED: net payment was not recorded exactly';
  end if;
  raise notice 'TEST 20 PASSED: gross 800 + adjustments -200 = net 600 reconciles; proof must equal the net';
end $$;

rollback;
