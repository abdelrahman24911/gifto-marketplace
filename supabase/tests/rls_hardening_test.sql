-- Gifto Phase 8 RLS/security verification: hardening guards.
-- Runs against a bare `supabase/postgres` container after all migrations (1–18).
--
-- Covers:
--   A. is_vendor_staff helper is gone.
--   B. authenticated has no INSERT path on profiles.
--   C. defense-in-depth INSERT guard blocks self-provisioning is_platform_admin.
--   D. service_role may still insert an admin flag (bootstrap path).
--   E. the last owner of a vendor cannot be demoted (even by a platform admin).
--   F. an owner can be demoted once a second owner exists.
--   G. the last owner of a vendor cannot be deleted.

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
-- Seed (as superuser: bypasses RLS to create the fixtures)
-- ---------------------------------------------------------------------------
delete from public.vendors where id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from auth.users where email like '%@gifto.test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin@gifto.test',   '{"full_name":"Platform Admin"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'owner-a@gifto.test', '{"full_name":"Owner A"}'::jsonb),
  ('55555555-5555-5555-5555-555555555555', 'owner-b@gifto.test', '{"full_name":"Owner B"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', 'plain@gifto.test',   '{"full_name":"Plain User"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666', 'svc@gifto.test',     '{"full_name":"Service Seed"}'::jsonb),
  ('77777777-7777-7777-7777-777777777777', 'fk-ok@gifto.test',   '{"full_name":"FK Ok"}'::jsonb),
  ('88888888-8888-8888-8888-888888888888', 'fk-elevated@gifto.test', '{"full_name":"FK Elevated"}'::jsonb);

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = '11111111-1111-1111-1111-111111111111';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (id, name, slug, status) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Hardening Vendor', 'hardening-vendor', 'active');

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'owner');

-- The raw supabase/postgres image does not pre-grant table privileges to
-- service_role (the hosted platform configures default privileges). Grant
-- them here so the service-role bootstrap-path test mirrors hosted behaviour.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- TEST A: the redundant is_vendor_staff helper no longer exists
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_vendor_staff(uuid)') is not null then
    raise exception 'TEST A FAILED: is_vendor_staff(uuid) still exists';
  end if;
  raise notice 'TEST A PASSED: is_vendor_staff dropped';
end $$;

-- ---------------------------------------------------------------------------
-- TEST B: authenticated has no INSERT grant/policy on profiles
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
do $$
begin
  begin
    insert into public.profiles (id, email, is_platform_admin)
    values ('99999999-9999-9999-9999-999999999999', 'nope@gifto.test', false);
    raise exception using message = 'TEST B FAILED: authenticated inserted a profile', errcode = '99999';
  exception
    when sqlstate '99999' then raise;
    when insufficient_privilege then
      raise notice 'TEST B PASSED: profiles INSERT denied for authenticated';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST C: defense-in-depth INSERT guard blocks self-provisioning admin.
-- A temporary INSERT policy simulates a future insert path; the trigger must
-- still refuse is_platform_admin = true for a non-admin caller. The auto-
-- provisioned profiles are removed first so the inserts hit the trigger, not
-- the primary key.
-- ---------------------------------------------------------------------------
reset role;
delete from public.profiles where id in (
  '77777777-7777-7777-7777-777777777777',
  '88888888-8888-8888-8888-888888888888'
);
create policy "TEMP profiles insert (hardening test)"
  on public.profiles for insert
  to authenticated
  with check (true);

set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
do $$
begin
  begin
    insert into public.profiles (id, email, is_platform_admin)
    values ('88888888-8888-8888-8888-888888888888', 'fk-elevated@gifto.test', true);
    raise exception using message = 'TEST C1 FAILED: admin flag self-provisioned', errcode = '99999';
  exception
    when sqlstate '99999' then raise;
    when others then
      raise notice 'TEST C1 PASSED: admin-flag insert blocked by guard (%)', sqlstate;
  end;
end $$;

do $$
declare flag boolean;
begin
  insert into public.profiles (id, email, is_platform_admin)
  values ('77777777-7777-7777-7777-777777777777', 'fk-ok@gifto.test', false);
  select is_platform_admin into flag from public.profiles
    where id = '77777777-7777-7777-7777-777777777777';
  if flag then raise exception 'TEST C2 FAILED: plain insert unexpectedly admin'; end if;
  raise notice 'TEST C2 PASSED: plain profile insert allowed';
end $$;

reset role;
drop policy "TEMP profiles insert (hardening test)" on public.profiles;

-- ---------------------------------------------------------------------------
-- TEST D: service_role may still insert an admin flag (bootstrap path).
-- Replace the auto-provisioned profile with a service-role insert.
-- ---------------------------------------------------------------------------
delete from public.profiles where id = '66666666-6666-6666-6666-666666666666';

set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare flag boolean;
begin
  insert into public.profiles (id, email, is_platform_admin)
  values ('66666666-6666-6666-6666-666666666666', 'svc@gifto.test', true);
  select is_platform_admin into flag from public.profiles
    where id = '66666666-6666-6666-6666-666666666666';
  if not flag then raise exception 'TEST D FAILED: service-role admin insert not applied'; end if;
  raise notice 'TEST D PASSED: service_role bootstraps admin flag';
end $$;

-- ---------------------------------------------------------------------------
-- TEST E: the last owner cannot be demoted (even by a platform admin)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
do $$
declare r public.vendor_role;
begin
  begin
    update public.vendor_members set role = 'staff'
      where vendor_id = 'bbbbbbbb-0000-0000-0000-000000000001'
        and profile_id = '22222222-2222-2222-2222-222222222222';
    raise exception using message = 'TEST E FAILED: sole owner demoted', errcode = '99999';
  exception
    when sqlstate '99999' then raise;
    when others then
      raise notice 'TEST E PASSED: sole-owner demotion blocked (%)', sqlstate;
  end;
  select role into r from public.vendor_members
    where vendor_id = 'bbbbbbbb-0000-0000-0000-000000000001'
      and profile_id = '22222222-2222-2222-2222-222222222222';
  if r <> 'owner' then raise exception 'TEST E FAILED: role became %', r; end if;
end $$;

-- ---------------------------------------------------------------------------
-- TEST F: with a second owner present, demotion is allowed
-- ---------------------------------------------------------------------------
-- Platform admin promotes owner B, then demotes owner A.
insert into public.vendor_members (vendor_id, profile_id, role) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'owner');

do $$
declare n int; r public.vendor_role;
begin
  update public.vendor_members set role = 'staff'
    where vendor_id = 'bbbbbbbb-0000-0000-0000-000000000001'
      and profile_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  select role into r from public.vendor_members
    where vendor_id = 'bbbbbbbb-0000-0000-0000-000000000001'
      and profile_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 or r <> 'staff' then
    raise exception 'TEST F FAILED: n=% role=%', n, r;
  end if;
  raise notice 'TEST F PASSED: owner demoted once a second owner exists';
end $$;

-- ---------------------------------------------------------------------------
-- TEST G: the last owner cannot be deleted
-- ---------------------------------------------------------------------------
-- B is now the sole owner; deleting B must fail. Re-promote A, then B may leave.
do $$
begin
  begin
    delete from public.vendor_members
      where vendor_id = 'bbbbbbbb-0000-0000-0000-000000000001'
        and profile_id = '55555555-5555-5555-5555-555555555555';
    raise exception using message = 'TEST G1 FAILED: sole owner deleted', errcode = '99999';
  exception
    when sqlstate '99999' then raise;
    when others then
      raise notice 'TEST G1 PASSED: sole-owner deletion blocked (%)', sqlstate;
  end;
end $$;

update public.vendor_members set role = 'owner'
  where vendor_id = 'bbbbbbbb-0000-0000-0000-000000000001'
    and profile_id = '22222222-2222-2222-2222-222222222222';

do $$
declare n int;
begin
  delete from public.vendor_members
    where vendor_id = 'bbbbbbbb-0000-0000-0000-000000000001'
      and profile_id = '55555555-5555-5555-5555-555555555555';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST G2 FAILED: deleted % rows', n; end if;
  raise notice 'TEST G2 PASSED: owner removed once another owner remains';
end $$;

-- ---------------------------------------------------------------------------
-- TEST H: cascading deletes are not blocked by the last-owner guard
-- (vendor removal must work even with a single owner — depth-2 cascade).
-- ---------------------------------------------------------------------------
do $$
declare c int;
begin
  delete from public.vendors where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  select count(*) into c from public.vendors
    where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if c <> 0 then raise exception 'TEST H1 FAILED: vendor not deleted'; end if;
  select count(*) into c from public.vendor_members
    where vendor_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if c <> 0 then raise exception 'TEST H2 FAILED: memberships not cascaded'; end if;
  raise notice 'TEST H PASSED: vendor cascade delete not blocked by last-owner guard';
end $$;

-- ---------------------------------------------------------------------------
-- TEST I: mail_outbox is admin-read-only (migration 63)
-- ---------------------------------------------------------------------------
-- The queue is written only through the service-role mail module; no API
-- role can read it except a platform admin, and nobody can write it
-- through PostgREST at all (no insert/update/delete policy exists).
reset role;
insert into public.mail_outbox
  (kind, to_email, subject, body_text, status)
values
  ('order_status', 'customer@gifto.test', 'Your order shipped', 'Shipped.', 'pending');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
do $$
declare
  v_count int;
  v_blocked boolean := false;
begin
  select count(*) into v_count from public.mail_outbox;
  if v_count <> 1 then
    raise exception 'TEST I FAILED: platform admin cannot read the outbox (saw %)', v_count;
  end if;

  begin
    insert into public.mail_outbox
      (kind, to_email, subject, body_text, status)
    values
      ('order_status', 'x@gifto.test', 'Forged', 'Forged.', 'pending');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST I FAILED: platform admin inserted an outbox row through the API';
  end if;

  v_blocked := false;
  begin
    update public.mail_outbox set status = 'sent' where kind = 'order_status';
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST I FAILED: platform admin updated an outbox row through the API';
  end if;

  v_blocked := false;
  begin
    delete from public.mail_outbox where kind = 'order_status';
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST I FAILED: platform admin deleted an outbox row through the API';
  end if;
  raise notice 'TEST I-a PASSED: platform admin reads the outbox but cannot write it';
end $$;

set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.mail_outbox;
  if v_count <> 0 then
    raise exception 'TEST I FAILED: a plain customer can read the outbox (saw %)', v_count;
  end if;
  raise notice 'TEST I-b PASSED: non-admin users cannot read the outbox';
  raise notice 'TEST I PASSED: mail_outbox is admin-read-only';
end $$;

reset role;

rollback;
