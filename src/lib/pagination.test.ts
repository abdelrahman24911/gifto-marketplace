import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
  totalPages,
} from "./pagination";

describe("parsePage", () => {
  it("defaults to 1 for missing or invalid input", () => {
    for (const value of [undefined, null, "", "0", "-2", "abc", "1.5", "1e3", " 2"]) {
      expect(parsePage(value)).toBe(1);
    }
  });

  it("parses positive integers and uses the first of repeated params", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(["4", "9"])).toBe(4);
  });

  it("rejects absurdly long numbers", () => {
    expect(parsePage("99999999999")).toBe(1);
  });
});

describe("pageWindow", () => {
  it("computes inclusive PostgREST ranges", () => {
    expect(pageWindow(1)).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      from: 0,
      to: 24,
    });
    expect(pageWindow(3, 10)).toMatchObject({ from: 20, to: 29 });
  });
});

describe("totalPages / clampPage", () => {
  it("always has at least one page", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(25)).toBe(1);
    expect(totalPages(26)).toBe(2);
  });

  it("clamps out-of-range pages to the last page", () => {
    expect(clampPage(99, 60)).toBe(3);
    expect(clampPage(2, 0)).toBe(1);
    expect(clampPage(0, 60)).toBe(1);
  });
});
