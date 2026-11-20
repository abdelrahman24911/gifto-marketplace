import { NextResponse } from "next/server";

import {
  GUEST_COOKIE_MAX_AGE_SECONDS,
  GUEST_TOKEN_PATTERN,
  createGuestToken,
  guestCookieName,
  isValidGuestToken,
  sha256Hex,
} from "@/lib/guest-order";
import { getSiteUrl } from "@/lib/site-url";
import { createServiceClient } from "@/lib/supabase/service";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Redeems a one-time guest-order recovery link (P1-02, H-18).
 *
 * GET /orders/recover/confirm?order=<uuid>&token=<64-hex>
 *
 * On success the guest token is rotated server-side, the fresh token is set
 * as the order-scoped HttpOnly cookie, and the customer lands on their
 * order. The raw recovery token is never logged. On any failure the customer
 * is sent back to /orders/recover with a generic error.
 */
export async function GET(request: Request) {
  const siteUrl = getSiteUrl();
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("order") ?? "";
  const token = searchParams.get("token") ?? "";

  const recoverUrl = new URL("/orders/recover?error=invalid", `${siteUrl}/`);

  if (!UUID_PATTERN.test(orderId) || !GUEST_TOKEN_PATTERN.test(token)) {
    return NextResponse.redirect(recoverUrl);
  }

  const newToken = createGuestToken();
  const service = createServiceClient();
  const { error } = await service.rpc("redeem_guest_recovery_token", {
    p_order_id: orderId,
    p_token_hash: sha256Hex(token),
    p_new_token_hash: sha256Hex(newToken),
  });

  if (error || !isValidGuestToken(newToken)) {
    return NextResponse.redirect(recoverUrl);
  }

  const response = NextResponse.redirect(
    new URL(`/orders/${orderId}`, `${siteUrl}/`),
  );
  response.cookies.set({
    name: guestCookieName(orderId),
    value: newToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/orders/${orderId}`,
    maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}
