-- Rollback for 00000000000039_auth_rate_limits.sql (P1-12, H-12).
--
-- Drops the auth quota RPC and its table. Safe to run only while no
-- deployed code still calls consume_auth_quota; the app code that uses it
-- is removed in the same release that rolls this migration back.

drop function if exists public.consume_auth_quota(text, integer, integer);
drop table if exists public.auth_rate_limits;
