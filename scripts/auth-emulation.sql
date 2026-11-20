-- Test-only Supabase auth emulation for disposable local Postgres (P0-02).
--
-- The RLS suites and migrations expect the Supabase platform's `auth` schema
-- (`auth.users`, `auth.uid()`) and the `anon` / `authenticated` /
-- `service_role` roles, which a plain local Postgres does not ship. The
-- GitHub-hosted CI job uses the `supabase/postgres` image, which provides
-- them natively, and this file is skipped there.
--
-- The runner (scripts/run-rls-suites.sh) applies this file ONLY when
-- `auth.users` does not already exist. It is test infrastructure only:
-- never apply it to a hosted project, and never rely on it outside tests.
--
-- Emulated surface (the minimum the migrations and suites touch):
--   auth.users (id uuid PK, email, raw_user_meta_data jsonb, created_at)
--   auth.uid() — reads request.jwt.claim.sub, like PostgREST does
--   roles anon, authenticated, service_role (NOLOGIN; SET ROLE works)

create schema if not exists auth;

create table if not exists auth.users (
  id                uuid primary key,
  email             text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
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
end $$;

-- The Supabase platform grants the API roles USAGE on the auth schema so
-- they can call auth.uid() (the catalog/occasions suites do exactly this
-- as authenticated/anon). The ALTER is idempotent: roles created by an
-- older version of this file (without BYPASSRLS) are upgraded in place,
-- because roles are cluster-wide and survive dropping the test database.
alter role service_role with bypassrls;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
