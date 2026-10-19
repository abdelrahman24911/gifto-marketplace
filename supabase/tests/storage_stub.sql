-- Minimal storage schema stub for local container test runs.
--
-- The raw `supabase/postgres` image ships without the storage schema (the
-- hosted platform installs it separately). Migration 0009 creates the
-- `product-images` bucket and its storage.objects policies, so this stub —
-- created BEFORE the migrations — gives those policies a table to live on.
-- It mirrors only the columns and privileges the policies and suites touch.
-- Never run this against a hosted project: hosted storage already exists.
--
-- Run this file AS supabase_admin (the raw image's `postgres` role is not a
-- superuser and does not own the storage schema):
--   docker exec -e PGPASSWORD=postgres gifto-rls-test \
--     psql -U supabase_admin -v ON_ERROR_STOP=1 -f /tmp/storage_stub.sql
-- Objects are re-owned to `postgres` so the migration runner (which applies
-- migrations as `postgres`) can create its policies on storage.objects — the
-- same capability the hosted platform grants its migration role.

create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.buckets owner to postgres;
alter table storage.objects owner to postgres;
alter schema storage owner to postgres;

alter table storage.objects enable row level security;

-- Mirrors the hosted platform's object-path helper: the folders above the
-- file name, split on '/'.
create or replace function storage.foldername(name text)
returns text[]
language sql immutable
as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1];
$$;

-- Mirrors the hosted platform's default object privileges.
grant usage on schema storage to anon, authenticated, service_role;
grant select on table storage.buckets to anon, authenticated, service_role;
grant select on table storage.objects to anon, authenticated, service_role;
grant insert, update, delete on table storage.objects to authenticated, service_role;
