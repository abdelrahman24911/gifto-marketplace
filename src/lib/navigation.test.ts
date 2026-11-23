import { describe, expect, it } from "vitest";

import { shouldInterceptLinkClick } from "./navigation";

import type { LinkClick } from "./navigation";

const plainClick: LinkClick = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};

describe("shouldInterceptLinkClick", () => {
  it("intercepts a plain left-click", () => {
    expect(shouldInterceptLinkClick(plainClick)).toBe(true);
  });

  it("does not intercept a middle or right click", () => {
    expect(shouldInterceptLinkClick({ ...plainClick, button: 1 })).toBe(false);
    expect(shouldInterceptLinkClick({ ...plainClick, button: 2 })).toBe(false);
  });

  it("does not intercept modified clicks", () => {
    expect(shouldInterceptLinkClick({ ...plainClick, metaKey: true })).toBe(false);
    expect(shouldInterceptLinkClick({ ...plainClick, ctrlKey: true })).toBe(false);
    expect(shouldInterceptLinkClick({ ...plainClick, shiftKey: true })).toBe(false);
    expect(shouldInterceptLinkClick({ ...plainClick, altKey: true })).toBe(false);
  });

  it("does not intercept a click that was already handled", () => {
    expect(
      shouldInterceptLinkClick({ ...plainClick, defaultPrevented: true }),
    ).toBe(false);
  });
});
