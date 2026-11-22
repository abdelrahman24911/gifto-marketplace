-- Gifto Marketplace - R-03 (re-audit v3): close the legacy price-consent bypass.
--
-- The old checkout RPCs — place_order, place_order_with_idempotency and
-- place_guest_order — accepted orders with no price check at all (migration
-- 34's header said so explicitly). Any direct RPC caller could place an
-- order at live prices without ever seeing a price change, so a vendor
-- price change between cart and submit was charged silently and discovered
-- at the door, in cash — the exact harm P1-03 (H-19) was meant to stop.
--
-- This migration removes the bypass by DROPPING the three legacy RPCs.
-- The only checkout paths left are place_order_with_price_check
-- (authenticated) and place_guest_order_with_price_check (service-role
-- only), both of which require the prices the customer saw and refuse the
-- order with PRICE_CHANGED when a live price differs. The app has not
-- called a legacy RPC since P1-03: checkout uses only the price-check
-- RPCs (src/app/[locale]/(storefront)/checkout/actions.ts).
--
-- The 11-argument _create_order delegating wrapper (migration 34) is kept:
-- it is private (no API role has EXECUTE on it) and is not reachable from
-- PostgREST, so it is not a bypass. The 13-argument _create_order is the
-- single trusted implementation and is unchanged by this migration.
--
-- Tests: the RLS suites used the legacy RPCs as order-creation helpers.
-- They now use supabase/tests/test_helpers.sql (gifto_test.place_order /
-- place_order_with_idempotency / place_guest_order), which builds the
-- expected prices from the live product rows and calls the price-check
-- RPCs — so the suites exercise the only checkout path a real caller can
-- reach. The helpers are test infrastructure only: they are loaded by
-- scripts/run-rls-suites.sh and the concurrency runners, never by a
-- migration, and they do not exist on a hosted project.

drop function if exists public.place_order(
  jsonb, text, text, text, text, text, text
);

drop function if exists public.place_order_with_idempotency(
  jsonb, text, text, text, text, text, text, text, uuid
);

drop function if exists public.place_guest_order(
  jsonb, text, text, text, text, text, text, text, uuid, text
);

comment on function public._create_order(
  uuid, jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int
) is
  'Single trusted order-creation implementation (P1-03, R-03): when expected prices are supplied, they must match the locked live prices or the order is refused with PRICE_CHANGED. The legacy no-check RPCs (place_order, place_order_with_idempotency, place_guest_order) were dropped in migration 51; only place_order_with_price_check / place_guest_order_with_price_check can reach this function from an API role.';
