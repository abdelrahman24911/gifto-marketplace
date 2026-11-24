-- Gifto Marketplace - delivery coverage no longer gates checkout.
--
-- NUMBERING: migration 72 is already occupied by
-- 00000000000072_vendor_invitations.sql (unapplied at the time of this
-- change), so this is the next free version, 73.
--
-- CHOICE: redefine delivery_coverage_allows() instead of dropping the
-- order_vendors_assert_delivery_coverage trigger. The trigger stays as an
-- address-validity guard: it rejects a missing or unknown governorate and
-- accepts every valid Egyptian governorate, regardless of which governorates
-- or areas the vendor lists. Dropping the trigger would need a second change
-- to keep direct function callers in sync and would let an invalid
-- governorate through the order_vendors insert (the _create_order length
-- check is not an Egyptian-governorate check).
--
-- Gifto ships the order, so vendors.delivery_coverage is now informational.
-- The stored lists and the admin/vendor settings screens are untouched and
-- remain editable for a future per-vendor delivery model. The admin address
-- correction RPC also calls this function for its P1-13 coverage warning, so
-- a correction to another valid governorate now applies without a warning;
-- order_address_corrections.coverage_warning_acknowledged remains for
-- historical rows and new rows record false.
--
-- Validity uses the existing normalize_governorate_name() from migration 37:
-- trim, collapse whitespace, case-fold, tolerate a trailing "Governorate"
-- suffix or leading "محافظة" prefix, and normalize Arabic orthography. This
-- mirrors deliveryCoverageAllows() in src/lib/vendor-settings.ts.

create or replace function public.delivery_coverage_allows(
  p_coverage jsonb,
  p_city text,
  p_governorate text,
  p_address_line text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select public.normalize_governorate_name(p_governorate) is not null;
$$;

revoke all on function public.delivery_coverage_allows(jsonb, text, text, text)
  from public, anon, authenticated;

comment on function public.delivery_coverage_allows(jsonb, text, text, text) is
  'Delivery coverage is informational. Allows any valid Egyptian governorate (normalize_governorate_name is not null), regardless of the vendor coverage lists; rejects a missing or unknown governorate. Mirrors deliveryCoverageAllows() in src/lib/vendor-settings.ts.';
