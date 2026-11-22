-- Gifto Marketplace - P1-13 (H-10 remainder): admin address correction.
--
-- The admin order detail page (migration 28 + src/app/admin/orders/[id])
-- renders the delivery address read-only, and the audit trail already has a
-- "wrong_address" reason code for a problem nobody could fix in the UI. A
-- typo'd address meant a failed COD delivery or off-system handling.
--
-- This migration adds the correction only; the detail page, the status
-- override and the status timeline are untouched:
--
--   * order_address_corrections: append-only audit of every correction with
--     actor, reason, note, and before/after values. order_status_events is
--     deliberately NOT reused: it is a status-event table (one row per
--     suborder transition, with from/to status and a vendor), and forcing a
--     fake status transition to record an address fix would corrupt the
--     timeline the detail page renders.
--   * correct_order_address(): the single write path. SECURITY DEFINER with
--     a pinned search_path, platform-admin only, mirroring
--     set_order_vendor_status (migration 28):
--       - the order row is locked FOR UPDATE first;
--       - rejected while any suborder is delivered or returned (a delivered
--         parcel cannot be re-addressed);
--       - the five address fields use exactly the length rules place_order
--         enforces (migration 05), so a correction can never store a value
--         checkout would have refused;
--       - a reason is mandatory; a note is mandatory when the reason is
--         "other"; the note is capped at 1000 characters like status notes;
--       - coverage consequence (migration 29): if the corrected
--         governorate/city/address would put a live suborder outside its
--         vendor's delivery coverage, the call changes NOTHING and returns
--         {ok:false, error:"coverage_break", vendors:[...]} so the UI can
--         ask for an explicit second confirmation naming the affected
--         shop(s). Passing p_acknowledge_coverage_break=true applies the
--         correction and records the acknowledgement in the audit row. The
--         correction never re-runs checkout and never moves stock.
--
-- Direct UPDATE on the address columns stays revoked for signed-in users
-- (no admin UPDATE policy exists on orders); the RPC is the only path.

-- ---------------------------------------------------------------------------
-- Append-only correction audit
-- ---------------------------------------------------------------------------

create table public.order_address_corrections (
  id                             bigint generated always as identity primary key,
  order_id                       uuid not null references public.orders (id) on delete cascade,
  actor_id                       uuid references public.profiles (id) on delete set null,
  reason_code                    text not null
                                 check (reason_code in (
                                   'wrong_address',
                                   'customer_request',
                                   'other'
                                 )),
  note                           text check (note is null or length(note) <= 1000),
  -- Before/after snapshots of the five corrected fields, as JSON objects
  -- with keys recipient_name, contact_phone, address_line, city,
  -- governorate. Stored as data, not as a fake status event.
  before                         jsonb not null,
  after                          jsonb not null,
  coverage_warning_acknowledged  boolean not null default false,
  created_at                     timestamptz not null default now()
);

alter table public.order_address_corrections enable row level security;

create index order_address_corrections_order_idx
  on public.order_address_corrections (order_id, created_at desc);

-- Corrections are admin business records: only platform admins read them.
-- The customer order pages do not surface corrections.
create policy "order_address_corrections: platform admin read"
  on public.order_address_corrections for select
  using (public.is_platform_admin());

revoke all on table public.order_address_corrections from public, anon, authenticated;
grant select on table public.order_address_corrections to authenticated, service_role;

comment on table public.order_address_corrections is
  'Append-only audit of admin delivery-address corrections (P1-13, H-10). One row per correction with actor, reason, note and before/after values; never a status event.';

-- ---------------------------------------------------------------------------
-- Single controlled correction path
-- ---------------------------------------------------------------------------

create or replace function public.correct_order_address(
  p_order_id uuid,
  p_recipient_name text,
  p_contact_phone text,
  p_address_line text,
  p_city text,
  p_governorate text,
  p_reason_code text,
  p_note text default null,
  p_acknowledge_coverage_break boolean default false
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_reason text := nullif(lower(btrim(p_reason_code)), '');
  v_note text := nullif(btrim(p_note), '');
  v_recipient text := btrim(p_recipient_name);
  v_phone text := btrim(p_contact_phone);
  v_address text := btrim(p_address_line);
  v_city text := btrim(p_city);
  v_governorate text := btrim(p_governorate);
  v_breaking_vendors text[] := array[]::text[];
  v_before jsonb;
  v_after jsonb;
begin
  if v_actor is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can correct an order address.'
      using errcode = '42501';
  end if;

  select *
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found.' using errcode = '42501';
  end if;

  -- Same length rules place_order enforces (migration 05).
  if v_recipient is null or length(v_recipient) not between 2 and 120 then
    raise exception 'Enter the recipient name (2-120 characters).' using errcode = '22023';
  end if;
  if v_phone is null or length(v_phone) not between 5 and 30 then
    raise exception 'Enter the phone number (5-30 characters).' using errcode = '22023';
  end if;
  if v_address is null or length(v_address) not between 5 and 300 then
    raise exception 'Enter the address (5-300 characters).' using errcode = '22023';
  end if;
  if v_city is null or length(v_city) not between 2 and 80 then
    raise exception 'Enter the city (2-80 characters).' using errcode = '22023';
  end if;
  if v_governorate is null or length(v_governorate) not between 2 and 80 then
    raise exception 'Enter the governorate (2-80 characters).' using errcode = '22023';
  end if;

  if v_reason is null or v_reason not in (
    'wrong_address',
    'customer_request',
    'other'
  ) then
    raise exception 'Choose a valid reason for this address correction.' using errcode = '22023';
  end if;

  if v_note is not null and length(v_note) > 1000 then
    raise exception 'The note must be 1000 characters or fewer.' using errcode = '22001';
  end if;

  if v_reason = 'other' and v_note is null then
    raise exception 'Add a note when the reason is "other".'
      using errcode = '23514';
  end if;

  -- A delivered or returned parcel cannot be re-addressed.
  if exists (
    select 1
      from public.order_vendors ov
     where ov.order_id = v_order.id
       and ov.status in ('delivered', 'returned')
  ) then
    raise exception 'This order can no longer be corrected: a shop line has already been delivered or returned.'
      using errcode = '23514';
  end if;

  -- Coverage consequence (migration 29): a correction must never silently
  -- create an undeliverable order. Only live (non-cancelled) suborders are
  -- checked; cancelled lines no longer need delivery.
  select coalesce(array_agg(v.name order by v.name), array[]::text[])
    into v_breaking_vendors
    from public.order_vendors ov
    join public.vendors v on v.id = ov.vendor_id
   where ov.order_id = v_order.id
     and ov.status <> 'cancelled'
     and not public.delivery_coverage_allows(
       v.delivery_coverage, v_city, v_governorate, v_address
     );

  if cardinality(v_breaking_vendors) > 0
     and not coalesce(p_acknowledge_coverage_break, false) then
    return jsonb_build_object(
      'ok', false,
      'error', 'coverage_break',
      'vendors', to_jsonb(v_breaking_vendors)
    );
  end if;

  v_before := jsonb_build_object(
    'recipient_name', v_order.recipient_name,
    'contact_phone', v_order.contact_phone,
    'address_line', v_order.address_line,
    'city', v_order.city,
    'governorate', v_order.governorate
  );
  v_after := jsonb_build_object(
    'recipient_name', v_recipient,
    'contact_phone', v_phone,
    'address_line', v_address,
    'city', v_city,
    'governorate', v_governorate
  );

  update public.orders
     set recipient_name = v_recipient,
         contact_phone = v_phone,
         address_line = v_address,
         city = v_city,
         governorate = v_governorate
   where id = v_order.id;

  insert into public.order_address_corrections (
    order_id,
    actor_id,
    reason_code,
    note,
    before,
    after,
    coverage_warning_acknowledged
  ) values (
    v_order.id,
    v_actor,
    v_reason,
    v_note,
    v_before,
    v_after,
    cardinality(v_breaking_vendors) > 0
  );

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'coverage_break', to_jsonb(v_breaking_vendors)
  );
end;
$$;

revoke all on function public.correct_order_address(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean
) from public, anon;
grant execute on function public.correct_order_address(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean
) to authenticated;

comment on function public.correct_order_address(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean
) is
  'Admin-only delivery-address correction with mandatory reason, delivered/returned guard, coverage-break confirmation, and append-only audit (P1-13, H-10).';
