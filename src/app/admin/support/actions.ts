"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import { checkMutationQuota } from "@/lib/rate-limit";
import { notifySupportRequestStatusChanged } from "@/lib/mail";
import { isSupportStatus, validateAdminReply } from "@/lib/support-requests";

import type { SupportRequestStatus } from "@/lib/supabase/database.types";

export type SupportStatusState =
  | { error: string; attempt: number }
  | { success: string; status: SupportRequestStatus; attempt: number }
  | null;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Updates a support request's status and, optionally, the admin reply the
 * shop sees in its dashboard (migration 69). The reply is only rewritten
 * when it actually changed, so a status-only update never refreshes
 * replied_at or re-sends the same reply by email.
 */
export async function updateSupportRequestStatus(
  prev: SupportStatusState,
  formData: FormData,
): Promise<SupportStatusState> {
  const attempt =
    (prev && "attempt" in prev && typeof prev.attempt === "number"
      ? prev.attempt
      : 0) + 1;

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const reply = String(formData.get("reply") ?? "").trim();

  if (!UUID_PATTERN.test(id)) {
    return { error: "That support request could not be found.", attempt };
  }
  if (!isSupportStatus(status)) {
    return { error: "Choose a valid support status.", attempt };
  }
  const replyError = validateAdminReply(reply);
  if (replyError) {
    return { error: replyError, attempt };
  }

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError, attempt };

  const { data: current, error: readError } = await supabase
    .from("support_requests")
    .select("admin_reply")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    return {
      error: "The request couldn't be updated. Please try again.",
      attempt,
    };
  }
  if (!current) {
    return { error: "That support request could not be found.", attempt };
  }

  const replyChanged =
    reply.length > 0 && reply !== (current.admin_reply ?? "").trim();
  const update = replyChanged
    ? {
        status,
        admin_reply: reply,
        replied_at: new Date().toISOString(),
        replied_by: user.id,
      }
    : { status };

  const { data, error } = await supabase
    .from("support_requests")
    .update(update)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "Your account doesn't have permission to update support requests."
          : "The request couldn't be updated. Please try again.",
      attempt,
    };
  }
  if (!data) {
    return { error: "That support request could not be found.", attempt };
  }

  revalidatePath("/admin/support");
  revalidatePath("/vendor/support");

  // P1-01: vendor status email, with the new reply when one was written.
  // A failed send never rolls the update back.
  await notifySupportRequestStatusChanged(
    id,
    status,
    replyChanged ? reply : undefined,
  );

  return {
    success: replyChanged
      ? "Reply saved and status updated."
      : "Support status updated.",
    status,
    attempt,
  };
}
