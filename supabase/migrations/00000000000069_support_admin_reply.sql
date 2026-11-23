-- 00000000000069_support_admin_reply.sql
--
-- In-app admin replies on vendor support requests.
--
-- Until now an admin could only change a request's status; the only way to
-- answer the shop was email, which is not configured yet, so vendors had no
-- way to see what Gifto actually said. A reply written here is shown in the
-- vendor dashboard (Help & support → Recent requests) and included in the
-- status email when one is sent.
--
-- The "admin update" RLS policy already lets platform admins update the row;
-- the column-level grant is what restricted writes to `status` only, so the
-- grant is extended to the three new columns here. Vendors still cannot
-- update support_requests at all (no vendor update policy exists).

alter table public.support_requests
  add column if not exists admin_reply text,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references public.profiles (id) on delete set null;

-- ADD CONSTRAINT has no IF NOT EXISTS, so guard it: re-applying this
-- migration must be a no-op.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'support_requests_admin_reply_length'
       and conrelid = 'public.support_requests'::regclass
  ) then
    alter table public.support_requests
      add constraint support_requests_admin_reply_length
        check (admin_reply is null or length(trim(admin_reply)) between 1 and 4000);
  end if;
end $$;

comment on column public.support_requests.admin_reply is
  'Latest reply from a platform admin, shown in the vendor dashboard.';
comment on column public.support_requests.replied_at is
  'When the latest admin reply was written.';
comment on column public.support_requests.replied_by is
  'Platform admin who wrote the latest reply.';

grant update (status, admin_reply, replied_at, replied_by)
  on table public.support_requests to authenticated;
