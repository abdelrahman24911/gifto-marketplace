"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { checkMutationQuota } from "@/lib/rate-limit";
import { safeDbError } from "@/lib/safe-db-error";

export type AcceptInvitationState =
  | { error: string; attempt: number }
  | null;

export async function acceptVendorInvitation(
  prev: AcceptInvitationState,
  formData: FormData,
): Promise<AcceptInvitationState> {
  const attempt =
    (prev && typeof prev.attempt === "number" ? prev.attempt : 0) + 1;

  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  if (!invitationId) {
    return { error: "Missing invitation id.", attempt };
  }

  const { supabase, user } = await requireUser({
    verifyWithAuthServer: true,
  });

  const quotaError = await checkMutationQuota("vendor", user.id);
  if (quotaError) return { error: quotaError, attempt };

  const { data, error } = await supabase.rpc("accept_vendor_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) {
    return {
      error: safeDbError(
        error,
        "The invitation could not be accepted. Please try again.",
      ),
      attempt,
    };
  }
  if (!data) {
    return {
      error: "The invitation could not be accepted. Please try again.",
      attempt,
    };
  }

  revalidatePath("/account/invitations");
  revalidatePath("/account");
  redirect(`/vendor/overview?vendor=${data}`);
}
