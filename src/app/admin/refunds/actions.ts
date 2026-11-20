"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import { parseEgpToMinor } from "@/lib/money";
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

  const { supabase } = await requirePlatformAdmin();
  const { error } = await supabase.rpc("resolve_refund_case", {
    p_case_id: caseId,
    p_approved: decision === "approve",
    p_refund_amount_minor: amountMinor,
    p_note: note || null,
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

  return {
    success:
      decision === "approve"
        ? "Refund approved and commission adjusted."
        : "Refund request rejected.",
    attempt,
  };
}
