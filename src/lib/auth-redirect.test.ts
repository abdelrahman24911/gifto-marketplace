import { afterEach, describe, expect, it, vi } from "vitest";

import { getAuthCallbackUrl, getSafeAuthPath } from "./auth-redirect";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth redirect URLs", () => {
  it("uses the production origin for confirmation and password-reset callbacks", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    expect(getAuthCallbackUrl("/account")).toBe(
      "https://gifto-marketplace.vercel.app/auth/callback?next=%2Faccount",
    );
    expect(getAuthCallbackUrl("/reset-password")).toBe(
      "https://gifto-marketplace.vercel.app/auth/callback?next=%2Freset-password",
    );
  });

  it("uses localhost during local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    expect(getAuthCallbackUrl("/account")).toBe(
      "http://localhost:3000/auth/callback?next=%2Faccount",
    );
  });

  it("normalizes trailing slashes in the configured origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gifto.example///");

    expect(getAuthCallbackUrl("/account")).toBe(
      "https://gifto.example/auth/callback?next=%2Faccount",
    );
  });

  it("rejects invalid redirects without creating an open redirect", () => {
    expect(getSafeAuthPath("https://attacker.example")).toBe("/account");
    expect(getSafeAuthPath("//attacker.example")).toBe("/account");
    expect(getSafeAuthPath("/\\attacker.example")).toBe("/account");
    expect(getSafeAuthPath("/account?tab=orders")).toBe("/account?tab=orders");
  });
});
