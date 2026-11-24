create table public.vendor_invitations (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references public.vendors (id) on delete cascade,
  email         text not null
                check (
                  email = lower(btrim(email))
                  and length(email) between 3 and 160
                  and position('@' in email) > 1
                ),
  role          public.vendor_role not null
                check (role in ('manager', 'staff')),
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by    uuid references public.profiles (id) on delete set null,
  auth_user_id  uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '7 days'),
  accepted_at   timestamptz,
  accepted_by   uuid references public.profiles (id) on delete set null,
  revoked_at    timestamptz,
  constraint vendor_invitations_state check (
    (status = 'pending' and accepted_at is null and revoked_at is null)
    or (status = 'accepted' and accepted_at is not null and revoked_at is null)
    or (status = 'revoked' and accepted_at is null and revoked_at is not null)
    or (status = 'expired' and accepted_at is null and revoked_at is null)
  )
);

create unique index vendor_invitations_pending_email_key
  on public.vendor_invitations (vendor_id, email)
  where status = 'pending';

create index vendor_invitations_pending_vendor_idx
  on public.vendor_invitations (vendor_id, created_at desc)
  where status = 'pending';

create index vendor_invitations_pending_email_idx
  on public.vendor_invitations (email)
  where status = 'pending';

create index vendor_invitations_pending_auth_user_idx
  on public.vendor_invitations (auth_user_id)
  where status = 'pending';

alter table public.vendor_invitations enable row level security;

create policy "vendor_invitations: owner read"
  on public.vendor_invitations for select
  using (
    public.is_vendor_active_owner(vendor_id)
    or public.is_platform_admin()
  );

create policy "vendor_invitations: owner insert"
  on public.vendor_invitations for insert
  with check (
    public.is_vendor_active_owner(vendor_id)
    or public.is_platform_admin()
  );

create policy "vendor_invitations: owner update"
  on public.vendor_invitations for update
  using (
    public.is_vendor_active_owner(vendor_id)
    or public.is_platform_admin()
  )
  with check (
    public.is_vendor_active_owner(vendor_id)
    or public.is_platform_admin()
  );

revoke all on table public.vendor_invitations from public, anon, authenticated;
grant select, insert on table public.vendor_invitations to authenticated;
grant update (status, revoked_at) on table public.vendor_invitations to authenticated;

create or replace function public.list_my_vendor_invitations()
returns table (
  id          uuid,
  vendor_id   uuid,
  vendor_name text,
  vendor_slug text,
  role        public.vendor_role,
  created_at  timestamptz,
  expires_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select vi.id, vi.vendor_id, v.name, v.slug, vi.role, vi.created_at, vi.expires_at
    from public.vendor_invitations vi
    join public.vendors v on v.id = vi.vendor_id
    join auth.users u on u.id = auth.uid()
   where vi.status = 'pending'
     and vi.expires_at > now()
     and v.status = 'active'
     and (
       vi.auth_user_id = u.id
       or (vi.auth_user_id is null and vi.email = lower(u.email))
     )
   order by vi.created_at desc;
$$;

revoke all on function public.list_my_vendor_invitations() from public, anon;
grant execute on function public.list_my_vendor_invitations() to authenticated;

create or replace function public.accept_vendor_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_email        text;
  v_confirmed_at timestamptz;
  v_inv          public.vendor_invitations%rowtype;
  v_vendor_status public.vendor_status;
begin
  if v_uid is null then
    raise exception 'Sign in to accept this invitation.' using errcode = '42501';
  end if;

  select lower(u.email), u.email_confirmed_at
    into v_email, v_confirmed_at
    from auth.users u
   where u.id = v_uid;

  if v_email is null then
    raise exception 'Sign in to accept this invitation.' using errcode = '42501';
  end if;

  select *
    into v_inv
    from public.vendor_invitations
   where id = p_invitation_id
   for update;

  if not found then
    raise exception 'This invitation could not be found.' using errcode = '22023';
  end if;

  if v_inv.status = 'accepted' then
    if v_inv.accepted_by = v_uid and exists (
      select 1
        from public.vendor_members vm
       where vm.vendor_id = v_inv.vendor_id
         and vm.profile_id = v_uid
    ) then
      return v_inv.vendor_id;
    end if;
    raise exception 'This invitation has already been used.' using errcode = '22023';
  end if;

  if v_inv.status = 'revoked' then
    raise exception 'This invitation was revoked.' using errcode = '22023';
  end if;

  if v_inv.status = 'expired' or v_inv.expires_at <= now() then
    raise exception 'This invitation has expired. Ask the shop owner for a new one.'
      using errcode = '22023';
  end if;

  if v_inv.auth_user_id is not null then
    if v_inv.auth_user_id <> v_uid then
      raise exception 'This invitation is for a different account.'
        using errcode = '42501';
    end if;
  elsif v_inv.email <> v_email then
    raise exception 'This invitation is for a different email address.'
      using errcode = '42501';
  end if;

  if v_confirmed_at is null then
    raise exception 'Confirm your email address before accepting this invitation.'
      using errcode = '22023';
  end if;

  select v.status
    into v_vendor_status
    from public.vendors v
   where v.id = v_inv.vendor_id;

  if v_vendor_status is distinct from 'active' then
    raise exception 'This shop is not accepting staff right now.'
      using errcode = '22023';
  end if;

  insert into public.profiles (id, email)
  values (v_uid, v_email)
  on conflict (id) do nothing;

  insert into public.vendor_members (vendor_id, profile_id, role)
  values (v_inv.vendor_id, v_uid, v_inv.role)
  on conflict (vendor_id, profile_id) do nothing;

  update public.vendor_invitations
     set status = 'accepted',
         accepted_at = now(),
         accepted_by = v_uid,
         auth_user_id = coalesce(auth_user_id, v_uid)
   where id = v_inv.id;

  return v_inv.vendor_id;
end;
$$;

revoke all on function public.accept_vendor_invitation(uuid) from public, anon;
grant execute on function public.accept_vendor_invitation(uuid) to authenticated;
