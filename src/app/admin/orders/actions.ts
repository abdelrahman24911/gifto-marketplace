"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import {
  validateAddressCorrection,
  type AddressCorrectionValues,
} from "@/lib/order-address";
import { checkMutationQuota } from "@/lib/rate-limit";
import { isOrderStatusReasonCode } from "@/lib/order-status-reasons";
import { notifyOrderStatusChanged } from "@/lib/mail";
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

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError, attempt };

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

  // P1-01: customer status email. A failed send never rolls the change back.
  await notifyOrderStatusChanged(suborderId, expected, next);

  return {
    success:
      next === "cancelled"
        ? "Order line cancelled and stock restored."
        : `Marked as ${ORDER_STATUS_LABELS[next]}.`,
    attempt,
  };
}

export type AdminAddressCorrectionState =
  | { error: string; values: AddressCorrectionValues; attempt: number }
  | { success: string; values: AddressCorrectionValues; attempt: number }
  | {
      coverageWarning: string[];
      values: AddressCorrectionValues;
      attempt: number;
    }
  | null;

function correctionError(code: string | undefined) {
  switch (code) {
    case "42501":
      return "You no longer have permission to correct this order.";
    case "23514":
      return "This order can no longer be corrected, or the change needs a note. Refresh and try again.";
    case "22001":
      return "The note must be 1000 characters or fewer.";
    case "22023":
      return "Check the address fields and choose a valid reason.";
    default:
      return "The address could not be corrected. Refresh and try again.";
  }
}

/**
 * Corrects the delivery address on an order that has not been delivered
 * (P1-13, H-10). Platform admins only; the database RPC is the real gate
 * (delivered/returned guard, coverage-break confirmation, audit row).
 * The correction never re-runs checkout and never moves stock.
 */
export async function correctAdminOrderAddress(
  prev: AdminAddressCorrectionState,
  formData: FormData,
): Promise<AdminAddressCorrectionState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;

  const orderId = String(formData.get("order_id") ?? "").trim();
  const values: AddressCorrectionValues = {
    recipientName: String(formData.get("recipient_name") ?? "").trim(),
    contactPhone: String(formData.get("contact_phone") ?? "").trim(),
    addressLine: String(formData.get("address_line") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    governorate: String(formData.get("governorate") ?? "").trim(),
    reasonCode: String(formData.get("reason_code") ?? "").trim(),
    note: String(formData.get("note") ?? "").trim(),
  };
  const acknowledgeCoverageBreak =
    formData.get("acknowledge_coverage_break") === "on";

  if (!orderId) {
    return { error: "Missing order id.", values, attempt };
  }

  const invalid = validateAddressCorrection(values);
  if (invalid) {
    return { error: invalid.error, values: invalid.values, attempt };
  }
  const trimmed = values;

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError, values: trimmed, attempt };

  const { data, error } = await supabase.rpc("correct_order_address", {
    p_order_id: orderId,
    p_recipient_name: trimmed.recipientName,
    p_contact_phone: trimmed.contactPhone,
    p_address_line: trimmed.addressLine,
    p_city: trimmed.city,
    p_governorate: trimmed.governorate,
    p_reason_code: trimmed.reasonCode,
    p_note: trimmed.note || null,
    p_acknowledge_coverage_break: acknowledgeCoverageBreak,
  });

  if (error) return { error: correctionError(error.code), values: trimmed, attempt };

  const result = data as unknown as {
    ok?: boolean;
    error?: string;
    vendors?: string[];
  } | null;

  // Coverage break without the second confirmation: nothing changed; the
  // form re-renders with the warning and the affected shops named.
  if (result && result.ok === false && result.error === "coverage_break") {
    return {
      coverageWarning: Array.isArray(result.vendors) ? result.vendors : [],
      values: trimmed,
      attempt,
    };
  }

  if (!result || result.ok !== true) {
    return {
      error: "The address could not be corrected. Refresh and try again.",
      values: trimmed,
      attempt,
    };
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);

  return { success: "Delivery address corrected and recorded.", values: trimmed, attempt };
}
