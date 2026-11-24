import { describe, expect, it } from "vitest";

import { GOVERNORATES } from "@/lib/governorates";
import {
  CONTACT_EMAIL_PATTERN,
  VENDOR_COVERAGE_MAX_ITEMS,
  coverageFromJson,
  coverageToJson,
  deliveryCoverageAllows,
  formatCoverageList,
  formatPrepTime,
  formatWorkingHours,
  parseCoverageList,
  parsePrepTimeDays,
  validateWorkingHours,
  workingHoursFromJson,
  workingHoursToJson,
} from "@/lib/vendor-settings";

describe("parseCoverageList", () => {
  it("splits commas and new lines, trims, and drops blanks", () => {
    expect(
      parseCoverageList(" Alexandria, Beheira\n,  , Giza ").values,
    ).toEqual(["Alexandria", "Beheira", "Giza"]);
  });

  it("deduplicates case-insensitively while keeping the first spelling", () => {
    expect(parseCoverageList("Cairo, cairo, CAIRO").values).toEqual(["Cairo"]);
  });

  it("rejects an overlong entry", () => {
    const result = parseCoverageList("a".repeat(81));
    expect(result.values).toEqual([]);
    expect(result.error).toMatch(/80 characters/);
  });

  it("rejects too many entries", () => {
    const input = Array.from(
      { length: VENDOR_COVERAGE_MAX_ITEMS + 1 },
      (_, index) => `Area ${index}`,
    ).join(",");
    const result = parseCoverageList(input);
    expect(result.values).toEqual([]);
    expect(result.error).toMatch(/at most 30/);
  });

  it("accepts an empty list", () => {
    expect(parseCoverageList("  , \n ")).toEqual({ values: [], error: null });
  });
});

describe("coverageFromJson", () => {
  it("reads the documented shape", () => {
    expect(
      coverageFromJson({ governorates: ["alexandria"], areas: ["smouha"] }),
    ).toEqual({ governorates: ["alexandria"], areas: ["smouha"] });
  });

  it("degrades malformed shapes to empty coverage", () => {
    expect(coverageFromJson(null)).toEqual({ governorates: [], areas: [] });
    expect(coverageFromJson(["alexandria"])).toEqual({
      governorates: [],
      areas: [],
    });
    expect(coverageFromJson({ governorates: "alexandria" })).toEqual({
      governorates: [],
      areas: [],
    });
  });

  it("filters non-string and blank entries", () => {
    expect(
      coverageFromJson({ governorates: ["Cairo", 3, " ", null], areas: [] }),
    ).toEqual({ governorates: ["Cairo"], areas: [] });
  });
});

describe("coverageToJson and formatCoverageList", () => {
  it("round-trips the supported shape", () => {
    const json = coverageToJson({
      governorates: ["Cairo"],
      areas: ["Maadi"],
    });
    expect(coverageFromJson(json)).toEqual({
      governorates: ["Cairo"],
      areas: ["Maadi"],
    });
    expect(formatCoverageList(["Cairo", "Giza"])).toBe("Cairo, Giza");
  });
});

describe("deliveryCoverageAllows", () => {
  const alexandriaToyCorner = {
    governorates: ["Alexandria"],
    areas: ["Smouha", "Sidi Gaber", "Gleem", "Damanhour"],
  };
  const nileBlossoms = {
    governorates: ["Alexandria"],
    areas: ["Raml Station", "Sidi Gaber", "Smouha", "San Stefano"],
  };
  const address = {
    city: "Maadi",
    governorate: "Cairo",
    addressLine: "12 Road 9, Maadi",
  };

  it("allows the reported Cairo to Alexandria Toy Corner order", () => {
    expect(
      deliveryCoverageAllows(alexandriaToyCorner, {
        city: "Cairo",
        governorate: "Cairo",
        addressLine: "12 Road 9, Maadi",
      }),
    ).toBe(true);
  });

  it("allows an Aswan order from Nile Blossoms", () => {
    expect(
      deliveryCoverageAllows(nileBlossoms, {
        city: "Aswan",
        governorate: "Aswan",
        addressLine: "1 Corniche El Nil",
      }),
    ).toBe(true);
  });

  it.each(GOVERNORATES.map(({ en }) => en))(
    "allows %s from a vendor whose lists are elsewhere",
    (governorate) => {
      expect(
        deliveryCoverageAllows(alexandriaToyCorner, {
          ...address,
          governorate,
        }),
      ).toBe(true);
      expect(
        deliveryCoverageAllows(nileBlossoms, {
          ...address,
          governorate,
        }),
      ).toBe(true);
    },
  );

  it.each(GOVERNORATES.map(({ en, ar }) => [en, ar] as const))(
    "accepts the Arabic form for %s",
    (_en, arabic) => {
      expect(
        deliveryCoverageAllows(nileBlossoms, {
          ...address,
          governorate: arabic,
        }),
      ).toBe(true);
    },
  );

  it("allows every address when the shop lists nothing", () => {
    expect(
      deliveryCoverageAllows(
        { governorates: [], areas: [] },
        { city: "Alexandria", governorate: "Alexandria", addressLine: "1 Sea Rd" },
      ),
    ).toBe(true);
  });

  it("ignores stored coverage values entirely", () => {
    expect(
      deliveryCoverageAllows(
        { governorates: ["Giza"], areas: ["Zamalek"] },
        address,
      ),
    ).toBe(true);
    expect(
      deliveryCoverageAllows(
        { governorates: ["Cairo"], areas: ["Maadi"] },
        { ...address, governorate: "Aswan" },
      ),
    ).toBe(true);
  });

  it("tolerates the same governorate variants as the database", () => {
    expect(
      deliveryCoverageAllows(alexandriaToyCorner, {
        ...address,
        governorate: "Cairo Governorate",
      }),
    ).toBe(true);
    expect(
      deliveryCoverageAllows(alexandriaToyCorner, {
        ...address,
        governorate: "محافظة القاهرة",
      }),
    ).toBe(true);
    expect(
      deliveryCoverageAllows(alexandriaToyCorner, {
        ...address,
        governorate: "الاسكندريه",
      }),
    ).toBe(true);
  });

  it("rejects a missing or non-Egyptian governorate", () => {
    for (const governorate of ["", "   ", "Atlantis", "Cairoo", "New Cairo"]) {
      expect(
        deliveryCoverageAllows(alexandriaToyCorner, {
          ...address,
          governorate,
        }),
      ).toBe(false);
    }
  });
});

describe("working hours", () => {
  it("reads valid same-day ranges and ignores closed or malformed days", () => {
    expect(
      workingHoursFromJson({
        mon: { open: "09:00", close: "18:00" },
        tue: { open: "18:00", close: "09:00" },
        wed: { open: "9:00", close: "17:00" },
        thu: null,
        sat: { open: "10:00", close: "14:00" },
      }),
    ).toEqual({
      mon: { open: "09:00", close: "18:00" },
      sat: { open: "10:00", close: "14:00" },
    });
  });

  it("round-trips only valid slots", () => {
    const json = workingHoursToJson({
      mon: { open: "09:00", close: "18:00" },
      tue: { open: "", close: "18:00" },
      wed: { open: "18:00", close: "09:00" },
    });

    expect(json).toEqual({ mon: { open: "09:00", close: "18:00" } });
    expect(workingHoursFromJson(json)).toEqual({
      mon: { open: "09:00", close: "18:00" },
    });
  });

  it("requires both times and a closing time after opening", () => {
    expect(
      validateWorkingHours({ mon: { open: "09:00", close: "" } }),
    ).toMatch(/both opening and closing/i);
    expect(
      validateWorkingHours({ mon: { open: "18:00", close: "09:00" } }),
    ).toMatch(/after opening/i);
    expect(
      validateWorkingHours({ mon: { open: "9:00", close: "18:00" } }),
    ).toMatch(/24-hour/i);
  });

  it("accepts an empty schedule", () => {
    expect(validateWorkingHours({})).toBeNull();
  });

  it("formats only the days that are open", () => {
    expect(
      formatWorkingHours({
        mon: { open: "09:00", close: "18:00" },
        sat: { open: "10:00", close: "14:00" },
      }),
    ).toEqual([
      { day: "mon", label: "Monday", value: "09:00–18:00" },
      { day: "sat", label: "Saturday", value: "10:00–14:00" },
    ]);
  });
});

describe("preparation time formatting", () => {
  it("formats blank, same-day, single and ranged lead times", () => {
    expect(formatPrepTime(null, null)).toBeNull();
    expect(formatPrepTime(0, 0)).toBe("Same day");
    expect(formatPrepTime(2, 2)).toBe("2 days");
    expect(formatPrepTime(1, 1)).toBe("1 day");
    expect(formatPrepTime(0, 3)).toBe("Up to 3 days");
    expect(formatPrepTime(1, 3)).toBe("1–3 days");
    expect(formatPrepTime(null, 3)).toBe("3 days");
  });
});

describe("preparation time", () => {
  it("parses blank and bounded whole-day values", () => {
    expect(parsePrepTimeDays("")).toEqual({ value: null, error: null });
    expect(parsePrepTimeDays(" 0 ")).toEqual({ value: 0, error: null });
    expect(parsePrepTimeDays("60")).toEqual({ value: 60, error: null });
  });

  it("rejects fractions, negatives and values over 60", () => {
    expect(parsePrepTimeDays("1.5").error).toMatch(/whole number/i);
    expect(parsePrepTimeDays("-1").error).toMatch(/whole number/i);
    expect(parsePrepTimeDays("61").error).toMatch(/between 0 and 60/i);
  });
});

describe("contact email validation", () => {
  it("accepts ordinary business addresses", () => {
    expect(CONTACT_EMAIL_PATTERN.test("orders@shop.eg")).toBe(true);
  });

  it("rejects missing domains and spaces", () => {
    expect(CONTACT_EMAIL_PATTERN.test("orders@shop")).toBe(false);
    expect(CONTACT_EMAIL_PATTERN.test("orders @shop.eg")).toBe(false);
  });
});
