import { describe, expect, it } from "vitest";

import { EnvironmentBanner } from "./environment-banner";

describe("EnvironmentBanner", () => {
  it("renders the demo banner with the environment marker", () => {
    const element = EnvironmentBanner({ environment: "demo" });
    expect(element).not.toBeNull();
    expect(element?.props["data-environment"]).toBe("demo");
    expect(element?.props.role).toBe("status");
    expect(String(element?.props.children)).toContain("Demo environment");
    expect(String(element?.props.children)).toContain(
      "No real orders, payments or emails",
    );
    expect(element?.props.className).toContain("bg-amber-200");
  });

  it("renders a distinct staging banner", () => {
    const element = EnvironmentBanner({ environment: "staging" });
    expect(element).not.toBeNull();
    expect(element?.props["data-environment"]).toBe("staging");
    expect(String(element?.props.children)).toContain("Staging environment");
    expect(element?.props.className).toContain("bg-sky-200");
  });

  it("renders nothing for production or development", () => {
    expect(EnvironmentBanner({ environment: "production" })).toBeNull();
    expect(EnvironmentBanner({ environment: "development" })).toBeNull();
  });
});
