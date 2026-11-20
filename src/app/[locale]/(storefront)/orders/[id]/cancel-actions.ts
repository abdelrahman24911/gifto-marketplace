"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  guestCookieName,
  isValidGuestToken,
  sha256Hex,
} from "@/lib/guest-order";
import { createServiceClient } from "@/lib/supabase/service";

export type GuestCancelState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cancels a guest order the caller proves ownership of with the HttpOnly,
 * order-scoped token cookie. The raw token never leaves the server: it is
 * hashed the same way migration 11 does and passed to the service-role-only
 * cancel_guest_order RPC (P0-05, H-02). The RPC re-checks that the order is
 * a guest order still in "placed" and restocks every cancelled suborder.
 */
export async function cancelGuestOrder(
  prev: GuestCancelState,
  formData: FormData,
): Promise<GuestCancelState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const orderId = String(formData.get("order_id") ?? "").trim();

  if (!UUID_PATTERN.test(orderId)) {
    return { error: "That order could not be found.", attempt };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(guestCookieName(orderId))?.value;
  if (!isValidGuestToken(token)) {
    return { error: "This order link is not valid in this browser.", attempt };
  }

  const service = createServiceClient();
  const { error } = await service.rpc("cancel_guest_order", {
    p_order_id: orderId,
    p_token_hash: sha256Hex(token),
  });

  if (error) {
    return {
      error:
        error.code === "23514" || error.code === "42501" || error.code === "22023"
          ? error.message
          : "The order could not be cancelled. Refresh the page and try again.",
      attempt,
    };
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/vendor/orders");

  return { success: "Order cancelled. Stock was returned to the shops.", attempt };
}
