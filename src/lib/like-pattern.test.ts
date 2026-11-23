import { describe, expect, it } from "vitest";

import { containsLikePattern, escapeLikePattern } from "./like-pattern";

describe("escapeLikePattern", () => {
  it("leaves ordinary text unchanged", () => {
    expect(escapeLikePattern("Aramex Express")).toBe("Aramex Express");
  });

  it("escapes percent, underscore, and backslash", () => {
    expect(escapeLikePattern("50%_off\\sale")).toBe("50\\%\\_off\\\\sale");
  });

  it("escapes every occurrence", () => {
    expect(escapeLikePattern("%_%")).toBe("\\%\\_\\%");
  });
});

describe("containsLikePattern", () => {
  it("wraps escaped text in wildcards", () => {
    expect(containsLikePattern("100%")).toBe("%100\\%%");
  });
});
