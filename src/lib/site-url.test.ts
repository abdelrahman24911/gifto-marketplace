import { afterEach, describe, expect, it, vi } from "vitest";

import { getSiteUrl } from "./site-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSiteUrl", () => {
  it("falls back to localhost outside production", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("trims trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gifto.example///");

    expect(getSiteUrl()).toBe("https://gifto.example");
  });

  it("uses the deployed origin when production has no site URL override", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    expect(getSiteUrl()).toBe("https://gifto-marketplace.vercel.app");
  });

  it("rejects localhost in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

    expect(() => getSiteUrl()).toThrow(/localhost/);
  });

  it("can use the deployment origin for metadata in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");

    expect(
      getSiteUrl({ fallbackToProductionOnLocalhost: true }),
    ).toBe("https://gifto-marketplace.vercel.app");
  });

  it("keeps a valid production origin when metadata fallback is enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gifto.example/");

    expect(
      getSiteUrl({ fallbackToProductionOnLocalhost: true }),
    ).toBe("https://www.gifto.example");
  });

  it("rejects non-http protocols and malformed URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "ftp://gifto.example");
    expect(() => getSiteUrl()).toThrow(/http or https/);

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "not a url");
    expect(() => getSiteUrl()).toThrow(/absolute URL/);
  });
});
