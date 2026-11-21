-- Rollback for migration 57 (R-03): restore the legacy 11-argument
-- _create_order wrapper exactly as migration 34 defined it — a
-- delegating wrapper passing null expected prices, grant-revoked from
-- every API role.

create or replace function public._create_order(
  p_user_id uuid,
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
language sql
security definer
set search_path = public, extensions
as $$
  select public._create_order(
    p_user_id, p_items, p_recipient_name, p_contact_phone, p_contact_email,
    p_address_line, p_city, p_governorate, p_notes,
    p_idempotency_key, p_guest_token_hash, null, null
  );
$$;

revoke all on function public._create_order(
  uuid, jsonb, text, text, text, text, text, text, text, uuid, text
) from public, anon, authenticated, service_role;
