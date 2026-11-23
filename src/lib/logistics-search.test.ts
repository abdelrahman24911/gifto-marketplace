import { describe, expect, it } from "vitest";

import { courierLikePattern, normalizeCourierSearch } from "./logistics-search";

function likeMatches(pattern: string, value: string): boolean {
  let source = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? "";

    if (character === "\\") {
      const next = pattern[index + 1];
      if (next === undefined) {
        source += "\\\\";
      } else {
        source += next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        index += 1;
      }
    } else if (character === "%") {
      source += ".*";
    } else if (character === "_") {
      source += ".";
    } else {
      source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }

  return new RegExp(`${source}$`, "s").test(value);
}

describe("normalizeCourierSearch", () => {
  it("removes PostgREST syntax and the '*' alias for '%'", () => {
    expect(normalizeCourierSearch(' Aramex, (Bosta)* "fast" ')).toBe(
      "Aramex Bosta fast",
    );
  });

  it("keeps percent and underscore for literal matching", () => {
    expect(normalizeCourierSearch("50%_off")).toBe("50%_off");
  });

  it("returns an empty string for missing input", () => {
    expect(normalizeCourierSearch(undefined)).toBe("");
  });

  it("caps the search at 80 characters", () => {
    expect(normalizeCourierSearch("a".repeat(100))).toHaveLength(80);
  });
});

describe("courierLikePattern", () => {
  it("matches only a literal percent when searching for '%'", () => {
    const pattern = courierLikePattern("%");

    expect(pattern).toBe("%\\%%");

    const couriers = ["Aramex", "Bosta", "50% Express"];
    const matches = couriers.filter((courier) =>
      likeMatches(pattern ?? "", courier),
    );

    expect(matches).toEqual(["50% Express"]);
  });

  it("matches only a literal underscore when searching for '_'", () => {
    const pattern = courierLikePattern("_");

    expect(pattern).toBe("%\\_%");

    const couriers = ["Aramex", "fast_line", "Bosta"];
    const matches = couriers.filter((courier) =>
      likeMatches(pattern ?? "", courier),
    );

    expect(matches).toEqual(["fast_line"]);
  });

  it("returns null for an empty search", () => {
    expect(courierLikePattern("   ")).toBeNull();
  });
});
