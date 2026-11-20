-- Gifto vendor dashboard backend verification.
--
-- Phase 20: vendor profile privacy, working hours, public projection.
-- Run after all migrations against a disposable supabase/postgres container.
\set ON_ERROR_STOP on

do $$
begin
  if current_setting('gifto.rls_test_disposable', true) is distinct from 'yes' then
    raise exception 'Refusing to run destructive RLS tests. Start a disposable database and SET gifto.rls_test_disposable = ''yes'' in the same psql session.';
  end if;
end $$;

begin;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
delete from public.vendors where id in (
  'c1000000-0000-0000-0000-0000000000aa',
  'c2000000-0000-0000-0000-0000000000bb'
);
delete from auth.users where email like '%@dashboard.gifto.test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('11000000-0000-0000-0000-000000000001', 'admin@dashboard.gifto.test', '{"full_name":"Admin"}'::jsonb),
  ('22000000-0000-0000-0000-000000000002', 'owner@dashboard.gifto.test', '{"full_name":"Owner"}'::jsonb),
  ('33000000-0000-0000-0000-000000000003', 'staff@dashboard.gifto.test', '{"full_name":"Staff"}'::jsonb),
  ('44000000-0000-0000-0000-000000000004', 'outsider@dashboard.gifto.test', '{"full_name":"Outsider"}'::jsonb);

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = '11000000-0000-0000-0000-000000000001';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (
  id, name, slug, status, address_line, commission_rate, contact_email,
  cover_path, working_hours, prep_time_min_days, prep_time_max_days
) values (
  'c1000000-0000-0000-0000-0000000000aa',
  'Privacy Shop',
  'privacy-shop',
  'active',
  '12 Private Street, Cairo',
  0.10,
  'private@privacy-shop.test',
  'c1000000-0000-0000-0000-0000000000aa/cover.jpg',
  '{"mon":{"open":"09:00","close":"17:00"},"tue":null}'::jsonb,
  1,
  3
), (
  'c2000000-0000-0000-0000-0000000000bb',
  'Pending Shop',
  'pending-shop',
  'pending',
  '99 Hidden Street, Cairo',
  0.10,
  null,
  null,
  '{}'::jsonb,
  null,
  null
);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('c1000000-0000-0000-0000-0000000000aa', '22000000-0000-0000-0000-000000000002', 'owner'),
  ('c1000000-0000-0000-0000-0000000000aa', '33000000-0000-0000-0000-000000000003', 'staff'),
  ('c2000000-0000-0000-0000-0000000000bb', '22000000-0000-0000-0000-000000000002', 'owner');

insert into public.products (id, vendor_id, name, slug, price_minor, stock, status)
values (
  'd1000000-0000-0000-0000-0000000000aa',
  'c1000000-0000-0000-0000-0000000000aa',
  'Pause Test Gift',
  'pause-test-gift',
  2500,
  10,
  'active'
);

insert into public.support_requests (vendor_id, category, subject, body)
values (
  'c2000000-0000-0000-0000-0000000000bb',
  'account',
  'Pending shop account issue',
  'This seeded request belongs to a pending shop and must not be visible to another vendor.'
);

delete from storage.objects where bucket_id = 'vendor-media';
insert into storage.objects (bucket_id, name) values
  ('vendor-media', 'c1000000-0000-0000-0000-0000000000aa/branding/seed-logo.jpg'),
  ('vendor-media', 'c2000000-0000-0000-0000-0000000000bb/cover/seed-cover.jpg');

-- ---------------------------------------------------------------------------
-- TEST 1: signed-in outsiders cannot read the base vendor table
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '44000000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"44000000-0000-0000-0000-000000000004"}';
do $$
declare c int;
begin
  select count(*) into c from public.vendors where id = 'c1000000-0000-0000-0000-0000000000aa';
  if c <> 0 then raise exception 'TEST 1 FAILED: outsider saw % active vendor row(s)', c; end if;
  raise notice 'TEST 1 PASSED: outsiders cannot read base vendor rows';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: owners and admins keep full access to the base row
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '22000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000002"}';
do $$
declare a text; c int;
begin
  select address_line, commission_rate into a, c
  from public.vendors where id = 'c1000000-0000-0000-0000-0000000000aa';
  if a is distinct from '12 Private Street, Cairo' then
    raise exception 'TEST 2 FAILED: owner address=%', a;
  end if;
  raise notice 'TEST 2 PASSED: owner reads private vendor fields';
end $$;

set request.jwt.claim.sub = '11000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000001"}';
do $$
declare a text;
begin
  select address_line into a from public.vendors
  where id = 'c1000000-0000-0000-0000-0000000000aa';
  if a is distinct from '12 Private Street, Cairo' then
    raise exception 'TEST 2 FAILED: admin address=%', a;
  end if;
  raise notice 'TEST 2 PASSED: admin reads private vendor fields';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: public view exposes approved fields only, active vendors only
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int; cv text; wh jsonb; pmin int; pmax int;
begin
  select count(*) into c from public.public_vendors;
  if c <> 1 then raise exception 'TEST 3 FAILED: anon saw % vendors', c; end if;

  select cover_path, working_hours, prep_time_min_days, prep_time_max_days
    into cv, wh, pmin, pmax
  from public.public_vendors
  where id = 'c1000000-0000-0000-0000-0000000000aa';

  if cv is distinct from 'c1000000-0000-0000-0000-0000000000aa/cover.jpg' then
    raise exception 'TEST 3 FAILED: cover_path=%', cv;
  end if;
  if wh <> '{"mon":{"open":"09:00","close":"17:00"},"tue":null}'::jsonb then
    raise exception 'TEST 3 FAILED: working_hours=%', wh;
  end if;
  if pmin <> 1 or pmax <> 3 then
    raise exception 'TEST 3 FAILED: prep_time=%..%', pmin, pmax;
  end if;
  if exists (select 1 from public.public_vendors where slug = 'pending-shop') then
    raise exception 'TEST 3 FAILED: anon saw a pending vendor';
  end if;
  raise notice 'TEST 3 PASSED: public projection is correct';
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_vendors'
      and column_name = 'address_line'
  ) then
    raise exception 'TEST 3 FAILED: address_line leaked into public_vendors';
  end if;
  raise notice 'TEST 3 PASSED: address_line is absent from the public view';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: working-hours validator accepts valid values and rejects invalid ones
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  if not public.vendor_working_hours_valid('{}'::jsonb) then
    raise exception 'TEST 4 FAILED: empty object rejected';
  end if;
  if not public.vendor_working_hours_valid('{"mon":{"open":"00:00","close":"23:59"}}'::jsonb) then
    raise exception 'TEST 4 FAILED: valid day rejected';
  end if;
  if not public.vendor_working_hours_valid('{"mon":null}'::jsonb) then
    raise exception 'TEST 4 FAILED: JSON null day rejected';
  end if;

  if public.vendor_working_hours_valid('null'::jsonb) then
    raise exception 'TEST 4 FAILED: JSON null document accepted';
  end if;
  if public.vendor_working_hours_valid('[]'::jsonb) then
    raise exception 'TEST 4 FAILED: array accepted';
  end if;
  if public.vendor_working_hours_valid('{"funday":{"open":"09:00","close":"17:00"}}'::jsonb) then
    raise exception 'TEST 4 FAILED: unknown day accepted';
  end if;
  if public.vendor_working_hours_valid('{"mon":{"open":"9:00","close":"17:00"}}'::jsonb) then
    raise exception 'TEST 4 FAILED: malformed time accepted';
  end if;
  if public.vendor_working_hours_valid('{"mon":{"open":"09:00","close":"09:00"}}'::jsonb) then
    raise exception 'TEST 4 FAILED: equal open/close accepted';
  end if;
  if public.vendor_working_hours_valid('{"mon":{"open":"18:00","close":"09:00"}}'::jsonb) then
    raise exception 'TEST 4 FAILED: reversed range accepted';
  end if;
  if public.vendor_working_hours_valid('{"mon":{"open":"09:00"}}'::jsonb) then
    raise exception 'TEST 4 FAILED: missing close accepted';
  end if;
  if public.vendor_working_hours_valid('{"mon":{"open":"09:00","close":"17:00","note":"x"}}'::jsonb) then
    raise exception 'TEST 4 FAILED: unknown slot key accepted';
  end if;

  if has_function_privilege('anon', 'public.vendor_working_hours_valid(jsonb)', 'EXECUTE') then
    raise exception 'TEST 4 FAILED: anon can execute validator';
  end if;
  if not has_function_privilege('authenticated', 'public.vendor_working_hours_valid(jsonb)', 'EXECUTE') then
    raise exception 'TEST 4 FAILED: authenticated cannot execute validator';
  end if;
  raise notice 'TEST 4 PASSED: working-hours validator is correct and gated';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: database constraints reject invalid working hours and prep ranges
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    update public.vendors
    set working_hours = '{"mon":{"open":"17:00","close":"09:00"}}'::jsonb
    where id = 'c1000000-0000-0000-0000-0000000000aa';
    raise exception 'TEST 5 FAILED: invalid working hours accepted';
  exception when check_violation then
    null;
  end;

  begin
    update public.vendors
    set prep_time_min_days = 5, prep_time_max_days = 2
    where id = 'c1000000-0000-0000-0000-0000000000aa';
    raise exception 'TEST 5 FAILED: reversed prep range accepted';
  exception when check_violation then
    null;
  end;

  begin
    update public.vendors
    set address_line = 'abc'
    where id = 'c1000000-0000-0000-0000-0000000000aa';
    raise exception 'TEST 5 FAILED: short address accepted';
  exception when check_violation then
    null;
  end;

  raise notice 'TEST 5 PASSED: profile constraints reject invalid values';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: an active owner can update the approved profile fields
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000002"}';
do $$
declare n int; v jsonb; pmin int;
begin
  update public.vendors
  set address_line = '14 Updated Street, Cairo',
      working_hours = '{"tue":{"open":"10:00","close":"16:00"}}'::jsonb,
      prep_time_min_days = 2,
      prep_time_max_days = 5
  where id = 'c1000000-0000-0000-0000-0000000000aa';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 6 FAILED: updated % rows', n; end if;

  select working_hours, prep_time_min_days into v, pmin
  from public.vendors where id = 'c1000000-0000-0000-0000-0000000000aa';
  if v <> '{"tue":{"open":"10:00","close":"16:00"}}'::jsonb or pmin <> 2 then
    raise exception 'TEST 6 FAILED: values not persisted';
  end if;
  raise notice 'TEST 6 PASSED: active owner updates profile fields';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 7: outsiders cannot update vendor profile fields
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '44000000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"44000000-0000-0000-0000-000000000004"}';
do $$
declare n int;
begin
  update public.vendors set address_line = 'Hijacked Street, Cairo'
  where id = 'c1000000-0000-0000-0000-0000000000aa';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 7 FAILED: outsider updated % rows', n; end if;
  raise notice 'TEST 7 PASSED: outsiders cannot update vendor profiles';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 8: vendor-media bucket is public-read and owner-scoped for writes
-- ---------------------------------------------------------------------------
reset role;
do $$
declare is_public boolean; max_bytes bigint;
begin
  select public, file_size_limit into is_public, max_bytes
  from storage.buckets where id = 'vendor-media';
  if is_public is not true then
    raise exception 'TEST 8 FAILED: vendor-media is not public';
  end if;
  if max_bytes <> 5 * 1024 * 1024 then
    raise exception 'TEST 8 FAILED: unexpected file size limit %', max_bytes;
  end if;
  raise notice 'TEST 8 PASSED: vendor-media bucket config is correct';
end $$;

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int;
begin
  select count(*) into c from storage.objects where bucket_id = 'vendor-media';
  if c <> 2 then raise exception 'TEST 8 FAILED: anon saw % vendor media objects', c; end if;
  raise notice 'TEST 8 PASSED: anon reads public vendor media';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 9: owners can upload branding and cover files only under their vendor
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000002"}';
do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('vendor-media', 'c1000000-0000-0000-0000-0000000000aa/branding/logo-new.png');
  insert into storage.objects (bucket_id, name)
  values ('vendor-media', 'c1000000-0000-0000-0000-0000000000aa/cover/cover-new.png');
  raise notice 'TEST 9 PASSED: owner uploads logo and cover media';
end $$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('vendor-media', 'c2000000-0000-0000-0000-0000000000bb/branding/hijack.png');
    raise exception 'TEST 9 FAILED: owner wrote into another vendor folder';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into storage.objects (bucket_id, name)
    values ('vendor-media', 'c1000000-0000-0000-0000-0000000000aa/secrets/leak.png');
    raise exception 'TEST 9 FAILED: owner wrote outside branding/cover folders';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 9 PASSED: vendor-media writes are folder- and vendor-scoped';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 10: staff cannot write vendor media; owners can delete their own
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '33000000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"33000000-0000-0000-0000-000000000003"}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('vendor-media', 'c1000000-0000-0000-0000-0000000000aa/branding/staff.png');
    raise exception 'TEST 10 FAILED: staff wrote vendor media';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 10 PASSED: staff cannot write vendor media';
end $$;

set request.jwt.claim.sub = '22000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000002"}';
do $$
declare n int;
begin
  delete from storage.objects
  where bucket_id = 'vendor-media'
    and name = 'c1000000-0000-0000-0000-0000000000aa/branding/seed-logo.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 10 FAILED: deleted % seed objects', n; end if;
  raise notice 'TEST 10 PASSED: owner deletes own vendor media';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 11: pausing orders keeps the shop public but blocks checkout
-- ---------------------------------------------------------------------------
reset role;
do $$
declare accepting boolean;
begin
  select is_accepting_orders into accepting
  from public.public_vendors
  where id = 'c1000000-0000-0000-0000-0000000000aa';
  if accepting is distinct from true then
    raise exception 'TEST 11 FAILED: new vendors should accept orders by default';
  end if;
  raise notice 'TEST 11 PASSED: public view exposes accepting state';
end $$;

set role authenticated;
set request.jwt.claim.sub = '22000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000002"}';
do $$
declare n int;
begin
  update public.vendors set is_accepting_orders = false
  where id = 'c1000000-0000-0000-0000-0000000000aa';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 11 FAILED: owner paused % rows', n; end if;
  raise notice 'TEST 11 PASSED: owner pauses new orders';
end $$;

reset role;
do $$
declare accepting boolean; v_status public.vendor_status; products int;
begin
  select is_accepting_orders, status into accepting, v_status
  from public.vendors where id = 'c1000000-0000-0000-0000-0000000000aa';
  if accepting is distinct from false or v_status <> 'active' then
    raise exception 'TEST 11 FAILED: pause changed shop status or did not persist';
  end if;

  select count(*) into products
  from public.products
  where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
    and status = 'active';
  if products <> 1 then
    raise exception 'TEST 11 FAILED: paused shop lost public products';
  end if;
  raise notice 'TEST 11 PASSED: paused shop keeps status and products';
end $$;

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int; accepting boolean;
begin
  select count(*) into c from public.public_vendors
  where id = 'c1000000-0000-0000-0000-0000000000aa';
  if c <> 1 then raise exception 'TEST 11 FAILED: paused shop disappeared from public view'; end if;

  select is_accepting_orders into accepting
  from public.public_vendors
  where id = 'c1000000-0000-0000-0000-0000000000aa';
  if accepting is distinct from false then
    raise exception 'TEST 11 FAILED: anon view did not show paused state';
  end if;
  raise notice 'TEST 11 PASSED: anon still sees paused shop and state';
end $$;

reset role;
do $$
begin
  begin
    perform public._create_order(
      null,
      '[{"product_id":"d1000000-0000-0000-0000-0000000000aa","quantity":1}]'::jsonb,
      'Pause Buyer', '01000000000', null, '10 Test Street, Cairo',
      'Cairo', 'Cairo', null, gen_random_uuid(), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    );
    raise exception 'TEST 11 FAILED: checkout succeeded while paused';
  exception when sqlstate '22023' then
    if sqlerrm not like '%not accepting orders right now%' then
      raise;
    end if;
  end;

  if exists (
    select 1 from public.orders where guest_token_hash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ) then
    raise exception 'TEST 11 FAILED: paused checkout created an order';
  end if;
  raise notice 'TEST 11 PASSED: paused checkout is rejected without an order';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 12: resuming reopens checkout; price, commission and stock still apply
-- ---------------------------------------------------------------------------
do $$
begin
  update public.vendors set is_accepting_orders = true
  where id = 'c1000000-0000-0000-0000-0000000000aa';
  raise notice 'TEST 12 PASSED: orders resumed';
end $$;

do $$
declare v_order_id uuid; v_stock int; v_commission numeric; v_subtotal int;
begin
  v_order_id := public._create_order(
    null,
    '[{"product_id":"d1000000-0000-0000-0000-0000000000aa","quantity":2}]'::jsonb,
    'Resume Buyer', '01000000000', null, '10 Test Street, Cairo',
    'Cairo', 'Cairo', null, gen_random_uuid(), 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  );

  select stock into v_stock from public.products
  where id = 'd1000000-0000-0000-0000-0000000000aa';
  if v_stock <> 8 then raise exception 'TEST 12 FAILED: stock=% (expected 8)', v_stock; end if;

  select commission_rate, subtotal_minor into v_commission, v_subtotal
  from public.order_vendors
  where order_id = v_order_id
    and vendor_id = 'c1000000-0000-0000-0000-0000000000aa';
  if v_commission <> 0.10 or v_subtotal <> 5000 then
    raise exception 'TEST 12 FAILED: commission=% subtotal=%', v_commission, v_subtotal;
  end if;
  raise notice 'TEST 12 PASSED: resumed checkout uses DB price, commission and stock';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 13: vendors submit support requests with server-assigned metadata
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '22000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000002"}';
do $$
declare v_id uuid; v_created_by uuid; v_status public.support_request_status; n int;
begin
  insert into public.support_requests (vendor_id, category, subject, body)
  values (
    'c1000000-0000-0000-0000-0000000000aa',
    'orders',
    'Cannot export orders',
    'The orders page will not download a spreadsheet for this week.'
  )
  returning id, created_by, status into v_id, v_created_by, v_status;

  if v_created_by is distinct from '22000000-0000-0000-0000-000000000002' then
    raise exception 'TEST 13 FAILED: created_by was not assigned to the caller';
  end if;
  if v_status <> 'open' then
    raise exception 'TEST 13 FAILED: initial status was %', v_status;
  end if;

  select count(*) into n from public.support_requests;
  if n <> 1 then
    raise exception 'TEST 13 FAILED: vendor saw % support requests (expected own 1)', n;
  end if;
  raise notice 'TEST 13 PASSED: vendor insert defaults and read scope are correct';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 14: vendors cannot forge metadata, update status, or submit as outsiders
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.support_requests (vendor_id, category, subject, body, status)
    values (
      'c1000000-0000-0000-0000-0000000000aa',
      'orders',
      'Forged status request',
      'This insert tries to set a status the vendor should not control.',
      'resolved'
    );
    raise exception 'TEST 14 FAILED: vendor set status on insert';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.support_requests
      (vendor_id, category, subject, body, created_by)
    values (
      'c1000000-0000-0000-0000-0000000000aa',
      'orders',
      'Forged creator request',
      'This insert tries to impersonate another creator identity.',
      '11000000-0000-0000-0000-000000000001'
    );
    raise exception 'TEST 14 FAILED: vendor set created_by on insert';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 14 PASSED: insert metadata columns are not vendor-writable';
end $$;

do $$
declare n int;
begin
  update public.support_requests set status = 'resolved'
  where subject = 'Cannot export orders';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 14 FAILED: vendor updated % support rows', n; end if;
  raise notice 'TEST 14 PASSED: vendors cannot change support status';
end $$;

set request.jwt.claim.sub = '44000000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"44000000-0000-0000-0000-000000000004"}';
do $$
begin
  begin
    insert into public.support_requests (vendor_id, category, subject, body)
    values (
      'c1000000-0000-0000-0000-0000000000aa',
      'other',
      'Outsider support request',
      'An outsider must not be able to create a request for this shop.'
    );
    raise exception 'TEST 14 FAILED: outsider created a support request';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 14 PASSED: outsiders cannot submit for a shop';
end $$;

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
begin
  begin
    perform count(*) from public.support_requests;
    raise exception 'TEST 14 FAILED: anon read the support table';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 14 PASSED: anon has no support-table access';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 15: admins read the queue and update status; submissions are rate limited
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000001"}';
do $$
declare n int; v_status public.support_request_status;
begin
  select count(*) into n from public.support_requests;
  if n <> 2 then
    raise exception 'TEST 15 FAILED: admin saw % support requests (expected 2)', n;
  end if;

  update public.support_requests set status = 'in_progress'
  where subject = 'Cannot export orders';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 15 FAILED: admin updated % rows', n; end if;

  select status into v_status from public.support_requests
  where subject = 'Cannot export orders';
  if v_status <> 'in_progress' then
    raise exception 'TEST 15 FAILED: admin status update persisted as %', v_status;
  end if;
  raise notice 'TEST 15 PASSED: admin reads queue and updates status';
end $$;

set request.jwt.claim.sub = '22000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000002"}';
do $$
declare i int;
begin
  for i in 1..4 loop
    insert into public.support_requests (vendor_id, category, subject, body)
    values (
      'c1000000-0000-0000-0000-0000000000aa',
      'other',
      'Rate limit request ' || i,
      'This request is part of the rate-limit verification for a shop.'
    );
  end loop;

  begin
    insert into public.support_requests (vendor_id, category, subject, body)
    values (
      'c1000000-0000-0000-0000-0000000000aa',
      'other',
      'Rate limit request 6',
      'This sixth request in the rolling window must be rejected by the trigger.'
    );
    raise exception 'TEST 15 FAILED: rate limit did not reject the sixth request';
  exception when sqlstate '22023' then
    null;
  end;
  raise notice 'TEST 15 PASSED: support submissions are rate limited';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 16: analytics reads have a vendor/date index
-- ---------------------------------------------------------------------------
reset role;
do $$
declare v_def text;
begin
  select indexdef into v_def
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'order_vendors_vendor_created_idx';

  if v_def is null then
    raise exception 'TEST 16 FAILED: analytics index is missing';
  end if;
  if v_def not like '%(vendor_id, created_at DESC)%' then
    raise exception 'TEST 16 FAILED: unexpected analytics index definition: %', v_def;
  end if;
  raise notice 'TEST 16 PASSED: analytics vendor/date index exists';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 17 (P1-14, H-07): the owner manages the roster through RLS; staff,
-- outsiders and cross-vendor owners cannot.
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  -- A second active shop whose owner is NOT a member of Privacy Shop.
  insert into auth.users (id, email, raw_user_meta_data) values
    ('55000000-0000-0000-0000-000000000005', 'owner-c@dashboard.gifto.test', '{"full_name":"Owner C"}'::jsonb);
  insert into public.vendors (id, name, slug, status, commission_rate) values
    ('c3000000-0000-0000-0000-0000000000cc', 'Second Shop', 'second-shop', 'active', 0.10);
  insert into public.vendor_members (vendor_id, profile_id, role) values
    ('c3000000-0000-0000-0000-0000000000cc', '55000000-0000-0000-0000-000000000005', 'owner');
end $$;

set role authenticated;
set request.jwt.claim.sub = '22000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000002"}';
do $$
declare n int;
begin
  -- Owner invites the outsider as staff, promotes them, then removes them.
  insert into public.vendor_members (vendor_id, profile_id, role)
  values ('c1000000-0000-0000-0000-0000000000aa', '44000000-0000-0000-0000-000000000004', 'staff');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 17 FAILED: owner inserted % members', n; end if;

  update public.vendor_members set role = 'manager'
   where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
     and profile_id = '44000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 17 FAILED: owner changed % roles', n; end if;
  if (select role from public.vendor_members
       where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
         and profile_id = '44000000-0000-0000-0000-000000000004') <> 'manager' then
    raise exception 'TEST 17 FAILED: role change did not persist';
  end if;

  delete from public.vendor_members
   where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
     and profile_id = '44000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 17 FAILED: owner removed % members', n; end if;
  raise notice 'TEST 17 PASSED: owner invites, re-roles and removes members';
end $$;

-- Staff cannot manage the roster at all.
set request.jwt.claim.sub = '33000000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"33000000-0000-0000-0000-000000000003"}';
do $$
declare n int;
begin
  begin
    insert into public.vendor_members (vendor_id, profile_id, role)
    values ('c1000000-0000-0000-0000-0000000000aa', '44000000-0000-0000-0000-000000000004', 'staff');
    raise exception 'TEST 17 FAILED: staff inserted a member';
  exception when insufficient_privilege then
    null;
  end;

  update public.vendor_members set role = 'manager'
   where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
     and profile_id = '22000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 17 FAILED: staff changed % roles', n; end if;

  delete from public.vendor_members
   where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
     and profile_id = '22000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 17 FAILED: staff removed % members', n; end if;
  raise notice 'TEST 17 PASSED: staff cannot manage the roster';
end $$;

-- Outsider and cross-vendor owner cannot touch this shop's roster.
set request.jwt.claim.sub = '44000000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"44000000-0000-0000-0000-000000000004"}';
do $$
declare n int;
begin
  begin
    insert into public.vendor_members (vendor_id, profile_id, role)
    values ('c1000000-0000-0000-0000-0000000000aa', '44000000-0000-0000-0000-000000000004', 'staff');
    raise exception 'TEST 17 FAILED: outsider inserted a member';
  exception when insufficient_privilege then
    null;
  end;

  delete from public.vendor_members
   where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
     and profile_id = '33000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 17 FAILED: outsider removed % members', n; end if;
  raise notice 'TEST 17 PASSED: outsiders cannot manage the roster';
end $$;

set request.jwt.claim.sub = '55000000-0000-0000-0000-000000000005';
set request.jwt.claims = '{"sub":"55000000-0000-0000-0000-000000000005"}';
do $$
declare n int;
begin
  begin
    insert into public.vendor_members (vendor_id, profile_id, role)
    values ('c1000000-0000-0000-0000-0000000000aa', '44000000-0000-0000-0000-000000000004', 'staff');
    raise exception 'TEST 17 FAILED: cross-vendor owner inserted a member';
  exception when insufficient_privilege then
    null;
  end;

  update public.vendor_members set role = 'manager'
   where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
     and profile_id = '33000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 17 FAILED: cross-vendor owner changed % roles', n; end if;
  raise notice 'TEST 17 PASSED: a shop owner cannot manage another shop''s roster';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 18 (P1-14, H-07): list_vendor_members shows the roster with contact
-- details only to members of that shop (or platform admins).
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '22000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000002"}';
do $$
declare
  v_count int;
  v_staff_email text;
begin
  if has_function_privilege('anon', 'public.list_vendor_members(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.list_vendor_members(uuid)', 'execute') then
    raise exception 'TEST 18 FAILED: roster RPC grants are wrong';
  end if;

  select count(*) into v_count
    from public.list_vendor_members('c1000000-0000-0000-0000-0000000000aa');
  if v_count <> 2 then
    raise exception 'TEST 18 FAILED: owner saw % roster rows (expected 2)', v_count;
  end if;

  select email into v_staff_email
    from public.list_vendor_members('c1000000-0000-0000-0000-0000000000aa')
   where role = 'staff';
  if v_staff_email <> 'staff@dashboard.gifto.test' then
    raise exception 'TEST 18 FAILED: roster hides member contact details';
  end if;
  raise notice 'TEST 18 PASSED: owner reads the roster with emails';
end $$;

set request.jwt.claim.sub = '33000000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"33000000-0000-0000-0000-000000000003"}';
do $$
declare v_count int;
begin
  select count(*) into v_count
    from public.list_vendor_members('c1000000-0000-0000-0000-0000000000aa');
  if v_count <> 2 then
    raise exception 'TEST 18 FAILED: staff saw % roster rows (expected 2)', v_count;
  end if;
  raise notice 'TEST 18 PASSED: staff sees the read-only roster';
end $$;

set request.jwt.claim.sub = '44000000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"44000000-0000-0000-0000-000000000004"}';
do $$
declare v_count int;
begin
  select count(*) into v_count
    from public.list_vendor_members('c1000000-0000-0000-0000-0000000000aa');
  if v_count <> 0 then
    raise exception 'TEST 18 FAILED: outsider saw % roster rows', v_count;
  end if;
  raise notice 'TEST 18 PASSED: outsiders see no roster';
end $$;

set request.jwt.claim.sub = '55000000-0000-0000-0000-000000000005';
set request.jwt.claims = '{"sub":"55000000-0000-0000-0000-000000000005"}';
do $$
declare v_count int;
begin
  select count(*) into v_count
    from public.list_vendor_members('c1000000-0000-0000-0000-0000000000aa');
  if v_count <> 0 then
    raise exception 'TEST 18 FAILED: cross-vendor owner saw % roster rows', v_count;
  end if;

  select count(*) into v_count
    from public.list_vendor_members('c3000000-0000-0000-0000-0000000000cc');
  if v_count <> 1 then
    raise exception 'TEST 18 FAILED: owner saw % own roster rows (expected 1)', v_count;
  end if;
  raise notice 'TEST 18 PASSED: rosters are isolated per shop';
end $$;

set request.jwt.claim.sub = '11000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"11000000-0000-0000-0000-000000000001"}';
do $$
declare v_count int;
begin
  select count(*) into v_count
    from public.list_vendor_members('c1000000-0000-0000-0000-0000000000aa');
  if v_count <> 2 then
    raise exception 'TEST 18 FAILED: admin saw % roster rows (expected 2)', v_count;
  end if;
  raise notice 'TEST 18 PASSED: platform admin reads any roster';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 19 (P1-14, H-07): the last-owner guard still holds — the sole owner
-- cannot be demoted or removed, but can hand over once a second owner exists.
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '22000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"22000000-0000-0000-0000-000000000002"}';
do $$
begin
  begin
    update public.vendor_members set role = 'manager'
     where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
       and profile_id = '22000000-0000-0000-0000-000000000002';
    raise exception 'TEST 19 FAILED: sole owner was demoted';
  exception when raise_exception then
    null;
  end;

  begin
    delete from public.vendor_members
     where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
       and profile_id = '22000000-0000-0000-0000-000000000002';
    raise exception 'TEST 19 FAILED: sole owner was removed';
  exception when raise_exception then
    null;
  end;
  raise notice 'TEST 19 PASSED: sole owner cannot be demoted or removed';
end $$;

do $$
begin
  -- Promote staff to owner, then the original owner can step down.
  update public.vendor_members set role = 'owner'
   where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
     and profile_id = '33000000-0000-0000-0000-000000000003';
  update public.vendor_members set role = 'manager'
   where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
     and profile_id = '22000000-0000-0000-0000-000000000002';
  if (select role from public.vendor_members
       where vendor_id = 'c1000000-0000-0000-0000-0000000000aa'
         and profile_id = '22000000-0000-0000-0000-000000000002') <> 'manager' then
    raise exception 'TEST 19 FAILED: handover demotion did not persist';
  end if;
  raise notice 'TEST 19 PASSED: ownership hands over once a second owner exists';
end $$;

rollback;
