-- Gifto Phase 6 verification: commission ledger, reversals and settlements.
-- Runs after migrations 1–6 against a bare `supabase/postgres` container.
-- Any failure RAISEs and, with `psql -v ON_ERROR_STOP=1`, aborts non-zero.
--
-- Order ids are carried between blocks in session GUCs so they survive SET ROLE.

\set ON_ERROR_STOP on

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
     or has_function_privilege('anon', 'public.mark_settlement_paid(uuid)', 'execute') then
    raise exception 'TEST 1 FAILED: anon holds privileges on the commission group';
  end if;

  if has_table_privilege('authenticated', 'public.commission_entries', 'insert')
     or has_table_privilege('authenticated', 'public.commission_entries', 'update')
     or has_table_privilege('authenticated', 'public.commission_entries', 'delete')
     or has_table_privilege('authenticated', 'public.settlements', 'insert')
     or has_table_privilege('authenticated', 'public.settlements', 'update')
     or has_table_privilege('authenticated', 'public.settlement_lines', 'insert') then
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
  v_oid := public.place_order(
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
  update public.order_vendors set status = 'confirmed' where id = v_ov;
  update public.order_vendors set status = 'shipped' where id = v_ov;
  update public.order_vendors set status = 'delivered' where id = v_ov;
end $$;

set request.jwt.claim.sub = 'c2110000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c2110000-0000-0000-0000-000000000003"}';
do $$
declare v_oid uuid; v_ov uuid;
begin
  v_oid := current_setting('gifto_test.comm_order_id')::uuid;
  select id into v_ov from public.order_vendors
   where order_id = v_oid and vendor_id = '41100000-0000-0000-0000-000000000002';
  update public.order_vendors set status = 'confirmed' where id = v_ov;
  update public.order_vendors set status = 'shipped' where id = v_ov;
  update public.order_vendors set status = 'delivered' where id = v_ov;
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
  update public.order_vendors set status = 'delivered' where id = v_ov;

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
  v_oid := public.place_order(
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
  update public.order_vendors set status = 'returned' where id = v_ov;
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
declare v_sid uuid; v_total int; v_lines int; v_paid_at timestamptz;
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

  select total_minor into v_total from public.settlements where id = v_sid;
  select count(*), coalesce(sum(amount_minor), 0) into v_lines, v_total
    from public.settlement_lines where settlement_id = v_sid;

  if v_lines <> 1 or v_total <> 1125 then
    raise exception 'TEST 8 FAILED: % lines, total %', v_lines, v_total;
  end if;

  begin
    perform public.mark_settlement_paid(v_sid);
  exception when others then
    raise exception 'TEST 8 FAILED: admin could not mark paid: %', sqlerrm;
  end;

  select paid_at into v_paid_at from public.settlements where id = v_sid;
  if v_paid_at is null then
    raise exception 'TEST 8 FAILED: paid_at not stamped';
  end if;
  raise notice 'TEST 8 PASSED: admin settled a shop''s earned commission and paid it';
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
    perform public.mark_settlement_paid(current_setting('gifto_test.comm_settlement_id')::uuid);
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
  v_oid := public.place_order(
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
  update public.order_vendors set status = 'confirmed' where id = v_ov;
  update public.order_vendors set status = 'shipped' where id = v_ov;
  update public.order_vendors set status = 'delivered' where id = v_ov;
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
    update public.order_vendors set status = 'returned' where id = v_ov;
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

reset role;
