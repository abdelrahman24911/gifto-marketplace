-- Gifto Phase 1 RLS verification.
-- Runs against a bare `supabase/postgres` container (which provides the auth
-- schema, auth.users, auth.uid(), and the anon/authenticated/service_role roles)
-- after the foundations migration has been applied.
--
-- Simulates Supabase request context the same way PostgREST does:
--   set role authenticated;  set request.jwt.claims = '{"sub":"<uuid>"}';
-- Any failure RAISEs and (with `psql -v ON_ERROR_STOP=1`) aborts non-zero.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Seed (as superuser: bypasses RLS to create the fixtures)
-- ---------------------------------------------------------------------------
-- Idempotent re-runs. Deleting the auth users cascades to profiles.
delete from public.vendors where id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from auth.users where email like '%@gifto.test';

-- Inserting into auth.users fires public.handle_new_user (migration 2), which
-- auto-provisions the matching public.profiles row. We pass full_name via the
-- user metadata instead of inserting profiles directly.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin@gifto.test',    '{"full_name":"Platform Admin"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'owner@gifto.test',    '{"full_name":"Vendor Owner"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'member@gifto.test',   '{"full_name":"Vendor Staff"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'outsider@gifto.test', '{"full_name":"Outsider"}'::jsonb);

-- Bootstrap the first platform admin. The self-elevation guard trigger blocks
-- ordinary (and even non-admin) UPDATEs of is_platform_admin, so seeding the
-- initial admin requires temporarily disabling that trigger as superuser.
alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = '11111111-1111-1111-1111-111111111111';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (id, name, slug, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Test Vendor', 'test-vendor', 'pending');

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

-- ---------------------------------------------------------------------------
-- TEST A: outsider cannot see a pending vendor
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
do $$
declare c int;
begin
  select count(*) into c from public.vendors where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if c <> 0 then raise exception 'TEST A FAILED: outsider saw % pending vendor(s)', c; end if;
  raise notice 'TEST A PASSED: outsider cannot read pending vendor';
end $$;

-- ---------------------------------------------------------------------------
-- TEST B: a member sees their own vendor in any status
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
do $$
declare c int;
begin
  select count(*) into c from public.vendors where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if c <> 1 then raise exception 'TEST B FAILED: owner saw % own vendor(s)', c; end if;
  raise notice 'TEST B PASSED: owner reads own pending vendor';
end $$;

-- ---------------------------------------------------------------------------
-- TEST C: outsider cannot insert themselves into a vendor roster
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
do $$
begin
  begin
    insert into public.vendor_members (vendor_id, profile_id, role)
    values ('aaaaaaaa-0000-0000-0000-000000000001',
            '44444444-4444-4444-4444-444444444444', 'staff');
    raise exception 'TEST C FAILED: outsider inserted a membership';
  exception when insufficient_privilege then
    raise notice 'TEST C PASSED: outsider membership insert denied (%)', sqlstate;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST D: owner can add a member
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
do $$
declare n int;
begin
  insert into public.vendor_members (vendor_id, profile_id, role)
  values ('aaaaaaaa-0000-0000-0000-000000000001',
          '33333333-3333-3333-3333-333333333333', 'staff');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST D FAILED: inserted % rows', n; end if;
  raise notice 'TEST D PASSED: owner added a staff member';
end $$;

-- ---------------------------------------------------------------------------
-- TEST E: ordinary user cannot grant themselves platform admin
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
do $$
declare flag boolean;
begin
  begin
    update public.profiles set is_platform_admin = true
      where id = '22222222-2222-2222-2222-222222222222';
  exception when others then null;
  end;
  select is_platform_admin into flag from public.profiles
    where id = '22222222-2222-2222-2222-222222222222';
  if flag then raise exception 'TEST E FAILED: user granted themselves platform admin'; end if;
  raise notice 'TEST E PASSED: self-elevation to platform admin blocked';
end $$;

-- ---------------------------------------------------------------------------
-- TEST F: owner may edit descriptive fields
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
do $$
declare n int;
begin
  update public.vendors set description = 'updated by owner'
    where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST F FAILED: updated % rows', n; end if;
  raise notice 'TEST F PASSED: owner edited descriptive field';
end $$;

-- ---------------------------------------------------------------------------
-- TEST G: owner cannot change vendor status (finance-field guard)
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
do $$
declare st public.vendor_status;
begin
  begin
    update public.vendors set status = 'active'
      where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  exception when others then null;
  end;
  select status into st from public.vendors
    where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if st <> 'pending' then raise exception 'TEST G FAILED: status became %', st; end if;
  raise notice 'TEST G PASSED: owner status change blocked';
end $$;

-- ---------------------------------------------------------------------------
-- TEST H: anon sees no pending vendors, cannot read profiles
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int;
begin
  select count(*) into c from public.public_vendors;
  if c <> 0 then raise exception 'TEST H1 FAILED: anon saw % vendors', c; end if;
  raise notice 'TEST H1 PASSED: anon sees no pending vendors (via public view)';
end $$;
do $$
begin
  begin
    perform count(*) from public.profiles;
    raise exception 'TEST H2 FAILED: anon read profiles';
  exception when insufficient_privilege then
    raise notice 'TEST H2 PASSED: anon has no profiles access';
  end;
end $$;
-- anon must be denied direct access to the base vendors table (which would
-- expose commission_rate / contact_* / delivery_coverage).
do $$
begin
  begin
    perform id from public.vendors limit 1;
    raise exception 'TEST H3 FAILED: anon read the base vendors table';
  exception when insufficient_privilege then
    raise notice 'TEST H3 PASSED: anon cannot read base vendors table';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST I: staff member can read the roster; outsider cannot
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
do $$
declare c int;
begin
  select count(*) into c from public.vendor_members
    where vendor_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if c < 1 then raise exception 'TEST I1 FAILED: member saw % roster rows', c; end if;
  raise notice 'TEST I1 PASSED: member reads own roster';
end $$;

set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
do $$
declare c int;
begin
  select count(*) into c from public.vendor_members
    where vendor_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if c <> 0 then raise exception 'TEST I2 FAILED: outsider saw % roster rows', c; end if;
  raise notice 'TEST I2 PASSED: outsider cannot read roster';
end $$;

-- ---------------------------------------------------------------------------
-- TEST J: platform admin can activate a vendor; then anon sees it
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
do $$
declare n int; st public.vendor_status;
begin
  update public.vendors set status = 'active'
    where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  select status into st from public.vendors
    where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 1 or st <> 'active' then
    raise exception 'TEST J1 FAILED: n=% st=%', n, st;
  end if;
  raise notice 'TEST J1 PASSED: admin activated vendor';
end $$;

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int;
begin
  select count(*) into c from public.public_vendors
    where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if c <> 1 then raise exception 'TEST J2 FAILED: anon saw % active vendors', c; end if;
  raise notice 'TEST J2 PASSED: anon reads active vendor (via public view)';
end $$;

-- ---------------------------------------------------------------------------
-- TEST K: status transition was logged (audit trail)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
do $$
declare c int;
begin
  select count(*) into c from public.vendor_status_history
    where vendor_id = 'aaaaaaaa-0000-0000-0000-000000000001'
      and to_status = 'active';
  if c < 1 then raise exception 'TEST K FAILED: no audit row recorded'; end if;
  raise notice 'TEST K PASSED: status change logged (% active row(s))', c;
end $$;

reset role;
