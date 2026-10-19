import { describe, expect, it } from "vitest";

import { formatEgp, minorToEgpInput, parseEgpToMinor } from "./money";

describe("formatEgp", () => {
  it("formats whole piastres", () => {
    expect(formatEgp(17500)).toBe("EGP 175.00");
  });

  it("pads single-digit piastres", () => {
    expect(formatEgp(17505)).toBe("EGP 175.05");
    expect(formatEgp(5)).toBe("EGP 0.05");
  });

  it("formats zero", () => {
    expect(formatEgp(0)).toBe("EGP 0.00");
  });

  it("groups thousands", () => {
    expect(formatEgp(123456789)).toBe("EGP 1,234,567.89");
  });

  it("keeps a leading minus for negative amounts", () => {
    expect(formatEgp(-17500)).toBe("-EGP 175.00");
  });
});

describe("parseEgpToMinor", () => {
  it("parses plain amounts", () => {
    expect(parseEgpToMinor("150")).toBe(15000);
    expect(parseEgpToMinor("150.5")).toBe(15050);
    expect(parseEgpToMinor("150.50")).toBe(15050);
    expect(parseEgpToMinor("0")).toBe(0);
    expect(parseEgpToMinor("0.99")).toBe(99);
  });

  it("tolerates commas, whitespace and an EGP prefix", () => {
    expect(parseEgpToMinor("1,250.50")).toBe(125050);
    expect(parseEgpToMinor("  99  ")).toBe(9900);
    expect(parseEgpToMinor("EGP 99")).toBe(9900);
    expect(parseEgpToMinor("egp 99.25")).toBe(9925);
  });

  it("rejects more than two decimals instead of rounding", () => {
    expect(parseEgpToMinor("150.505")).toBeNull();
  });

  it("rejects negative, empty and non-numeric input", () => {
    expect(parseEgpToMinor("-5")).toBeNull();
    expect(parseEgpToMinor("")).toBeNull();
    expect(parseEgpToMinor("abc")).toBeNull();
    expect(parseEgpToMinor("12.34.56")).toBeNull();
    expect(parseEgpToMinor("1e3")).toBeNull();
  });

  it("rejects amounts above the sanity bound", () => {
    // 7-digit whole parts are the hard limit; the 10M EGP bound is unreachable.
    expect(parseEgpToMinor("9999999.99")).toBe(999999999);
    expect(parseEgpToMinor("10000000")).toBeNull();
    expect(parseEgpToMinor("10000000.01")).toBeNull();
  });
});

describe("minorToEgpInput", () => {
  it("round-trips through parseEgpToMinor", () => {
    for (const minor of [0, 5, 99, 15000, 123456789]) {
      expect(parseEgpToMinor(minorToEgpInput(minor))).toBe(minor);
    }
  });

  it("pads the piastres", () => {
    expect(minorToEgpInput(17505)).toBe("175.05");
  });
});
