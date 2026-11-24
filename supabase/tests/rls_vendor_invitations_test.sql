\set ON_ERROR_STOP on

do $$
begin
  if current_setting('gifto.rls_test_disposable', true) is distinct from 'yes' then
    raise exception 'Refusing to run destructive RLS tests. Start a disposable database and SET gifto.rls_test_disposable = ''yes'' in the same psql session.';
  end if;
end $$;

begin;

delete from public.vendor_invitations
  where vendor_id in (
    'bbbbbbbb-0000-0000-0000-000000001001',
    'bbbbbbbb-0000-0000-0000-000000001002',
    'bbbbbbbb-0000-0000-0000-000000001003'
  );
delete from public.vendors
  where id in (
    'bbbbbbbb-0000-0000-0000-000000001001',
    'bbbbbbbb-0000-0000-0000-000000001002',
    'bbbbbbbb-0000-0000-0000-000000001003'
  );
delete from auth.users where email like '%@invite.test';

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('11111111-1111-4111-8111-111111111101', 'admin@invite.test', '{"full_name":"Invite Admin"}'::jsonb, now()),
  ('11111111-1111-4111-8111-111111111102', 'owner-a@invite.test', '{"full_name":"Owner A"}'::jsonb, now()),
  ('11111111-1111-4111-8111-111111111103', 'manager-a@invite.test', '{"full_name":"Manager A"}'::jsonb, now()),
  ('11111111-1111-4111-8111-111111111104', 'invitee@invite.test', '{"full_name":"Invitee"}'::jsonb, now()),
  ('11111111-1111-4111-8111-111111111105', 'unconfirmed@invite.test', '{"full_name":"Unconfirmed"}'::jsonb, null),
  ('11111111-1111-4111-8111-111111111106', 'owner-b@invite.test', '{"full_name":"Owner B"}'::jsonb, now()),
  ('11111111-1111-4111-8111-111111111107', 'owner-inactive@invite.test', '{"full_name":"Owner Inactive"}'::jsonb, now()),
  ('11111111-1111-4111-8111-111111111108', 'prebound@invite.test', '{"full_name":"Prebound"}'::jsonb, now());

alter table public.profiles disable trigger profiles_protect_platform_admin;
update public.profiles set is_platform_admin = true
  where id = '11111111-1111-4111-8111-111111111101';
alter table public.profiles enable trigger profiles_protect_platform_admin;

insert into public.vendors (id, name, slug, status) values
  ('bbbbbbbb-0000-0000-0000-000000001001', 'Invite Vendor A', 'invite-vendor-a', 'active'),
  ('bbbbbbbb-0000-0000-0000-000000001002', 'Invite Vendor B', 'invite-vendor-b', 'active'),
  ('bbbbbbbb-0000-0000-0000-000000001003', 'Invite Vendor C', 'invite-vendor-c', 'suspended');

insert into public.vendor_members (vendor_id, profile_id, role) values
  ('bbbbbbbb-0000-0000-0000-000000001001', '11111111-1111-4111-8111-111111111102', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000001001', '11111111-1111-4111-8111-111111111103', 'manager'),
  ('bbbbbbbb-0000-0000-0000-000000001002', '11111111-1111-4111-8111-111111111106', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000001003', '11111111-1111-4111-8111-111111111107', 'owner');

insert into public.vendor_invitations
  (id, vendor_id, email, role, status, invited_by, auth_user_id, expires_at, revoked_at)
values
  ('aaaaaaaa-0000-4000-8000-000000001001', 'bbbbbbbb-0000-0000-0000-000000001001', 'invitee@invite.test', 'staff', 'pending', '11111111-1111-4111-8111-111111111102', null, now() + interval '7 days', null),
  ('aaaaaaaa-0000-4000-8000-000000001002', 'bbbbbbbb-0000-0000-0000-000000001001', 'prebound@invite.test', 'manager', 'pending', '11111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111108', now() + interval '7 days', null),
  ('aaaaaaaa-0000-4000-8000-000000001003', 'bbbbbbbb-0000-0000-0000-000000001001', 'unconfirmed@invite.test', 'staff', 'pending', '11111111-1111-4111-8111-111111111102', null, now() + interval '7 days', null),
  ('aaaaaaaa-0000-4000-8000-000000001004', 'bbbbbbbb-0000-0000-0000-000000001001', 'invitee@invite.test', 'staff', 'expired', '11111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111104', now() - interval '1 day', null),
  ('aaaaaaaa-0000-4000-8000-000000001005', 'bbbbbbbb-0000-0000-0000-000000001001', 'prebound@invite.test', 'staff', 'revoked', '11111111-1111-4111-8111-111111111102', '11111111-1111-4111-8111-111111111108', now() + interval '7 days', now()),
  ('aaaaaaaa-0000-4000-8000-000000001006', 'bbbbbbbb-0000-0000-0000-000000001003', 'invitee@invite.test', 'staff', 'pending', '11111111-1111-4111-8111-111111111107', null, now() + interval '7 days', null),
  ('aaaaaaaa-0000-4000-8000-000000001010', 'bbbbbbbb-0000-0000-0000-000000001001', 'wrong@invite.test', 'staff', 'pending', '11111111-1111-4111-8111-111111111102', null, now() + interval '7 days', null);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111102';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111102"}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.vendor_invitations
   where vendor_id = 'bbbbbbbb-0000-0000-0000-000000001001';
  if v_count <> 6 then
    raise exception 'TEST owner read FAILED: expected 6, got %', v_count;
  end if;
  raise notice 'TEST owner read PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111103';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111103"}';

do $$
declare
  v_count int;
  v_rows int;
begin
  select count(*) into v_count
    from public.vendor_invitations
   where vendor_id = 'bbbbbbbb-0000-0000-0000-000000001001';
  if v_count <> 0 then
    raise exception 'TEST manager read FAILED: got %', v_count;
  end if;

  update public.vendor_invitations
     set status = 'revoked', revoked_at = now()
   where id = 'aaaaaaaa-0000-4000-8000-000000001002';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'TEST manager update FAILED: updated % rows', v_rows;
  end if;

  raise notice 'TEST manager read/update PASSED';
end $$;

do $$
begin
  insert into public.vendor_invitations (vendor_id, email, role, invited_by)
  values (
    'bbbbbbbb-0000-0000-0000-000000001001',
    'manager-insert@invite.test',
    'staff',
    '11111111-1111-4111-8111-111111111103'
  );
  raise exception using message = 'TEST manager insert FAILED: insert allowed', errcode = '99999';
exception
  when sqlstate '99999' then raise;
  when insufficient_privilege then
    raise notice 'TEST manager insert PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111106';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111106"}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.vendor_invitations
   where vendor_id = 'bbbbbbbb-0000-0000-0000-000000001001';
  if v_count <> 0 then
    raise exception 'TEST other owner read FAILED: got %', v_count;
  end if;
  raise notice 'TEST other owner read PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111107';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111107"}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.vendor_invitations
   where vendor_id = 'bbbbbbbb-0000-0000-0000-000000001003';
  if v_count <> 0 then
    raise exception 'TEST inactive owner read FAILED: got %', v_count;
  end if;
  raise notice 'TEST inactive owner read PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111101';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111101"}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.vendor_invitations
   where vendor_id = 'bbbbbbbb-0000-0000-0000-000000001001';
  if v_count <> 6 then
    raise exception 'TEST admin read FAILED: got %', v_count;
  end if;
  raise notice 'TEST admin read PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111102';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111102"}';

do $$
declare
  v_count int;
  v_rows int;
begin
  insert into public.vendor_invitations
    (id, vendor_id, email, role, invited_by)
  values (
    'aaaaaaaa-0000-4000-8000-000000001011',
    'bbbbbbbb-0000-0000-0000-000000001001',
    'owner-insert@invite.test',
    'staff',
    '11111111-1111-4111-8111-111111111102'
  );

  select count(*) into v_count
    from public.vendor_invitations
   where id = 'aaaaaaaa-0000-4000-8000-000000001011';
  if v_count <> 1 then
    raise exception 'TEST owner insert FAILED: got %', v_count;
  end if;

  update public.vendor_invitations
     set status = 'revoked', revoked_at = now()
   where id = 'aaaaaaaa-0000-4000-8000-000000001011';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'TEST owner revoke FAILED: updated % rows', v_rows;
  end if;

  raise notice 'TEST owner insert/revoke PASSED';
end $$;

do $$
begin
  update public.vendor_invitations
     set role = 'manager'
   where id = 'aaaaaaaa-0000-4000-8000-000000001011';
  raise exception using message = 'TEST owner role update FAILED: role column update allowed', errcode = '99999';
exception
  when sqlstate '99999' then raise;
  when insufficient_privilege then
    raise notice 'TEST owner role update PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111104';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111104"}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.list_my_vendor_invitations();
  if v_count <> 1 then
    raise exception 'TEST invitee list FAILED: got %', v_count;
  end if;
  raise notice 'TEST invitee list PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111108';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111108"}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.list_my_vendor_invitations();
  if v_count <> 1 then
    raise exception 'TEST prebound list FAILED: got %', v_count;
  end if;
  raise notice 'TEST prebound list PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111105';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111105"}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.list_my_vendor_invitations();
  if v_count <> 1 then
    raise exception 'TEST unconfirmed list FAILED: got %', v_count;
  end if;
  raise notice 'TEST unconfirmed list PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111106';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111106"}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.list_my_vendor_invitations();
  if v_count <> 0 then
    raise exception 'TEST outsider list FAILED: got %', v_count;
  end if;
  raise notice 'TEST outsider list PASSED';
end $$;

reset role;
delete from public.profiles where id = '11111111-1111-4111-8111-111111111104';

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111104';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111104"}';

do $$
declare
  v_vendor uuid;
  v_role text;
  v_status text;
  v_profile_email text;
  v_members int;
begin
  v_vendor := public.accept_vendor_invitation('aaaaaaaa-0000-4000-8000-000000001001');
  if v_vendor <> 'bbbbbbbb-0000-0000-0000-000000001001' then
    raise exception 'TEST accept FAILED: wrong vendor %', v_vendor;
  end if;

  select role::text into v_role
    from public.vendor_members
   where vendor_id = v_vendor
     and profile_id = '11111111-1111-4111-8111-111111111104';
  if v_role <> 'staff' then
    raise exception 'TEST accept FAILED: role %', v_role;
  end if;

  select status into v_status
    from public.vendor_invitations
   where id = 'aaaaaaaa-0000-4000-8000-000000001001';
  if v_status <> 'accepted' then
    raise exception 'TEST accept FAILED: status %', v_status;
  end if;

  select email into v_profile_email
    from public.profiles
   where id = '11111111-1111-4111-8111-111111111104';
  if v_profile_email <> 'invitee@invite.test' then
    raise exception 'TEST accept FAILED: profile email %', v_profile_email;
  end if;

  v_vendor := public.accept_vendor_invitation('aaaaaaaa-0000-4000-8000-000000001001');
  if v_vendor <> 'bbbbbbbb-0000-0000-0000-000000001001' then
    raise exception 'TEST accept idempotent FAILED: vendor %', v_vendor;
  end if;

  select count(*) into v_members
    from public.vendor_members
   where vendor_id = v_vendor
     and profile_id = '11111111-1111-4111-8111-111111111104';
  if v_members <> 1 then
    raise exception 'TEST accept idempotent FAILED: % memberships', v_members;
  end if;

  raise notice 'TEST accept/idempotent PASSED';
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.list_my_vendor_invitations();
  if v_count <> 0 then
    raise exception 'TEST accepted list FAILED: got %', v_count;
  end if;
  raise notice 'TEST accepted list PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111108';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111108"}';

do $$
declare
  v_vendor uuid;
  v_role text;
begin
  v_vendor := public.accept_vendor_invitation('aaaaaaaa-0000-4000-8000-000000001002');
  if v_vendor <> 'bbbbbbbb-0000-0000-0000-000000001001' then
    raise exception 'TEST prebound accept FAILED: wrong vendor %', v_vendor;
  end if;

  select role::text into v_role
    from public.vendor_members
   where vendor_id = v_vendor
     and profile_id = '11111111-1111-4111-8111-111111111108';
  if v_role <> 'manager' then
    raise exception 'TEST prebound accept FAILED: role %', v_role;
  end if;

  raise notice 'TEST prebound accept PASSED';
end $$;

do $$
begin
  perform public.accept_vendor_invitation('aaaaaaaa-0000-4000-8000-000000001005');
  raise exception using message = 'TEST revoked accept FAILED: accepted', errcode = '99999';
exception
  when sqlstate '99999' then raise;
  when sqlstate '22023' then
    raise notice 'TEST revoked accept PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111105';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111105"}';

do $$
begin
  perform public.accept_vendor_invitation('aaaaaaaa-0000-4000-8000-000000001003');
  raise exception using message = 'TEST unconfirmed accept FAILED: accepted', errcode = '99999';
exception
  when sqlstate '99999' then raise;
  when sqlstate '22023' then
    raise notice 'TEST unconfirmed accept PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111106';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111106"}';

do $$
begin
  perform public.accept_vendor_invitation('aaaaaaaa-0000-4000-8000-000000001010');
  raise exception using message = 'TEST wrong account FAILED: accepted', errcode = '99999';
exception
  when sqlstate '99999' then raise;
  when insufficient_privilege then
    raise notice 'TEST wrong account PASSED';
end $$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111104';
set request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111104"}';

do $$
begin
  perform public.accept_vendor_invitation('aaaaaaaa-0000-4000-8000-000000001004');
  raise exception using message = 'TEST expired accept FAILED: accepted', errcode = '99999';
exception
  when sqlstate '99999' then raise;
  when sqlstate '22023' then
    raise notice 'TEST expired accept PASSED';
end $$;

do $$
begin
  perform public.accept_vendor_invitation('aaaaaaaa-0000-4000-8000-000000001006');
  raise exception using message = 'TEST inactive vendor FAILED: accepted', errcode = '99999';
exception
  when sqlstate '99999' then raise;
  when sqlstate '22023' then
    raise notice 'TEST inactive vendor PASSED';
end $$;

reset role;
set role anon;
set request.jwt.claim.sub = '';

do $$
begin
  perform public.list_my_vendor_invitations();
  raise exception using message = 'TEST anon execute FAILED: allowed', errcode = '99999';
exception
  when sqlstate '99999' then raise;
  when insufficient_privilege then
    raise notice 'TEST anon execute PASSED';
end $$;

reset role;

rollback;
