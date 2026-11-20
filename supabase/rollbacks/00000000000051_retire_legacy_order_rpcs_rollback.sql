-- Rollback for migration 51 (R-03 legacy price-consent bypass).
--
-- Recreates the three legacy no-check checkout RPCs exactly as migrations
-- 05/11 defined them, with their original grants. Rolling back
-- REINTRODUCES the R-03 bypass: any direct RPC caller can again place an
-- order without price consent. Only roll back if the price-check RPCs
-- themselves must be removed; otherwise keep migration 51 applied.

create or replace function public.place_order(
  p_items jsonb,
  p_recipient_name text,
  p_contact_phone text,
  p_address_line text,
  p_city text,
  p_governorate text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to place an order.'
      using errcode = '42501';
  end if;

  return public._create_order(
    v_uid, p_items, p_recipient_name, p_contact_phone, null,
    p_address_line, p_city, p_governorate, p_notes, null, null
  );
end;
$$;

revoke all on function public.place_order(jsonb, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text, text, text)
  to authenticated;

create or replace function public.place_order_with_idempotency(
  p_items jsonb,
  p_recipient_name text,
  p_contact_phone text,
  p_contact_email text,
  p_address_line text,
  p_city text,
  p_governorate text,
  p_notes text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to place an order.'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'A checkout attempt key is required.' using errcode = '22023';
  end if;

  return public._create_order(
    v_uid, p_items, p_recipient_name, p_contact_phone, p_contact_email,
    p_address_line, p_city, p_governorate, p_notes, p_idempotency_key, null
  );
end;
$$;

revoke all on function public.place_order_with_idempotency(
  jsonb, text, text, text, text, text, text, text, uuid
) from public, anon;
grant execute on function public.place_order_with_idempotency(
  jsonb, text, text, text, text, text, text, text, uuid
) to authenticated;

create or replace function public.place_guest_order(
  p_items jsonb,
  p_recipient_name text,
  p_contact_phone text,
  p_contact_email text,
  p_address_line text,
  p_city text,
  p_governorate text,
  p_notes text,
  p_idempotency_key uuid,
  p_guest_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
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

  return public._create_order(
    null, p_items, p_recipient_name, p_contact_phone, p_contact_email,
    p_address_line, p_city, p_governorate, p_notes,
    p_idempotency_key, p_guest_token_hash
  );
end;
$$;

revoke all on function public.place_guest_order(
  jsonb, text, text, text, text, text, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.place_guest_order(
  jsonb, text, text, text, text, text, text, text, uuid, text
) to service_role;
