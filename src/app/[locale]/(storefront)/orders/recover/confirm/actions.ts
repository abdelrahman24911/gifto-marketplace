"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import type { AppLocale } from "@/i18n/routing";
import {
  GUEST_TOKEN_PATTERN,
  createGuestToken,
  guestCookieSettings,
  isValidGuestToken,
  legacyGuestCookieCleanupSettings,
  sha256Hex,
} from "@/lib/guest-order";
import { localePrefixFor } from "@/lib/locale-path";
import { createServiceClient } from "@/lib/supabase/service";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function currentLocalePrefix(): Promise<string> {
  try {
    return localePrefixFor((await getLocale()) as AppLocale);
  } catch {
    return "";
  }
}

export type RedeemRecoveryState =
  | { error: string; attempt: number }
  | null;

/**
 * Redeems a one-time guest-order recovery token (P1-02, H-18; migration
 * 62 follow-up — token no longer travels in a GET query).
 *
 * The token arrives in the POST body (FormData), never in the URL: the
 * emailed link carries it in the fragment (#token=...), which browsers
 * never send to the server, and the confirm page posts it from there.
 * A GET to this page never redeems anything — the old GET redeem route
 * is deleted, so links emailed before this change (1-hour tokens) no
 * longer work and the customer requests a fresh link instead.
 *
 * On success the guest token is rotated server-side, the fresh token is
 * set as the order-scoped HttpOnly cookie, and the customer is sent to
 * their order. The raw recovery token is never logged. On any failure
 * the customer is sent back to /orders/recover with a generic error.
 */
export async function redeemGuestOrderRecovery(
  _prev: RedeemRecoveryState,
  formData: FormData,
): Promise<RedeemRecoveryState> {
  const orderId = String(formData.get("order") ?? "").trim();
  const token = String(formData.get("token") ?? "").trim();
  const localePrefix = await currentLocalePrefix();

  if (!UUID_PATTERN.test(orderId) || !GUEST_TOKEN_PATTERN.test(token)) {
    redirect(`${localePrefix}/orders/recover?error=invalid`);
  }

  const newToken = createGuestToken();
  const service = createServiceClient();
  const { error } = await service.rpc("redeem_guest_recovery_token", {
    p_order_id: orderId,
    p_token_hash: sha256Hex(token),
    p_new_token_hash: sha256Hex(newToken),
  });

  if (error || !isValidGuestToken(newToken)) {
    redirect(`${localePrefix}/orders/recover?error=invalid`);
  }

  const cookieStore = await cookies();
  cookieStore.set(guestCookieSettings(orderId, newToken));
  for (const cookie of legacyGuestCookieCleanupSettings(orderId)) {
    cookieStore.delete(cookie);
  }

  redirect(`${localePrefix}/orders/${orderId}`);
}
