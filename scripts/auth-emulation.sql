-- Test-only Supabase auth emulation for disposable local Postgres (P0-02).
--
-- The RLS suites and migrations expect the Supabase platform's `auth` schema
-- (`auth.users`, `auth.uid()`) and the `anon` / `authenticated` /
-- `service_role` roles, which a plain local Postgres does not ship. The
-- `supabase/postgres` image has them in its default database, but a freshly
-- created `gifto_rls_test` database does not inherit them, so the CI job
-- applies this file too.
--
-- The runner (scripts/run-rls-suites.sh) applies this file ONLY when
-- `auth.users` does not already exist. It is test infrastructure only:
-- never apply it to a hosted project, and never rely on it outside tests.
--
-- Emulated surface (the minimum the migrations and suites touch):
--   auth.users (id uuid PK, email, raw_user_meta_data jsonb,
--               email_confirmed_at timestamptz, created_at)
--   auth.uid() — reads request.jwt.claim.sub, like PostgREST does
--   roles anon, authenticated, service_role (NOLOGIN; SET ROLE works)

create schema if not exists auth;

create table if not exists auth.users (
  id                uuid primary key,
  email             text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at        timestamptz not null default now()
);

alter table auth.users
  add column if not exists email_confirmed_at timestamptz;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- The Supabase image already creates these roles, including service_role with
-- BYPASSRLS. A reserved role can only be modified by a superuser, and CI's
-- postgres role is not one, so only attempt the ALTER when the required
-- attribute is actually missing. The assertions below run either way: this
-- never silently skips BYPASSRLS or weakens the RLS test semantics.
do $$
declare
  v_bypassrls boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    -- Matches the Supabase platform: service_role bypasses RLS (the
    -- hardening suite's bootstrap path relies on it).
    create role service_role nologin bypassrls;
  end if;

  select rolbypassrls into v_bypassrls
  from pg_roles
  where rolname = 'service_role';

  if not v_bypassrls then
    if not (select rolsuper from pg_roles where rolname = current_user) then
      raise exception
        'service_role lacks BYPASSRLS and % is not a superuser; cannot preserve RLS test semantics',
        current_user;
    end if;
    execute 'alter role service_role with bypassrls';
  end if;

  if not exists (
    select 1 from pg_roles
    where rolname = 'service_role' and rolbypassrls
  ) then
    raise exception 'service_role must have BYPASSRLS for RLS test semantics';
  end if;

  if exists (
    select 1 from pg_roles
    where rolname in ('anon', 'authenticated') and rolbypassrls
  ) then
    raise exception 'anon and authenticated must not have BYPASSRLS';
  end if;
end $$;

-- The Supabase platform grants the API roles USAGE on the auth schema so
-- they can call auth.uid() (the catalog/occasions suites do exactly this
-- as authenticated/anon). Roles are cluster-wide and survive dropping the
-- test database; the DO block above verifies their attributes without
-- requiring superuser rights when they are already correct.
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
