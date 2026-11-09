-- Rollback for 00000000000024_analytics_scale.sql.
--
-- Drops the analytics vendor/date index only. No data or permissions change.
-- The bounded all-time application read remains valid without the index, but
-- analytics queries may become slower on large order histories.

drop index if exists public.order_vendors_vendor_created_idx;
