"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  guestCookieName,
  isValidGuestToken,
  sha256Hex,
} from "@/lib/guest-order";

export type ClaimOrderState =
  | { error: string; attempt: number }
  | null;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Attaches a guest order to the signed-in account (P1-02, H-18).
 *
 * The caller proves the guest token (from the order-scoped cookie) and the
 * database moves the order onto their account, clearing the guest token so
 * the order is reachable from /account/orders from then on. The guest token
 * is never logged.
 */
export async function claimGuestOrder(
  prev: ClaimOrderState,
  formData: FormData,
): Promise<ClaimOrderState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const orderId = String(formData.get("order_id") ?? "").trim();

  if (!UUID_PATTERN.test(orderId)) {
    return { error: "That order could not be found.", attempt };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Sign in first, then claim this order.", attempt };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(guestCookieName(orderId))?.value;
  if (!isValidGuestToken(token)) {
    return { error: "This order link is not valid in this browser.", attempt };
  }

  const service = createServiceClient();
  const { error } = await service.rpc("claim_guest_order", {
    p_order_id: orderId,
    p_token_hash: sha256Hex(token),
    p_user_id: user.id,
  });

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "That order could not be claimed. It may already belong to an account, or its link may have expired."
          : "The order could not be claimed. Refresh the page and try again.",
      attempt,
    };
  }

  cookieStore.delete(guestCookieName(orderId));
  redirect(`/account/orders/${orderId}`);
}
