-- Gifto UX Batch 1 verification: wishlist, saved addresses, gift options and
-- delivery-date preference (migration 47).
-- Run after all migrations against a disposable database. Any failure RAISEs
-- and, with `psql -v ON_ERROR_STOP=1`, aborts non-zero.

\set ON_ERROR_STOP on

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
delete from public.products where vendor_id = '43300000-0000-0000-0000-000000000001';
delete from public.vendors where id = '43300000-0000-0000-0000-000000000001';
delete from auth.users where email like '%@giftshopper.gifto.test';

insert into auth.users (id, email) values
  ('13300000-0000-0000-0000-000000000001', 'buyer-a@giftshopper.gifto.test'),
  ('13300000-0000-0000-0000-000000000002', 'buyer-b@giftshopper.gifto.test'),
  ('13300000-0000-0000-0000-000000000003', 'admin@giftshopper.gifto.test');

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
 where id = '13300000-0000-0000-0000-000000000003';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (id, name, slug, status, commission_rate) values
  ('43300000-0000-0000-0000-000000000001', 'Gift Shop', 'gift-shop', 'active', 0.1000);

insert into public.products (id, vendor_id, name, slug, price_minor, stock, status) values
  ('53300000-0000-0000-0000-000000000001', '43300000-0000-0000-0000-000000000001',
   'Gift One', 'gift-one', 10000, 5, 'active'),
  ('53300000-0000-0000-0000-000000000002', '43300000-0000-0000-0000-000000000001',
   'Gift Two', 'gift-two', 25000, 2, 'active');

-- ---------------------------------------------------------------------------
-- TEST 1: anon has no privileges on the new tables
-- ---------------------------------------------------------------------------
do $$
begin
  if has_table_privilege('anon', 'public.wishlists', 'select')
     or has_table_privilege('anon', 'public.wishlists', 'insert')
     or has_table_privilege('anon', 'public.saved_addresses', 'select')
     or has_table_privilege('anon', 'public.saved_addresses', 'insert')
     or has_table_privilege('anon', 'public.saved_addresses', 'update')
     or has_table_privilege('anon', 'public.saved_addresses', 'delete') then
    raise exception 'TEST 1 FAILED: anon holds privileges on wishlist/address tables';
  end if;
  raise notice 'TEST 1 PASSED: anon has no access to wishlists or saved_addresses';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: anon cannot read or write either table
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
begin
  begin
    perform count(*) from public.wishlists;
    raise exception 'TEST 2 FAILED: anon read wishlists';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.saved_addresses
      (user_id, label, recipient_name, contact_phone, address_line, city, governorate)
    values ('13300000-0000-0000-0000-000000000001', 'Home', 'A Buyer', '01001112233',
            '12 Main Street', 'Alexandria', 'Alexandria');
    raise exception 'TEST 2 FAILED: anon inserted a saved address';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 2 PASSED: anon cannot read wishlists or write saved addresses';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: wishlist is owner-only, one row per product, cascades on delete
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '13300000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"13300000-0000-0000-0000-000000000001"}';
do $$
declare
  v_count int;
  v_blocked boolean := false;
begin
  insert into public.wishlists (user_id, product_id)
  values ('13300000-0000-0000-0000-000000000001',
          '53300000-0000-0000-0000-000000000001');

  select count(*) into v_count from public.wishlists;
  if v_count <> 1 then
    raise exception 'TEST 3 FAILED: owner sees % wishlist rows, expected 1', v_count;
  end if;

  -- A second row for the same product is rejected by the unique constraint.
  begin
    insert into public.wishlists (user_id, product_id)
    values ('13300000-0000-0000-0000-000000000001',
            '53300000-0000-0000-0000-000000000001');
    raise exception 'TEST 3 FAILED: duplicate wishlist row inserted';
  exception when unique_violation then
    null;
  end;

  -- Inserting a row owned by another customer is rejected by RLS.
  begin
    insert into public.wishlists (user_id, product_id)
    values ('13300000-0000-0000-0000-000000000002',
            '53300000-0000-0000-0000-000000000002');
    raise exception 'TEST 3 FAILED: wishlist row inserted for another user';
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 3 FAILED: cross-user wishlist insert was not blocked';
  end if;

  delete from public.wishlists
   where product_id = '53300000-0000-0000-0000-000000000001';
  select count(*) into v_count from public.wishlists;
  if v_count <> 0 then
    raise exception 'TEST 3 FAILED: owner could not delete own wishlist row';
  end if;
  raise notice 'TEST 3 PASSED: wishlist is owner-only with one row per product';
end $$;

-- Another customer sees none of buyer A's rows, and deleting the product
-- cascades the wishlist rows away.
set request.jwt.claim.sub = '13300000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"13300000-0000-0000-0000-000000000001"}';
do $$
begin
  insert into public.wishlists (user_id, product_id)
  values ('13300000-0000-0000-0000-000000000001',
          '53300000-0000-0000-0000-000000000002');
end $$;

set request.jwt.claim.sub = '13300000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"13300000-0000-0000-0000-000000000002"}';
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.wishlists;
  if v_count <> 0 then
    raise exception 'TEST 3 FAILED: buyer B sees % wishlist rows', v_count;
  end if;
  delete from public.wishlists
   where product_id = '53300000-0000-0000-0000-000000000002';
  if not found then
    raise notice 'TEST 3 PASSED: buyer B cannot delete buyer A''s wishlist row';
  else
    raise exception 'TEST 3 FAILED: buyer B deleted buyer A''s wishlist row';
  end if;
end $$;

reset role;
delete from public.products where id = '53300000-0000-0000-0000-000000000002';
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.wishlists;
  if v_count <> 0 then
    raise exception 'TEST 3 FAILED: wishlist row survived product delete';
  end if;
  raise notice 'TEST 3 PASSED: wishlist rows cascade when the product is deleted';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: saved addresses are owner-only with exactly one default
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '13300000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"13300000-0000-0000-0000-000000000001"}';
do $$
declare
  v_home uuid;
  v_work uuid;
  v_count int;
  v_rows int;
begin
  insert into public.saved_addresses
    (user_id, label, recipient_name, contact_phone, address_line, city, governorate, is_default)
  values ('13300000-0000-0000-0000-000000000001', 'Home', 'A Buyer', '01001112233',
          '12 Main Street', 'Alexandria', 'Alexandria', true)
  returning id into v_home;

  insert into public.saved_addresses
    (user_id, label, recipient_name, contact_phone, address_line, city, governorate)
  values ('13300000-0000-0000-0000-000000000001', 'Work', 'A Buyer', '01001112233',
          '8 Office Road', 'Alexandria', 'Alexandria')
  returning id into v_work;

  -- A second default is rejected by the partial unique index.
  begin
    insert into public.saved_addresses
      (user_id, label, recipient_name, contact_phone, address_line, city, governorate, is_default)
    values ('13300000-0000-0000-0000-000000000001', 'Other', 'A Buyer', '01001112233',
            '1 Elsewhere', 'Cairo', 'Cairo', true);
    raise exception 'TEST 4 FAILED: second default address inserted';
  exception when unique_violation then
    null;
  end;

  -- A one-character label is rejected by the length check.
  begin
    insert into public.saved_addresses
      (user_id, label, recipient_name, contact_phone, address_line, city, governorate)
    values ('13300000-0000-0000-0000-000000000001', 'H', 'A Buyer', '01001112233',
            '12 Main Street', 'Alexandria', 'Alexandria');
    raise exception 'TEST 4 FAILED: one-character label accepted';
  exception when check_violation then
    null;
  end;

  -- The owner can update their own address and switch the default by
  -- clearing the old one first (the server action's sequence).
  update public.saved_addresses set is_default = false where id = v_home;
  update public.saved_addresses set is_default = true where id = v_work;
  select count(*) into v_count from public.saved_addresses where is_default;
  if v_count <> 1 then
    raise exception 'TEST 4 FAILED: % default addresses, expected 1', v_count;
  end if;

  perform set_config('gifto_test.home_address_id', v_home::text, false);
  perform set_config('gifto_test.work_address_id', v_work::text, false);
  raise notice 'TEST 4a PASSED: owner CRUD works with exactly one default';
end $$;

-- Another customer sees, updates and deletes none of buyer A's addresses.
set request.jwt.claim.sub = '13300000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"13300000-0000-0000-0000-000000000002"}';
do $$
declare
  v_count int;
  v_rows int;
begin
  select count(*) into v_count from public.saved_addresses;
  if v_count <> 0 then
    raise exception 'TEST 4 FAILED: buyer B sees % saved addresses', v_count;
  end if;

  update public.saved_addresses set label = 'Hijacked'
   where id = current_setting('gifto_test.home_address_id')::uuid;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'TEST 4 FAILED: buyer B updated buyer A''s address';
  end if;

  delete from public.saved_addresses
   where id = current_setting('gifto_test.home_address_id')::uuid;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'TEST 4 FAILED: buyer B deleted buyer A''s address';
  end if;
  raise notice 'TEST 4 PASSED: saved addresses are owner-only with one default';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: gift checkout stores wrap, message, date and note; no extra fee
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '13300000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"13300000-0000-0000-0000-000000000001"}';
do $$
declare
  v_oid uuid;
  v_wrap boolean;
  v_message text;
  v_date date;
  v_note text;
  v_subtotal int;
  v_total int;
  v_fee int;
begin
  v_oid := public.place_order_with_price_check(
    '[{"product_id":"53300000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'A Buyer', '01001112233', 'buyer-a@giftshopper.gifto.test',
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(),
    '[{"product_id":"53300000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
    10000,
    true, 'Happy birthday!', current_date + 3, 'Evenings please');

  if v_oid is null then
    raise exception 'TEST 5 FAILED: gift checkout returned no id';
  end if;

  select gift_wrap, gift_message, preferred_delivery_date, delivery_time_note,
         subtotal_minor, total_minor, delivery_fee_minor
    into v_wrap, v_message, v_date, v_note, v_subtotal, v_total, v_fee
    from public.orders where id = v_oid;

  if not v_wrap then
    raise exception 'TEST 5 FAILED: gift_wrap was not stored';
  end if;
  if v_message <> 'Happy birthday!' then
    raise exception 'TEST 5 FAILED: gift_message stored as %', v_message;
  end if;
  if v_date <> current_date + 3 then
    raise exception 'TEST 5 FAILED: preferred date stored as %', v_date;
  end if;
  if v_note <> 'Evenings please' then
    raise exception 'TEST 5 FAILED: delivery time note stored as %', v_note;
  end if;
  if v_subtotal <> 10000 or v_total <> 10000 or v_fee <> 0 then
    raise exception 'TEST 5 FAILED: gift wrap changed the money (subtotal %, total %, fee %)',
      v_subtotal, v_total, v_fee;
  end if;
  raise notice 'TEST 5 PASSED: gift checkout stores all four fields with no extra fee';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: gift validation rejects bad input and creates nothing
-- ---------------------------------------------------------------------------
do $$
declare
  v_before int;
  v_after int;
  v_blocked boolean;
begin
  select count(*) into v_before from public.orders;

  -- Over-long gift message.
  v_blocked := false;
  begin
    perform public.place_order_with_price_check(
      '[{"product_id":"53300000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'A Buyer', '01001112233', 'buyer-a@giftshopper.gifto.test',
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      gen_random_uuid(),
      '[{"product_id":"53300000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
      10000,
      true, repeat('x', 501), null, null);
  exception when others then
    if sqlerrm like '%Gift message must be 500 characters or fewer.%' then
      v_blocked := true;
    else
      raise exception 'TEST 6 FAILED: wrong error for long gift message: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 6 FAILED: over-long gift message was not blocked';
  end if;

  -- Preferred date is today (must be tomorrow or later).
  v_blocked := false;
  begin
    perform public.place_order_with_price_check(
      '[{"product_id":"53300000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'A Buyer', '01001112233', 'buyer-a@giftshopper.gifto.test',
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      gen_random_uuid(),
      '[{"product_id":"53300000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
      10000,
      false, null, current_date, null);
  exception when others then
    if sqlerrm like '%between tomorrow and 14 days%' then
      v_blocked := true;
    else
      raise exception 'TEST 6 FAILED: wrong error for today''s date: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 6 FAILED: today as preferred date was not blocked';
  end if;

  -- Preferred date is 15 days out (window ends at +14).
  v_blocked := false;
  begin
    perform public.place_order_with_price_check(
      '[{"product_id":"53300000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'A Buyer', '01001112233', 'buyer-a@giftshopper.gifto.test',
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      gen_random_uuid(),
      '[{"product_id":"53300000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
      10000,
      false, null, current_date + 15, null);
  exception when others then
    if sqlerrm like '%between tomorrow and 14 days%' then
      v_blocked := true;
    else
      raise exception 'TEST 6 FAILED: wrong error for +15 day date: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 6 FAILED: +15 day preferred date was not blocked';
  end if;

  -- Over-long delivery time note.
  v_blocked := false;
  begin
    perform public.place_order_with_price_check(
      '[{"product_id":"53300000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
      'A Buyer', '01001112233', 'buyer-a@giftshopper.gifto.test',
      '12 Main Street', 'Alexandria', 'Alexandria', null,
      gen_random_uuid(),
      '[{"product_id":"53300000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
      10000,
      false, null, null, repeat('x', 201));
  exception when others then
    if sqlerrm like '%Delivery time note must be 200 characters or fewer.%' then
      v_blocked := true;
    else
      raise exception 'TEST 6 FAILED: wrong error for long time note: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 6 FAILED: over-long delivery time note was not blocked';
  end if;

  select count(*) into v_after from public.orders;
  if v_after <> v_before then
    raise exception 'TEST 6 FAILED: rejected gift checkouts created % orders', v_after - v_before;
  end if;
  raise notice 'TEST 6 PASSED: gift validation rejects bad input and creates nothing';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 7: the legacy 11-argument call still places, with gift fields empty
-- ---------------------------------------------------------------------------
do $$
declare
  v_oid uuid;
  v_wrap boolean;
  v_message text;
  v_date date;
begin
  v_oid := public.place_order_with_price_check(
    '[{"product_id":"53300000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'A Buyer', '01001112233', 'buyer-a@giftshopper.gifto.test',
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(),
    '[{"product_id":"53300000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
    10000);
  if v_oid is null then
    raise exception 'TEST 7 FAILED: legacy 11-argument call returned no id';
  end if;
  select gift_wrap, gift_message, preferred_delivery_date
    into v_wrap, v_message, v_date from public.orders where id = v_oid;
  if v_wrap or v_message is not null or v_date is not null then
    raise exception 'TEST 7 FAILED: legacy call stored gift fields';
  end if;
  raise notice 'TEST 7 PASSED: legacy 11-argument checkout still places with empty gift fields';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 8: guest checkout stores the gift fields too
-- ---------------------------------------------------------------------------
reset role;
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-token-gift', 'sha256'), 'hex');
  v_oid uuid;
begin
  v_oid := public.place_guest_order_with_price_check(
    '[{"product_id":"53300000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Guest Buyer', '01001112233', null,
    '12 Main Street', 'Alexandria', 'Alexandria', null,
    gen_random_uuid(), v_hash,
    '[{"product_id":"53300000-0000-0000-0000-000000000001","unit_price_minor":10000}]'::jsonb,
    10000,
    true, 'For you!', current_date + 7, null);
  if v_oid is null then
    raise exception 'TEST 8 FAILED: guest gift checkout returned no id';
  end if;
  -- service_role cannot select orders directly; carry the id to a
  -- superuser block for the stored-value assertions below.
  perform set_config('gifto_test.guest_gift_order_id', v_oid::text, false);
  raise notice 'TEST 8a PASSED: guest gift checkout placed an order';
end $$;

reset role;
do $$
declare
  v_oid uuid := current_setting('gifto_test.guest_gift_order_id')::uuid;
  v_wrap boolean;
  v_message text;
  v_date date;
begin
  select gift_wrap, gift_message, preferred_delivery_date
    into v_wrap, v_message, v_date from public.orders where id = v_oid;
  if not v_wrap or v_message <> 'For you!' or v_date <> current_date + 7 then
    raise exception 'TEST 8 FAILED: guest gift fields stored as wrap %, message %, date %',
      v_wrap, v_message, v_date;
  end if;
  raise notice 'TEST 8 PASSED: guest checkout stores gift wrap, message and preferred date';
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- TEST 9: get_guest_order exposes the gift fields to the token holder
-- ---------------------------------------------------------------------------
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_hash text := encode(digest('guest-token-gift', 'sha256'), 'hex');
  v_oid uuid := current_setting('gifto_test.guest_gift_order_id')::uuid;
  v_order jsonb;
begin
  v_order := public.get_guest_order(v_oid, v_hash);
  if v_order is null then
    raise exception 'TEST 9 FAILED: get_guest_order returned nothing';
  end if;
  if (v_order ->> 'gift_wrap')::boolean is not true
     or v_order ->> 'gift_message' <> 'For you!'
     or (v_order ->> 'preferred_delivery_date')::date <> current_date + 7 then
    raise exception 'TEST 9 FAILED: guest order JSON gift fields are %',
      v_order -> 'gift_wrap';
  end if;
  -- A wrong token still gets nothing, gift fields included.
  if public.get_guest_order(
    v_oid, encode(digest('wrong-token', 'sha256'), 'hex')
  ) is not null then
    raise exception 'TEST 9 FAILED: get_guest_order leaked to a wrong token';
  end if;
  raise notice 'TEST 9 PASSED: get_guest_order exposes gift fields to the token holder only';
end $$;

reset role;

rollback;
