-- Gifto UX Batch 2 verification: product reviews — verified buyers only,
-- moderation-first, RPC-only writes, public read of approved reviews.
-- Run after all migrations against a disposable database.

\set ON_ERROR_STOP on

do $$
begin
  if current_setting('gifto.rls_test_disposable', true) is distinct from 'yes' then
    raise exception 'Refusing to run destructive RLS tests. Start a disposable database and SET gifto.rls_test_disposable = ''yes'' in the same psql session.';
  end if;
end $$;

begin;

-- ---------------------------------------------------------------------------
-- Seed (as superuser; bypasses RLS to create fixtures)
-- ---------------------------------------------------------------------------
delete from public.product_reviews where product_id in (
  '95200000-0000-0000-0000-000000000001',
  '95200000-0000-0000-0000-000000000002',
  '95200000-0000-0000-0000-000000000003'
);
delete from public.order_items where order_vendor_id in (
  '97200000-0000-0000-0000-000000000001',
  '97200000-0000-0000-0000-000000000002',
  '97200000-0000-0000-0000-000000000003'
);
delete from public.order_vendors where id in (
  '97200000-0000-0000-0000-000000000001',
  '97200000-0000-0000-0000-000000000002',
  '97200000-0000-0000-0000-000000000003'
);
delete from public.orders where id in (
  '96200000-0000-0000-0000-000000000001',
  '96200000-0000-0000-0000-000000000002',
  '96200000-0000-0000-0000-000000000003'
);
delete from public.products where id in (
  '95200000-0000-0000-0000-000000000001',
  '95200000-0000-0000-0000-000000000002',
  '95200000-0000-0000-0000-000000000003'
);
delete from public.vendor_members where vendor_id in (
  '94200000-0000-0000-0000-000000000001',
  '94200000-0000-0000-0000-000000000002'
);
delete from public.vendors where id in (
  '94200000-0000-0000-0000-000000000001',
  '94200000-0000-0000-0000-000000000002'
);
delete from auth.users where email like '%@reviews.gifto.test';

insert into auth.users (id, email) values
  ('93200000-0000-0000-0000-000000000001', 'buyer-a@reviews.gifto.test'),
  ('93200000-0000-0000-0000-000000000002', 'buyer-b@reviews.gifto.test'),
  ('93200000-0000-0000-0000-000000000003', 'admin@reviews.gifto.test'),
  ('93200000-0000-0000-0000-000000000004', 'owner-a@reviews.gifto.test'),
  ('93200000-0000-0000-0000-000000000005', 'owner-b@reviews.gifto.test');

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
 where id = '93200000-0000-0000-0000-000000000003';
alter table public.profiles enable trigger profiles_protect_platform_admin;

update public.profiles set full_name = 'Sara Ahmed'
 where id = '93200000-0000-0000-0000-000000000001';

insert into public.vendors (id, name, slug, status, commission_rate)
values
  ('94200000-0000-0000-0000-000000000001', 'Review Shop A', 'review-shop-a', 'active', 0.1000),
  ('94200000-0000-0000-0000-000000000002', 'Review Shop B', 'review-shop-b', 'active', 0.1000);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('94200000-0000-0000-0000-000000000001', '93200000-0000-0000-0000-000000000004', 'owner'),
  ('94200000-0000-0000-0000-000000000002', '93200000-0000-0000-0000-000000000005', 'owner');

insert into public.products
  (id, vendor_id, name, slug, price_minor, stock, status) values
  ('95200000-0000-0000-0000-000000000001', '94200000-0000-0000-0000-000000000001', 'A Gift', 'a-gift', 5000, 3, 'active'),
  ('95200000-0000-0000-0000-000000000002', '94200000-0000-0000-0000-000000000002', 'B Gift', 'b-gift', 7000, 3, 'active'),
  ('95200000-0000-0000-0000-000000000003', '94200000-0000-0000-0000-000000000001', 'A Second Gift', 'a-second-gift', 9000, 3, 'active');

-- Buyer-a received product A (delivered) and product C (delivered), and
-- bought product B but it is only shipped — not yet received.
insert into public.orders (
  id, user_id, status, subtotal_minor, total_minor, recipient_name,
  contact_phone, address_line, city, governorate
) values
  ('96200000-0000-0000-0000-000000000001', '93200000-0000-0000-0000-000000000001', 'delivered', 5000, 5000, 'Sara', '01001112233', '1 Street', 'Alexandria', 'Alexandria'),
  ('96200000-0000-0000-0000-000000000002', '93200000-0000-0000-0000-000000000001', 'shipped', 7000, 7000, 'Sara', '01001112233', '1 Street', 'Alexandria', 'Alexandria'),
  ('96200000-0000-0000-0000-000000000003', '93200000-0000-0000-0000-000000000001', 'delivered', 9000, 9000, 'Sara', '01001112233', '1 Street', 'Alexandria', 'Alexandria');

insert into public.order_vendors (
  id, order_id, vendor_id, status, subtotal_minor, commission_rate, delivered_at
) values
  ('97200000-0000-0000-0000-000000000001', '96200000-0000-0000-0000-000000000001', '94200000-0000-0000-0000-000000000001', 'delivered', 5000, 0.1000, now()),
  ('97200000-0000-0000-0000-000000000002', '96200000-0000-0000-0000-000000000002', '94200000-0000-0000-0000-000000000002', 'shipped', 7000, 0.1000, null),
  ('97200000-0000-0000-0000-000000000003', '96200000-0000-0000-0000-000000000003', '94200000-0000-0000-0000-000000000001', 'delivered', 9000, 0.1000, now());

insert into public.order_items (
  id, order_vendor_id, product_id, product_name, product_slug,
  unit_price_minor, quantity, line_total_minor
) values
  ('98200000-0000-0000-0000-000000000001', '97200000-0000-0000-0000-000000000001', '95200000-0000-0000-0000-000000000001', 'A Gift', 'a-gift', 5000, 1, 5000),
  ('98200000-0000-0000-0000-000000000002', '97200000-0000-0000-0000-000000000002', '95200000-0000-0000-0000-000000000002', 'B Gift', 'b-gift', 7000, 1, 7000),
  ('98200000-0000-0000-0000-000000000003', '97200000-0000-0000-0000-000000000003', '95200000-0000-0000-0000-000000000003', 'A Second Gift', 'a-second-gift', 9000, 1, 9000);

-- Seeded reviews (direct insert, bypassing RLS): one approved review on
-- product A by buyer-a, one pending review on product A by buyer-b.
insert into public.product_reviews
  (id, product_id, user_id, rating, body, author_name, status, reviewed_by, reviewed_at) values
  ('99200000-0000-0000-0000-000000000001', '95200000-0000-0000-0000-000000000001', '93200000-0000-0000-0000-000000000001', 5, 'Loved it', 'Sara', 'approved', '93200000-0000-0000-0000-000000000003', now()),
  ('99200000-0000-0000-0000-000000000002', '95200000-0000-0000-0000-000000000001', '93200000-0000-0000-0000-000000000002', 4, 'Waiting', null, 'pending', null, null);

-- ---------------------------------------------------------------------------
-- TEST 1: anon reads approved reviews only
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.product_reviews;
  if v_count <> 1 then
    raise exception 'TEST 1 FAILED: anon saw % reviews (expected 1 approved)', v_count;
  end if;
  if not exists (select 1 from public.product_reviews where id = '99200000-0000-0000-0000-000000000001') then
    raise exception 'TEST 1 FAILED: anon missing the approved review';
  end if;
  if exists (select 1 from public.product_reviews where id = '99200000-0000-0000-0000-000000000002') then
    raise exception 'TEST 1 FAILED: anon saw a pending review';
  end if;
  raise notice 'TEST 1 PASSED: anon reads approved reviews only';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: the author reads their own pending review; other customers do not
-- ---------------------------------------------------------------------------
set role authenticated;
-- The temp table is created as the authenticated role (like
-- refund_test_ids in rls_refunds_test.sql) so later inserts under this
-- role are permitted.
create temp table review_test_ids (name text primary key, id uuid);
set request.jwt.claim.sub = '93200000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"93200000-0000-0000-0000-000000000002"}';
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.product_reviews
   where product_id = '95200000-0000-0000-0000-000000000001';
  if v_count <> 2 then
    raise exception 'TEST 2 FAILED: pending author saw % reviews on product A (expected 2)', v_count;
  end if;
  raise notice 'TEST 2a PASSED: the author reads their own pending review';
end $$;

set request.jwt.claim.sub = '93200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"93200000-0000-0000-0000-000000000001"}';
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.product_reviews
   where product_id = '95200000-0000-0000-0000-000000000001';
  if v_count <> 1 then
    raise exception 'TEST 2 FAILED: another customer saw % reviews on product A (expected 1 approved)', v_count;
  end if;
  raise notice 'TEST 2 PASSED: another customer cannot read a pending review';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: a customer who never received the gift cannot review it
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '93200000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"93200000-0000-0000-0000-000000000002"}';
do $$
declare
  v_blocked boolean := false;
begin
  if public.is_verified_buyer('95200000-0000-0000-0000-000000000001') then
    raise exception 'TEST 3 FAILED: a non-buyer is reported as a verified buyer';
  end if;

  begin
    perform public.submit_product_review(
      '95200000-0000-0000-0000-000000000001', 5, 'I never bought this');
  exception when check_violation then
    if sqlerrm like '%Only customers who received%' then
      v_blocked := true;
    else
      raise exception 'TEST 3 FAILED: wrong error for a non-buyer review: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 3 FAILED: a non-buyer review was accepted';
  end if;
  raise notice 'TEST 3 PASSED: a non-buyer cannot review';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: a verified buyer submits; validation and one-per-product hold;
-- direct writes are refused (RPC-only)
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '93200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"93200000-0000-0000-0000-000000000001"}';
do $$
declare
  v_blocked boolean := false;
begin
  if not public.is_verified_buyer('95200000-0000-0000-0000-000000000003') then
    raise exception 'TEST 4 FAILED: a delivered buyer is not a verified buyer';
  end if;
  if public.is_verified_buyer('95200000-0000-0000-0000-000000000002') then
    raise exception 'TEST 4 FAILED: a shipped-only buyer is a verified buyer';
  end if;

  -- Shipped-only product B: bought but not received yet.
  begin
    perform public.submit_product_review(
      '95200000-0000-0000-0000-000000000002', 5, 'Too early');
  exception when check_violation then
    if sqlerrm like '%Only customers who received%' then
      v_blocked := true;
    else
      raise exception 'TEST 4 FAILED: wrong error for a shipped-only review: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 4 FAILED: a shipped-only review was accepted';
  end if;

  -- Bad rating and over-long body are refused before any write.
  v_blocked := false;
  begin
    perform public.submit_product_review(
      '95200000-0000-0000-0000-000000000003', 6, 'Too many stars');
  exception when invalid_parameter_value then
    if sqlerrm like '%1 to 5 stars%' then
      v_blocked := true;
    else
      raise exception 'TEST 4 FAILED: wrong error for rating 6: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 4 FAILED: rating 6 was accepted';
  end if;

  v_blocked := false;
  begin
    perform public.submit_product_review(
      '95200000-0000-0000-0000-000000000003', 5, repeat('x', 1001));
  exception when invalid_parameter_value then
    if sqlerrm like '%1000 characters%' then
      v_blocked := true;
    else
      raise exception 'TEST 4 FAILED: wrong error for a 1001-char review: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 4 FAILED: a 1001-character review was accepted';
  end if;

  -- Direct insert is refused: writes go through the RPC only.
  v_blocked := false;
  begin
    insert into public.product_reviews
      (product_id, user_id, rating, body, status)
    values (
      '95200000-0000-0000-0000-000000000003',
      '93200000-0000-0000-0000-000000000001',
      5, 'Direct write', 'approved');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 4 FAILED: a direct review insert was accepted';
  end if;
  raise notice 'TEST 4a PASSED: validation and RPC-only writes hold';
end $$;

insert into review_test_ids
select 'buyer_a_review_c', public.submit_product_review(
  '95200000-0000-0000-0000-000000000003', 4, 'Beautifully wrapped');

do $$
declare
  v_id uuid := (select id from review_test_ids where name = 'buyer_a_review_c');
begin
  if v_id is null then
    raise exception 'TEST 4 FAILED: verified-buyer submit returned nothing';
  end if;
  if not exists (
    select 1 from public.product_reviews
     where id = v_id
       and status = 'pending'
       and rating = 4
       and body = 'Beautifully wrapped'
       and author_name = 'Sara'
  ) then
    raise exception 'TEST 4 FAILED: submitted review was not stored pending with a first-name snapshot';
  end if;
  raise notice 'TEST 4b PASSED: verified-buyer review stored pending with author snapshot';

  -- One review per (product, user).
  begin
    perform public.submit_product_review(
      '95200000-0000-0000-0000-000000000003', 5, 'Second try');
  exception when check_violation then
    if sqlerrm like '%already reviewed%' then
      raise notice 'TEST 4 PASSED: verified-buyer submit, one per product, validation, RPC-only writes';
      return;
    else
      raise exception 'TEST 4 FAILED: wrong error for a duplicate review: %', sqlerrm;
    end if;
  end;
  raise exception 'TEST 4 FAILED: a duplicate review was accepted';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: a shop's members read pending reviews on their own products only
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '93200000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"93200000-0000-0000-0000-000000000004"}';
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.product_reviews
   where product_id in (
     '95200000-0000-0000-0000-000000000001',
     '95200000-0000-0000-0000-000000000003');
  if v_count <> 3 then
    raise exception 'TEST 5 FAILED: shop A owner saw % reviews on own products (expected 3)', v_count;
  end if;
  raise notice 'TEST 5a PASSED: a shop owner reads pending reviews on own products';
end $$;

set request.jwt.claim.sub = '93200000-0000-0000-0000-000000000005';
set request.jwt.claims = '{"sub":"93200000-0000-0000-0000-000000000005"}';
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.product_reviews
   where product_id = '95200000-0000-0000-0000-000000000002';
  if v_count <> 0 then
    raise exception 'TEST 5 FAILED: shop B owner saw % reviews on a product with none', v_count;
  end if;
  -- The public approved review on shop A's product is visible to
  -- everyone; the pending one on the same product is not.
  select count(*) into v_count from public.product_reviews
   where product_id = '95200000-0000-0000-0000-000000000001';
  if v_count <> 1 then
    raise exception 'TEST 5 FAILED: shop B owner saw % reviews on shop A''s product (expected 1 approved)', v_count;
  end if;
  raise notice 'TEST 5 PASSED: a shop owner reads only their own products'' reviews';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: admin moderation — pending becomes public, exactly once;
-- non-admins cannot moderate
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '93200000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"93200000-0000-0000-0000-000000000001"}';
do $$
declare
  v_blocked boolean := false;
begin
  begin
    perform public.moderate_product_review(
      (select id from review_test_ids where name = 'buyer_a_review_c'), true);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 6 FAILED: a non-admin moderated a review';
  end if;
  raise notice 'TEST 6a PASSED: moderation is admin-only';
end $$;

set request.jwt.claim.sub = '93200000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"93200000-0000-0000-0000-000000000003"}';
do $$
declare
  v_id uuid := (select id from review_test_ids where name = 'buyer_a_review_c');
  v_blocked boolean := false;
begin
  perform public.moderate_product_review(v_id, true);

  if not exists (
    select 1 from public.product_reviews
     where id = v_id
       and status = 'approved'
       and reviewed_by = '93200000-0000-0000-0000-000000000003'
       and reviewed_at is not null
  ) then
    raise exception 'TEST 6 FAILED: moderation did not approve the review';
  end if;

  begin
    perform public.moderate_product_review(v_id, false);
  exception when check_violation then
    if sqlerrm like '%already been moderated%' then
      v_blocked := true;
    else
      raise exception 'TEST 6 FAILED: wrong error for a second moderation: %', sqlerrm;
    end if;
  end;
  if not v_blocked then
    raise exception 'TEST 6 FAILED: a review was moderated twice';
  end if;
  raise notice 'TEST 6 PASSED: admin moderation approves once and only once';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 7: the summary counts approved reviews only; anon sees the newly
-- approved review
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_count int;
  v_summary record;
begin
  select count(*) into v_count from public.product_reviews;
  if v_count <> 2 then
    raise exception 'TEST 7 FAILED: anon saw % reviews after moderation (expected 2 approved)', v_count;
  end if;

  select * into v_summary from public.product_review_summary(
    '95200000-0000-0000-0000-000000000001');
  if v_summary.review_count <> 1 or v_summary.average_rating <> 5.0 then
    raise exception 'TEST 7 FAILED: product A summary is (% , %) (expected 1, 5.0)',
      v_summary.review_count, v_summary.average_rating;
  end if;

  select * into v_summary from public.product_review_summary(
    '95200000-0000-0000-0000-000000000003');
  if v_summary.review_count <> 1 or v_summary.average_rating <> 4.0 then
    raise exception 'TEST 7 FAILED: product C summary is (% , %) (expected 1, 4.0)',
      v_summary.review_count, v_summary.average_rating;
  end if;

  select * into v_summary from public.product_review_summary(
    '95200000-0000-0000-0000-000000000002');
  if v_summary.review_count <> 0 or v_summary.average_rating is not null then
    raise exception 'TEST 7 FAILED: product B summary is (% , %) (expected 0, null)',
      v_summary.review_count, v_summary.average_rating;
  end if;
  raise notice 'TEST 7 PASSED: summary counts approved reviews only, anon sees newly approved reviews';
end $$;

reset role;

rollback;
