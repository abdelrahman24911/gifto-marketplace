"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth";
import { checkMutationQuota } from "@/lib/rate-limit";
import { safeDbError } from "@/lib/safe-db-error";

export type ModerateReviewState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function attemptFrom(prev: { attempt?: number } | null): number {
  return (prev?.attempt ?? 0) + 1;
}

/**
 * UX Batch 2 (reviews): approve (public) or reject (hidden) a pending
 * review. Moderation is once-only — the RPC refuses a review that has
 * already been moderated, and it is the authority on admin-only access.
 */
export async function moderateReview(
  prev: ModerateReviewState,
  formData: FormData,
): Promise<ModerateReviewState> {
  const attempt = attemptFrom(prev);
  const reviewId = String(formData.get("review_id") ?? "").trim();
  const approvedRaw = String(formData.get("approved") ?? "").trim();

  if (!UUID_PATTERN.test(reviewId)) {
    return { error: "That review could not be found.", attempt };
  }
  if (approvedRaw !== "true" && approvedRaw !== "false") {
    return { error: "Choose whether to approve or reject the review.", attempt };
  }

  const { supabase, user } = await requirePlatformAdmin();

  const quotaError = await checkMutationQuota("admin", user.id);
  if (quotaError) return { error: quotaError, attempt };

  const { error } = await supabase.rpc("moderate_product_review", {
    p_review_id: reviewId,
    p_approved: approvedRaw === "true",
  });

  if (error) {
    return {
      error: safeDbError(
        error,
        "The review could not be moderated. Refresh the page and try again.",
      ),
      attempt,
    };
  }

  revalidatePath("/admin/reviews");

  return {
    success:
      approvedRaw === "true"
        ? "Review approved. It is now visible on the gift page."
        : "Review rejected. It stays hidden.",
    attempt,
  };
}
