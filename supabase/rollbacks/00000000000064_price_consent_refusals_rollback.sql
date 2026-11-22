-- Rollback for migration 64 (price-consent refusal trail, S-08).
--
-- Drops price_consent_refusals and _record_price_consent_refusal.
-- Rolling back REINTRODUCES the S-08 gap: PRICE_CHANGED refusals
-- leave no audit trail again, so a dispute about a refused attempt
-- cannot be answered from the system. Only roll back if the refusal
-- trail itself must be removed. Any refusal rows recorded before the
-- rollback are deleted with the table. Accepted-consent rows in
-- price_consent_events (migration 62) are untouched.

drop function if exists public._record_price_consent_refusal(
  uuid, jsonb, uuid, text, jsonb, int
);
drop table if exists public.price_consent_refusals;
