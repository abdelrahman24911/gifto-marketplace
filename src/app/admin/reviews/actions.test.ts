import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  quotaError: null as string | null,
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: async () => ({
    supabase: { rpc: state.rpc },
    user: { id: "admin-1" },
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkMutationQuota: vi.fn(async () => state.quotaError),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { moderateReview } from "./actions";

const REVIEW_ID = "22222222-2222-4222-8222-222222222222";

function moderateFormData(
  overrides: { reviewId?: string; approved?: string } = {},
): FormData {
  const formData = new FormData();
  formData.set("review_id", overrides.reviewId ?? REVIEW_ID);
  formData.set("approved", overrides.approved ?? "true");
  return formData;
}

beforeEach(() => {
  state.quotaError = null;
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ error: null });
});

describe("moderateReview (UX Batch 2)", () => {
  it("validates the review id and the decision before any RPC call", async () => {
    await expect(
      moderateReview(null, moderateFormData({ reviewId: "nope" })),
    ).resolves.toMatchObject({ error: "That review could not be found." });
    expect(state.rpc).not.toHaveBeenCalled();

    await expect(
      moderateReview(null, moderateFormData({ approved: "maybe" })),
    ).resolves.toMatchObject({
      error: "Choose whether to approve or reject the review.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses the mutation when the admin quota is exceeded", async () => {
    state.quotaError =
      "Too many changes. Please wait an hour and try again.";

    await expect(
      moderateReview(null, moderateFormData()),
    ).resolves.toEqual({
      error: "Too many changes. Please wait an hour and try again.",
      attempt: 1,
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("surfaces the RPC's refusal verbatim and reports approve/reject", async () => {
    state.rpc.mockResolvedValueOnce({
      error: {
        code: "23514",
        message: "This review has already been moderated.",
      },
    });

    await expect(
      moderateReview(null, moderateFormData()),
    ).resolves.toMatchObject({
      error: "This review has already been moderated.",
    });

    await expect(
      moderateReview(null, moderateFormData({ approved: "true" })),
    ).resolves.toMatchObject({
      success: "Review approved. It is now visible on the gift page.",
    });
    expect(state.rpc).toHaveBeenCalledWith("moderate_product_review", {
      p_review_id: REVIEW_ID,
      p_approved: true,
    });

    await expect(
      moderateReview(null, moderateFormData({ approved: "false" })),
    ).resolves.toMatchObject({
      success: "Review rejected. It stays hidden.",
    });
    expect(state.rpc).toHaveBeenCalledWith("moderate_product_review", {
      p_review_id: REVIEW_ID,
      p_approved: false,
    });
  });

  it("hides an unexpected RPC failure behind the generic message", async () => {
    state.rpc.mockResolvedValueOnce({
      error: { code: "500", message: "boom" },
    });

    await expect(
      moderateReview(null, moderateFormData()),
    ).resolves.toMatchObject({
      error:
        "The review could not be moderated. Refresh the page and try again.",
    });
  });
});
