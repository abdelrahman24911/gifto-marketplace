import { describe, expect, it } from "vitest";

import {
  GOVERNORATES,
  GOVERNORATE_NAMES,
  governorateLabel,
  governorateMatchKey,
  isGovernorate,
  normalizeGovernorate,
  partitionGovernorates,
} from "./governorates";

describe("governorates", () => {
  it("lists exactly Egypt's 27 governorates, once each", () => {
    expect(GOVERNORATES).toHaveLength(27);
    expect(new Set(GOVERNORATE_NAMES).size).toBe(27);
    expect(GOVERNORATE_NAMES).toContain("Cairo");
    expect(GOVERNORATE_NAMES).toContain("Alexandria");
    expect(GOVERNORATE_NAMES).toContain("South Sinai");
  });

  it("labels a governorate with its Arabic name", () => {
    expect(governorateLabel("Cairo")).toBe("Cairo — القاهرة");
    expect(governorateLabel("Alexandria")).toBe("Alexandria — الإسكندرية");
    expect(governorateLabel("Unknown")).toBe("Unknown");
  });

  it("accepts only exact canonical names", () => {
    expect(isGovernorate("Cairo")).toBe(true);
    expect(isGovernorate("cairo")).toBe(false);
    expect(isGovernorate("Cairo Governorate")).toBe(false);
    expect(isGovernorate("القاهرة")).toBe(false);
    expect(isGovernorate("")).toBe(false);
  });

  it("normalises trim, case and whitespace variants", () => {
    expect(normalizeGovernorate("  cairo ")).toBe("Cairo");
    expect(normalizeGovernorate("CAIRO")).toBe("Cairo");
    expect(normalizeGovernorate("Kafr   El Sheikh")).toBe("Kafr El Sheikh");
    expect(normalizeGovernorate("kAFR el sHEIKH")).toBe("Kafr El Sheikh");
  });

  it("strips a trailing Governorate suffix", () => {
    expect(normalizeGovernorate("Cairo Governorate")).toBe("Cairo");
    expect(normalizeGovernorate("cairo governorate")).toBe("Cairo");
    expect(normalizeGovernorate("Alexandria Governorate")).toBe("Alexandria");
  });

  it("maps Arabic names, including orthographic variants", () => {
    expect(normalizeGovernorate("القاهرة")).toBe("Cairo");
    expect(normalizeGovernorate("محافظة القاهرة")).toBe("Cairo");
    expect(normalizeGovernorate("الاسكندريه")).toBe("Alexandria");
    expect(normalizeGovernorate("الإسكندرية")).toBe("Alexandria");
    expect(normalizeGovernorate("الجيزة")).toBe("Giza");
    expect(normalizeGovernorate("شمال سيناء")).toBe("North Sinai");
  });

  it("never guesses an unmappable value into a different governorate", () => {
    expect(normalizeGovernorate("Cairoo")).toBeNull();
    expect(normalizeGovernorate("Giza City")).toBeNull();
    expect(normalizeGovernorate("New Cairo")).toBeNull();
    expect(normalizeGovernorate("Governorate of Cairo")).toBeNull();
    expect(normalizeGovernorate("")).toBeNull();
    expect(normalizeGovernorate("   ")).toBeNull();
  });

  it("partitions stored values into canonical and unmappable", () => {
    expect(
      partitionGovernorates([
        "Cairo Governorate",
        "cairo",
        "القاهرة",
        "Cairoo",
        "Giza",
        "  ",
        "Cairoo",
      ]),
    ).toEqual({
      canonical: ["Cairo", "Giza"],
      unmappable: ["Cairoo"],
    });
  });

  it("keeps the JS match key aligned with the SQL normaliser's rules", () => {
    // These keys are what migration 37's normalize_governorate_name()
    // must produce for the same inputs; if this changes, the migration
    // must change with it.
    expect(governorateMatchKey("Cairo Governorate")).toBe("cairo");
    expect(governorateMatchKey("محافظة القاهرة")).toBe("القاهره");
    expect(governorateMatchKey("الاسكندريه")).toBe("الاسكندريه");
  });
});
