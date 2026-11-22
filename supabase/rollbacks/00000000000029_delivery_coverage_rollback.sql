-- Rollback for 00000000000029_delivery_coverage.sql.
--
-- Removes the checkout-time delivery-coverage trigger and its helper
-- functions. Out-of-coverage orders will be accepted again, so deploy the
-- pre-29 application behavior in the same window.
--
-- Run after rolling back 37 (which redefines delivery_coverage_allows) and
-- any later migration that calls it, such as 40. No stored data is changed.

drop trigger if exists order_vendors_assert_delivery_coverage
  on public.order_vendors;
drop function if exists public.assert_order_vendor_delivery_coverage();
drop function if exists public.delivery_coverage_allows(jsonb, text, text, text);
