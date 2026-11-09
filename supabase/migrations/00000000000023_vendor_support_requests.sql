-- Gifto Marketplace - vendor support requests
--
-- Vendors submit a support request into a manual admin queue. There are no
-- notification or reply features here: the Gifto team triages requests in the
-- admin dashboard.
--
-- Insert hardening: authenticated vendors receive INSERT privilege on only
-- (vendor_id, category, subject, body). `id`, `created_by`, `status` and all
-- timestamps are assigned server-side. RLS independently requires an active
-- membership of the target shop and that `created_by` is the caller.

create type public.support_request_status as enum (
  'open',
  'in_progress',
  'resolved'
);

create table public.support_requests (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendors (id) on delete cascade,
  created_by  uuid references public.profiles (id) on delete set null
              default auth.uid(),
  category    text not null check (
                category in ('orders', 'products', 'finance', 'account', 'other')
              ),
  subject     text not null check (length(trim(subject)) between 5 and 120),
  body        text not null check (length(trim(body)) between 20 and 4000),
  status      public.support_request_status not null default 'open',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.support_requests is
  'Vendor-submitted support requests reviewed manually by platform admins.';
comment on column public.support_requests.created_by is
  'Membership user who submitted the request; set by the database default.';

create index support_requests_vendor_created_idx
  on public.support_requests (vendor_id, created_at desc);
create index support_requests_queue_idx
  on public.support_requests (status, created_at desc);
create index support_requests_creator_recent_idx
  on public.support_requests (created_by, created_at desc);

create trigger support_requests_set_updated_at
  before update on public.support_requests
  for each row execute function public.set_updated_at();

-- Lightweight abuse control. Counting real submissions avoids a second queue
-- table and keeps the limit correct even if a request is later deleted by an
-- admin. Five per rolling 15 minutes is enough for legitimate shop issues.
create or replace function public.enforce_support_request_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent integer;
begin
  if new.created_by is null then
    return new;
  end if;

  select count(*) into v_recent
    from public.support_requests
   where created_by = new.created_by
     and created_at > now() - interval '15 minutes';

  if v_recent >= 5 then
    raise exception 'You have sent several support requests recently. Please wait before sending another.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger support_requests_rate_limit
  before insert on public.support_requests
  for each row execute function public.enforce_support_request_rate_limit();

alter table public.support_requests enable row level security;

create policy "support requests: vendor read"
  on public.support_requests
  for select
  to authenticated
  using (
    public.is_vendor_active_member(vendor_id)
    or public.is_platform_admin()
  );

create policy "support requests: vendor insert"
  on public.support_requests
  for insert
  to authenticated
  with check (
    public.is_vendor_active_member(vendor_id)
    and created_by = auth.uid()
  );

create policy "support requests: admin update"
  on public.support_requests
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on table public.support_requests from public, anon, authenticated;
grant select on table public.support_requests to authenticated;
grant insert (vendor_id, category, subject, body)
  on table public.support_requests to authenticated;
grant update (status) on table public.support_requests to authenticated;
