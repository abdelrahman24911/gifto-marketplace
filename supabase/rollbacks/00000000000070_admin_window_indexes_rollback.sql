-- Rollback for 00000000000070_admin_window_indexes.sql.
-- Drops the three window-read indexes. The indexed columns and their
-- data are untouched; dropping an index only removes the lookup
-- structure, so this rollback is safe on any database — but like all
-- rollbacks it is still disposable-database-only by policy.
-- Never apply rollbacks outside a disposable database.

drop index if exists public.orders_created_idx;
drop index if exists public.commission_entries_earned_idx;
drop index if exists public.commission_entries_vendor_earned_idx;
