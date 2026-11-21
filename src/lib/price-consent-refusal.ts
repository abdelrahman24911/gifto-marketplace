import "server-only";

import { createServiceClient } from "./supabase/service";

import type { Json } from "./supabase/database.types";
import type { ExpectedPrice } from "./price-consent";

/**
 * Records a PRICE_CHANGED refusal durably (migration 64, S-08).
 *
 * The refusal itself rolls its transaction back, so the audit row is
 * written in a separate transaction through the service-role recorder
 * — the same client checkout already uses for guest checkout. The
 * recorder verifies the mismatch against live prices itself, so a stale
 * call records nothing. Best-effort and never throws: the refusal
 * response must not fail because the audit row did.
 *
 * The idempotency key is the checkout attempt's own key — the same one
 * _create_order received — so the refusal row keys to the same attempt
 * a consent row would have keyed to had the order been placed. (S-12:
 * this was previously a private function inside the checkout server
 * action, so no test could assert which key or actor it recorded;
 * extracting it here makes that wiring testable.)
 */
export async function recordPriceConsentRefusal(args: {
  items: unknown;
  expectedPrices: ExpectedPrice[];
  expectedTotalMinor: number;
  idempotencyKey: string;
  userId: string | null;
  guestTokenHash: string | null;
}): Promise<void> {
  try {
    const service = createServiceClient();
    await service.rpc("_record_price_consent_refusal", {
      p_idempotency_key: args.idempotencyKey,
      p_items: args.items as Json,
      p_user_id: args.userId,
      p_guest_token_hash: args.guestTokenHash,
      p_expected_prices: args.expectedPrices as unknown as Json,
      p_expected_total_minor: args.expectedTotalMinor,
    });
  } catch {
    // Audit-only: never break the refusal response.
  }
}
