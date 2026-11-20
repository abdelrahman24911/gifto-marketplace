-- Gifto Marketplace - auth and server-action rate limits (P1-12, H-12)
--
-- Login, signup, password reset, guest-order recovery, order claim/cancel,
-- refund cases, and admin/vendor mutations are rate-limited server-side.
-- Only checkout (migration 11) and vendor support requests (migration 23)
-- were limited before; credential stuffing and signup abuse against an
-- Egyptian consumer marketplace (shared CGNAT IPs) need limits that are
-- verified, not assumed from Supabase defaults.
--
-- Shape reuses the checkout quota pattern exactly: one row per hashed
-- bucket, a fixed window, an atomic upsert that returns the attempt count,
-- and the caller comparing the count with its limit. A separate table from
-- checkout_rate_limits keeps the two concerns apart (different windows,
-- different retention, and an auth bucket can never collide with a
-- checkout bucket).
--
-- Buckets are SHA-256 hashes of a scope plus a caller key (IP, account id,
-- email, or order id) — never raw IP addresses. Raw IPs are never stored
-- or logged by the rate limiter; see src/lib/rate-limit.ts. Opportunistic
-- cleanup keeps rows for at most 2 days, matching checkout.
--
-- The RPC is service_role-only. Anonymous and authenticated API roles
-- cannot execute it, so the limit cannot be probed or reset from the
-- browser; only server code holding the service key can consume quota.

create table if not exists public.auth_rate_limits (
  bucket        text primary key,
  window_start  timestamptz not null default now(),
  attempts      integer not null default 0 check (attempts >= 0)
);

alter table public.auth_rate_limits enable row level security;

-- No policies: only the service role (which bypasses RLS) needs this table.
revoke all on table public.auth_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_rate_limits to service_role;

comment on table public.auth_rate_limits is
  'Hashed rate-limit buckets for auth and sensitive server actions (P1-12). Buckets are SHA-256 hashes, never raw IPs; rows are pruned after 2 days.';

-- Returns the attempt count inside the current window and records the attempt.
-- The caller (server code in src/lib/rate-limit.ts) compares it with its
-- limit, so the increment is committed even when the request is rejected.
create or replace function public.consume_auth_quota(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
begin
  if p_bucket is null or length(p_bucket) not between 16 and 128 then
    raise exception 'Invalid auth bucket.' using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'Invalid auth limit.' using errcode = '22023';
  end if;

  if p_window_seconds is null or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'Invalid auth window.' using errcode = '22023';
  end if;

  -- Opportunistic cleanup keeps the table tiny without a scheduled job.
  delete from public.auth_rate_limits
   where window_start < now() - interval '2 days';

  insert into public.auth_rate_limits (bucket, window_start, attempts)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set attempts = case
          when public.auth_rate_limits.window_start
               < now() - make_interval(secs => p_window_seconds)
            then 1
          else public.auth_rate_limits.attempts + 1
        end,
        window_start = case
          when public.auth_rate_limits.window_start
               < now() - make_interval(secs => p_window_seconds)
            then now()
          else public.auth_rate_limits.window_start
        end
  returning attempts into v_attempts;

  return v_attempts;
end;
$$;

revoke all on function public.consume_auth_quota(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_auth_quota(text, integer, integer)
  to service_role;
