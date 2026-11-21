"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import { checkMutationQuota } from "@/lib/rate-limit";
import { formatEgp, parseEgpToMinor } from "@/lib/money";
import { notifyRefundCaseResolved } from "@/lib/mail";

export type ResolveRefundState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveRefundCase(
  prev: ResolveRefundState,
  formData: FormData,
): Promise<ResolveRefundState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const caseId = String(formData.get("case_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const amountInput = String(formData.get("refund_amount") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  // P1-04 (D-09): approval normally requires the item back. Unchecking
  // means the refund is approved without a physical return (wrong/damaged
  // beyond return) — no receipt, no returned transition, no restock.
  const returnRequired = formData.get("return_required") === "yes";

  if (!UUID_PATTERN.test(caseId)) {
    return { error: "That refund case could not be found.", attempt };
  }
  if (decision !== "approve" && decision !== "reject") {
    return { error: "Choose approve or reject.", attempt };
  }
  if (note.length > 1000) {
    return { error: "Keep the note to 1000 characters or fewer.", attempt };
  }

  let amountMinor = 0;
  if (decision === "approve") {
    amountMinor = parseEgpToMinor(amountInput) ?? -1;
    if (amountMinor <= 0) {
      return {
        error: "Enter a valid refund amount greater than zero.",
        attempt,
      };
    }
  }

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError, attempt };
  const { error } = await supabase.rpc("resolve_refund_case", {
    p_case_id: caseId,
    p_approved: decision === "approve",
    p_refund_amount_minor: amountMinor,
    p_note: note || null,
    p_return_required: returnRequired,
  });

  if (error) {
    return {
      error:
        error.code === "23514" || error.code === "42501" || error.code === "22023"
          ? error.message
          : "The refund could not be resolved. Refresh the page and try again.",
      attempt,
    };
  }

  revalidatePath("/admin/refunds");
  revalidatePath("/admin/settlements");
  revalidatePath("/admin/commissions");
  revalidatePath("/vendor/finance");

  // P1-01: customer refund-resolution email. Never rolls the decision back.
  await notifyRefundCaseResolved(caseId);

  // N-01 (D-08): when the approval landed on a paid settlement, the
  // commission was recorded as a clawback instead of an adjustment —
  // say so, so the admin knows the money is carried to the next batch.
  let clawbackMinor: number | null = null;
  if (decision === "approve") {
    const { data: clawbackData } = await supabase
      .from("commission_clawbacks")
      .select("amount_minor")
      .eq("refund_case_id", caseId)
      .maybeSingle();
    clawbackMinor = (clawbackData as { amount_minor: number } | null)
      ?.amount_minor ?? null;
  }

  // N-02: when the approval landed before delivery, the commission
  // reduction is pending until the suborder is delivered — say so, so
  // the admin does not read "adjusted" as money already moved.
  let pendingMinor: number | null = null;
  if (decision === "approve" && clawbackMinor === null) {
    const { data: pendingData } = await supabase
      .from("pending_commission_adjustments")
      .select("amount_minor")
      .eq("refund_case_id", caseId)
      .eq("status", "pending")
      .maybeSingle();
    pendingMinor = (pendingData as { amount_minor: number } | null)
      ?.amount_minor ?? null;
  }

  return {
    success:
      decision === "approve"
        ? clawbackMinor !== null
          ? `Refund approved. The commission was already paid out, so a clawback of ${formatEgp(Math.abs(clawbackMinor))} was recorded against the shop's next settlement.`
          : pendingMinor !== null
            ? `Refund approved. The commission will be reduced by ${formatEgp(Math.abs(pendingMinor))} when the suborder is delivered.`
            : "Refund approved and commission adjusted."
        : "Refund request rejected.",
    attempt,
  };
}

export type RestockRefundState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

export type CorrectInspectionState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

// R-05 residual (re-audit v5): the admin could call the correction RPC
// but had no UI for it — only the shop could correct a wrong inspection
// call, from its own case page. Same RPC, same window (approved case,
// receipt recorded, not yet restocked); the database refuses a
// same-value correction and re-derives the courier payer.
export async function correctInspectionCondition(
  prev: CorrectInspectionState,
  formData: FormData,
): Promise<CorrectInspectionState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const caseId = String(formData.get("case_id") ?? "").trim();
  const conditionRaw = String(formData.get("condition") ?? "").trim();

  if (!UUID_PATTERN.test(caseId)) {
    return { error: "That refund case could not be found.", attempt };
  }
  if (
    conditionRaw !== "good" &&
    conditionRaw !== "wrong_item" &&
    conditionRaw !== "damaged"
  ) {
    return {
      error: "Choose what arrived: good condition, wrong item, or damaged.",
      attempt,
    };
  }

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError, attempt };
  const { error } = await supabase.rpc("correct_refund_inspection_condition", {
    p_case_id: caseId,
    p_condition: conditionRaw,
  });

  if (error) {
    return {
      error:
        error.code === "23514" || error.code === "42501" || error.code === "22023"
          ? error.message
          : "The inspection could not be corrected. Refresh the page and try again.",
      attempt,
    };
  }

  revalidatePath("/admin/refunds");
  revalidatePath("/vendor/refunds");

  return {
    success:
      conditionRaw === "good"
        ? "Inspection corrected to good condition. The customer pays the return courier and the item can be restocked after inspection."
        : conditionRaw === "wrong_item"
          ? "Inspection corrected to wrong item. The shop pays the return courier and the item is not restocked against this order."
          : "Inspection corrected to damaged. The shop pays the return courier and a damaged item is never restocked.",
    attempt,
  };
}

// P1-04 (D-09): manual restock after the vendor confirmed receipt. The RPC
// restocks through adjust_product_stock exactly once; a damaged item is
// simply never restocked.
export async function restockRefundCase(
  prev: RestockRefundState,
  formData: FormData,
): Promise<RestockRefundState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const caseId = String(formData.get("case_id") ?? "").trim();

  if (!UUID_PATTERN.test(caseId)) {
    return { error: "That refund case could not be found.", attempt };
  }

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError, attempt };
  const { error } = await supabase.rpc("restock_refund_case", {
    p_case_id: caseId,
  });

  if (error) {
    return {
      error:
        error.code === "23514" || error.code === "42501" || error.code === "22023"
          ? error.message
          : "The return could not be restocked. Refresh the page and try again.",
      attempt,
    };
  }

  revalidatePath("/admin/refunds");
  revalidatePath("/vendor/inventory");

  return { success: "Returned items restocked after inspection.", attempt };
}
