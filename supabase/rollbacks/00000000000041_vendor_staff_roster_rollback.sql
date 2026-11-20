-- Rollback for 00000000000041_vendor_staff_roster.sql (P1-14, H-07).
--
-- Drops the roster-read RPC. Safe to run only while no deployed code still
-- calls list_vendor_members; the staff page falls back to no roster. The
-- vendor_members table, its RLS policies and the last-owner guard are
-- untouched (they predate P1-14).

drop function if exists public.list_vendor_members(uuid);
