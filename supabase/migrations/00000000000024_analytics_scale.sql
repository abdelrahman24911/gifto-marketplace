-- ---------------------------------------------------------------------------
-- 24. Analytics read scale
--
-- Vendor analytics filters and sorts `order_vendors` by vendor and placement
-- date. The existing `(vendor_id, status)` index cannot serve the date window
-- or the bounded all-time read efficiently, so add a covering composite index.
-- Existing row visibility and grants are unchanged.
-- ---------------------------------------------------------------------------

create index order_vendors_vendor_created_idx
  on public.order_vendors (vendor_id, created_at desc)
  include (status, subtotal_minor, delivered_at);

comment on index public.order_vendors_vendor_created_idx is
  'Serves vendor analytics date windows and bounded all-time reads.';
