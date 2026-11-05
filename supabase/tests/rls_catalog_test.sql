-- Gifto Phase 3+ verification: catalog RLS (categories, products, product_images)
-- plus the product-images storage policies (migration 9).
-- Runs after all migrations against a bare `supabase/postgres` container with
-- supabase/tests/storage_stub.sql applied first (the raw image has no storage
-- schema; hosted projects already have one).
-- Same request-context simulation as the other suites. Any failure RAISEs and,
-- with `psql -v ON_ERROR_STOP=1`, aborts non-zero.

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
-- Seed (as superuser; bypasses RLS to create fixtures)
-- ---------------------------------------------------------------------------
delete from public.products where vendor_id in (
  'e1000000-0000-0000-0000-0000000000aa',
  'e2000000-0000-0000-0000-0000000000bb'
);
delete from public.categories where slug in ('gift-boxes', 'hidden-cat', 'admin-added');
delete from public.vendors where id in (
  'e1000000-0000-0000-0000-0000000000aa',
  'e2000000-0000-0000-0000-0000000000bb'
);
delete from auth.users where email like '%@catalog.gifto.test';
-- storage.objects survives the per-suite `drop schema public`; clear the
-- bucket so re-runs do not collide on (bucket_id, name).
delete from storage.objects where bucket_id = 'product-images';

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-00000000000a', 'manager-a@catalog.gifto.test'),
  ('a2000000-0000-0000-0000-00000000000a', 'staff-a@catalog.gifto.test'),
  ('b1000000-0000-0000-0000-00000000000b', 'manager-b@catalog.gifto.test'),
  ('c1000000-0000-0000-0000-00000000000c', 'admin@catalog.gifto.test');

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = 'c1000000-0000-0000-0000-00000000000c';
alter table public.profiles enable trigger profiles_protect_platform_admin;

-- Vendor A is active (public); vendor B is pending (not public).
insert into public.vendors (id, name, slug, status) values
  ('e1000000-0000-0000-0000-0000000000aa', 'Shop A', 'shop-a', 'active'),
  ('e2000000-0000-0000-0000-0000000000bb', 'Shop B', 'shop-b', 'pending');

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('e1000000-0000-0000-0000-0000000000aa', 'a1000000-0000-0000-0000-00000000000a', 'owner'),
  ('e1000000-0000-0000-0000-0000000000aa', 'a2000000-0000-0000-0000-00000000000a', 'staff'),
  ('e2000000-0000-0000-0000-0000000000bb', 'b1000000-0000-0000-0000-00000000000b', 'owner');

insert into public.categories (id, name, slug, is_active) values
  ('f1000000-0000-0000-0000-0000000000aa', 'Gift Boxes', 'gift-boxes', true),
  ('f2000000-0000-0000-0000-0000000000bb', 'Hidden Category', 'hidden-cat', false);

insert into public.products
  (id, vendor_id, category_id, name, slug, price_minor, stock, status) values
  ('d1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-0000000000aa',
   'f1000000-0000-0000-0000-0000000000aa', 'A Public Gift', 'a-public-gift', 15000, 3, 'active'),
  ('d2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-0000000000aa',
   null, 'A Secret Draft', 'a-secret-draft', 5000, 0, 'draft'),
  ('d3000000-0000-0000-0000-000000000003', 'e2000000-0000-0000-0000-0000000000bb',
   null, 'B Hidden Public', 'b-hidden-public', 20000, 5, 'active'),
  ('d4000000-0000-0000-0000-000000000004', 'e2000000-0000-0000-0000-0000000000bb',
   null, 'B Secret Draft', 'b-secret-draft', 9000, 0, 'draft');

insert into public.product_images (product_id, path, alt, position) values
  ('d1000000-0000-0000-0000-000000000001', 'public/img-a1.jpg', 'A public', 0),
  ('d2000000-0000-0000-0000-000000000002', 'public/img-a2.jpg', 'A draft', 0),
  ('d3000000-0000-0000-0000-000000000003', 'public/img-b3.jpg', 'B pending', 0);

-- ---------------------------------------------------------------------------
-- TEST 1: anon reads active categories only
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int;
begin
  select count(*) into c from public.categories;
  if c <> 1 then raise exception 'TEST 1 FAILED: anon saw % categories', c; end if;
  if not exists (select 1 from public.categories where slug = 'gift-boxes') then
    raise exception 'TEST 1 FAILED: anon missing active category';
  end if;
  raise notice 'TEST 1 PASSED: anon reads only active categories';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: anon sees only the active product of an active vendor
-- ---------------------------------------------------------------------------
do $$
declare c int;
begin
  select count(*) into c from public.products;
  if c <> 1 then raise exception 'TEST 2 FAILED: anon saw % products', c; end if;
  if not exists (select 1 from public.products where slug = 'a-public-gift') then
    raise exception 'TEST 2 FAILED: anon missing active product';
  end if;
  if exists (select 1 from public.products where slug = 'b-hidden-public') then
    raise exception 'TEST 2 FAILED: anon saw product of pending vendor';
  end if;
  raise notice 'TEST 2 PASSED: anon sees only public products';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: anon sees price/stock, and only public product images
-- ---------------------------------------------------------------------------
do $$
declare p numeric; s int; img int;
begin
  select price_minor, stock into p, s from public.products where slug = 'a-public-gift';
  if p <> 15000 or s <> 3 then raise exception 'TEST 3 FAILED: p=% s=%', p, s; end if;
  select count(*) into img from public.product_images;
  if img <> 1 then raise exception 'TEST 3 FAILED: anon saw % images', img; end if;
  raise notice 'TEST 3 PASSED: anon reads price/stock and public images only';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: anon cannot write the catalog
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.products (vendor_id, name, price_minor)
    values ('e1000000-0000-0000-0000-0000000000aa', 'Anon Product', 100);
    raise exception 'TEST 4 FAILED: anon inserted a product';
  exception when insufficient_privilege then
    raise notice 'TEST 4 PASSED: anon cannot insert products';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: a manager creates a product; slug is derived and unique per vendor
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'a1000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-00000000000a"}';
do $$
declare p1 uuid; p2 uuid; s1 text; s2 text; st public.product_status;
begin
  insert into public.products (vendor_id, category_id, name, price_minor, stock)
  values ('e1000000-0000-0000-0000-0000000000aa',
          'f1000000-0000-0000-0000-0000000000aa', 'Handmade Gift', 12000, 2)
  returning id into p1;
  insert into public.products (vendor_id, name, price_minor, stock)
  values ('e1000000-0000-0000-0000-0000000000aa', 'Handmade Gift', 13000, 4)
  returning id into p2;

  select slug, status into s1, st from public.products where id = p1;
  select slug into s2 from public.products where id = p2;
  if s1 <> 'handmade-gift' then raise exception 'TEST 5 FAILED: slug=%', s1; end if;
  if s2 <> 'handmade-gift-2' then raise exception 'TEST 5 FAILED: slug2=%', s2; end if;
  if st <> 'draft' then raise exception 'TEST 5 FAILED: default status=%', st; end if;
  raise notice 'TEST 5 PASSED: manager created products with derived unique slugs';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: a manager can publish/edit their own product; stock is RPC-only
-- ---------------------------------------------------------------------------
do $$
declare st public.product_status; p int; s int; pid uuid;
begin
  if has_column_privilege('authenticated', 'public.products', 'vendor_id', 'update') then
    raise exception 'TEST 6 FAILED: authenticated has table-wide products UPDATE';
  end if;
  if has_column_privilege('authenticated', 'public.products', 'stock', 'update') then
    raise exception 'TEST 6 FAILED: authenticated may update products.stock';
  end if;

  update public.products
    set status = 'active', price_minor = 17500
    where slug = 'handmade-gift';
  select id, status, price_minor, stock into pid, st, p, s
    from public.products where slug = 'handmade-gift';
  if st <> 'active' or p <> 17500 or s <> 2 then
    raise exception 'TEST 6 FAILED: st=% p=% s=%', st, p, s; end if;

  begin
    update public.products set stock = 6 where id = pid;
    raise exception 'TEST 6 FAILED: direct stock update was allowed';
  exception when insufficient_privilege then
    null;
  end;

  perform public.adjust_product_stock(pid, 4, 'catalog test restock');
  select stock into s from public.products where id = pid;
  if s <> 6 then raise exception 'TEST 6 FAILED: stock after RPC=%', s; end if;
  raise notice 'TEST 6 PASSED: manager edited product; stock only via audited RPC';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 7: a manager cannot create a product for another vendor
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.products (vendor_id, name, price_minor)
    values ('e2000000-0000-0000-0000-0000000000bb', 'Hijack', 100);
    raise exception 'TEST 7 FAILED: created a product for another vendor';
  exception when insufficient_privilege then
    raise notice 'TEST 7 PASSED: cross-vendor product insert denied';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 8: a staff member cannot create products
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'a2000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-00000000000a"}';
do $$
begin
  begin
    insert into public.products (vendor_id, name, price_minor)
    values ('e1000000-0000-0000-0000-0000000000aa', 'Staff Product', 100);
    raise exception 'TEST 8 FAILED: staff created a product';
  exception when insufficient_privilege then
    raise notice 'TEST 8 PASSED: staff cannot create products';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 9: vendor isolation — A cannot read B's draft, but can read B's active
--          product once it is public-facing? (B's vendor is pending, so no.)
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'a1000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-00000000000a"}';
do $$
declare c int;
begin
  select count(*) into c from public.products
    where vendor_id = 'e2000000-0000-0000-0000-0000000000bb';
  if c <> 0 then raise exception 'TEST 9 FAILED: A saw % of B''s products', c; end if;
  raise notice 'TEST 9 PASSED: vendor isolation holds';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 10: a manager cannot insert images for another vendor's product
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.product_images (product_id, path)
    values ('d3000000-0000-0000-0000-000000000003', 'public/hack.jpg');
    raise exception 'TEST 10 FAILED: inserted image for another vendor';
  exception when insufficient_privilege then
    raise notice 'TEST 10 PASSED: cross-vendor image insert denied';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 11: a manager manages their own product images
-- ---------------------------------------------------------------------------
do $$
declare n int; own uuid;
begin
  select id into own from public.products where slug = 'handmade-gift';
  insert into public.product_images (product_id, path, alt, position)
  values (own, 'public/img-handmade.jpg', 'Handmade', 0);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 11 FAILED: inserted % rows', n; end if;

  update public.product_images set alt = 'Updated alt' where path = 'public/img-handmade.jpg';
  delete from public.product_images where path = 'public/img-handmade.jpg';
  raise notice 'TEST 11 PASSED: manager manages own product images';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 12: the newly published product is now visible to anon
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int;
begin
  select count(*) into c from public.products where slug = 'handmade-gift';
  if c <> 1 then raise exception 'TEST 12 FAILED: anon saw % of published product', c; end if;
  raise notice 'TEST 12 PASSED: published product visible to anon';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 13: a non-admin cannot manage categories
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'a1000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-00000000000a"}';
do $$
begin
  begin
    insert into public.categories (name, slug) values ('Sneaky', 'sneaky');
    raise exception 'TEST 13 FAILED: non-admin created a category';
  exception when insufficient_privilege then
    raise notice 'TEST 13 PASSED: non-admin cannot manage categories';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 14: a platform admin can read all products and moderate categories
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'c1000000-0000-0000-0000-00000000000c';
set request.jwt.claims = '{"sub":"c1000000-0000-0000-0000-00000000000c"}';
do $$
declare c int; hidden boolean;
begin
  select count(*) into c from public.products;
  if c < 6 then raise exception 'TEST 14 FAILED: admin saw only % products', c; end if;

  insert into public.categories (name, slug) values ('Admin Added', 'admin-added');
  update public.categories set is_active = false where slug = 'gift-boxes';
  select is_active into hidden from public.categories where slug = 'gift-boxes';
  if hidden then raise exception 'TEST 14 FAILED: admin could not deactivate category'; end if;
  raise notice 'TEST 14 PASSED: admin reads all products and moderates categories';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 15: deactivated category disappears from the public surface
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
begin
  if exists (select 1 from public.categories where slug = 'gift-boxes') then
    raise exception 'TEST 15 FAILED: deactivated category still visible to anon';
  end if;
  if not exists (select 1 from public.categories where slug = 'admin-added') then
    raise exception 'TEST 15 FAILED: newly added active category missing from public';
  end if;
  raise notice 'TEST 15 PASSED: deactivated category hidden, new active one visible';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 16: a manager uploads an object into their own vendor folder
-- (requires the storage schema — apply supabase/tests/storage_stub.sql first
-- in the local container workflow; hosted storage already exists.)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'a1000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-00000000000a"}';
do $$
declare n int;
begin
  insert into storage.objects (bucket_id, name, owner)
  values ('product-images',
          'e1000000-0000-0000-0000-0000000000aa/d1000000-0000-0000-0000-000000000001/img-upload.jpg',
          auth.uid());
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 16 FAILED: inserted % rows', n; end if;
  raise notice 'TEST 16 PASSED: manager uploaded into own vendor folder';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 17: staff, cross-vendor managers, and unknown products cannot upload
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'a2000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-00000000000a"}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('product-images',
            'e1000000-0000-0000-0000-0000000000aa/d1000000-0000-0000-0000-000000000001/staff.jpg',
            auth.uid());
    raise exception 'TEST 17A FAILED: staff uploaded an object';
  exception when insufficient_privilege then
    raise notice 'TEST 17A PASSED: staff upload denied';
  end;
end $$;

set request.jwt.claim.sub = 'b1000000-0000-0000-0000-00000000000b';
set request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-00000000000b"}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('product-images',
            'e1000000-0000-0000-0000-0000000000aa/d1000000-0000-0000-0000-000000000001/hijack.jpg',
            auth.uid());
    raise exception 'TEST 17B FAILED: cross-vendor upload allowed';
  exception when insufficient_privilege then
    raise notice 'TEST 17B PASSED: cross-vendor upload denied';
  end;
end $$;

set request.jwt.claim.sub = 'a1000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-00000000000a"}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('product-images',
            'e1000000-0000-0000-0000-0000000000aa/00000000-0000-0000-0000-000000000000/ghost.jpg',
            auth.uid());
    raise exception 'TEST 17C FAILED: upload for unknown product allowed';
  exception when insufficient_privilege then
    raise notice 'TEST 17C PASSED: unknown-product upload denied';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 18: anon cannot upload but can read the public bucket
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
    values ('product-images', 'x/y/anon.jpg');
    raise exception 'TEST 18A FAILED: anon uploaded an object';
  exception when insufficient_privilege then
    raise notice 'TEST 18A PASSED: anon upload denied';
  end;
end $$;
do $$
declare c int;
begin
  select count(*) into c from storage.objects where bucket_id = 'product-images';
  if c < 1 then raise exception 'TEST 18B FAILED: anon saw % objects', c; end if;
  raise notice 'TEST 18B PASSED: anon reads public bucket';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 19: pending owners cannot write/delete storage; active owners can delete
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'b1000000-0000-0000-0000-00000000000b';
set request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-00000000000b"}';
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('product-images',
            'e2000000-0000-0000-0000-0000000000bb/d3000000-0000-0000-0000-000000000003/b-shop.jpg',
            auth.uid());
    raise exception 'TEST 19A FAILED: pending owner uploaded an object';
  exception when insufficient_privilege then
    raise notice 'TEST 19A PASSED: pending owner upload denied';
  end;
end $$;
do $$
declare n int;
begin
  delete from storage.objects
    where name = 'e1000000-0000-0000-0000-0000000000aa/d1000000-0000-0000-0000-000000000001/img-upload.jpg';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 19B FAILED: cross-vendor delete removed % rows', n; end if;
  if not exists (
    select 1 from storage.objects
      where name = 'e1000000-0000-0000-0000-0000000000aa/d1000000-0000-0000-0000-000000000001/img-upload.jpg'
  ) then
    raise exception 'TEST 19B FAILED: object disappeared';
  end if;
  raise notice 'TEST 19B PASSED: pending/cross-vendor delete filtered by RLS';
end $$;

set request.jwt.claim.sub = 'a1000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-00000000000a"}';
do $$
declare n int;
begin
  delete from storage.objects
    where name = 'e1000000-0000-0000-0000-0000000000aa/d1000000-0000-0000-0000-000000000001/img-upload.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 19C FAILED: active owner deleted % rows', n; end if;
  raise notice 'TEST 19C PASSED: active owner deletes own object';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 20: pending owners cannot delete catalog rows; active owners can
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'b1000000-0000-0000-0000-00000000000b';
set request.jwt.claims = '{"sub":"b1000000-0000-0000-0000-00000000000b"}';
do $$
declare n int; pname text;
begin
  update public.products set name = 'Pending Rename'
    where id = 'd4000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 20A FAILED: pending owner updated % products', n; end if;
  select name into pname from public.products
    where id = 'd4000000-0000-0000-0000-000000000004';
  if pname <> 'B Secret Draft' then
    raise exception 'TEST 20A FAILED: pending owner changed name to %', pname;
  end if;

  delete from public.products
    where id = 'd4000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 20A FAILED: pending owner deleted % products', n; end if;
  if not exists (
    select 1 from public.products
      where id = 'd4000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'TEST 20A FAILED: pending owner product disappeared';
  end if;

  delete from public.product_images
    where product_id = 'd3000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 20A FAILED: pending owner deleted % images', n; end if;

  begin
    perform public.adjust_product_stock(
      'd3000000-0000-0000-0000-000000000003', -1, null);
    raise exception 'TEST 20A FAILED: pending owner adjusted stock';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 20A PASSED: pending owner product/image/stock writes denied';
end $$;

set request.jwt.claim.sub = 'a1000000-0000-0000-0000-00000000000a';
set request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-00000000000a"}';
do $$
declare n int;
begin
  delete from public.products
    where id = 'd2000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 20B FAILED: active owner deleted % products', n; end if;
  raise notice 'TEST 20B PASSED: active owner deletes own product';
end $$;

reset role;

rollback;
