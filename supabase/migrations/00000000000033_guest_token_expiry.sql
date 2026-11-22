-- Gifto Marketplace - P1-02 (H-18): guest token expiry and recovery.
--
-- Guest access was a 7-day HttpOnly cookie or nothing: the token hash stored
-- on the order never expired server-side, and losing the cookie meant losing
-- the order, its refund cases, and any recovery path.
--
-- This migration:
--   * adds orders.guest_token_expires_at, stamped at placement (now() + 7
--     days, the current cookie lifetime) by a trigger, and backfilled for
--     existing guest orders as created_at + 7 days;
--   * enforces expiry in get_guest_order, cancel_guest_order,
--     open_guest_refund_case and get_guest_refund_cases (redefined here —
--     migrations 11, 30 and 32 are never edited in place);
--   * adds guest_recovery_tokens: single-use, 1-hour recovery links issued
--     after proving order reference + the phone or email used at checkout
--     (request_guest_order_recovery, service-role only, generic reply on
--     no match so the endpoint cannot probe for orders);
--   * adds redeem_guest_recovery_token, which rotates the guest token and
--     its expiry after a valid recovery link is used;
--   * adds claim_guest_order, which attaches a guest order to a signed-in
--     account once the caller proves the token.
--
-- The raw recovery token is returned to the server action only, is emailed
-- as a one-time link, and is stored only as a SHA-256 hash — exactly like
-- the guest token itself. Phone or reference alone is never sufficient.
-- Rate limiting lives in the server action (same quota table as checkout).

-- ---------------------------------------------------------------------------
-- Expiry column, stamped at placement and backfilled
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists guest_token_expires_at timestamptz;

comment on column public.orders.guest_token_expires_at is
  'Server-side expiry of the guest access token (P1-02, H-18). Placement stamps now() + 7 days; the guest RPCs reject an expired token. Null for signed-in orders.';

-- Stamps the expiry whenever a guest token is first stored (or rotated)
-- without an explicit expiry. An explicitly supplied expiry is never
-- overwritten, so recovery rotation controls its own lifetime.
create or replace function public.stamp_guest_token_expiry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.guest_token_hash is not null and new.guest_token_expires_at is null then
    new.guest_token_expires_at := now() + interval '7 days';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_stamp_guest_token_expiry on public.orders;
create trigger orders_stamp_guest_token_expiry
  before insert or update of guest_token_hash on public.orders
  for each row execute function public.stamp_guest_token_expiry();

revoke all on function public.stamp_guest_token_expiry()
  from public, anon, authenticated;

update public.orders
   set guest_token_expires_at = created_at + interval '7 days'
 where guest_token_hash is not null
   and guest_token_expires_at is null;

-- ---------------------------------------------------------------------------
-- Shared expiry check (used by the redefined RPCs below)
-- ---------------------------------------------------------------------------

create or replace function public.guest_token_is_live(
  p_order_id uuid,
  p_token_hash text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.orders o
     where o.id = p_order_id
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
       and (o.guest_token_expires_at is null
            or o.guest_token_expires_at > now())
  );
$$;

revoke all on function public.guest_token_is_live(uuid, text)
  from public, anon, authenticated;

-- Tells the guest order page whether a token is expired (vs never valid),
-- so it can show the recovery path instead of a bare 404. Server-side only.
create or replace function public.guest_token_expired(
  p_order_id uuid,
  p_token_hash text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.orders o
     where o.id = p_order_id
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
       and o.guest_token_expires_at is not null
       and o.guest_token_expires_at <= now()
  );
$$;

revoke all on function public.guest_token_expired(uuid, text)
  from public, anon, authenticated;
grant execute on function public.guest_token_expired(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- get_guest_order — redefined with expiry (migration 11 definition + check)
-- ---------------------------------------------------------------------------

create or replace function public.get_guest_order(
  p_order_id uuid,
  p_token_hash text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'reference', o.public_reference,
    'status', o.status,
    'currency', o.currency,
    'subtotal_minor', o.subtotal_minor,
    'delivery_fee_minor', o.delivery_fee_minor,
    'total_minor', o.total_minor,
    'recipient_name', o.recipient_name,
    'contact_phone', o.contact_phone,
    'address_line', o.address_line,
    'city', o.city,
    'governorate', o.governorate,
    'notes', o.notes,
    'created_at', o.created_at,
    'vendors', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ov.id,
          'status', ov.status,
          'subtotal_minor', ov.subtotal_minor,
          'vendor_name', v.name,
          'vendor_slug', v.slug,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'product_name', i.product_name,
                'product_slug', i.product_slug,
                'unit_price_minor', i.unit_price_minor,
                'quantity', i.quantity,
                'line_total_minor', i.line_total_minor
              )
              order by i.created_at, i.id
            )
            from public.order_items i
            where i.order_vendor_id = ov.id
          ), '[]'::jsonb)
        )
        order by ov.created_at, ov.id
      )
      from public.order_vendors ov
      join public.vendors v on v.id = ov.vendor_id
      where ov.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id
    and o.guest_token_hash is not null
    and o.guest_token_hash = lower(p_token_hash)
    and p_token_hash ~ '^[0-9a-f]{64}$'
    and (o.guest_token_expires_at is null
         or o.guest_token_expires_at > now());
$$;

revoke all on function public.get_guest_order(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_guest_order(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- cancel_guest_order — redefined with expiry (migration 32 + check)
-- ---------------------------------------------------------------------------

create or replace function public.cancel_guest_order(
  p_order_id uuid,
  p_token_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
begin
  if p_token_hash is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.user_id is null
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
       and (o.guest_token_expires_at is null
            or o.guest_token_expires_at > now())
  ) then
    raise exception 'Order not found.' using errcode = '42501';
  end if;

  select status
    into v_status
    from public.orders
   where id = p_order_id
   for update;

  -- Idempotent: an already-cancelled order is already in the desired end
  -- state. Return without touching anything so stock is never restocked
  -- twice.
  if v_status = 'cancelled' then
    return;
  end if;

  if v_status <> 'placed' then
    raise exception 'Only orders that no shop has started processing can be cancelled.'
      using errcode = '23514';
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id;

  -- Each suborder cancellation restores its stock via the restock trigger
  -- and is recorded by the migration-28 audit trigger.
  update public.order_vendors
     set status = 'cancelled'
   where order_id = p_order_id
     and status <> 'cancelled';
end;
$$;

revoke all on function public.cancel_guest_order(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_guest_order(uuid, text) to service_role;

comment on function public.cancel_guest_order(uuid, text) is
  'Guest self-service cancellation (P0-05, H-02). Token-hash gated, service-role only; mirrors cancel_order() placed-only rule and restock semantics. A second call on a cancelled order is a no-op. P1-02: rejects expired tokens.';

-- ---------------------------------------------------------------------------
-- open_guest_refund_case — redefined with expiry (migration 30 + check)
-- ---------------------------------------------------------------------------

create or replace function public.open_guest_refund_case(
  p_order_id uuid,
  p_token_hash text,
  p_order_vendor_id uuid,
  p_reason text,
  p_requested_amount_minor int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suborder record;
  v_case_id  uuid;
begin
  if p_token_hash is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
       and (o.guest_token_expires_at is null
            or o.guest_token_expires_at > now())
  ) then
    raise exception 'This order link is not valid.' using errcode = '42501';
  end if;

  select ov.id, ov.order_id, ov.vendor_id, ov.status, ov.subtotal_minor
    into v_suborder
    from public.order_vendors ov
   where ov.id = p_order_vendor_id
     and ov.order_id = p_order_id;

  if v_suborder.id is null then
    raise exception 'Choose a valid order item group.' using errcode = '22023';
  end if;

  if v_suborder.status not in ('shipped', 'delivered', 'returned') then
    raise exception 'A refund can be requested after the shop ships the order.'
      using errcode = '23514';
  end if;

  if p_reason is null or length(trim(p_reason)) not between 5 and 1000 then
    raise exception 'Describe the problem in 5-1000 characters.'
      using errcode = '22023';
  end if;

  if p_requested_amount_minor is not null
     and (p_requested_amount_minor < 0
          or p_requested_amount_minor > v_suborder.subtotal_minor) then
    raise exception 'The requested amount cannot exceed the shop subtotal.'
      using errcode = '22023';
  end if;

  begin
    insert into public.refund_cases (
      order_id, order_vendor_id, vendor_id, source, opened_by,
      reason, requested_amount_minor
    ) values (
      v_suborder.order_id, v_suborder.id, v_suborder.vendor_id, 'guest',
      null, trim(p_reason), p_requested_amount_minor
    )
    returning id into v_case_id;
  exception when unique_violation then
    raise exception 'There is already an open refund case for this shop in your order.'
      using errcode = '23514';
  end;

  return v_case_id;
end;
$$;

revoke all on function public.open_guest_refund_case(uuid, text, uuid, text, int)
  from public, anon, authenticated;
grant execute on function public.open_guest_refund_case(uuid, text, uuid, text, int)
  to service_role;

-- ---------------------------------------------------------------------------
-- get_guest_refund_cases — redefined with expiry (migration 30 + check)
-- ---------------------------------------------------------------------------

create or replace function public.get_guest_refund_cases(
  p_order_id uuid,
  p_token_hash text
)
returns table (
  id uuid,
  order_vendor_id uuid,
  status public.refund_case_status,
  reason text,
  requested_amount_minor int,
  refund_amount_minor int,
  resolution_note text,
  created_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token_hash is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
       and (o.guest_token_expires_at is null
            or o.guest_token_expires_at > now())
  ) then
    raise exception 'This order link is not valid.' using errcode = '42501';
  end if;

  return query
    select rc.id, rc.order_vendor_id, rc.status, rc.reason,
           rc.requested_amount_minor, rc.refund_amount_minor,
           rc.resolution_note, rc.created_at, rc.resolved_at
      from public.refund_cases rc
     where rc.order_id = p_order_id
     order by rc.created_at desc;
end;
$$;

revoke all on function public.get_guest_refund_cases(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_guest_refund_cases(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- guest_recovery_tokens — single-use, 1-hour recovery links
-- ---------------------------------------------------------------------------

create table if not exists public.guest_recovery_tokens (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  token_hash   text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now(),
  constraint guest_recovery_tokens_one_live_per_order
    unique (order_id, token_hash)
);

alter table public.guest_recovery_tokens enable row level security;

-- No policies: only the service role (which bypasses RLS) needs this table.
revoke all on table public.guest_recovery_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.guest_recovery_tokens to service_role;

create index if not exists guest_recovery_tokens_order_idx
  on public.guest_recovery_tokens (order_id, expires_at);

comment on table public.guest_recovery_tokens is
  'Single-use guest order recovery links (P1-02, H-18). Only the SHA-256 hash is stored; the raw token is emailed once and never logged.';

-- ---------------------------------------------------------------------------
-- request_guest_order_recovery — prove reference + phone/email, get a link
-- ---------------------------------------------------------------------------

create or replace function public.request_guest_order_recovery(
  p_public_reference text,
  p_contact text
)
returns table (
  order_id uuid,
  recovery_token text,
  contact_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_contact_email text;
  v_raw_token text;
begin
  if p_public_reference is null
     or upper(btrim(p_public_reference)) !~ '^GFT-[0-9A-F]{12}$' then
    return;
  end if;

  if p_contact is null or length(btrim(p_contact)) < 5 then
    return;
  end if;

  -- Reference plus the phone or email used at checkout. No match means a
  -- silent empty result — the caller cannot tell whether the reference, the
  -- contact, or both were wrong.
  select o.id, o.contact_email
    into v_order_id, v_contact_email
    from public.orders o
   where o.public_reference = upper(btrim(p_public_reference))
     and o.user_id is null
     and o.guest_token_hash is not null
     and (
       btrim(o.contact_phone) = btrim(p_contact)
       or (o.contact_email is not null
           and lower(o.contact_email) = lower(btrim(p_contact)))
     );

  if v_order_id is null then
    return;
  end if;

  -- One live recovery link per order; issuing a new one invalidates the old.
  -- (Column qualified: the function's RETURNS TABLE also names a column
  -- order_id, which would make the reference ambiguous.)
  delete from public.guest_recovery_tokens
   where public.guest_recovery_tokens.order_id = v_order_id
     and used_at is null;

  v_raw_token := encode(gen_random_bytes(32), 'hex');

  insert into public.guest_recovery_tokens (order_id, token_hash, expires_at)
  values (
    v_order_id,
    encode(sha256(convert_to(v_raw_token, 'UTF8')), 'hex'),
    now() + interval '1 hour'
  );

  return query select v_order_id, v_raw_token, v_contact_email;
end;
$$;

revoke all on function public.request_guest_order_recovery(text, text)
  from public, anon, authenticated;
grant execute on function public.request_guest_order_recovery(text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- redeem_guest_recovery_token — use the link once, rotate the guest token
-- ---------------------------------------------------------------------------

create or replace function public.redeem_guest_recovery_token(
  p_order_id uuid,
  p_token_hash text,
  p_new_token_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_new_token_hash is null or p_new_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'This recovery link is not valid or has expired.'
      using errcode = '42501';
  end if;

  select id
    into v_token_id
    from public.guest_recovery_tokens
   where order_id = p_order_id
     and token_hash = p_token_hash
     and used_at is null
     and expires_at > now()
   for update;

  if v_token_id is null then
    raise exception 'This recovery link is not valid or has expired.'
      using errcode = '42501';
  end if;

  update public.guest_recovery_tokens
     set used_at = now()
   where id = v_token_id;

  -- Rotate the guest token and refresh its 7-day lifetime. The trigger
  -- would stamp an expiry anyway; setting it explicitly keeps the rule in
  -- one place and survives the trigger being dropped.
  update public.orders
     set guest_token_hash = p_new_token_hash,
         guest_token_expires_at = now() + interval '7 days'
   where id = p_order_id
     and user_id is null;

  if not found then
    raise exception 'This recovery link is not valid or has expired.'
      using errcode = '42501';
  end if;

  delete from public.guest_recovery_tokens
   where order_id = p_order_id
     and id <> v_token_id;
end;
$$;

revoke all on function public.redeem_guest_recovery_token(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.redeem_guest_recovery_token(uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- claim_guest_order — attach a guest order to a signed-in account
-- ---------------------------------------------------------------------------

create or replace function public.claim_guest_order(
  p_order_id uuid,
  p_token_hash text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or not exists (
    select 1 from auth.users where id = p_user_id
  ) then
    raise exception 'Order not found.' using errcode = '42501';
  end if;

  if p_token_hash is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.user_id is null
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
       and (o.guest_token_expires_at is null
            or o.guest_token_expires_at > now())
  ) then
    raise exception 'Order not found.' using errcode = '42501';
  end if;

  update public.orders
     set user_id = p_user_id,
         guest_token_hash = null,
         guest_token_expires_at = null
   where id = p_order_id
     and user_id is null;

  -- The guest token is gone, so outstanding recovery links die with it.
  delete from public.guest_recovery_tokens where order_id = p_order_id;
end;
$$;

revoke all on function public.claim_guest_order(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_guest_order(uuid, text, uuid)
  to service_role;
