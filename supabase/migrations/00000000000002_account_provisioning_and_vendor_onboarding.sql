-- Gifto Marketplace — Phase 2a: account provisioning & vendor onboarding
--
-- Scope (backend/security only; UI is a follow-up task):
--   1. Provision a `public.profiles` row automatically when an auth user is
--      created. Without this, `profiles.id -> auth.users(id)` has no writer and
--      an authenticated user can never become a vendor member.
--   2. `apply_as_vendor(...)` — a SECURITY DEFINER RPC that lets an authenticated
--      user self-apply as a vendor. It creates a `pending` vendor plus an `owner`
--      membership atomically.
--
-- Why an RPC: the only INSERT policy on `vendors` is platform-admin-only (by
-- design — vendors are not created by direct client writes). Self-application
-- therefore needs a narrowly-scoped, audited entry point. The RPC:
--   * requires an authenticated caller,
--   * always creates `status = 'pending'` (never active — platform admin approval
--     is required, per the vendor status semantics),
--   * derives a unique slug server-side (client cannot choose a colliding slug),
--   * writes the owner membership in the same transaction.
-- It does not accept status/commission_rate, so a caller cannot set finance
-- fields. The existing `vendors_guard_finance_fields` trigger still covers
-- subsequent direct UPDATEs.

-- ---------------------------------------------------------------------------
-- 1. Profile provisioning on signup
-- ---------------------------------------------------------------------------

-- Runs as definer so it can insert into public.profiles regardless of RLS.
-- search_path pinned to avoid hijack. Idempotent: a pre-existing profile row
-- (e.g. seeded admin) is left untouched.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger functions do not require caller EXECUTE privilege; revoke anyway so
-- the function surface stays least-privilege.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- `drop ... if exists` keeps this migration re-runnable in throwaway test DBs.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Vendor self-onboarding RPC
-- ---------------------------------------------------------------------------

create or replace function public.apply_as_vendor(
  p_name        text,
  p_description text default null,
  p_city        text default null,
  p_governorate text default null,
  p_phone       text default null,
  p_email       text default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_base      text;
  v_slug      text;
  v_try       int := 1;
  v_vendor_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required to apply as a vendor.'
      using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Vendor name must be at least 2 characters.'
      using errcode = '22023';
  end if;

  -- The auth user must have a profile (auto-provisioned above); otherwise the
  -- owner membership FK would fail with an opaque error.
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'No profile found for the current user.'
      using errcode = '23503';
  end if;

  v_base := public.slugify(p_name);
  if v_base = '' then
    raise exception 'Vendor name must contain at least one letter or number.'
      using errcode = '22023';
  end if;

  -- Server-owned slug: try the base, then append an incrementing suffix. Past a
  -- sane bound, fall back to a random suffix so a hostile name cannot force an
  -- unbounded loop.
  v_slug := v_base;
  while exists (select 1 from public.vendors v where v.slug = v_slug) loop
    v_try := v_try + 1;
    if v_try > 100 then
      v_slug := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      exit;
    end if;
    v_slug := v_base || '-' || v_try::text;
  end loop;

  -- status/commission_rate intentionally omitted -> table defaults apply
  -- (status 'pending', commission_rate 0.1000). INSERT also fires the
  -- vendor_status_history trigger, recording the initial transition.
  insert into public.vendors (
    name, slug, description, city, governorate, contact_phone, contact_email
  )
  values (
    trim(p_name),
    v_slug,
    nullif(trim(p_description), ''),
    nullif(trim(p_city), ''),
    nullif(trim(p_governorate), ''),
    nullif(trim(p_phone), ''),
    nullif(trim(p_email), '')
  )
  returning id into v_vendor_id;

  insert into public.vendor_members (vendor_id, profile_id, role)
  values (v_vendor_id, v_uid, 'owner');

  return v_vendor_id;
end;
$$;

-- Only authenticated users may apply. Explicit signature avoids ambiguity when
-- the 6-arg overload is resolved.
revoke all on function
  public.apply_as_vendor(text, text, text, text, text, text)
from public, anon;
grant execute on function
  public.apply_as_vendor(text, text, text, text, text, text)
to authenticated;
