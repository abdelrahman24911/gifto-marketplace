"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthQuota } from "@/lib/rate-limit";

export type CancelOrderState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

/**
 * Cancels an order the caller owns. `cancel_order` re-checks ownership and that
 * no shop has started processing; it also restocks every cancelled suborder.
 */
export async function cancelOrder(
  prev: CancelOrderState,
  formData: FormData,
): Promise<CancelOrderState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;
  const orderId = String(formData.get("order_id") ?? "").trim();

  if (!orderId) return { error: "Missing order id.", attempt };

  const { supabase, user } = await requireUser({ verifyWithAuthServer: true });

  // P1-12: IP + per-order-and-account buckets, fail-closed.
  const quota = await checkAuthQuota("orderCancel", {
    accountKey: `${orderId}:${user.id}`,
  });
  if (quota.limited) {
    return { error: quota.message ?? "Please wait and try again.", attempt };
  }

  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
  });

  if (error) return { error: error.message, attempt };

  revalidatePath("/account/orders");
  revalidatePath(`/account/orders/${orderId}`);
  revalidatePath("/vendor/orders");

  return { success: "Order cancelled.", attempt };
}
