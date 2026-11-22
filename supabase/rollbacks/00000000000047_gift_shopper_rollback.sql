-- Rollback for 00000000000047_gift_shopper.sql.
--
-- Removes wishlists, saved addresses, the four gift/delivery-preference
-- columns, the gift-option validator, and the 15/16-argument price-check
-- wrappers; restores migration 34's 11/12-argument wrappers and grants.
--
-- DATA LOSS: wishlists, saved addresses, gift messages, wrap choices,
-- preferred dates, and delivery-time notes are deleted. This rollback
-- refuses while any of that data exists; export it first. Run it after
-- rolling back 48-66 in reverse order (62 restores this migration's
-- wrappers, and 48/49 restore get_guest_order's shape). Deploy the
-- pre-47 application code in the same window.

do $$
begin
  if to_regclass('public.wishlists') is not null then
    if exists (select 1 from public.wishlists) then
      raise exception 'Refusing to roll back 47: wishlists contain rows. Export them first.';
    end if;
  end if;

  if to_regclass('public.saved_addresses') is not null then
    if exists (select 1 from public.saved_addresses) then
      raise exception 'Refusing to roll back 47: saved addresses contain rows. Export them first.';
    end if;
  end if;

  if (
    select count(*)
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'orders'
       and column_name in (
         'gift_wrap',
         'gift_message',
         'preferred_delivery_date',
         'delivery_time_note'
       )
  ) = 4 then
    if exists (
      select 1
        from public.orders
       where gift_wrap is true
          or gift_message is not null
          or preferred_delivery_date is not null
          or delivery_time_note is not null
    ) then
      raise exception 'Refusing to roll back 47: orders contain gift or delivery-preference data. Export it first.';
    end if;
  end if;
end $$;

-- Drop the migration-47 wrappers before restoring the migration-34 ones.
drop function if exists public.place_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, jsonb, int,
  boolean, text, date, text
);
drop function if exists public.place_guest_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int,
  boolean, text, date, text
);

-- ---------------------------------------------------------------------------
-- Signed-in checkout with price consent (migration 34)
-- ---------------------------------------------------------------------------

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
  p_expected_total_minor int
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
    p_address_line, p_city, p_governorate, p_notes, p_idempotency_key, null,
    p_expected_prices, p_expected_total_minor
  );
end;
$$;

revoke all on function public.place_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, jsonb, int
) from public, anon;
grant execute on function public.place_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, jsonb, int
) to authenticated;

-- ---------------------------------------------------------------------------
-- Guest checkout with price consent (migration 34, service-role only)
-- ---------------------------------------------------------------------------

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
  p_expected_total_minor int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  return public._create_order(
    null, p_items, p_recipient_name, p_contact_phone, p_contact_email,
    p_address_line, p_city, p_governorate, p_notes,
    p_idempotency_key, p_guest_token_hash,
    p_expected_prices, p_expected_total_minor
  );
end;
$$;

revoke all on function public.place_guest_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int
) from public, anon, authenticated;
grant execute on function public.place_guest_order_with_price_check(
  jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int
) to service_role;

drop function if exists public._validate_gift_options(boolean, text, date, text);

alter table public.orders
  drop constraint if exists orders_gift_message_check,
  drop constraint if exists orders_delivery_time_note_check;

alter table public.orders
  drop column if exists delivery_time_note,
  drop column if exists preferred_delivery_date,
  drop column if exists gift_message,
  drop column if exists gift_wrap;

drop table if exists public.saved_addresses;
drop table if exists public.wishlists;
