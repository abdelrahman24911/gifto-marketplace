"use server";

import { revalidatePath } from "next/cache";

import { requireVendorRole } from "@/lib/vendor";

export type VendorRefundState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refundError(
  error: { code?: string; message: string },
  attempt: number,
): VendorRefundState {
  return {
    error:
      error.code === "23514" || error.code === "42501" || error.code === "22023"
        ? error.message
        : "The refund case could not be updated. Refresh the page and try again.",
    attempt,
  };
}

// P1-04 (D-09): the shop marks a refund case seen. Vendors never set the
// refund amount and never resolve the case.
export async function acknowledgeRefundCase(
  prev: VendorRefundState,
  formData: FormData,
): Promise<VendorRefundState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const caseId = String(formData.get("case_id") ?? "").trim();
  const vendorId = String(formData.get("vendor_id") ?? "").trim();

  if (!UUID_PATTERN.test(caseId) || !UUID_PATTERN.test(vendorId)) {
    return { error: "That refund case could not be found.", attempt };
  }

  const { supabase } = await requireVendorRole(vendorId);
  const { error } = await supabase.rpc("acknowledge_refund_case", {
    p_case_id: caseId,
  });

  if (error) return refundError(error, attempt);

  revalidatePath(`/vendor/refunds?vendor=${vendorId}`);
  revalidatePath(`/vendor/refunds/${caseId}?vendor=${vendorId}`);

  return { success: "Refund case acknowledged.", attempt };
}

// P1-04 (D-09): the shop confirms the returned item was received (the
// inspection). This moves the suborder to returned through the audited
// status path. It never touches stock; restock is a manual admin step.
export async function confirmRefundReceipt(
  prev: VendorRefundState,
  formData: FormData,
): Promise<VendorRefundState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const caseId = String(formData.get("case_id") ?? "").trim();
  const vendorId = String(formData.get("vendor_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!UUID_PATTERN.test(caseId) || !UUID_PATTERN.test(vendorId)) {
    return { error: "That refund case could not be found.", attempt };
  }
  if (note.length > 1000) {
    return { error: "Keep the note to 1000 characters or fewer.", attempt };
  }

  const { supabase } = await requireVendorRole(vendorId);
  const { error } = await supabase.rpc("confirm_refund_receipt", {
    p_case_id: caseId,
    p_note: note || null,
  });

  if (error) return refundError(error, attempt);

  revalidatePath(`/vendor/refunds?vendor=${vendorId}`);
  revalidatePath(`/vendor/refunds/${caseId}?vendor=${vendorId}`);
  revalidatePath("/vendor/orders");

  return {
    success: "Return confirmed received. The order is now marked returned.",
    attempt,
  };
}
