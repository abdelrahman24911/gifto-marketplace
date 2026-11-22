-- Gifto Marketplace - auth rate-limit quota tests (P1-12, H-12)
--
-- Verifies `consume_auth_quota` (migration 39) the same way
-- rls_guest_orders_test.sql verifies `consume_checkout_quota`: per-bucket
-- windowed counts, window reset, argument validation, service-role-only
-- execution, and independence from the checkout quota table.
--
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
-- TEST 1: the auth quota increments and reports a windowed count
-- ---------------------------------------------------------------------------
set role service_role;
do $$
declare
  v_bucket text := repeat('a', 64);
  v_first int;
  v_second int;
  v_third int;
begin
  v_first := public.consume_auth_quota(v_bucket, 2, 3600);
  v_second := public.consume_auth_quota(v_bucket, 2, 3600);
  v_third := public.consume_auth_quota(v_bucket, 2, 3600);

  if v_first <> 1 or v_second <> 2 or v_third <> 3 then
    raise exception 'TEST 1 FAILED: counts % % %', v_first, v_second, v_third;
  end if;

  -- another bucket is independent
  if public.consume_auth_quota(repeat('c', 64), 2, 3600) <> 1 then
    raise exception 'TEST 1 FAILED: buckets are not isolated';
  end if;

  raise notice 'TEST 1 PASSED: auth quota is per-bucket and windowed';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: an expired window resets the count, and stale rows are pruned
-- ---------------------------------------------------------------------------
do $$
declare
  v_bucket text := repeat('a', 64);
  v_count int;
begin
  -- Backdate the window so it is older than the 1-hour window.
  update public.auth_rate_limits
     set window_start = now() - interval '2 hours'
   where bucket = v_bucket;

  v_count := public.consume_auth_quota(v_bucket, 2, 3600);
  if v_count <> 1 then
    raise exception 'TEST 2 FAILED: expired window did not reset (got %)', v_count;
  end if;

  -- A row older than 2 days is pruned by the opportunistic cleanup.
  insert into public.auth_rate_limits (bucket, window_start, attempts)
  values (repeat('d', 64), now() - interval '3 days', 9);
  perform public.consume_auth_quota(repeat('e', 64), 5, 3600);
  if exists (select 1 from public.auth_rate_limits where bucket = repeat('d', 64)) then
    raise exception 'TEST 2 FAILED: stale auth quota row was not pruned';
  end if;

  raise notice 'TEST 2 PASSED: window reset and stale-row pruning work';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: invalid arguments are rejected
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.consume_auth_quota('short', 5, 3600);
    raise exception 'TEST 3 FAILED: short bucket accepted';
  exception when sqlstate '22023' then
    -- expected
  end;

  begin
    perform public.consume_auth_quota(repeat('f', 64), 0, 3600);
    raise exception 'TEST 3 FAILED: limit 0 accepted';
  exception when sqlstate '22023' then
    -- expected
  end;

  begin
    perform public.consume_auth_quota(repeat('f', 64), 1001, 3600);
    raise exception 'TEST 3 FAILED: limit 1001 accepted';
  exception when sqlstate '22023' then
    -- expected
  end;

  begin
    perform public.consume_auth_quota(repeat('f', 64), 5, 30);
    raise exception 'TEST 3 FAILED: 30s window accepted';
  exception when sqlstate '22023' then
    -- expected
  end;

  begin
    perform public.consume_auth_quota(repeat('f', 64), 5, 90000);
    raise exception 'TEST 3 FAILED: 90000s window accepted';
  exception when sqlstate '22023' then
    -- expected
  end;

  raise notice 'TEST 3 PASSED: invalid auth quota arguments are rejected';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: the auth quota is service-role only and independent of checkout
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.consume_auth_quota(text,integer,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.consume_auth_quota(text,integer,integer)', 'execute') then
    raise exception 'TEST 4 FAILED: a weaker role can execute consume_auth_quota';
  end if;

  if not has_function_privilege('service_role', 'public.consume_auth_quota(text,integer,integer)', 'execute') then
    raise exception 'TEST 4 FAILED: service_role cannot execute consume_auth_quota';
  end if;

  if has_table_privilege('anon', 'public.auth_rate_limits', 'select')
     or has_table_privilege('authenticated', 'public.auth_rate_limits', 'select')
     or has_table_privilege('anon', 'public.auth_rate_limits', 'insert')
     or has_table_privilege('authenticated', 'public.auth_rate_limits', 'update') then
    raise exception 'TEST 4 FAILED: a weaker role holds privileges on auth_rate_limits';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.auth_rate_limits'::regclass) then
    raise exception 'TEST 4 FAILED: RLS is not enabled on auth_rate_limits';
  end if;

  raise notice 'TEST 4 PASSED: auth quota is service-role only with RLS enabled';
end $$;

set role service_role;
do $$
declare
  v_bucket text := repeat('b', 64);
  v_auth int;
  v_checkout int;
begin
  -- Same bucket string in both tables counts independently.
  v_auth := public.consume_auth_quota(v_bucket, 100, 3600);
  v_checkout := public.consume_checkout_quota(v_bucket, 100, 3600);
  if v_auth <> 1 or v_checkout <> 1 then
    raise exception 'TEST 4 FAILED: auth/checkout quotas share state (%/%)', v_auth, v_checkout;
  end if;
  v_auth := public.consume_auth_quota(v_bucket, 100, 3600);
  v_checkout := public.consume_checkout_quota(v_bucket, 100, 3600);
  if v_auth <> 2 or v_checkout <> 2 then
    raise exception 'TEST 4 FAILED: auth/checkout quotas diverged (%/%)', v_auth, v_checkout;
  end if;

  raise notice 'TEST 4b PASSED: auth and checkout quotas are independent';
end $$;

reset role;

rollback;
