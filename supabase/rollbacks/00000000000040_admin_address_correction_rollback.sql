-- Rollback for 00000000000040_admin_address_correction.sql (P1-13, H-10).
--
-- Drops the correction RPC and its audit table. Safe to run only while no
-- deployed code still calls correct_order_address; the admin detail page
-- renders the address read-only again, as before P1-13. Correction history
-- recorded in order_address_corrections is deleted with the table — export
-- it first if the audit trail must be kept.

drop function if exists public.correct_order_address(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  boolean
);
drop table if exists public.order_address_corrections;
