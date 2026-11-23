-- Migration 70 — Batch 3 (P4): indexes for the admin console's time-window
-- reads and the vendor finance ledger.
--
-- The overview and analytics pages filter orders by created_at and
-- commission_entries by earned_at over a 30-day window on every load and
-- order by the same columns, and the vendor finance ledger reads
-- commission_entries by vendor with an earned_at range ordered by
-- earned_at desc. No index covered either timestamp column (the existing
-- orders indexes are on status and (user_id, created_at); the existing
-- commission_entries index is on (vendor_id, status)), so all three
-- queries scanned the whole table and sorted. At pilot volumes that is
-- invisible, but these are the hottest dashboard reads and the indexes
-- are small and standard, so they are added now rather than after the
-- first slow month.
--
-- orders_created_idx serves the admin 30-day window and the recent-orders
-- ordering (created_at desc, limit 6).
-- commission_entries_earned_idx serves the admin 30-day window on
-- earned_at (no vendor filter on the overview/analytics reads).
-- commission_entries_vendor_earned_idx serves the vendor finance ledger
-- and the admin commissions per-vendor reads (vendor equality, earned_at
-- range and ordering, id tiebreak).

create index if not exists orders_created_idx
  on public.orders (created_at desc);

create index if not exists commission_entries_earned_idx
  on public.commission_entries (earned_at desc);

create index if not exists commission_entries_vendor_earned_idx
  on public.commission_entries (vendor_id, earned_at desc, id desc);
