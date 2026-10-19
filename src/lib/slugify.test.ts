import { describe, expect, it } from "vitest";

import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases and hyphenates runs of non-alphanumerics", () => {
    expect(slugify("Handmade Gift Box")).toBe("handmade-gift-box");
    expect(slugify("  Extra   Spaces  ")).toBe("extra-spaces");
    expect(slugify("Gift & Wrap!")).toBe("gift-wrap");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("---hello---")).toBe("hello");
    expect(slugify("!!!")).toBe("");
  });

  it("keeps digits", () => {
    expect(slugify("Box 21")).toBe("box-21");
  });

  it("matches the database slug shape used by the unique constraint", () => {
    const result = slugify("Ramadan Kareem 2026!");
    expect(result).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
