"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  guestCookieName,
  isValidGuestToken,
  sha256Hex,
} from "@/lib/guest-order";
import { parseEgpToMinor } from "@/lib/money";
import { notifyRefundCaseOpened } from "@/lib/mail";
import { checkAuthQuota } from "@/lib/rate-limit";
import { refundReasonError } from "@/lib/refunds";
import { createServiceClient } from "@/lib/supabase/service";

export type GuestRefundState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function openGuestRefundCase(
  prev: GuestRefundState,
  formData: FormData,
): Promise<GuestRefundState> {
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

  const cookieStore = await cookies();
  const token = cookieStore.get(guestCookieName(orderId))?.value;
  if (!isValidGuestToken(token)) {
    return { error: "This order link is not valid in this browser.", attempt };
  }

  // P1-12: IP + per-suborder buckets, fail-closed.
  const quota = await checkAuthQuota("refundCase", {
    accountKey: orderVendorId,
  });
  if (quota.limited) {
    return { error: quota.message ?? "Please wait and try again.", attempt };
  }

  const service = createServiceClient();
  const { data: caseId, error } = await service.rpc("open_guest_refund_case", {
    p_order_id: orderId,
    p_token_hash: sha256Hex(token),
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

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/admin/refunds");

  // P1-01: customer confirmation email. Never rolls the case back.
  if (caseId) await notifyRefundCaseOpened(caseId);

  return { success: "Refund request sent to the Gifto team.", attempt };
}

// P1-04: one-shot dispute escalation for guest orders. The token is
// verified by the service-role RPC (with the P1-02 expiry check); the RPC
// enforces "once" and the admin's second decision is final.
export async function escalateGuestRefundCase(
  prev: GuestRefundState,
  formData: FormData,
): Promise<GuestRefundState> {
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

  const cookieStore = await cookies();
  const token = cookieStore.get(guestCookieName(orderId))?.value;
  if (!isValidGuestToken(token)) {
    return { error: "This order link is not valid in this browser.", attempt };
  }

  // P1-12: IP + per-case buckets, fail-closed.
  const quota = await checkAuthQuota("refundCase", {
    accountKey: caseId,
  });
  if (quota.limited) {
    return { error: quota.message ?? "Please wait and try again.", attempt };
  }

  const service = createServiceClient();
  const { error } = await service.rpc("escalate_guest_refund_case", {
    p_order_id: orderId,
    p_token_hash: sha256Hex(token),
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

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/admin/refunds");

  return {
    success: "Escalated. Gifto will review your refund again.",
    attempt,
  };
}

// N-03 (D-09): the guest who opened a case can cancel it while it is
// still open. The token is verified by the service-role RPC; the RPC
// enforces guest-only and opener-only.
export async function cancelGuestRefundCase(
  prev: GuestRefundState,
  formData: FormData,
): Promise<GuestRefundState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const orderId = String(formData.get("order_id") ?? "").trim();
  const caseId = String(formData.get("case_id") ?? "").trim();

  if (!UUID_PATTERN.test(orderId) || !UUID_PATTERN.test(caseId)) {
    return { error: "That refund case could not be found.", attempt };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(guestCookieName(orderId))?.value;
  if (!isValidGuestToken(token)) {
    return { error: "This order link is not valid in this browser.", attempt };
  }

  // P1-12: IP + per-case buckets, fail-closed.
  const quota = await checkAuthQuota("refundCase", {
    accountKey: caseId,
  });
  if (quota.limited) {
    return { error: quota.message ?? "Please wait and try again.", attempt };
  }

  const service = createServiceClient();
  const { error } = await service.rpc("cancel_guest_refund_case", {
    p_order_id: orderId,
    p_token_hash: sha256Hex(token),
    p_case_id: caseId,
  });

  if (error) {
    return {
      error:
        error.code === "23514" || error.code === "42501" || error.code === "22023"
          ? error.message
          : "The refund request could not be cancelled. Refresh the page and try again.",
      attempt,
    };
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/admin/refunds");

  return { success: "Refund request cancelled.", attempt };
}
