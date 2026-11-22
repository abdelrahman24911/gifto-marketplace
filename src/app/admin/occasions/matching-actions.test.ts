import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authRejected: false,
  quotaError: null as string | null,
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: async () => {
    if (state.authRejected) throw new Error("REDIRECT:/login");
    return {
      supabase: { rpc: state.rpc },
      user: { id: "admin-1" },
    };
  },
}));

// P1-12: the quota limiter is covered by src/lib/rate-limit.test.ts and
// supabase/tests/rate_limits_test.sql; these tests exercise the action
// logic with the quota allowed.
vi.mock("@/lib/rate-limit", () => ({
  checkMutationQuota: vi.fn(async () => state.quotaError),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));

import { saveOccasionMatchingRules } from "./actions";

const OCCASION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CATEGORY_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CATEGORY_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAG_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const TAG_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function form(values: {
  occasionId?: string;
  categoryIds?: string[];
  tagIds?: string[];
}) {
  const data = new FormData();
  data.set("occasion_id", values.occasionId ?? OCCASION_ID);
  for (const id of values.categoryIds ?? []) data.append("category_ids", id);
  for (const id of values.tagIds ?? []) data.append("tag_ids", id);
  return data;
}

describe("saveOccasionMatchingRules", () => {
  beforeEach(() => {
    state.authRejected = false;
    state.rpc.mockReset();
    state.rpc.mockResolvedValue({ error: null });
  });

  it("rejects an invalid occasion id without writing", async () => {
    const result = await saveOccasionMatchingRules(
      null,
      form({ occasionId: "not-a-uuid" }),
    );

    expect(result).toMatchObject({
      attempt: 1,
      error: "That occasion id is not valid.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid category/tag ids without writing", async () => {
    const badCategory = await saveOccasionMatchingRules(
      null,
      form({ categoryIds: ["not-a-uuid"] }),
    );
    const badTag = await saveOccasionMatchingRules(
      null,
      form({ tagIds: ["not-a-uuid"] }),
    );

    expect(badCategory).toMatchObject({
      error: "One or more selected categories are not valid.",
    });
    expect(badTag).toMatchObject({
      error: "One or more selected tags are not valid.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("dedupes ids and calls the combined atomic RPC in order", async () => {
    const result = await saveOccasionMatchingRules(
      null,
      form({
        categoryIds: [CATEGORY_B, CATEGORY_A, CATEGORY_B],
        tagIds: [TAG_A, TAG_A, TAG_B],
      }),
    );

    expect(state.rpc).toHaveBeenCalledWith(
      "replace_occasion_matching_rules",
      {
        p_occasion_id: OCCASION_ID,
        p_category_ids: [CATEGORY_B, CATEGORY_A],
        p_tag_ids: [TAG_A, TAG_B],
      },
    );
    expect(result).toMatchObject({
      attempt: 1,
      categoryIds: [CATEGORY_B, CATEGORY_A],
      tagIds: [TAG_A, TAG_B],
      success: "Matching rules saved: 2 categories and 2 tags.",
    });
  });

  it("reports cleared rules and increments attempts", async () => {
    state.rpc.mockResolvedValueOnce({ error: null });
    const first = await saveOccasionMatchingRules(
      { attempt: 4, error: "previous failure" },
      form({}),
    );

    expect(first).toMatchObject({
      attempt: 5,
      categoryIds: [],
      tagIds: [],
      success:
        "Matching rules cleared. Manual picks still follow the occasion's matching mode.",
    });
  });

  it("maps inactive-tag and permission failures to readable errors", async () => {
    state.rpc.mockResolvedValueOnce({
      error: {
        code: "23514",
        message: "Only active approved tags can be used as occasion rules.",
      },
    });
    const inactive = await saveOccasionMatchingRules(
      null,
      form({ tagIds: [TAG_A] }),
    );
    expect(inactive).toMatchObject({
      error:
        "One or more selected tags are no longer active. Reload the page and choose again.",
    });

    state.rpc.mockResolvedValueOnce({
      error: { code: "42501", message: "permission denied" },
    });
    const unauthorized = await saveOccasionMatchingRules(
      null,
      form({ categoryIds: [CATEGORY_A] }),
    );
    expect(unauthorized).toMatchObject({
      error: "You do not have permission to change this occasion.",
    });
  });

  it("preserves the auth redirect", async () => {
    state.authRejected = true;
    await expect(
      saveOccasionMatchingRules(null, form({})),
    ).rejects.toThrow("REDIRECT:/login");
  });
});
