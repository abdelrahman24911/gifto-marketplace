-- Gifto occasion discovery verification (migration 26).
--
-- Covers:
--   * occasion RLS, slug derivation/collisions and permanent slug redirects
--   * manual, automatic and hybrid matching, dedupe, ordering and pagination
--   * active product / active vendor filtering (paused shops stay visible)
--   * global tag RLS, active-only assignment and the ten-tag ceiling
--   * vendor tag suggestions and the admin approval/rejection workflow
--   * admin-only curation RPCs
--   * occasion-images Storage bucket settings and policies
--
-- Runs after all migrations against a bare `supabase/postgres` container with
-- supabase/tests/storage_stub.sql applied first. The suite is destructive and
-- requires gifto.rls_test_disposable = 'yes' in the same psql session. All
-- fixtures live inside the transaction and are rolled back at the end.

\set ON_ERROR_STOP on

do $$
begin
  if current_setting('gifto.rls_test_disposable', true) is distinct from 'yes' then
    raise exception 'Refusing to run destructive RLS tests. Start a disposable database and SET gifto.rls_test_disposable = ''yes'' in the same psql session.';
  end if;
end $$;

begin;

-- ---------------------------------------------------------------------------
-- Fixtures (as superuser; bypasses RLS)
-- ---------------------------------------------------------------------------

delete from public.tag_suggestions where vendor_id in (
  'e1000000-0000-0000-0000-0000000000a1',
  'e1000000-0000-0000-0000-0000000000b2',
  'e1000000-0000-0000-0000-0000000000c3',
  'e1000000-0000-0000-0000-0000000000d4'
);
delete from public.product_tags where product_id in (
  'd1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000002',
  'd1000000-0000-0000-0000-000000000003',
  'd1000000-0000-0000-0000-000000000004',
  'd1000000-0000-0000-0000-000000000005',
  'd1000000-0000-0000-0000-000000000006',
  'd1000000-0000-0000-0000-000000000007',
  'd1000000-0000-0000-0000-000000000008',
  'd1000000-0000-0000-0000-000000000009',
  'd1000000-0000-0000-0000-00000000000a',
  'd1000000-0000-0000-0000-00000000000b',
  'd1000000-0000-0000-0000-00000000000c',
  'd1000000-0000-0000-0000-00000000000d'
);
delete from public.occasion_tags where occasion_id in (
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000004'
);
delete from public.occasion_categories where occasion_id in (
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000004'
);
delete from public.occasion_products where occasion_id in (
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000004'
);
delete from public.occasion_slug_redirects where occasion_id in (
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000004'
);
delete from public.occasions where id in (
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000004'
);
delete from public.tags where id in (
  'f2000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000002',
  'f2000000-0000-0000-0000-000000000003',
  'f2000000-0000-0000-0000-000000000101',
  'f2000000-0000-0000-0000-000000000102',
  'f2000000-0000-0000-0000-000000000103',
  'f2000000-0000-0000-0000-000000000104',
  'f2000000-0000-0000-0000-000000000105',
  'f2000000-0000-0000-0000-000000000106',
  'f2000000-0000-0000-0000-000000000107',
  'f2000000-0000-0000-0000-000000000108',
  'f2000000-0000-0000-0000-000000000109',
  'f2000000-0000-0000-0000-00000000010a'
);
delete from public.products where vendor_id in (
  'e1000000-0000-0000-0000-0000000000a1',
  'e1000000-0000-0000-0000-0000000000b2',
  'e1000000-0000-0000-0000-0000000000c3',
  'e1000000-0000-0000-0000-0000000000d4'
);
delete from public.categories where id in (
  'f1000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000002'
);
delete from public.vendor_members where vendor_id in (
  'e1000000-0000-0000-0000-0000000000a1',
  'e1000000-0000-0000-0000-0000000000b2',
  'e1000000-0000-0000-0000-0000000000c3',
  'e1000000-0000-0000-0000-0000000000d4'
);
delete from public.vendors where id in (
  'e1000000-0000-0000-0000-0000000000a1',
  'e1000000-0000-0000-0000-0000000000b2',
  'e1000000-0000-0000-0000-0000000000c3',
  'e1000000-0000-0000-0000-0000000000d4'
);
delete from auth.users where email like '%@occasions.gifto.test';
delete from storage.objects where bucket_id = 'occasion-images';

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@occasions.gifto.test'),
  ('a0000000-0000-0000-0000-000000000002', 'owner-a@occasions.gifto.test'),
  ('a0000000-0000-0000-0000-000000000003', 'manager-a@occasions.gifto.test'),
  ('a0000000-0000-0000-0000-000000000004', 'staff-a@occasions.gifto.test'),
  ('a0000000-0000-0000-0000-000000000005', 'owner-b@occasions.gifto.test'),
  ('a0000000-0000-0000-0000-000000000006', 'owner-c@occasions.gifto.test'),
  ('a0000000-0000-0000-0000-000000000007', 'owner-d@occasions.gifto.test');

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = 'a0000000-0000-0000-0000-000000000001';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (id, name, slug, status, is_accepting_orders) values
  ('e1000000-0000-0000-0000-0000000000a1', 'Occasion Shop A', 'occasion-shop-a', 'active', true),
  ('e1000000-0000-0000-0000-0000000000b2', 'Occasion Shop B', 'occasion-shop-b', 'pending', true),
  ('e1000000-0000-0000-0000-0000000000c3', 'Occasion Shop C', 'occasion-shop-c', 'suspended', true),
  ('e1000000-0000-0000-0000-0000000000d4', 'Occasion Shop D', 'occasion-shop-d', 'active', false);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('e1000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000002', 'owner'),
  ('e1000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000003', 'manager'),
  ('e1000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000004', 'staff'),
  ('e1000000-0000-0000-0000-0000000000b2', 'a0000000-0000-0000-0000-000000000005', 'owner'),
  ('e1000000-0000-0000-0000-0000000000c3', 'a0000000-0000-0000-0000-000000000006', 'owner'),
  ('e1000000-0000-0000-0000-0000000000d4', 'a0000000-0000-0000-0000-000000000007', 'owner');

insert into public.categories (id, name, slug, is_active) values
  ('f1000000-0000-0000-0000-000000000001', 'Active Gifts', 'active-gifts', true),
  ('f1000000-0000-0000-0000-000000000002', 'Hidden Gifts', 'hidden-gifts', false);

insert into public.tags (id, name, slug, is_active) values
  ('f2000000-0000-0000-0000-000000000001', 'Birthday', 'birthday', true),
  ('f2000000-0000-0000-0000-000000000002', 'Celebration', 'celebration', true),
  ('f2000000-0000-0000-0000-000000000003', 'Retired', 'retired', false),
  ('f2000000-0000-0000-0000-000000000101', 'Extra 01', 'extra-01', true),
  ('f2000000-0000-0000-0000-000000000102', 'Extra 02', 'extra-02', true),
  ('f2000000-0000-0000-0000-000000000103', 'Extra 03', 'extra-03', true),
  ('f2000000-0000-0000-0000-000000000104', 'Extra 04', 'extra-04', true),
  ('f2000000-0000-0000-0000-000000000105', 'Extra 05', 'extra-05', true),
  ('f2000000-0000-0000-0000-000000000106', 'Extra 06', 'extra-06', true),
  ('f2000000-0000-0000-0000-000000000107', 'Extra 07', 'extra-07', true),
  ('f2000000-0000-0000-0000-000000000108', 'Extra 08', 'extra-08', true),
  ('f2000000-0000-0000-0000-000000000109', 'Extra 09', 'extra-09', true),
  ('f2000000-0000-0000-0000-00000000010a', 'Extra 10', 'extra-10', true);

insert into public.products
  (id, vendor_id, category_id, name, slug, price_minor, stock, status, created_at) values
  ('d1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000a1',
   'f1000000-0000-0000-0000-000000000001', 'Manual Old', 'manual-old', 10000, 5, 'active', now() - interval '10 days'),
  ('d1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-0000000000a1',
   'f1000000-0000-0000-0000-000000000001', 'Manual New', 'manual-new', 10000, 5, 'active', now() - interval '9 days'),
  ('d1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-0000000000a1',
   'f1000000-0000-0000-0000-000000000001', 'Category Match', 'category-match', 10000, 5, 'active', now() - interval '8 days'),
  ('d1000000-0000-0000-0000-000000000004', 'e1000000-0000-0000-0000-0000000000a1',
   null, 'Tag Match', 'tag-match', 10000, 5, 'active', now() - interval '7 days'),
  ('d1000000-0000-0000-0000-000000000005', 'e1000000-0000-0000-0000-0000000000a1',
   null, 'Old Celebration', 'old-celebration', 10000, 5, 'active', now() - interval '12 days'),
  ('d1000000-0000-0000-0000-000000000006', 'e1000000-0000-0000-0000-0000000000a1',
   'f1000000-0000-0000-0000-000000000001', 'Draft Gift', 'draft-gift', 10000, 5, 'draft', now() - interval '6 days'),
  ('d1000000-0000-0000-0000-000000000007', 'e1000000-0000-0000-0000-0000000000b2',
   'f1000000-0000-0000-0000-000000000001', 'Pending Vendor Gift', 'pending-vendor-gift', 10000, 5, 'active', now() - interval '5 days'),
  ('d1000000-0000-0000-0000-000000000008', 'e1000000-0000-0000-0000-0000000000c3',
   'f1000000-0000-0000-0000-000000000001', 'Suspended Vendor Gift', 'suspended-vendor-gift', 10000, 5, 'active', now() - interval '4 days'),
  ('d1000000-0000-0000-0000-000000000009', 'e1000000-0000-0000-0000-0000000000d4',
   'f1000000-0000-0000-0000-000000000001', 'Paused Shop Gift', 'paused-shop-gift', 10000, 5, 'active', now() - interval '3 days'),
  ('d1000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-0000000000a1',
   'f1000000-0000-0000-0000-000000000002', 'Hidden Category Gift', 'hidden-category-gift', 10000, 5, 'active', now() - interval '2 days'),
  ('d1000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-0000000000a1',
   'f1000000-0000-0000-0000-000000000001', 'Newest Extra', 'newest-extra', 10000, 5, 'active', now() - interval '1 day'),
  ('d1000000-0000-0000-0000-00000000000c', 'e1000000-0000-0000-0000-0000000000a1',
   null, 'Tag Limit Probe', 'tag-limit-probe', 10000, 5, 'active', now() - interval '1 day'),
  ('d1000000-0000-0000-0000-00000000000d', 'e1000000-0000-0000-0000-0000000000a1',
   null, 'RPC Probe', 'rpc-probe', 10000, 5, 'active', now() - interval '1 day');

insert into public.product_tags (product_id, tag_id) values
  ('d1000000-0000-0000-0000-000000000003', 'f2000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000004', 'f2000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000005', 'f2000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-0000-0000-000000000006', 'f2000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000007', 'f2000000-0000-0000-0000-000000000001');

insert into public.occasions
  (id, name, slug, description, is_active, sort_order, match_mode) values
  ('c1000000-0000-0000-0000-000000000001', 'Manual Gifts', 'manual-gifts', 'Manual only', true, 1, 'manual'),
  ('c1000000-0000-0000-0000-000000000002', 'Automatic Gifts', 'automatic-gifts', 'Automatic only', true, 2, 'automatic'),
  ('c1000000-0000-0000-0000-000000000003', 'Hybrid Gifts', 'hybrid-gifts', 'Hybrid', true, 3, 'hybrid'),
  ('c1000000-0000-0000-0000-000000000004', 'Draft Gifts', 'draft-gifts', 'Draft', false, 4, 'hybrid');

insert into public.occasion_products (occasion_id, product_id, sort_order) values
  ('c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 0),
  ('c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 1),
  ('c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000006', 2),
  ('c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000007', 3),
  ('c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000008', 4),
  ('c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', 0),
  ('c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000004', 1),
  ('c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000006', 2),
  ('c1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', 0);

insert into public.occasion_categories (occasion_id, category_id) values
  ('c1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001');

insert into public.occasion_tags (occasion_id, tag_id) values
  ('c1000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000003', 'f2000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- TEST 1: anon reads only published occasions; draft stays hidden
-- ---------------------------------------------------------------------------

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int;
begin
  select count(*) into c from public.occasions;
  if c <> 3 then raise exception 'TEST 1 FAILED: anon saw % occasions', c; end if;
  if exists (select 1 from public.occasions where slug = 'draft-gifts') then
    raise exception 'TEST 1 FAILED: anon saw the draft occasion';
  end if;
  raise notice 'TEST 1 PASSED: anon reads only published occasions';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: anon cannot write occasions, tags, rules or associations
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    insert into public.occasions (name, slug) values ('Anon Occasion', 'anon-occasion');
    raise exception 'TEST 2A FAILED: anon inserted an occasion';
  exception when insufficient_privilege then
    raise notice 'TEST 2A PASSED: anon occasion insert denied';
  end;

  begin
    insert into public.tags (name, slug) values ('Anon Tag', 'anon-tag');
    raise exception 'TEST 2B FAILED: anon inserted a tag';
  exception when insufficient_privilege then
    raise notice 'TEST 2B PASSED: anon tag insert denied';
  end;

  begin
    insert into public.occasion_products (occasion_id, product_id)
    values ('c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001');
    raise exception 'TEST 2C FAILED: anon inserted a manual product';
  exception when insufficient_privilege then
    raise notice 'TEST 2C PASSED: anon association insert denied';
  end;

  begin
    update public.occasions set is_active = true
      where id = 'c1000000-0000-0000-0000-000000000004';
    if found then raise exception 'TEST 2D FAILED: anon updated an occasion'; end if;
  exception when insufficient_privilege then
    raise notice 'TEST 2D PASSED: anon occasion update denied';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: anon reads active tags only
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.tags where slug = 'birthday') then
    raise exception 'TEST 3 FAILED: anon cannot read an active tag';
  end if;
  if exists (select 1 from public.tags where slug = 'retired') then
    raise exception 'TEST 3 FAILED: anon saw an inactive tag';
  end if;
  raise notice 'TEST 3 PASSED: anon reads active tags only';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: admin creates occasions as drafts with collision-safe slugs
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
declare
  v_first_id  uuid;
  v_second_id uuid;
  v_status    boolean;
  v_slug      text;
begin
  insert into public.occasions (name) values ('Birthday Bash')
  returning id, slug, is_active into v_first_id, v_slug, v_status;
  if v_slug <> 'birthday-bash' or v_status then
    raise exception 'TEST 4 FAILED: first slug=% active=%', v_slug, v_status;
  end if;

  insert into public.occasions (name) values ('Birthday Bash')
  returning id, slug into v_second_id, v_slug;
  if v_slug <> 'birthday-bash-2' then
    raise exception 'TEST 4 FAILED: collision slug=%', v_slug;
  end if;

  insert into public.occasions (name, slug) values ('Explicit Case', 'EXPLICIT Case!')
  returning slug into v_slug;
  if v_slug <> 'explicit-case' then
    raise exception 'TEST 4 FAILED: explicit slug=%', v_slug;
  end if;

  update public.occasions set is_active = true where id = v_first_id;
  update public.occasions set is_active = false where id = v_first_id;
  delete from public.occasions where id in (v_first_id, v_second_id);
  if exists (select 1 from public.occasions where slug like 'birthday-bash%') then
    raise exception 'TEST 4 FAILED: admin delete did not remove test occasions';
  end if;
  raise notice 'TEST 4 PASSED: admin drafts, collision slugs and CRUD work';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: vendors cannot manage occasions, associations or global tags
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002"}';
do $$
begin
  begin
    insert into public.occasions (name, slug) values ('Vendor Occasion', 'vendor-occasion');
    raise exception 'TEST 5A FAILED: vendor inserted an occasion';
  exception when insufficient_privilege then
    raise notice 'TEST 5A PASSED: vendor occasion insert denied';
  end;

  update public.occasions set is_active = true
    where id = 'c1000000-0000-0000-0000-000000000004';
  if found then raise exception 'TEST 5B FAILED: vendor updated an occasion'; end if;

  delete from public.occasions
    where id = 'c1000000-0000-0000-0000-000000000004';
  if found then raise exception 'TEST 5C FAILED: vendor deleted an occasion'; end if;

  begin
    insert into public.occasion_products (occasion_id, product_id)
    values ('c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003');
    raise exception 'TEST 5D FAILED: vendor inserted a manual product';
  exception when insufficient_privilege then
    raise notice 'TEST 5D PASSED: vendor manual curation denied';
  end;

  begin
    insert into public.tags (name, slug) values ('Vendor Tag', 'vendor-tag');
    raise exception 'TEST 5E FAILED: vendor inserted a global tag';
  exception when insufficient_privilege then
    raise notice 'TEST 5E PASSED: vendor global tag insert denied';
  end;

  update public.tags set is_active = false
    where id = 'f2000000-0000-0000-0000-000000000001';
  if found then raise exception 'TEST 5F FAILED: vendor deactivated a global tag'; end if;

  delete from public.tags where id = 'f2000000-0000-0000-0000-000000000001';
  if found then raise exception 'TEST 5G FAILED: vendor deleted a global tag'; end if;

  raise notice 'TEST 5 PASSED: vendor occasion/tag administration denied';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: managers tag their own products; staff and other vendors cannot;
--         inactive tags are rejected
-- ---------------------------------------------------------------------------

do $$
declare n int;
begin
  insert into public.product_tags (product_id, tag_id)
  values ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000001');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 6A FAILED: manager inserted % tags', n; end if;
  raise notice 'TEST 6A PASSED: manager tags own product';
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004"}';
do $$
begin
  begin
    insert into public.product_tags (product_id, tag_id)
    values ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000002');
    raise exception 'TEST 6B FAILED: staff tagged a product';
  exception when insufficient_privilege then
    raise notice 'TEST 6B PASSED: staff tagging denied';
  end;
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000005';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000005"}';
do $$
begin
  begin
    insert into public.product_tags (product_id, tag_id)
    values ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000002');
    raise exception 'TEST 6C FAILED: cross-vendor tagging allowed';
  exception when insufficient_privilege then
    raise notice 'TEST 6C PASSED: cross-vendor tagging denied';
  end;
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002"}';
do $$
begin
  begin
    insert into public.product_tags (product_id, tag_id)
    values ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000003');
    raise exception 'TEST 6D FAILED: inactive tag assigned';
  exception when insufficient_privilege or check_violation then
    raise notice 'TEST 6D PASSED: inactive tag assignment denied';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 7: ten-tag ceiling, including direct inserts
-- ---------------------------------------------------------------------------

do $$
begin
  insert into public.product_tags (product_id, tag_id) values
    ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000101'),
    ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000102'),
    ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000103'),
    ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000104'),
    ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000105'),
    ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000106'),
    ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000107'),
    ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000108'),
    ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000109');

  begin
    insert into public.product_tags (product_id, tag_id)
    values ('d1000000-0000-0000-0000-00000000000d', 'f2000000-0000-0000-0000-000000000002');
    raise exception 'TEST 7A FAILED: eleventh tag accepted';
  exception when check_violation then
    raise notice 'TEST 7A PASSED: eleventh tag rejected';
  end;

  delete from public.product_tags
    where product_id = 'd1000000-0000-0000-0000-00000000000d';
  raise notice 'TEST 7 PASSED: manager removed own product tags';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 8: vendor tag suggestions, duplicate prevention and isolation
-- ---------------------------------------------------------------------------

do $$
declare
  v_id     uuid;
  v_slug   text;
  v_status public.tag_suggestion_status;
  v_by     uuid;
begin
  insert into public.tag_suggestions (vendor_id, name, description)
  values ('e1000000-0000-0000-0000-0000000000a1', 'Custom Wrapping', 'Gift wrap')
  returning id, normalized_slug, status, suggested_by
    into v_id, v_slug, v_status, v_by;

  if v_slug <> 'custom-wrapping' or v_status <> 'pending'
     or v_by <> 'a0000000-0000-0000-0000-000000000002' then
    raise exception 'TEST 8A FAILED: slug=% status=% by=%', v_slug, v_status, v_by;
  end if;
  if exists (select 1 from public.tags where slug = 'custom-wrapping') then
    raise exception 'TEST 8A FAILED: pending suggestion created a global tag';
  end if;

  insert into public.tag_suggestions (vendor_id, name)
  values ('e1000000-0000-0000-0000-0000000000a1', 'Disposable Idea');

  raise notice 'TEST 8A PASSED: pending suggestion normalized, no global tag';

  begin
    insert into public.tag_suggestions (vendor_id, name)
    values ('e1000000-0000-0000-0000-0000000000a1', ' custom   wrapping ');
    raise exception 'TEST 8B FAILED: duplicate pending suggestion accepted';
  exception when unique_violation then
    raise notice 'TEST 8B PASSED: duplicate pending suggestion rejected';
  end;

  begin
    insert into public.tag_suggestions (vendor_id, name)
    values ('e1000000-0000-0000-0000-0000000000b2', 'Cross Vendor Idea');
    raise exception 'TEST 8C FAILED: suggestion for another vendor accepted';
  exception when insufficient_privilege then
    raise notice 'TEST 8C PASSED: cross-vendor suggestion denied';
  end;

  begin
    update public.tag_suggestions set status = 'approved'
      where id = v_id;
    raise exception 'TEST 8D FAILED: vendor updated review state';
  exception when insufficient_privilege then
    raise notice 'TEST 8D PASSED: vendor review-state update denied';
  end;

  begin
    perform public.review_tag_suggestion(v_id, true, null);
    raise exception 'TEST 8E FAILED: vendor approved a suggestion';
  exception when insufficient_privilege then
    raise notice 'TEST 8E PASSED: vendor cannot approve suggestions';
  end;
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000007';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000007"}';
do $$
declare c int;
begin
  select count(*) into c from public.tag_suggestions
    where vendor_id = 'e1000000-0000-0000-0000-0000000000a1';
  if c <> 0 then raise exception 'TEST 8F FAILED: vendor D saw % of A suggestions', c; end if;

  insert into public.tag_suggestions (vendor_id, name)
  values ('e1000000-0000-0000-0000-0000000000d4', 'Custom Wrapping');
  raise notice 'TEST 8F PASSED: vendor D isolated but may suggest same term';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 9: admin approval reuses one global tag; rejection creates none
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
declare
  v_a_id   uuid;
  v_b_id   uuid;
  v_rej_id uuid;
  v_tag_a  uuid;
  v_tag_b  uuid;
  v_tag_count int;
begin
  select id into v_a_id from public.tag_suggestions
    where vendor_id = 'e1000000-0000-0000-0000-0000000000a1'
      and normalized_slug = 'custom-wrapping'
      and status = 'pending';
  select id into v_b_id from public.tag_suggestions
    where vendor_id = 'e1000000-0000-0000-0000-0000000000d4'
      and normalized_slug = 'custom-wrapping'
      and status = 'pending';

  v_tag_a := public.review_tag_suggestion(v_a_id, true, null);
  v_tag_b := public.review_tag_suggestion(v_b_id, true, null);

  if v_tag_a is null or v_tag_a <> v_tag_b then
    raise exception 'TEST 9A FAILED: approval did not reuse one tag (% / %)', v_tag_a, v_tag_b;
  end if;

  select count(*) into v_tag_count from public.tags
    where slug = 'custom-wrapping' and is_active;
  if v_tag_count <> 1 then
    raise exception 'TEST 9A FAILED: % global tags for one slug', v_tag_count;
  end if;

  if not exists (
    select 1 from public.tag_suggestions
     where id in (v_a_id, v_b_id)
       and status = 'approved'
       and reviewed_by = 'a0000000-0000-0000-0000-000000000001'
       and reviewed_at is not null
  ) then
    raise exception 'TEST 9A FAILED: approval audit fields missing';
  end if;
  raise notice 'TEST 9A PASSED: approvals reuse one active global tag';

  select id into v_rej_id from public.tag_suggestions
    where vendor_id = 'e1000000-0000-0000-0000-0000000000a1'
      and normalized_slug = 'disposable-idea'
      and status = 'pending';

  if public.review_tag_suggestion(v_rej_id, false, 'Too broad') is not null then
    raise exception 'TEST 9B FAILED: rejection returned a tag id';
  end if;
  if exists (select 1 from public.tags where slug = 'disposable-idea') then
    raise exception 'TEST 9B FAILED: rejection created a global tag';
  end if;
  if not exists (
    select 1 from public.tag_suggestions
     where id = v_rej_id
       and status = 'rejected'
       and rejection_reason = 'Too broad'
       and reviewed_by = 'a0000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'TEST 9B FAILED: rejection audit fields missing';
  end if;
  raise notice 'TEST 9B PASSED: rejection creates no tag and records the reason';

  begin
    perform public.review_tag_suggestion(v_a_id, true, null);
    raise exception 'TEST 9C FAILED: already-reviewed suggestion accepted';
  exception when check_violation then
    raise notice 'TEST 9C PASSED: already-reviewed suggestion rejected';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 10: manual mode returns only visible manual products, in order
-- ---------------------------------------------------------------------------

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_ids uuid[];
  r     record;
begin
  for r in select * from public.get_occasion_products(
    'c1000000-0000-0000-0000-000000000001', 24, 0
  ) loop
    v_ids := array_append(v_ids, r.id);
  end loop;

  if v_ids is distinct from array[
    'd1000000-0000-0000-0000-000000000002'::uuid,
    'd1000000-0000-0000-0000-000000000001'::uuid
  ] then
    raise exception 'TEST 10 FAILED: manual ids=%', v_ids;
  end if;
  raise notice 'TEST 10 PASSED: manual mode excludes drafts and inactive vendors';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 11: automatic mode unions category and tag matches, newest first
-- ---------------------------------------------------------------------------

do $$
declare
  v_ids uuid[];
  r     record;
begin
  for r in select * from public.get_occasion_products(
    'c1000000-0000-0000-0000-000000000002', 24, 0
  ) loop
    v_ids := array_append(v_ids, r.id);
  end loop;

  if v_ids is distinct from array[
    'd1000000-0000-0000-0000-00000000000b'::uuid,
    'd1000000-0000-0000-0000-000000000009'::uuid,
    'd1000000-0000-0000-0000-000000000004'::uuid,
    'd1000000-0000-0000-0000-000000000003'::uuid,
    'd1000000-0000-0000-0000-000000000002'::uuid,
    'd1000000-0000-0000-0000-000000000001'::uuid,
    'd1000000-0000-0000-0000-000000000005'::uuid
  ] then
    raise exception 'TEST 11 FAILED: automatic ids=%', v_ids;
  end if;

  if exists (
    select 1 from public.get_occasion_products(
      'c1000000-0000-0000-0000-000000000002', 24, 0
    ) where id in (
      'd1000000-0000-0000-0000-000000000006',
      'd1000000-0000-0000-0000-000000000007',
      'd1000000-0000-0000-0000-000000000008',
      'd1000000-0000-0000-0000-00000000000a'
    )
  ) then
    raise exception 'TEST 11 FAILED: ineligible product leaked into automatic results';
  end if;
  raise notice 'TEST 11 PASSED: automatic union/dedupe/newest-first and visibility hold';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 12: deactivating a tag removes it from matching and public reads
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
update public.tags set is_active = false
  where id = 'f2000000-0000-0000-0000-000000000002';

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int;
begin
  select count(*) into c from public.get_occasion_products(
    'c1000000-0000-0000-0000-000000000002', 24, 0
  );
  if c <> 6 then raise exception 'TEST 12 FAILED: automatic count=%', c; end if;

  if exists (
    select 1 from public.get_occasion_products(
      'c1000000-0000-0000-0000-000000000002', 24, 0
    ) where id = 'd1000000-0000-0000-0000-000000000005'
  ) then
    raise exception 'TEST 12 FAILED: inactive tag product still matched';
  end if;

  if exists (select 1 from public.tags where slug = 'celebration') then
    raise exception 'TEST 12 FAILED: inactive tag still publicly readable';
  end if;
  raise notice 'TEST 12 PASSED: inactive tag removed from matching and public reads';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 13: hybrid mode puts manual products first and deduplicates
-- ---------------------------------------------------------------------------

do $$
declare
  v_ids uuid[];
  v_manual boolean[];
  v_cat_count int;
  r record;
begin
  for r in select * from public.get_occasion_products(
    'c1000000-0000-0000-0000-000000000003', 24, 0
  ) loop
    v_ids := array_append(v_ids, r.id);
    v_manual := array_append(v_manual, r.is_manual);
  end loop;

  if v_ids is distinct from array[
    'd1000000-0000-0000-0000-000000000003'::uuid,
    'd1000000-0000-0000-0000-000000000004'::uuid,
    'd1000000-0000-0000-0000-00000000000b'::uuid,
    'd1000000-0000-0000-0000-000000000009'::uuid,
    'd1000000-0000-0000-0000-000000000002'::uuid,
    'd1000000-0000-0000-0000-000000000001'::uuid
  ] then
    raise exception 'TEST 13 FAILED: hybrid ids=%', v_ids;
  end if;

  if v_manual[1] is not true or v_manual[2] is not true
     or v_manual[3] is not false then
    raise exception 'TEST 13 FAILED: manual ordering flags=%', v_manual;
  end if;

  select count(*) into v_cat_count from public.get_occasion_products(
    'c1000000-0000-0000-0000-000000000003', 24, 0
  ) where id = 'd1000000-0000-0000-0000-000000000003';
  if v_cat_count <> 1 then
    raise exception 'TEST 13 FAILED: manual/category product duplicated % times', v_cat_count;
  end if;
  raise notice 'TEST 13 PASSED: hybrid manual priority, ordering and dedupe hold';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 14: draft occasions and draft products stay private
-- ---------------------------------------------------------------------------

do $$
declare c int;
begin
  select count(*) into c from public.get_occasion_products(
    'c1000000-0000-0000-0000-000000000004', 24, 0
  );
  if c <> 0 then raise exception 'TEST 14A FAILED: anon saw % draft products', c; end if;
  raise notice 'TEST 14A PASSED: draft occasion hidden from anon';
end $$;

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
declare
  c int;
  draft_count int;
begin
  select count(*) into c from public.get_occasion_products(
    'c1000000-0000-0000-0000-000000000004', 24, 0
  );
  if c <> 5 then raise exception 'TEST 14B FAILED: admin preview count=%', c; end if;

  select count(*) into draft_count from public.get_occasion_products(
    'c1000000-0000-0000-0000-000000000004', 24, 0
  ) where id = 'd1000000-0000-0000-0000-000000000006';
  if draft_count <> 0 then
    raise exception 'TEST 14B FAILED: admin preview included a draft product';
  end if;
  raise notice 'TEST 14B PASSED: admin previews the public-visible collection only';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 15: pagination is deterministic and total_count is consistent
-- ---------------------------------------------------------------------------

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare
  v_all uuid[];
  v_page uuid[];
  v_total bigint;
  v_offset int;
  r record;
begin
  for v_offset in 0..4 by 2 loop
    v_page := array[]::uuid[];
    for r in select * from public.get_occasion_products(
      'c1000000-0000-0000-0000-000000000002', 2, v_offset
    ) loop
      v_page := array_append(v_page, r.id);
      v_total := r.total_count;
    end loop;

    if cardinality(v_page) <> 2 then
      raise exception 'TEST 15 FAILED: page at % has % rows', v_offset, cardinality(v_page);
    end if;
    if v_total <> 6 then
      raise exception 'TEST 15 FAILED: total_count=% at offset %', v_total, v_offset;
    end if;
    v_all := v_all || v_page;
  end loop;

  if cardinality(v_all) <> 6 then
    raise exception 'TEST 15 FAILED: paginated rows=%', cardinality(v_all);
  end if;
  if (select count(distinct x) from unnest(v_all) x) <> 6 then
    raise exception 'TEST 15 FAILED: pages overlap';
  end if;

  select count(*) into v_total from public.get_occasion_products(
    'c1000000-0000-0000-0000-000000000002', 100, 0
  );
  if v_total <> 6 then
    raise exception 'TEST 15 FAILED: full scan count=%', v_total;
  end if;
  raise notice 'TEST 15 PASSED: pagination is disjoint and counts are consistent';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 16: slug redirects persist, resolve for anon, and never shadow a
--          current slug; draft redirects stay private
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
declare
  v_slug text;
begin
  update public.occasions
     set slug = 'Manual Picks!'
   where id = 'c1000000-0000-0000-0000-000000000001'
   returning slug into v_slug;
  if v_slug <> 'manual-picks' then
    raise exception 'TEST 16A FAILED: normalized slug=%', v_slug;
  end if;
  if not exists (
    select 1 from public.occasion_slug_redirects
     where old_slug = 'manual-gifts'
       and occasion_id = 'c1000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'TEST 16A FAILED: old slug redirect missing';
  end if;
  raise notice 'TEST 16A PASSED: slug rename records the old slug';

  begin
    insert into public.occasion_slug_redirects (old_slug, occasion_id)
    values ('manual-picks', 'c1000000-0000-0000-0000-000000000001');
    raise exception 'TEST 16B FAILED: redirect shadowed a current slug';
  exception when check_violation then
    raise notice 'TEST 16B PASSED: redirect cannot shadow a current slug';
  end;

  update public.occasions
     set slug = 'manual-gifts'
   where id = 'c1000000-0000-0000-0000-000000000001';

  if exists (
    select 1 from public.occasion_slug_redirects
     where old_slug = 'manual-gifts'
  ) then
    raise exception 'TEST 16C FAILED: current slug still exists as a redirect';
  end if;
  if not exists (
    select 1 from public.occasion_slug_redirects
     where old_slug = 'manual-picks'
       and occasion_id = 'c1000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'TEST 16C FAILED: cycle did not record the previous slug';
  end if;
  raise notice 'TEST 16C PASSED: current slug takes precedence in a slug cycle';

  update public.occasions
     set slug = 'draft-gifts-old'
   where id = 'c1000000-0000-0000-0000-000000000004';

  update public.occasions
     set slug = 'manual-picks'
   where id = 'c1000000-0000-0000-0000-000000000003';
end $$;

-- The third occasion currently has a redirect for manual-picks; a new current
-- slug must avoid it, so the edit above must have produced a collision suffix.
do $$
declare s text;
begin
  select slug into s from public.occasions
    where id = 'c1000000-0000-0000-0000-000000000003';
  if s not like 'manual-picks%' or s = 'manual-picks' then
    raise exception 'TEST 16D FAILED: redirect collision slug=%', s;
  end if;
  raise notice 'TEST 16D PASSED: new slugs avoid other occasions'' redirects';
end $$;

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int;
begin
  select count(*) into c
    from public.occasion_slug_redirects r
    join public.occasions o on o.id = r.occasion_id
   where r.old_slug = 'manual-picks' and o.is_active;
  if c <> 1 then raise exception 'TEST 16E FAILED: anon redirect count=%', c; end if;

  select count(*) into c
    from public.occasion_slug_redirects
   where old_slug = 'draft-gifts';
  if c <> 0 then raise exception 'TEST 16E FAILED: anon saw a draft redirect'; end if;
  raise notice 'TEST 16E PASSED: anon resolves only published occasion redirects';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 17: admin-only curation RPCs and manual ordering replacement
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002"}';
do $$
begin
  begin
    perform public.replace_occasion_products(
      'c1000000-0000-0000-0000-000000000001', '{}'::uuid[]);
    raise exception 'TEST 17A FAILED: vendor replaced occasion products';
  exception when insufficient_privilege then
    raise notice 'TEST 17A PASSED: vendor curation RPC denied';
  end;

  begin
    perform public.reorder_occasions(array['c1000000-0000-0000-0000-000000000001']::uuid[]);
    raise exception 'TEST 17B FAILED: vendor reordered occasions';
  exception when insufficient_privilege then
    raise notice 'TEST 17B PASSED: vendor reorder RPC denied';
  end;
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
declare n int; ord int;
begin
  perform public.replace_occasion_products(
    'c1000000-0000-0000-0000-000000000001',
    array[
      'd1000000-0000-0000-0000-000000000001',
      'd1000000-0000-0000-0000-000000000001',
      'd1000000-0000-0000-0000-000000000002'
    ]::uuid[]
  );
  select count(*) into n from public.occasion_products
    where occasion_id = 'c1000000-0000-0000-0000-000000000001';
  if n <> 2 then raise exception 'TEST 17C FAILED: rows=%', n; end if;

  select sort_order into ord from public.occasion_products
    where occasion_id = 'c1000000-0000-0000-0000-000000000001'
      and product_id = 'd1000000-0000-0000-0000-000000000001';
  if ord <> 0 then raise exception 'TEST 17C FAILED: first sort_order=%', ord; end if;
  raise notice 'TEST 17C PASSED: manual replacement dedupes and preserves order';

  perform public.replace_occasion_categories(
    'c1000000-0000-0000-0000-000000000002',
    array[
      'f1000000-0000-0000-0000-000000000001',
      'f1000000-0000-0000-0000-000000000001',
      'f1000000-0000-0000-0000-000000000002'
    ]::uuid[]
  );
  select count(*) into n from public.occasion_categories
    where occasion_id = 'c1000000-0000-0000-0000-000000000002';
  if n <> 2 then raise exception 'TEST 17D FAILED: category rows=%', n; end if;

  begin
    perform public.replace_occasion_tags(
      'c1000000-0000-0000-0000-000000000002',
      array['f2000000-0000-0000-0000-000000000003']::uuid[]);
    raise exception 'TEST 17E FAILED: inactive tag used as a rule';
  exception when check_violation then
    raise notice 'TEST 17E PASSED: inactive occasion tags rejected';
  end;

  perform public.replace_occasion_tags(
    'c1000000-0000-0000-0000-000000000002',
    array['f2000000-0000-0000-0000-000000000001']::uuid[]);
  select count(*) into n from public.occasion_tags
    where occasion_id = 'c1000000-0000-0000-0000-000000000002';
  if n <> 1 then raise exception 'TEST 17F FAILED: tag rows=%', n; end if;
  raise notice 'TEST 17D-F PASSED: category/tag rule replacement is deduped and validated';

  perform public.reorder_occasions(array[
    'c1000000-0000-0000-0000-000000000003',
    'c1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000004'
  ]::uuid[]);
  select sort_order into ord from public.occasions
    where id = 'c1000000-0000-0000-0000-000000000003';
  if ord <> 0 then raise exception 'TEST 17G FAILED: reordered first=%', ord; end if;
  raise notice 'TEST 17G PASSED: admin reorder RPC applies array order';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 18: replace_product_tags ownership, active-tag and ten-tag rules
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002"}';
do $$
declare n int;
begin
  perform public.replace_product_tags(
    'd1000000-0000-0000-0000-00000000000d',
    array[
      'f2000000-0000-0000-0000-000000000001',
      'f2000000-0000-0000-0000-000000000101'
    ]::uuid[]
  );
  select count(*) into n from public.product_tags
    where product_id = 'd1000000-0000-0000-0000-00000000000d';
  if n <> 2 then raise exception 'TEST 18A FAILED: rows=%', n; end if;
  raise notice 'TEST 18A PASSED: manager replaces own product tags';

  begin
    perform public.replace_product_tags(
      'd1000000-0000-0000-0000-00000000000d',
      array[
        'f2000000-0000-0000-0000-000000000001',
        'f2000000-0000-0000-0000-000000000101',
        'f2000000-0000-0000-0000-000000000102',
        'f2000000-0000-0000-0000-000000000103',
        'f2000000-0000-0000-0000-000000000104',
        'f2000000-0000-0000-0000-000000000105',
        'f2000000-0000-0000-0000-000000000106',
        'f2000000-0000-0000-0000-000000000107',
        'f2000000-0000-0000-0000-000000000108',
        'f2000000-0000-0000-0000-000000000109',
        'f2000000-0000-0000-0000-00000000010a'
      ]::uuid[]
    );
    raise exception 'TEST 18B FAILED: eleven tags accepted by RPC';
  exception when check_violation then
    raise notice 'TEST 18B PASSED: replacement RPC enforces ten tags';
  end;

  begin
    perform public.replace_product_tags(
      'd1000000-0000-0000-0000-00000000000d',
      array['f2000000-0000-0000-0000-000000000003']::uuid[]);
    raise exception 'TEST 18C FAILED: inactive tag accepted by RPC';
  exception when check_violation then
    raise notice 'TEST 18C PASSED: replacement RPC rejects inactive tags';
  end;
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004"}';
do $$
begin
  begin
    perform public.replace_product_tags(
      'd1000000-0000-0000-0000-00000000000d', '{}'::uuid[]);
    raise exception 'TEST 18D FAILED: staff replaced product tags';
  exception when insufficient_privilege then
    raise notice 'TEST 18D PASSED: staff replacement denied';
  end;
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000005';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000005"}';
do $$
begin
  begin
    perform public.replace_product_tags(
      'd1000000-0000-0000-0000-00000000000d', '{}'::uuid[]);
    raise exception 'TEST 18E FAILED: cross-vendor replacement allowed';
  exception when insufficient_privilege then
    raise notice 'TEST 18E PASSED: cross-vendor replacement denied';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 19: deleting configuration preserves products, categories and tags
-- ---------------------------------------------------------------------------

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
begin
  delete from public.occasion_products
    where occasion_id = 'c1000000-0000-0000-0000-000000000003'
      and product_id = 'd1000000-0000-0000-0000-000000000003';
  if not exists (
    select 1 from public.products
     where id = 'd1000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'TEST 19A FAILED: association deletion removed a product';
  end if;

  delete from public.occasion_categories
    where occasion_id = 'c1000000-0000-0000-0000-000000000002'
      and category_id = 'f1000000-0000-0000-0000-000000000001';
  if not exists (
    select 1 from public.categories
     where id = 'f1000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'TEST 19A FAILED: rule deletion removed a category';
  end if;

  delete from public.occasion_tags
    where occasion_id = 'c1000000-0000-0000-0000-000000000002'
      and tag_id = 'f2000000-0000-0000-0000-000000000001';
  if not exists (
    select 1 from public.tags
     where id = 'f2000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'TEST 19A FAILED: rule deletion removed a tag';
  end if;
  raise notice 'TEST 19A PASSED: association deletion preserves marketplace entities';

  delete from public.occasions
    where id = 'c1000000-0000-0000-0000-000000000004';
  if not exists (
    select 1 from public.products
     where id = 'd1000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'TEST 19B FAILED: occasion deletion removed a product';
  end if;
  if exists (
    select 1 from public.occasion_slug_redirects
     where occasion_id = 'c1000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'TEST 19B FAILED: redirects survived occasion deletion';
  end if;
  raise notice 'TEST 19B PASSED: occasion deletion preserves products and cascades redirects';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 20: table grants are least-privilege
-- ---------------------------------------------------------------------------

do $$
begin
  if has_table_privilege('anon', 'public.occasions', 'insert') then
    raise exception 'TEST 20 FAILED: anon has occasions INSERT';
  end if;
  if has_table_privilege('anon', 'public.tags', 'insert') then
    raise exception 'TEST 20 FAILED: anon has tags INSERT';
  end if;
  if has_table_privilege('authenticated', 'public.product_tags', 'update') then
    raise exception 'TEST 20 FAILED: authenticated has product_tags UPDATE';
  end if;
  if has_table_privilege('authenticated', 'public.tag_suggestions', 'update') then
    raise exception 'TEST 20 FAILED: authenticated has tag_suggestions UPDATE';
  end if;
  if has_column_privilege('authenticated', 'public.tag_suggestions', 'status', 'insert') then
    raise exception 'TEST 20 FAILED: authenticated may insert suggestion status';
  end if;
  if not has_table_privilege('anon', 'public.occasions', 'select') then
    raise exception 'TEST 20 FAILED: anon cannot select occasions';
  end if;
  raise notice 'TEST 20 PASSED: least-privilege table/column grants hold';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 21: occasion-images storage configuration and policies
-- ---------------------------------------------------------------------------

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('occasion-images',
            'c1000000-0000-0000-0000-000000000001/anon.jpg');
    raise exception 'TEST 21A FAILED: anon uploaded an occasion image';
  exception when insufficient_privilege then
    raise notice 'TEST 21A PASSED: anon upload denied';
  end;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002"}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('occasion-images',
            'c1000000-0000-0000-0000-000000000001/vendor.jpg',
            auth.uid());
    raise exception 'TEST 21B FAILED: vendor uploaded an occasion image';
  exception when insufficient_privilege then
    raise notice 'TEST 21B PASSED: vendor upload denied';
  end;
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('occasion-images',
            '00000000-0000-0000-0000-000000000000/admin.jpg',
            auth.uid());
    raise exception 'TEST 21C FAILED: admin uploaded into an unknown occasion';
  exception when insufficient_privilege then
    raise notice 'TEST 21C PASSED: unknown occasion folder denied';
  end;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('occasion-images',
            'c1000000-0000-0000-0000-000000000001/sub/admin.jpg',
            auth.uid());
    raise exception 'TEST 21D FAILED: nested path accepted';
  exception when insufficient_privilege then
    raise notice 'TEST 21D PASSED: nested object path denied';
  end;

  insert into storage.objects (bucket_id, name, owner)
  values ('occasion-images',
          'c1000000-0000-0000-0000-000000000001/admin.jpg',
          auth.uid());
  raise notice 'TEST 21E PASSED: admin uploads into an existing occasion folder';
end $$;

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int;
begin
  select count(*) into c from storage.objects
    where bucket_id = 'occasion-images';
  if c < 1 then raise exception 'TEST 21F FAILED: anon saw % objects', c; end if;
  raise notice 'TEST 21F PASSED: anon reads public occasion images';
end $$;

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002"}';
do $$
declare n int;
begin
  delete from storage.objects
    where bucket_id = 'occasion-images'
      and name = 'c1000000-0000-0000-0000-000000000001/admin.jpg';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 21G FAILED: vendor deleted % objects', n; end if;
  raise notice 'TEST 21G PASSED: vendor deletion filtered';
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
declare n int;
begin
  delete from storage.objects
    where bucket_id = 'occasion-images'
      and name = 'c1000000-0000-0000-0000-000000000001/admin.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 21H FAILED: admin deleted % objects', n; end if;
  raise notice 'TEST 21H PASSED: admin deletes occasion images';
end $$;

do $$
declare
  v_public boolean;
  v_size   bigint;
  v_types  text[];
begin
  select public, file_size_limit, allowed_mime_types
    into v_public, v_size, v_types
    from storage.buckets
   where id = 'occasion-images';

  if not v_public then raise exception 'TEST 21I FAILED: bucket is not public'; end if;
  if v_size <> 5 * 1024 * 1024 then
    raise exception 'TEST 21I FAILED: file_size_limit=%', v_size;
  end if;
  if not ('image/jpeg' = any(v_types))
     or not ('image/png' = any(v_types))
     or not ('image/webp' = any(v_types)) then
    raise exception 'TEST 21I FAILED: allowed_mime_types=%', v_types;
  end if;
  if 'image/avif' = any(v_types) then
    raise exception 'TEST 21I FAILED: AVIF unexpectedly allowed';
  end if;
  raise notice 'TEST 21I PASSED: bucket settings match the occasion media policy';
end $$;

reset role;

rollback;
