-- Rollback for migration 62 (consent audit trail).
--
-- Drops price_consent_events and _record_price_consent_event, and
-- restores the migration-47 price-check wrappers without consent
-- recording. Rolling back REINTRODUCES the missing consent audit
-- trail: expected prices are validated and then discarded again, so a
-- price dispute cannot be answered from the system. Only roll back if
-- the trail itself must be removed. Any consent rows recorded before
-- the rollback are deleted with the table.

drop function if exists public._record_price_consent_event(uuid, uuid, text, jsonb, int);
drop table if exists public.price_consent_events;

-- ---------------------------------------------------------------------------
-- Signed-in checkout with price consent + gift options (P1-03 + UX Batch 1)
-- ---------------------------------------------------------------------------

drop function if exists public.place_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, jsonb, int
);

create or replace function public.place_order_with_price_check(
  p_items jsonb,
  p_recipient_name text,
  p_contact_phone text,
  p_contact_email text,
  p_address_line text,
  p_city text,
  p_governorate text,
  p_notes text,
  p_idempotency_key uuid,
  p_expected_prices jsonb,
  p_expected_total_minor int,
  p_gift_wrap boolean default false,
  p_gift_message text default null,
  p_preferred_delivery_date date default null,
  p_delivery_time_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_oid uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to place an order.'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'A checkout attempt key is required.' using errcode = '22023';
  end if;

  perform public._validate_gift_options(
    p_gift_wrap, p_gift_message,
    p_preferred_delivery_date, p_delivery_time_note
  );

  v_oid := public._create_order(
    v_uid, p_items, p_recipient_name, p_contact_phone, p_contact_email,
    p_address_line, p_city, p_governorate, p_notes, p_idempotency_key, null,
    p_expected_prices, p_expected_total_minor
  );

  update public.orders
     set gift_wrap = coalesce(p_gift_wrap, false),
         gift_message = nullif(trim(p_gift_message), ''),
         preferred_delivery_date = p_preferred_delivery_date,
         delivery_time_note = nullif(trim(p_delivery_time_note), '')
   where id = v_oid;

  return v_oid;
end;
$$;

revoke all on function public.place_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, jsonb, int,
  boolean, text, date, text
) from public, anon;
grant execute on function public.place_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, jsonb, int,
  boolean, text, date, text
) to authenticated;


-- ---------------------------------------------------------------------------
-- Guest checkout with price consent + gift options (P1-03 + UX Batch 1)
-- ---------------------------------------------------------------------------

drop function if exists public.place_guest_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int
);

create or replace function public.place_guest_order_with_price_check(
  p_items jsonb,
  p_recipient_name text,
  p_contact_phone text,
  p_contact_email text,
  p_address_line text,
  p_city text,
  p_governorate text,
  p_notes text,
  p_idempotency_key uuid,
  p_guest_token_hash text,
  p_expected_prices jsonb,
  p_expected_total_minor int,
  p_gift_wrap boolean default false,
  p_gift_message text default null,
  p_preferred_delivery_date date default null,
  p_delivery_time_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oid uuid;
begin
  -- The service role has no end-user JWT. If this is ever called from a signed
  -- in context, reject it so a caller cannot attach the order to a real user.
  if auth.uid() is not null then
    raise exception 'Guest checkout cannot be used from a signed-in session.'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'A checkout attempt key is required.' using errcode = '22023';
  end if;

  if p_guest_token_hash is null or p_guest_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid guest order credential.' using errcode = '22023';
  end if;

  perform public._validate_gift_options(
    p_gift_wrap, p_gift_message,
    p_preferred_delivery_date, p_delivery_time_note
  );

  v_oid := public._create_order(
    null, p_items, p_recipient_name, p_contact_phone, p_contact_email,
    p_address_line, p_city, p_governorate, p_notes,
    p_idempotency_key, p_guest_token_hash,
    p_expected_prices, p_expected_total_minor
  );

  update public.orders
     set gift_wrap = coalesce(p_gift_wrap, false),
         gift_message = nullif(trim(p_gift_message), ''),
         preferred_delivery_date = p_preferred_delivery_date,
         delivery_time_note = nullif(trim(p_delivery_time_note), '')
   where id = v_oid;

  return v_oid;
end;
$$;

revoke all on function public.place_guest_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int,
  boolean, text, date, text
) from public, anon, authenticated;
grant execute on function public.place_guest_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int,
  boolean, text, date, text
) to service_role;
