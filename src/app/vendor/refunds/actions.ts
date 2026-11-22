"use server";

import { revalidatePath } from "next/cache";

import { requireVendorRole } from "@/lib/vendor";
import { checkMutationQuota } from "@/lib/rate-limit";

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

  const { supabase, user } = await requireVendorRole(vendorId, {
    verifyWithAuthServer: true,
  });

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };
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
// R-05: the shop also records what arrived — good, wrong item, or
// damaged. That sets who pays the return courier (customer for good,
// the shop for wrong/damaged) and whether the item may ever be restocked
// (a damaged or wrong item never is).
const INSPECTION_CONDITIONS = ["good", "wrong_item", "damaged"] as const;

export async function confirmRefundReceipt(
  prev: VendorRefundState,
  formData: FormData,
): Promise<VendorRefundState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const caseId = String(formData.get("case_id") ?? "").trim();
  const vendorId = String(formData.get("vendor_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const conditionRaw = String(formData.get("condition") ?? "").trim();

  if (!UUID_PATTERN.test(caseId) || !UUID_PATTERN.test(vendorId)) {
    return { error: "That refund case could not be found.", attempt };
  }
  if (note.length > 1000) {
    return { error: "Keep the note to 1000 characters or fewer.", attempt };
  }
  const condition = INSPECTION_CONDITIONS.find((c) => c === conditionRaw);
  if (!condition) {
    return {
      error: "Choose what arrived: good condition, wrong item, or damaged.",
      attempt,
    };
  }

  const { supabase, user } = await requireVendorRole(vendorId, {
    verifyWithAuthServer: true,
  });

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };
  const { error } = await supabase.rpc("confirm_refund_receipt", {
    p_case_id: caseId,
    p_note: note || null,
    p_condition: condition,
  });

  if (error) return refundError(error, attempt);

  revalidatePath(`/vendor/refunds?vendor=${vendorId}`);
  revalidatePath(`/vendor/refunds/${caseId}?vendor=${vendorId}`);
  revalidatePath("/vendor/orders");

  return {
    success:
      condition === "good"
        ? "Return confirmed received. The order is now marked returned."
        : condition === "wrong_item"
          ? "Return confirmed received as the wrong item. The order is now marked returned; the shop pays the return courier and the item is not restocked against this order."
          : "Return confirmed received as damaged. The order is now marked returned; the shop pays the return courier and a damaged item is never restocked.",
    attempt,
  };
}

// R-05 correction path: the shop fixes a wrong inspection call before
// Gifto restocks. The courier payer follows the corrected condition
// (customer for good, the shop for wrong/damaged); a restocked return
// can no longer be corrected, and the database keeps the replaced
// value for audit.
export async function correctInspectionCondition(
  prev: VendorRefundState,
  formData: FormData,
): Promise<VendorRefundState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const caseId = String(formData.get("case_id") ?? "").trim();
  const vendorId = String(formData.get("vendor_id") ?? "").trim();
  const conditionRaw = String(formData.get("condition") ?? "").trim();

  if (!UUID_PATTERN.test(caseId) || !UUID_PATTERN.test(vendorId)) {
    return { error: "That refund case could not be found.", attempt };
  }
  const condition = INSPECTION_CONDITIONS.find((c) => c === conditionRaw);
  if (!condition) {
    return {
      error: "Choose what arrived: good condition, wrong item, or damaged.",
      attempt,
    };
  }

  const { supabase, user } = await requireVendorRole(vendorId, {
    verifyWithAuthServer: true,
  });

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };
  const { error } = await supabase.rpc("correct_refund_inspection_condition", {
    p_case_id: caseId,
    p_condition: condition,
  });

  if (error) return refundError(error, attempt);

  revalidatePath(`/vendor/refunds?vendor=${vendorId}`);
  revalidatePath(`/vendor/refunds/${caseId}?vendor=${vendorId}`);

  return {
    success:
      condition === "good"
        ? "Inspection corrected to good condition. The customer pays the return courier and the item can be restocked after inspection."
        : condition === "wrong_item"
          ? "Inspection corrected to wrong item. The shop pays the return courier and the item is not restocked against this order."
          : "Inspection corrected to damaged. The shop pays the return courier and a damaged item is never restocked.",
    attempt,
  };
}
