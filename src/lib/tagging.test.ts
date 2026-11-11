import { describe, expect, it } from "vitest";

import {
  TAG_DESCRIPTION_MAX,
  TAG_NAME_MAX,
  normalizeTagDescription,
  normalizeTagName,
  tagSelectionIsDirty,
  toggleTagSelection,
  validateTagInput,
} from "./tagging";

describe("tag input normalization", () => {
  it("collapses whitespace and trims names", () => {
    expect(normalizeTagName("  Hand   made \n gifts ")).toBe(
      "Hand made gifts",
    );
  });

  it("normalizes line endings and trims descriptions", () => {
    expect(normalizeTagDescription("  First\r\nSecond\rThird  ")).toBe(
      "First\nSecond\nThird",
    );
  });
});

describe("validateTagInput", () => {
  it("accepts a valid tag and returns normalized values", () => {
    expect(
      validateTagInput({
        name: "  Care   package ",
        description: "  A thoughtful set\nof small gifts. ",
      }),
    ).toEqual({
      ok: true,
      values: {
        name: "Care package",
        description: "A thoughtful set\nof small gifts.",
      },
      fieldErrors: {},
    });
  });

  it("rejects names outside the database limits", () => {
    expect(validateTagInput({ name: "a" })).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.stringContaining("between 2 and") },
    });

    expect(validateTagInput({ name: "x".repeat(TAG_NAME_MAX + 1) })).toMatchObject(
      {
        ok: false,
        fieldErrors: { name: expect.stringContaining("60") },
      },
    );
  });

  it("rejects overlong descriptions", () => {
    expect(
      validateTagInput({
        name: "Thoughtful",
        description: "x".repeat(TAG_DESCRIPTION_MAX + 1),
      }),
    ).toMatchObject({
      ok: false,
      fieldErrors: { description: expect.stringContaining("500") },
    });
  });
});

describe("tag selection helpers", () => {
  it("treats the same ids in a different order as saved", () => {
    expect(tagSelectionIsDirty(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("detects additions, removals and length changes", () => {
    expect(tagSelectionIsDirty(["a", "b", "c"], ["a", "b"])).toBe(true);
    expect(tagSelectionIsDirty(["a"], ["a", "b"])).toBe(true);
    expect(tagSelectionIsDirty(["a", "c"], ["a", "b"])).toBe(true);
  });

  it("adds once and removes without mutating the input", () => {
    const selected = ["a", "b"];
    expect(toggleTagSelection(selected, "b", true)).toEqual(["a", "b"]);
    expect(toggleTagSelection(selected, "c", true)).toEqual(["a", "b", "c"]);
    expect(toggleTagSelection(selected, "a", false)).toEqual(["b"]);
    expect(selected).toEqual(["a", "b"]);
  });
});
