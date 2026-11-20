"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { parseEgpToMinor } from "@/lib/money";
import { notifyRefundCaseOpened } from "@/lib/mail";
import { refundReasonError } from "@/lib/refunds";

export type OpenRefundState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function openRefundCase(
  prev: OpenRefundState,
  formData: FormData,
): Promise<OpenRefundState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const orderId = String(formData.get("order_id") ?? "").trim();
  const orderVendorId = String(formData.get("order_vendor_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const amountInput = String(formData.get("requested_amount") ?? "").trim();

  if (!UUID_PATTERN.test(orderId) || !UUID_PATTERN.test(orderVendorId)) {
    return { error: "That order could not be found.", attempt };
  }

  const reasonError = refundReasonError(reason);
  if (reasonError) return { error: reasonError, attempt };

  let requestedAmount: number | null = null;
  if (amountInput) {
    requestedAmount = parseEgpToMinor(amountInput);
    if (requestedAmount === null) {
      return {
        error: "Enter a valid amount in EGP, or leave it blank.",
        attempt,
      };
    }
  }

  const { supabase } = await requireUser({ verifyWithAuthServer: true });
  const { data: caseId, error } = await supabase.rpc("open_refund_case", {
    p_order_vendor_id: orderVendorId,
    p_reason: reason,
    p_requested_amount_minor: requestedAmount,
  });

  if (error) {
    return {
      error:
        error.code === "23514" || error.code === "42501" || error.code === "22023"
          ? error.message
          : "The refund request could not be opened. Refresh the page and try again.",
      attempt,
    };
  }

  revalidatePath(`/account/orders/${orderId}`);
  revalidatePath("/admin/refunds");

  // P1-01: customer confirmation email. Never rolls the case back.
  if (caseId) await notifyRefundCaseOpened(caseId);

  return { success: "Refund request sent to the Gifto team.", attempt };
}

// P1-04: one-shot dispute escalation. The RPC enforces "once": a second
// escalation is rejected, and the admin's second decision is final.
export async function escalateRefundCase(
  prev: OpenRefundState,
  formData: FormData,
): Promise<OpenRefundState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const orderId = String(formData.get("order_id") ?? "").trim();
  const caseId = String(formData.get("case_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!UUID_PATTERN.test(orderId) || !UUID_PATTERN.test(caseId)) {
    return { error: "That refund case could not be found.", attempt };
  }
  if (note.length < 5 || note.length > 1000) {
    return {
      error: "Explain why you disagree in 5-1000 characters.",
      attempt,
    };
  }

  const { supabase } = await requireUser({ verifyWithAuthServer: true });
  const { error } = await supabase.rpc("escalate_refund_case", {
    p_case_id: caseId,
    p_note: note,
  });

  if (error) {
    return {
      error:
        error.code === "23514" || error.code === "42501" || error.code === "22023"
          ? error.message
          : "The escalation could not be sent. Refresh the page and try again.",
      attempt,
    };
  }

  revalidatePath(`/account/orders/${orderId}`);
  revalidatePath("/admin/refunds");

  return {
    success: "Escalated. Gifto will review your refund again.",
    attempt,
  };
}
