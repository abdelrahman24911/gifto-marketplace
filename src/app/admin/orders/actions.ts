"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import { isOrderStatusReasonCode } from "@/lib/order-status-reasons";
import {
  ADMIN_NEXT_STATUSES,
  ORDER_STATUS_LABELS,
  isOrderStatus,
} from "@/lib/orders";

export type AdminSuborderState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

function transitionError(code: string | undefined) {
  switch (code) {
    case "40001":
      return "This order line changed since the page loaded. Refresh and try again.";
    case "23514":
      return "That status change is no longer allowed. Refresh and try again.";
    case "22001":
      return "The note must be 1000 characters or fewer.";
    case "22023":
      return "Choose a valid reason for this status change.";
    case "42501":
      return "You no longer have permission to update this order line.";
    default:
      return "The order line could not be updated. Refresh and try again.";
  }
}

export async function setAdminSuborderStatus(
  prev: AdminSuborderState,
  formData: FormData,
): Promise<AdminSuborderState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;

  const suborderId = String(formData.get("suborder_id") ?? "").trim();
  const orderId = String(formData.get("order_id") ?? "").trim();
  const next = String(formData.get("status") ?? "").trim();
  const expected = String(formData.get("expected_status") ?? "").trim();
  const reasonInput = String(formData.get("reason_code") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!suborderId) return { error: "Missing order line id.", attempt };
  if (!isOrderStatus(next)) return { error: "Invalid status.", attempt };
  if (!isOrderStatus(expected)) {
    return { error: "Refresh the page and try again.", attempt };
  }

  const allowed = (ADMIN_NEXT_STATUSES[expected] ?? []).some(
    (option) => option.value === next,
  );
  if (!allowed) {
    return {
      error: "That status change is not allowed for this order line.",
      attempt,
    };
  }

  if (reasonInput && !isOrderStatusReasonCode(reasonInput)) {
    return { error: "Choose a valid reason for this status change.", attempt };
  }

  const reason = reasonInput || null;

  if (next === "cancelled" || next === "returned") {
    if (!reason) {
      return { error: "Choose a reason for this status change.", attempt };
    }
  }
  if (reason === "other" && !note) {
    return { error: "Add a note when the reason is other.", attempt };
  }
  if (note.length > 1000) {
    return { error: "The note must be 1000 characters or fewer.", attempt };
  }

  const { supabase } = await requirePlatformAdmin();

  const { data, error } = await supabase.rpc("set_order_vendor_status", {
    p_order_vendor_id: suborderId,
    p_next_status: next,
    p_expected_status: expected,
    p_reason_code: reason,
    p_note: note || null,
  });

  if (error) return { error: transitionError(error.code), attempt };

  const updated = data?.[0];
  if (!updated) {
    return { error: "That order line could not be found.", attempt };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId || updated.order_id}`);
  revalidatePath("/admin/commissions");
  revalidatePath("/account/orders");
  revalidatePath(`/account/orders/${updated.order_id}`);

  return {
    success:
      next === "cancelled"
        ? "Order line cancelled and stock restored."
        : `Marked as ${ORDER_STATUS_LABELS[next]}.`,
    attempt,
  };
}
