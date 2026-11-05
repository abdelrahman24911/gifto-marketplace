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

delete from public.vendors where id in (
  select vm.vendor_id
  from public.vendor_members vm
  join public.profiles p on p.id = vm.profile_id
  where p.email like '%@onboard.gifto.test'
);
delete from auth.users where email like '%@onboard.gifto.test';

insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'alice@onboard.gifto.test',
   '{"full_name":"Alice Owner","phone":"+201000000001"}'::jsonb),
  ('b0000000-0000-0000-0000-000000000002', 'bob@onboard.gifto.test', '{}'::jsonb),
  ('c0000000-0000-0000-0000-000000000003', 'admin@onboard.gifto.test', '{}'::jsonb);

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = 'c0000000-0000-0000-0000-000000000003';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors
  (id, name, slug, status, commission_rate, contact_email, city, governorate)
values
  ('d0000000-0000-0000-0000-000000000004', 'Alice Pending Shop',
   'alice-pending-shop', 'pending', 0.1000, 'alice@onboard.gifto.test',
   'Alexandria', 'Alexandria'),
  ('e0000000-0000-0000-0000-000000000005', 'Alice Suspended Shop',
   'alice-suspended-shop', 'suspended', 0.1000, 'suspended@onboard.gifto.test',
   'Alexandria', 'Alexandria'),
  ('f0000000-0000-0000-0000-000000000006', 'Alice Rejected Shop',
   'alice-rejected-shop', 'rejected', 0.1000, 'rejected@onboard.gifto.test',
   'Alexandria', 'Alexandria'),
  ('b0000000-0000-0000-0000-000000000007', 'Bob Active Shop',
   'bob-active-shop', 'active', 0.1000, 'bob@onboard.gifto.test',
   'Cairo', 'Cairo');

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('f0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'owner'),
  ('b0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000002', 'owner');

do $$
declare r record;
begin
  select email, full_name, phone, is_platform_admin into r
    from public.profiles where id = 'a0000000-0000-0000-0000-000000000001';
  if r is null then raise exception 'TEST 1 FAILED: no profile for Alice'; end if;
  if r.email <> 'alice@onboard.gifto.test' then
    raise exception 'TEST 1 FAILED: email=%', r.email; end if;
  if r.full_name <> 'Alice Owner' then
    raise exception 'TEST 1 FAILED: full_name=%', r.full_name; end if;
  if r.phone <> '+201000000001' then
    raise exception 'TEST 1 FAILED: phone=%', r.phone; end if;
  if r.is_platform_admin then
    raise exception 'TEST 1 FAILED: new user became platform admin'; end if;
  raise notice 'TEST 1 PASSED: profiles auto-provisioned on signup';
end $$;

set role authenticated;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';

do $$
begin
  if to_regprocedure('public.apply_as_vendor(text,text,text,text,text,text)') is not null then
    raise exception 'TEST 2 FAILED: self-onboarding RPC still exists';
  end if;
  raise notice 'TEST 2 PASSED: self-onboarding RPC removed';
end $$;

do $$
begin
  if exists (
    select 1 from public.vendors
    where slug = 'alice-pending-shop'
      and status = 'pending'
  ) then
    raise exception 'TEST 3 FAILED: unauthenticated caller can read pending vendor';
  end if;
  raise notice 'TEST 3 PASSED: unauthenticated caller cannot read pending vendor';
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';

do $$
declare v_role public.vendor_role; v_hist int;
begin
  select role into v_role from public.vendor_members
    where vendor_id = 'd0000000-0000-0000-0000-000000000004'
      and profile_id = 'a0000000-0000-0000-0000-000000000001';
  if v_role <> 'owner' then
    raise exception 'TEST 4 FAILED: role=%', v_role; end if;
  select count(*) into v_hist from public.vendor_status_history
    where vendor_id = 'd0000000-0000-0000-0000-000000000004'
      and from_status is null and to_status = 'pending';
  if v_hist <> 1 then
    raise exception 'TEST 4 FAILED: audit rows=%', v_hist; end if;
  raise notice 'TEST 4 PASSED: pending vendor owner and audit trail exist';
end $$;

do $$
begin
  begin
    insert into public.vendors (name, slug) values ('Direct Vendor', 'direct-vendor');
    raise exception 'TEST 5 FAILED: direct vendor insert succeeded';
  exception when insufficient_privilege then
    raise notice 'TEST 5 PASSED: direct vendor insert denied by RLS';
  end;
end $$;

do $$
declare st public.vendor_status;
begin
  begin
    update public.vendors set status = 'active'
      where id = 'd0000000-0000-0000-0000-000000000004';
  exception when others then null;
  end;
  select status into st from public.vendors
    where id = 'd0000000-0000-0000-0000-000000000004';
  if st <> 'pending' then
    raise exception 'TEST 6 FAILED: status became %', st; end if;
  raise notice 'TEST 6 PASSED: owner cannot self-activate vendor';
end $$;

set request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
set request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-000000000002"}';

do $$
declare c int;
begin
  select count(*) into c from public.vendors where slug = 'alice-pending-shop';
  if c <> 0 then
    raise exception 'TEST 7 FAILED: Bob saw % of Alice''s pending vendors', c; end if;
  raise notice 'TEST 7 PASSED: other user cannot read a pending vendor';
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';

do $$
declare v_allowed boolean;
begin
  select public.is_vendor_manager('d0000000-0000-0000-0000-000000000004') into v_allowed;
  if v_allowed then raise exception 'TEST 8 FAILED: pending manager allowed'; end if;
  select public.is_vendor_manager('e0000000-0000-0000-0000-000000000005') into v_allowed;
  if v_allowed then raise exception 'TEST 8 FAILED: suspended manager allowed'; end if;
  select public.is_vendor_manager('f0000000-0000-0000-0000-000000000006') into v_allowed;
  if v_allowed then raise exception 'TEST 8 FAILED: rejected manager allowed'; end if;

  select public.is_vendor_active_member('d0000000-0000-0000-0000-000000000004') into v_allowed;
  if v_allowed then raise exception 'TEST 8 FAILED: pending active member allowed'; end if;
  select public.is_vendor_active_owner('d0000000-0000-0000-0000-000000000004') into v_allowed;
  if v_allowed then raise exception 'TEST 8 FAILED: pending active owner allowed'; end if;

  raise notice 'TEST 8 PASSED: non-active vendors have no manager capability';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 8B: pending owners cannot edit the vendor profile or manage the roster
-- ---------------------------------------------------------------------------
do $$
declare n int; d text;
begin
  update public.vendors set description = 'pending self edit'
    where id = 'd0000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST 8B FAILED: pending owner updated % vendors', n; end if;
  select description into d from public.vendors
    where id = 'd0000000-0000-0000-0000-000000000004';
  if d is not null then raise exception 'TEST 8B FAILED: description=%', d; end if;

  begin
    insert into public.vendor_members (vendor_id, profile_id, role)
    values ('d0000000-0000-0000-0000-000000000004',
            'b0000000-0000-0000-0000-000000000002', 'staff');
    raise exception 'TEST 8B FAILED: pending owner added a member';
  exception when insufficient_privilege then
    null;
  end;
  select count(*) into n from public.vendor_members
    where vendor_id = 'd0000000-0000-0000-0000-000000000004'
      and profile_id = 'b0000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'TEST 8B FAILED: membership count=%', n; end if;
  raise notice 'TEST 8B PASSED: pending owner profile/roster writes denied';
end $$;

do $$
begin
  begin
    insert into public.products (vendor_id, name, slug, price_minor)
    values ('d0000000-0000-0000-0000-000000000004', 'Pending Product',
      'pending-product', 10000);
    raise exception 'TEST 9 FAILED: pending vendor inserted a product';
  exception when insufficient_privilege then
    raise notice 'TEST 9 PASSED: pending vendor product write denied';
  end;
end $$;

set role anon;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';

do $$
declare c int;
begin
  select count(*) into c from public.public_vendors
    where slug like 'alice-%';
  if c <> 0 then
    raise exception 'TEST 10 FAILED: anon saw % non-active vendors', c; end if;
  select count(*) into c from public.public_vendors
    where slug = 'bob-active-shop';
  if c <> 1 then
    raise exception 'TEST 10b FAILED: anon saw % active vendors', c; end if;
  raise notice 'TEST 10 PASSED: anon sees only active vendors';
end $$;

set role authenticated;
set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-000000000003"}';

do $$
declare st public.vendor_status;
begin
  update public.vendors set status = 'active'
    where id = 'd0000000-0000-0000-0000-000000000004';
  select status into st from public.vendors
    where id = 'd0000000-0000-0000-0000-000000000004';
  if st <> 'active' then
    raise exception 'TEST 11 FAILED: status=%', st; end if;
  raise notice 'TEST 11 PASSED: platform admin activated vendor';
end $$;

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';

do $$
declare v_allowed boolean;
begin
  select public.is_vendor_manager('d0000000-0000-0000-0000-000000000004') into v_allowed;
  if not v_allowed then raise exception 'TEST 12 FAILED: active manager denied'; end if;
  select public.is_vendor_active_member('d0000000-0000-0000-0000-000000000004') into v_allowed;
  if not v_allowed then raise exception 'TEST 12 FAILED: active member denied'; end if;
  select public.is_vendor_active_owner('d0000000-0000-0000-0000-000000000004') into v_allowed;
  if not v_allowed then raise exception 'TEST 12 FAILED: active owner denied'; end if;
  insert into public.products (vendor_id, name, slug, price_minor)
  values ('d0000000-0000-0000-0000-000000000004', 'Active Product',
    'active-product', 10000);
  raise notice 'TEST 12 PASSED: active vendor can manage products';
end $$;

-- ---------------------------------------------------------------------------
-- TEST 12B: active owners may edit the profile and manage the roster
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  update public.vendors set description = 'active owner edit'
    where id = 'd0000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 12B FAILED: updated % vendors', n; end if;

  insert into public.vendor_members (vendor_id, profile_id, role)
  values ('d0000000-0000-0000-0000-000000000004',
          'b0000000-0000-0000-0000-000000000002', 'staff');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST 12B FAILED: inserted % members', n; end if;
  raise notice 'TEST 12B PASSED: active owner profile/roster writes allowed';
end $$;

set request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000003';
set request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-000000000003"}';

update public.vendors set status = 'suspended'
  where id = 'd0000000-0000-0000-0000-000000000004';

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001"}';

do $$
declare v_allowed boolean;
begin
  select public.is_vendor_manager('d0000000-0000-0000-0000-000000000004') into v_allowed;
  if v_allowed then raise exception 'TEST 13 FAILED: suspended manager allowed'; end if;
  select public.is_vendor_active_member('d0000000-0000-0000-0000-000000000004') into v_allowed;
  if v_allowed then raise exception 'TEST 13 FAILED: suspended member allowed'; end if;
  select public.is_vendor_active_owner('d0000000-0000-0000-0000-000000000004') into v_allowed;
  if v_allowed then raise exception 'TEST 13 FAILED: suspended owner allowed'; end if;
  begin
    insert into public.products (vendor_id, name, slug, price_minor)
    values ('d0000000-0000-0000-0000-000000000004', 'Suspended Product',
      'suspended-product', 10000);
    raise exception 'TEST 13 FAILED: suspended vendor inserted a product';
  exception when insufficient_privilege then
    raise notice 'TEST 13 PASSED: suspended vendor product write denied';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- TEST 14: vendor creation RPC is service-role-only and atomic
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  if has_function_privilege(
    'anon',
    'public.create_vendor_for_owner(text,text,text,text,text,text,numeric,uuid)',
    'execute'
  ) then
    raise exception 'TEST 14 FAILED: anon can execute create_vendor_for_owner';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.create_vendor_for_owner(text,text,text,text,text,text,numeric,uuid)',
    'execute'
  ) then
    raise exception 'TEST 14 FAILED: authenticated can execute create_vendor_for_owner';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.create_vendor_for_owner(text,text,text,text,text,text,numeric,uuid)',
    'execute'
  ) then
    raise exception 'TEST 14 FAILED: service_role cannot execute create_vendor_for_owner';
  end if;
end $$;

grant usage on schema public to service_role;
set role service_role;
set request.jwt.claim.sub = '';
set request.jwt.claims = '{}';
do $$
declare v_vendor uuid;
begin
  v_vendor := public.create_vendor_for_owner(
    'Service Created Shop',
    'created by the admin invitation flow',
    'Cairo',
    'Cairo',
    '+201000000099',
    'service-created@onboard.gifto.test',
    0.1000,
    'b0000000-0000-0000-0000-000000000002'
  );

  if v_vendor is null then
    raise exception 'TEST 14 FAILED: RPC returned no vendor id';
  end if;
  perform set_config('gifto.test_vendor_id', v_vendor::text, false);
end $$;

reset role;

do $$
declare
  v_vendor uuid := current_setting('gifto.test_vendor_id')::uuid;
  v_owner int;
  v_status public.vendor_status;
begin
  select status into v_status from public.vendors where id = v_vendor;
  if v_status <> 'pending' then
    raise exception 'TEST 14 FAILED: status=%', v_status;
  end if;
  select count(*) into v_owner from public.vendor_members
    where vendor_id = v_vendor
      and profile_id = 'b0000000-0000-0000-0000-000000000002'
      and role = 'owner';
  if v_owner <> 1 then
    raise exception 'TEST 14 FAILED: owner memberships=%', v_owner;
  end if;
  raise notice 'TEST 14 PASSED: service role created vendor + owner atomically';
end $$;

set role service_role;
do $$
begin
  begin
    perform public.create_vendor_for_owner(
      'Duplicate Email Shop',
      null,
      null,
      null,
      null,
      'ALICE@ONBOARD.GIFTO.TEST',
      0.1000,
      'b0000000-0000-0000-0000-000000000002'
    );
    raise exception 'TEST 14B FAILED: duplicate normalized email accepted';
  exception when unique_violation then
    null;
  end;
end $$;

reset role;

do $$
begin
  if exists (
    select 1 from public.vendors where slug = 'duplicate-email-shop'
  ) then
    raise exception 'TEST 14B FAILED: failed RPC left a partial vendor';
  end if;
  raise notice 'TEST 14B PASSED: duplicate email fails without partial writes';
end $$;

rollback;
