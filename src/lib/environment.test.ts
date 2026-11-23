import { describe, expect, it } from "vitest";

import {
  getEnvironment,
  getEnvironmentBanner,
  isDemoEnvironment,
  isProductionEnvironment,
  isStagingEnvironment,
  parseEnvironment,
} from "./environment";

describe("parseEnvironment", () => {
  it("accepts each known value, case- and whitespace-insensitively", () => {
    expect(parseEnvironment("production")).toBe("production");
    expect(parseEnvironment(" Staging ")).toBe("staging");
    expect(parseEnvironment("DEMO")).toBe("demo");
    expect(parseEnvironment("development")).toBe("development");
  });

  it("returns null for missing, blank, or unknown values instead of throwing", () => {
    expect(parseEnvironment(undefined)).toBeNull();
    expect(parseEnvironment("")).toBeNull();
    expect(parseEnvironment("  ")).toBeNull();
    expect(parseEnvironment("live")).toBeNull();
    expect(parseEnvironment("prod")).toBeNull();
  });
});

describe("getEnvironment", () => {
  it("defaults to development when unset or blank", () => {
    expect(getEnvironment({})).toBe("development");
    expect(getEnvironment({ GIFTO_ENVIRONMENT: "" })).toBe("development");
    expect(getEnvironment({ GIFTO_ENVIRONMENT: "   " })).toBe("development");
  });

  it("returns the configured environment", () => {
    expect(getEnvironment({ GIFTO_ENVIRONMENT: "demo" })).toBe("demo");
    expect(getEnvironment({ GIFTO_ENVIRONMENT: "production" })).toBe(
      "production",
    );
  });

  it("throws on an unknown value instead of guessing", () => {
    expect(() => getEnvironment({ GIFTO_ENVIRONMENT: "live" })).toThrow(
      /GIFTO_ENVIRONMENT must be one of production, staging, demo, development/,
    );
  });
});

describe("environment helpers", () => {
  it("identifies demo, production and staging", () => {
    expect(isDemoEnvironment({ GIFTO_ENVIRONMENT: "demo" })).toBe(true);
    expect(isDemoEnvironment({ GIFTO_ENVIRONMENT: "production" })).toBe(
      false,
    );
    expect(
      isProductionEnvironment({ GIFTO_ENVIRONMENT: "production" }),
    ).toBe(true);
    expect(
      isProductionEnvironment({ GIFTO_ENVIRONMENT: "demo" }),
    ).toBe(false);
    expect(isStagingEnvironment({ GIFTO_ENVIRONMENT: "staging" })).toBe(
      true,
    );
    expect(isStagingEnvironment({})).toBe(false);
  });

  it("treats an unset environment as development, not demo or production", () => {
    expect(isDemoEnvironment({})).toBe(false);
    expect(isProductionEnvironment({})).toBe(false);
  });
});

describe("getEnvironmentBanner", () => {
  it("shows the demo banner with the no-real-orders wording", () => {
    const banner = getEnvironmentBanner("demo");
    expect(banner?.tone).toBe("demo");
    expect(banner?.message).toContain("Demo environment");
    expect(banner?.message).toContain("No real orders, payments or emails");
  });

  it("shows a distinct staging banner", () => {
    const banner = getEnvironmentBanner("staging");
    expect(banner?.tone).toBe("staging");
    expect(banner?.message).toContain("Staging environment");
  });

  it("shows no banner for production or development", () => {
    expect(getEnvironmentBanner("production")).toBeNull();
    expect(getEnvironmentBanner("development")).toBeNull();
  });
});
