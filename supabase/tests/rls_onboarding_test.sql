-- Gifto Phase 2a verification: account provisioning + vendor self-onboarding.
-- Runs after BOTH migrations against a bare `supabase/postgres` container.
-- Same request-context simulation as rls_foundation_test.sql. Any failure
-- RAISEs and, with `psql -v ON_ERROR_STOP=1`, aborts non-zero.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Seed (as superuser)
-- ---------------------------------------------------------------------------
-- Idempotent re-runs: remove any vendors owned by prior test users, then the
-- users (deleting auth.users cascades to their profiles and memberships).
delete from public.vendors where id in (
  select vm.vendor_id
  from public.vendor_members vm
  join public.profiles p on p.id = vm.profile_id
  where p.email like '%@onboard.gifto.test'
);
delete from auth.users where email like '%@onboard.gifto.test';

-- Inserting users fires public.handle_new_user -> profiles are auto-created.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'alice@onboard.gifto.test',
   '{"full_name":"Alice Applicant","phone":"+201000000001"}'::jsonb),
  ('b0000000-0000-0000-0000-000000000002', 'bob@onboard.gifto.test', '{}'::jsonb),
  ('c0000000-0000-0000-0000-000000000003', 'admin@onboard.gifto.test', '{}'::jsonb);

-- Bootstrap a platform admin (guard trigger blocks the UPDATE otherwise).
alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = 'c0000000-0000-0000-0000-000000000003';
alter table public.profiles enable trigger profiles_protect_platform_admin;

-- ---------------------------------------------------------------------------
-- TEST 1: profiles are auto-provisioned on signup, without privilege
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  select email, full_name, phone, is_platform_admin into r
    from public.profiles where id = 'a0000000-0000-0000-0000-000000000001';
  if r is null then raise exception 'TEST 1 FAILED: no profile for Alice'; end if;
  if r.email <> 'alice@onboard.gifto.test' then
    raise exception 'TEST 1 FAILED: email=%', r.email; end if;
  if r.full_name <> 'Alice Applicant' then
    raise exception 'TEST 1 FAILED: full_name=%', r.full_name; end if;
  if r.phone <> '+201000000001' then
    raise exception 'TEST 1 FAILED: phone=%', r.phone; end if;
  if r.is_platform_admin then
    raise exception 'TEST 1 FAILED: new user became platform admin'; end if;
  if not exists (
    select 1 from public.profiles where id = 'b0000000-0000-0000-0000-000000000002'
  ) then raise exception 'TEST 1 FAILED: no profile for Bob'; end if;
  raise notice 'TEST 1 PASSED: profiles auto-provisioned on signup';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 2: an unauthenticated caller cannot apply
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare v_denied boolean := false;
begin
  begin
    perform public.apply_as_vendor('Ghost Vendor');
  exception when others then
    v_denied := (sqlerrm like '%Authentication required%');
  end;
  if not v_denied then
    raise exception 'TEST 2 FAILED: unauthenticated apply was not rejected';
  end if;
  raise notice 'TEST 2 PASSED: unauthenticated apply rejected';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 3: an authenticated user applies -> pending vendor + owner + audit
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
declare
  v_id     uuid;
  v_status public.vendor_status;
  v_slug   text;
  v_role   public.vendor_role;
  v_hist   int;
begin
  v_id := public.apply_as_vendor(
    'Alice''s Gift Shop', 'Handmade gifts', 'Alexandria', 'Alexandria',
    '+201000000001', 'alice@onboard.gifto.test'
  );
  select status, slug into v_status, v_slug from public.vendors where id = v_id;
  if v_status <> 'pending' then
    raise exception 'TEST 3 FAILED: status=%', v_status; end if;
  if v_slug <> 'alice-s-gift-shop' then
    raise exception 'TEST 3 FAILED: slug=%', v_slug; end if;
  select role into v_role from public.vendor_members
    where vendor_id = v_id and profile_id = 'a0000000-0000-0000-0000-000000000001';
  if v_role <> 'owner' then
    raise exception 'TEST 3 FAILED: role=%', v_role; end if;
  select count(*) into v_hist from public.vendor_status_history
    where vendor_id = v_id and from_status is null and to_status = 'pending';
  if v_hist <> 1 then
    raise exception 'TEST 3 FAILED: audit rows=%', v_hist; end if;
  raise notice 'TEST 3 PASSED: pending vendor + owner + audit created (slug=%)', v_slug;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 4: duplicate vendor name yields a distinct, deduped slug
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-000000000002"}';
do $$
declare v_id uuid; v_slug text;
begin
  v_id := public.apply_as_vendor('Alice''s Gift Shop');
  select slug into v_slug from public.vendors where id = v_id;
  if v_slug <> 'alice-s-gift-shop-2' then
    raise exception 'TEST 4 FAILED: slug=%', v_slug; end if;
  raise notice 'TEST 4 PASSED: duplicate name deduped (slug=%)', v_slug;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 5: a normal user cannot insert a vendor directly (RLS boundary)
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
begin
  begin
    insert into public.vendors (name, slug) values ('Direct Vendor', 'direct-vendor');
    raise exception 'TEST 5 FAILED: direct vendor insert succeeded';
  exception when insufficient_privilege then
    raise notice 'TEST 5 PASSED: direct vendor insert denied by RLS';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 6: an applicant cannot self-activate their vendor
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
declare v_id uuid; st public.vendor_status;
begin
  select id into v_id from public.vendors where slug = 'alice-s-gift-shop';
  begin
    update public.vendors set status = 'active' where id = v_id;
  exception when others then null;
  end;
  select status into st from public.vendors where id = v_id;
  if st <> 'pending' then
    raise exception 'TEST 6 FAILED: status became %', st; end if;
  raise notice 'TEST 6 PASSED: applicant cannot self-activate vendor';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 7: cross-tenant isolation of pending applications
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-000000000002"}';
do $$
declare c int;
begin
  select count(*) into c from public.vendors where slug = 'alice-s-gift-shop';
  if c <> 0 then
    raise exception 'TEST 7 FAILED: Bob saw % of Alice''s vendors', c; end if;
  raise notice 'TEST 7 PASSED: other user cannot read a pending vendor';
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
declare c int;
begin
  select count(*) into c from public.vendors where slug = 'alice-s-gift-shop';
  if c <> 1 then
    raise exception 'TEST 7b FAILED: applicant saw % own vendors', c; end if;
  raise notice 'TEST 7b PASSED: applicant reads own pending vendor';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 8: anon cannot see onboarding (pending) vendors
-- ---------------------------------------------------------------------------
set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int;
begin
  select count(*) into c from public.public_vendors where slug like 'alice-s-gift-shop%';
  if c <> 0 then
    raise exception 'TEST 8 FAILED: anon saw % pending vendors', c; end if;
  raise notice 'TEST 8 PASSED: anon cannot see pending onboarding vendors';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 9: a name with no slug-safe characters is rejected
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';
do $$
declare v_denied boolean := false;
begin
  begin
    perform public.apply_as_vendor('!!!');
  exception when others then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'TEST 9 FAILED: punctuation-only name accepted';
  end if;
  raise notice 'TEST 9 PASSED: invalid vendor name rejected';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 10: platform admin approves an application; then anon sees it
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-000000000003"}';
do $$
declare v_id uuid; st public.vendor_status;
begin
  select id into v_id from public.vendors where slug = 'alice-s-gift-shop';
  update public.vendors set status = 'active' where id = v_id;
  select status into st from public.vendors where id = v_id;
  if st <> 'active' then
    raise exception 'TEST 10 FAILED: status=%', st; end if;
  raise notice 'TEST 10 PASSED: platform admin approved vendor';
end $$;

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare c int;
begin
  select count(*) into c from public.public_vendors where slug = 'alice-s-gift-shop';
  if c <> 1 then
    raise exception 'TEST 10b FAILED: anon saw % approved vendors', c; end if;
  raise notice 'TEST 10b PASSED: anon sees approved vendor (via public view)';
end $$;

reset role;
