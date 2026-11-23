import { describe, expect, it } from "vitest";

import { chartLabelIndices } from "./chart-labels";

describe("chartLabelIndices", () => {
  it("returns an empty set for no points", () => {
    expect(chartLabelIndices(0)).toEqual(new Set());
  });

  it("shows every label when there are few points", () => {
    expect([...chartLabelIndices(4)]).toEqual([0, 1, 2, 3]);
  });

  it("spaces labels for a 30-day range and keeps the last label clear", () => {
    // 30 points: step 5, last index 29 sits 4 columns past 25, so it shows.
    expect([...chartLabelIndices(30)]).toEqual([0, 5, 10, 15, 20, 25, 29]);
  });

  it("does NOT force the last label on next to its neighbour (the QA overlap)", () => {
    // 8 points: step 2 shows 0, 2, 4, 6; the last index 7 is only 1 column
    // past 6, so it must stay hidden — showing it produced "22 No23 No".
    expect([...chartLabelIndices(8)]).toEqual([0, 2, 4, 6]);
    expect([...chartLabelIndices(10)]).toEqual([0, 2, 4, 6, 8]);
  });

  it("shows the last label when it lands exactly on a step", () => {
    expect([...chartLabelIndices(7)]).toEqual([0, 2, 4, 6]);
    expect([...chartLabelIndices(13)]).toEqual([0, 3, 6, 9, 12]);
  });

  it("keeps at most CHART_LABEL_MAX + 1 labels for long ranges", () => {
    expect(chartLabelIndices(90).size).toBeLessThanOrEqual(7);
    const indices = [...chartLabelIndices(90)];
    for (let i = 1; i < indices.length; i += 1) {
      expect(indices[i] - indices[i - 1]).toBeGreaterThanOrEqual(3);
    }
  });
});
