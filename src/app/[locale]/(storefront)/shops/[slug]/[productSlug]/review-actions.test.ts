import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  quotaLimited: false,
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({
    supabase: { rpc: state.rpc },
    user: { id: "user-1" },
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkAuthQuota: vi.fn(async () => ({
    limited: state.quotaLimited,
    unavailable: false,
    message: state.quotaLimited
      ? "Too many review submissions. Please wait an hour and try again."
      : null,
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { submitReview } from "./review-actions";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

function reviewFormData(
  overrides: { productId?: string; rating?: string; body?: string } = {},
): FormData {
  const formData = new FormData();
  formData.set("product_id", overrides.productId ?? PRODUCT_ID);
  formData.set("shop_slug", "review-shop-a");
  formData.set("product_slug", "a-gift");
  formData.set("rating", overrides.rating ?? "5");
  formData.set("body", overrides.body ?? "Loved it");
  return formData;
}

beforeEach(() => {
  state.quotaLimited = false;
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ error: null });
});

describe("submitReview (UX Batch 2)", () => {
  it("validates the gift, the rating and the body before any RPC call", async () => {
    await expect(
      submitReview(null, reviewFormData({ productId: "not-a-uuid" })),
    ).resolves.toMatchObject({ error: "That gift could not be found." });
    expect(state.rpc).not.toHaveBeenCalled();

    for (const rating of ["0", "6", "abc"]) {
      await expect(
        submitReview(null, reviewFormData({ rating })),
      ).resolves.toMatchObject({
        error: "Choose a rating from 1 to 5 stars.",
      });
    }
    expect(state.rpc).not.toHaveBeenCalled();

    await expect(
      submitReview(null, reviewFormData({ body: "x".repeat(1001) })),
    ).resolves.toMatchObject({
      error: "A review must be 1000 characters or fewer.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses the submission when the review quota is exceeded", async () => {
    state.quotaLimited = true;

    await expect(submitReview(null, reviewFormData())).resolves.toMatchObject(
      {
        error:
          "Too many review submissions. Please wait an hour and try again.",
      },
    );
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("surfaces the RPC's refusal verbatim and reports success", async () => {
    state.rpc.mockResolvedValueOnce({
      error: {
        code: "23514",
        message: "Only customers who received this gift can review it.",
      },
    });

    await expect(submitReview(null, reviewFormData())).resolves.toMatchObject(
      {
        error: "Only customers who received this gift can review it.",
      },
    );

    await expect(submitReview(null, reviewFormData())).resolves.toMatchObject(
      {
        success:
          "Thank you — your review is awaiting moderation and will appear once approved.",
      },
    );
    expect(state.rpc).toHaveBeenCalledWith("submit_product_review", {
      p_product_id: PRODUCT_ID,
      p_rating: 5,
      p_body: "Loved it",
    });
  });

  it("hides an unexpected RPC failure behind the generic message", async () => {
    state.rpc.mockResolvedValueOnce({
      error: { code: "500", message: "boom" },
    });

    await expect(submitReview(null, reviewFormData())).resolves.toMatchObject(
      {
        error:
          "Your review could not be submitted. Refresh the page and try again.",
      },
    );
  });
});
