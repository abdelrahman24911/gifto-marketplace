import { describe, expect, it } from "vitest";

import { deleteConfirmationMatches } from "./confirm-delete";

describe("deleteConfirmationMatches", () => {
  it("accepts the exact product name", () => {
    expect(deleteConfirmationMatches("Plant Pot", "Plant Pot")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(deleteConfirmationMatches("Plant Pot", "  Plant Pot  ")).toBe(true);
  });

  it("is case-sensitive", () => {
    expect(deleteConfirmationMatches("Plant Pot", "plant pot")).toBe(false);
  });

  it("rejects a partial name", () => {
    expect(deleteConfirmationMatches("Plant Pot", "Plant")).toBe(false);
    expect(deleteConfirmationMatches("Plant Pot", "")).toBe(false);
  });

  it("rejects an empty expected name", () => {
    expect(deleteConfirmationMatches("", "")).toBe(false);
    expect(deleteConfirmationMatches("   ", "   ")).toBe(false);
  });
});
