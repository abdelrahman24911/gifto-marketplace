"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { checkAuthQuota } from "@/lib/rate-limit";

export type SubmitReviewState =
  | { error: string; attempt: number }
  | { success: string; attempt: number }
  | null;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UX Batch 2 (reviews): a verified buyer submits one review per gift.
 * The RPC is the authority — it enforces the delivered-purchase check,
 * the one-per-product rule, and the rating/body validation. The review
 * is born pending for admin moderation; nothing here makes it public.
 */
export async function submitReview(
  prev: SubmitReviewState,
  formData: FormData,
): Promise<SubmitReviewState> {
  const attempt = (prev?.attempt ?? 0) + 1;
  const productId = String(formData.get("product_id") ?? "").trim();
  const shopSlug = String(formData.get("shop_slug") ?? "").trim();
  const productSlug = String(formData.get("product_slug") ?? "").trim();
  const rating = Number(formData.get("rating") ?? 0);
  const body = String(formData.get("body") ?? "").trim();

  if (
    !UUID_PATTERN.test(productId) ||
    !shopSlug ||
    !productSlug
  ) {
    return { error: "That gift could not be found.", attempt };
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Choose a rating from 1 to 5 stars.", attempt };
  }
  if (body.length > 1000) {
    return { error: "A review must be 1000 characters or fewer.", attempt };
  }

  const { supabase, user } = await requireUser({ verifyWithAuthServer: true });

  // P1-12: per-account bucket, fail-closed. The RPC's one-review rule
  // stops duplicates; the quota stops stuffing.
  const quota = await checkAuthQuota("review", {
    accountKey: `${productId}:${user.id}`,
  });
  if (quota.limited) {
    return { error: quota.message ?? "Please wait and try again.", attempt };
  }

  const { error } = await supabase.rpc("submit_product_review", {
    p_product_id: productId,
    p_rating: rating,
    p_body: body || null,
  });

  if (error) {
    return {
      error:
        error.code === "23514" ||
        error.code === "42501" ||
        error.code === "22023"
          ? error.message
          : "Your review could not be submitted. Refresh the page and try again.",
      attempt,
    };
  }

  revalidatePath(`/shops/${shopSlug}/${productSlug}`);

  return {
    success:
      "Thank you — your review is awaiting moderation and will appear once approved.",
    attempt,
  };
}
