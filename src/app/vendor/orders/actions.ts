"use server";

import { revalidatePath } from "next/cache";

import { ORDER_STATUS_LABELS, isOrderStatus } from "@/lib/orders";
import { requireVendorRole } from "@/lib/vendor";

export type SuborderState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

/**
 * Moves one of the shop's suborders to its next state.
 *
 * The transition itself is validated by the database trigger
 * `assert_order_vendor_transition`; this action only ever writes `status`, and
 * RLS plus the column-level grant keep everything else on the row immutable.
 */
export async function setSuborderStatus(
  prev: SuborderState,
  formData: FormData,
): Promise<SuborderState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;

  const suborderId = String(formData.get("suborder_id") ?? "").trim();
  const next = String(formData.get("status") ?? "").trim();

  if (!suborderId) return { error: "Missing order line id.", attempt };
  if (!isOrderStatus(next)) return { error: "Invalid status.", attempt };

  const { supabase, access, canManage } = await requireVendorRole(
    formData.get("vendor") as string | null,
  );

  if (!canManage) {
    return {
      error: "Only shop owners and managers can update orders.",
      attempt,
    };
  }

  const { data, error } = await supabase
    .from("order_vendors")
    .update({ status: next })
    .eq("id", suborderId)
    .eq("vendor_id", access.vendorId)
    .select("id, order_id")
    .maybeSingle();

  if (error) return { error: error.message, attempt };
  if (!data) {
    return { error: "That order line was not found in this shop.", attempt };
  }

  revalidatePath("/vendor/orders");
  revalidatePath("/account/orders");
  revalidatePath(`/account/orders/${data.order_id}`);

  return { success: `Marked as ${ORDER_STATUS_LABELS[next]}.`, attempt };
}
