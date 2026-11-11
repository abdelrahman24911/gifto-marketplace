import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeError = { code?: string; message: string };
type FakeRow = Record<string, unknown>;
type QueryResult = { data: unknown; error: FakeError | null };

const state = vi.hoisted(() => ({
  authRejected: false,
  tags: [] as FakeRow[],
  rpc: vi.fn(),
  insertError: null as FakeError | null,
  updateError: null as FakeError | null,
  readError: null as FakeError | null,
}));

function makeClient() {
  function from(table: string) {
    if (table !== "tags") throw new Error(`Unexpected table: ${table}`);
    let operation: "select" | "insert" | "update" = "select";
    let payload: FakeRow = {};
    let filters: Array<{ column: string; value: unknown }> = [];

    function matching() {
      return state.tags.filter((row) =>
        filters.every(({ column, value }) => row[column] === value),
      );
    }

    const builder = {
      select() {
        return builder;
      },
      insert(next: FakeRow) {
        operation = "insert";
        payload = next;
        return builder;
      },
      update(next: FakeRow) {
        operation = "update";
        payload = next;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters = [...filters, { column, value }];
        return builder;
      },
      maybeSingle(): Promise<QueryResult> {
        if (operation === "select") {
          if (state.readError) {
            return Promise.resolve({ data: null, error: state.readError });
          }
          const row = matching()[0] ?? null;
          return Promise.resolve({ data: row, error: null });
        }

        if (operation === "insert") {
          if (state.insertError) {
            return Promise.resolve({ data: null, error: state.insertError });
          }
          const row: FakeRow = {
            ...payload,
            id: `00000000-0000-4000-8000-${String(state.tags.length + 1).padStart(12, "0")}`,
          };
          state.tags.push(row);
          return Promise.resolve({ data: row, error: null });
        }

        if (state.updateError) {
          return Promise.resolve({ data: null, error: state.updateError });
        }
        const rows = matching();
        for (const row of rows) Object.assign(row, payload);
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
    };

    return builder;
  }

  return { from, rpc: state.rpc };
}

vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: async () => {
    if (state.authRejected) throw new Error("REDIRECT:/login");
    return { supabase: makeClient() };
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));

import {
  createTag,
  reviewTagSuggestion,
  setTagActive,
  updateTag,
} from "./actions";

const TAG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUGGESTION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("admin tag actions", () => {
  beforeEach(() => {
    state.authRejected = false;
    state.tags = [];
    state.rpc.mockReset();
    state.insertError = null;
    state.updateError = null;
    state.readError = null;
  });

  it("validates a tag before writing", async () => {
    const result = await createTag(null, form({ name: "", description: "" }));

    expect(result?.fieldErrors?.name).toBeTruthy();
    expect(state.tags).toHaveLength(0);
  });

  it("refuses to create a duplicate slug and suggests reactivating it", async () => {
    state.tags = [
      {
        id: TAG_ID,
        name: "Thoughtful",
        slug: "thoughtful",
        description: null,
        is_active: false,
      },
    ];

    const result = await createTag(
      null,
      form({ name: "  Thoughtful  ", description: "" }),
    );

    expect(result).toMatchObject({
      error:
        "That tag already exists but is inactive. Reactivate it from the list below.",
    });
    expect(state.tags).toHaveLength(1);
  });

  it("creates an active tag with a normalized slug", async () => {
    const result = await createTag(
      null,
      form({ name: "Thoughtful", description: "Chosen with care" }),
    );

    expect(result).toMatchObject({
      attempt: 1,
      success: 'Tag "Thoughtful" created and active.',
      tagId: expect.any(String),
    });
    expect(state.tags[0]).toMatchObject({
      name: "Thoughtful",
      slug: "thoughtful",
      description: "Chosen with care",
      is_active: true,
    });
  });

  it("rejects an update for a missing tag", async () => {
    const result = await updateTag(
      null,
      form({ tag_id: OTHER_ID, name: "Missing", description: "" }),
    );

    expect(result).toMatchObject({ error: "That tag no longer exists." });
  });

  it("updates tag details without changing the slug", async () => {
    state.tags = [
      {
        id: TAG_ID,
        name: "Thoughtful",
        slug: "thoughtful",
        description: null,
        is_active: true,
      },
    ];

    const result = await updateTag(
      null,
      form({
        tag_id: TAG_ID,
        name: "Very thoughtful",
        description: "Updated",
      }),
    );

    expect(result).toMatchObject({
      success: "Tag details saved. Its public slug did not change.",
    });
    expect(state.tags[0]).toMatchObject({
      name: "Very thoughtful",
      slug: "thoughtful",
      description: "Updated",
    });
  });

  it("deactivates a tag and reports existing assignments", async () => {
    state.tags = [
      {
        id: TAG_ID,
        name: "Thoughtful",
        slug: "thoughtful",
        description: null,
        is_active: true,
      },
    ];

    const result = await setTagActive(
      null,
      form({ tag_id: TAG_ID, state: "inactive" }),
    );

    expect(result).toMatchObject({
      success:
        '"Thoughtful" is inactive. Existing assignments remain but are ignored publicly.',
    });
    expect(state.tags[0]?.is_active).toBe(false);
  });

  it("rejects an overlong rejection reason before calling the RPC", async () => {
    const result = await reviewTagSuggestion(
      null,
      form({
        suggestion_id: SUGGESTION_ID,
        decision: "reject",
        rejection_reason: "x".repeat(501),
      }),
    );

    expect(result).toMatchObject({
      error: "A rejection reason must be 500 characters or fewer.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("reviews a suggestion through the RPC", async () => {
    state.rpc.mockResolvedValue({ error: null });

    const result = await reviewTagSuggestion(
      null,
      form({
        suggestion_id: SUGGESTION_ID,
        decision: "approve",
      }),
    );

    expect(state.rpc).toHaveBeenCalledWith("review_tag_suggestion", {
      p_suggestion_id: SUGGESTION_ID,
      p_approve: true,
      p_rejection_reason: null,
    });
    expect(result).toMatchObject({
      success: "Suggestion approved and the tag is now available.",
    });
  });

  it("maps an already-reviewed suggestion error", async () => {
    state.rpc.mockResolvedValue({
      error: {
        code: "23514",
        message: "This tag suggestion has already been reviewed.",
      },
    });

    const result = await reviewTagSuggestion(
      null,
      form({ suggestion_id: SUGGESTION_ID, decision: "approve" }),
    );

    expect(result).toMatchObject({
      error: "This suggestion was already reviewed. Refresh the queue.",
    });
  });

  it("preserves the auth redirect", async () => {
    state.authRejected = true;
    await expect(createTag(null, form({ name: "Tag" }))).rejects.toThrow(
      "REDIRECT:/login",
    );
  });
});
