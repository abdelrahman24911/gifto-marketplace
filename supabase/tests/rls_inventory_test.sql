-- Gifto Phase 7 verification: manual stock adjustments.
-- Runs after all migrations (1–18) against a bare `supabase/postgres` container.
-- Any failure RAISEs and, with `psql -v ON_ERROR_STOP=1`, aborts non-zero.

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
delete from public.inventory_movements;
delete from public.products where vendor_id in (
  '41100000-0000-0000-0000-000000000001',
  '41100000-0000-0000-0000-000000000002'
);
delete from public.vendors where id in (
  '41100000-0000-0000-0000-000000000001',
  '41100000-0000-0000-0000-000000000002'
);
delete from auth.users where email like '%@inv.gifto.test';

insert into auth.users (id, email) values
  ('d1110000-0000-0000-0000-000000000001', 'owner@inv.gifto.test'),
  ('d1110000-0000-0000-0000-000000000002', 'manager@inv.gifto.test'),
  ('d1110000-0000-0000-0000-000000000003', 'staff@inv.gifto.test'),
  ('d1110000-0000-0000-0000-000000000004', 'outsider@inv.gifto.test');

insert into public.vendors (id, name, slug, status, commission_rate) values
  ('41100000-0000-0000-0000-000000000001', 'Inv Shop', 'inv-shop', 'active', 0.1000);

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('41100000-0000-0000-0000-000000000001', 'd1110000-0000-0000-0000-000000000001', 'owner'),
  ('41100000-0000-0000-0000-000000000001', 'd1110000-0000-0000-0000-000000000002', 'manager'),
  ('41100000-0000-0000-0000-000000000001', 'd1110000-0000-0000-0000-000000000003', 'staff');

insert into public.products (id, vendor_id, name, slug, price_minor, stock, status) values
  ('61100000-0000-0000-0000-000000000001', '41100000-0000-0000-0000-000000000001',
   'Inv Item', 'inv-item', 5000, 10, 'active');

-- ---------------------------------------------------------------------------
-- TEST 1: anon cannot call adjust_product_stock; there is no direct write path
-- ---------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('anon', 'public.adjust_product_stock(uuid,integer,text)', 'execute') then
    raise exception 'TEST 1 FAILED: anon can execute adjust_product_stock';
  end if;

  if has_table_privilege('authenticated', 'public.inventory_movements', 'insert')
     or has_table_privilege('authenticated', 'public.inventory_movements', 'update')
     or has_table_privilege('authenticated', 'public.inventory_movements', 'delete') then
    raise exception 'TEST 1 FAILED: authenticated can write inventory_movements directly';
  end if;

  if has_column_privilege('authenticated', 'public.products', 'vendor_id', 'update')
     or has_column_privilege('authenticated', 'public.products', 'stock', 'update') then
    raise exception 'TEST 1 FAILED: authenticated can update products.stock directly';
  end if;

  raise notice 'TEST 1 PASSED: stock moves only through the audited function';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: a manager adds stock; the product and a movement both change
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'd1110000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"d1110000-0000-0000-0000-000000000002"}';
do $$
declare v_new integer;
begin
  begin
    update public.products set stock = 99
      where id = '61100000-0000-0000-0000-000000000001';
    raise exception 'TEST 2 FAILED: direct stock update was allowed';
  exception when insufficient_privilege then
    null;
  end;

  v_new := public.adjust_product_stock(
    '61100000-0000-0000-0000-000000000001', 5, 'Restock from supplier');
  if v_new <> 15 then
    raise exception 'TEST 2 FAILED: expected stock 15, got %', v_new;
  end if;
end $$;

reset role;
do $$
declare v_stock integer; v_delta integer; v_reason text; v_note text; v_by uuid;
begin
  select stock into v_stock from public.products
   where id = '61100000-0000-0000-0000-000000000001';
  if v_stock <> 15 then
    raise exception 'TEST 2 FAILED: product stock is %', v_stock;
  end if;

  select delta, reason, note, created_by into v_delta, v_reason, v_note, v_by
    from public.inventory_movements
   where product_id = '61100000-0000-0000-0000-000000000001';

  if v_delta <> 5 or v_reason <> 'manual_adjustment' or v_note <> 'Restock from supplier'
     or v_by <> 'd1110000-0000-0000-0000-000000000002' then
    raise exception 'TEST 2 FAILED: movement delta=% reason=% note=% by=%',
      v_delta, v_reason, v_note, v_by;
  end if;

  raise notice 'TEST 2 PASSED: a manager''s adjustment updated stock and logged a movement';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: a staff member is denied (they cannot manage products either)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'd1110000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"d1110000-0000-0000-0000-000000000003"}';
do $$
begin
  begin
    perform public.adjust_product_stock(
      '61100000-0000-0000-0000-000000000001', 1, null);
    raise exception 'TEST 3 FAILED: a staff member adjusted stock';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 3 PASSED: staff cannot adjust stock';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: an outsider and anon are denied
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'd1110000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"d1110000-0000-0000-0000-000000000004"}';
do $$
begin
  begin
    perform public.adjust_product_stock(
      '61100000-0000-0000-0000-000000000001', 1, null);
    raise exception 'TEST 4 FAILED: an outsider adjusted stock';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 4 PASSED: an outsider cannot adjust stock';
end $$;

set role anon;
do $$
begin
  begin
    perform public.adjust_product_stock(
      '61100000-0000-0000-0000-000000000001', 1, null);
    raise exception 'TEST 4 FAILED: anon adjusted stock';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'TEST 4 PASSED: anon cannot adjust stock';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: validation — zero delta, going below zero, over the ceiling
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'd1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"d1110000-0000-0000-0000-000000000001"}';
do $$
declare v_case text;
begin
  begin
    perform public.adjust_product_stock('61100000-0000-0000-0000-000000000001', 0, null);
    raise exception 'TEST 5 FAILED: a zero adjustment was accepted';
  exception when others then
    if sqlerrm not like '%non-zero%' then raise; end if;
  end;

  begin
    perform public.adjust_product_stock('61100000-0000-0000-0000-000000000001', -100, null);
    raise exception 'TEST 5 FAILED: stock was allowed to go below zero';
  exception when others then
    if sqlerrm not like '%below zero%' then raise; end if;
  end;

  begin
    perform public.adjust_product_stock('61100000-0000-0000-0000-000000000001', 2000000, null);
    raise exception 'TEST 5 FAILED: an oversized adjustment was accepted';
  exception when others then
    if sqlerrm not like '%too large%' then raise; end if;
  end;

  raise notice 'TEST 5 PASSED: validation rejects zero, negative stock and oversized moves';
end $$;

reset role;
do $$
declare v_stock integer; v_moves integer;
begin
  select stock into v_stock from public.products
   where id = '61100000-0000-0000-0000-000000000001';
  select count(*) into v_moves from public.inventory_movements
   where product_id = '61100000-0000-0000-0000-000000000001';

  if v_stock <> 15 or v_moves <> 1 then
    raise exception 'TEST 5 FAILED: a rejected adjustment still changed state (stock=%, moves=%)',
      v_stock, v_moves;
  end if;
  raise notice 'TEST 5 PASSED: rejected adjustments leave stock and history untouched';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: a vendor reads only its own product's movement history
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'd1110000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"d1110000-0000-0000-0000-000000000001"}';
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.inventory_movements;
  if v_count <> 1 then
    raise exception 'TEST 6 FAILED: owner sees % movements', v_count;
  end if;
  raise notice 'TEST 6 PASSED: a shop reads its own movement history';
end $$;

set request.jwt.claim.sub = 'd1110000-0000-0000-0000-000000000004';
set request.jwt.claims = '{"sub":"d1110000-0000-0000-0000-000000000004"}';
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.inventory_movements;
  if v_count <> 0 then
    raise exception 'TEST 6 FAILED: an outsider sees % movements', v_count;
  end if;
  raise notice 'TEST 6 PASSED: an outsider cannot read the movement history';
end $$;

reset role;

rollback;
