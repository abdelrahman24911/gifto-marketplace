import { describe, expect, it } from "vitest";

import { carouselDirection, carouselEdges } from "@/lib/carousel";

describe("carouselEdges", () => {
  it("reports both directions at the start and end of an LTR rail", () => {
    expect(carouselEdges(0, 1200, 600)).toEqual({
      canPrev: false,
      canNext: true,
    });
    expect(carouselEdges(300, 1200, 600)).toEqual({
      canPrev: true,
      canNext: true,
    });
    expect(carouselEdges(600, 1200, 600)).toEqual({
      canPrev: true,
      canNext: false,
    });
  });

  it("treats RTL's negative scrollLeft as distance from the start", () => {
    expect(carouselEdges(-300, 1200, 600)).toEqual({
      canPrev: true,
      canNext: true,
    });
    expect(carouselEdges(-600, 1200, 600)).toEqual({
      canPrev: true,
      canNext: false,
    });
  });

  it("disables both directions when the content fits", () => {
    expect(carouselEdges(0, 400, 600)).toEqual({
      canPrev: false,
      canNext: false,
    });
  });

  it("ignores sub-pixel offsets at the edges", () => {
    expect(carouselEdges(1, 1200, 600).canPrev).toBe(false);
    expect(carouselEdges(599, 1200, 600).canNext).toBe(false);
  });
});

describe("carouselDirection", () => {
  it("scrolls forward positively in LTR and negatively in RTL", () => {
    expect(carouselDirection(false)).toBe(1);
    expect(carouselDirection(true)).toBe(-1);
  });
});
