-- Migration 57 — R-03 (re-audit v4, latent): drop the legacy 11-argument
-- _create_order wrapper.
--
-- Migration 34 introduced the 13-argument _create_order
-- (uuid, jsonb, text, text, text, text, text, text, text, uuid, text,
-- jsonb, int), which refuses the order unless the caller-supplied
-- expected prices match the locked live prices (PRICE_CHANGED). The
-- old 11-argument wrapper survived alongside it, delegating with
-- null expected prices — i.e. no price check at all. It was
-- grant-revoked from every API role, so it was unreachable, but a
-- future grant (or a misread of which overload is the real one)
-- would reopen the price-change bypass silently.
--
-- The wrapper is now dropped outright. Nothing live calls it:
--   - place_order_with_price_check / place_guest_order_with_price_check
--     (migration 34) and the gift-shopper wrappers (migration 47)
--     call the 13-argument form with expected prices;
--   - the only other callers were two RLS test call sites, rewritten
--     in this change to gifto_test.place_guest_order, which builds
--     expected prices from the live rows.
-- The 13-argument implementation is untouched and stays
-- grant-revoked from all API roles (migration 34), so PostgREST
-- cannot expose it.

drop function if exists public._create_order(
  uuid, jsonb, text, text, text, text, text, text, text, uuid, text
);

comment on function public._create_order(
  uuid, jsonb, text, text, text, text, text, text, text, uuid, text, jsonb, int
) is
  'Single trusted order-creation implementation (P1-03, R-03): when expected prices are supplied, they must match the locked live prices or the order is refused with PRICE_CHANGED. The legacy no-check RPCs (place_order, place_order_with_idempotency, place_guest_order) were dropped in migration 51 and the legacy 11-argument _create_order wrapper in migration 57; only place_order_with_price_check / place_guest_order_with_price_check can reach this function from an API role.';
