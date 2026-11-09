import { describe, expect, it } from "vitest";

import { shouldOptimizeImages } from "./images";

describe("shouldOptimizeImages", () => {
  it("optimizes images from a hosted Supabase project", () => {
    expect(shouldOptimizeImages("https://abcdefgh.supabase.co")).toBe(true);
  });

  it("serves images as-is from local or private-network stacks", () => {
    for (const url of [
      "http://localhost:54321",
      "http://127.0.0.1:54321",
      "http://10.0.0.5:8000",
      "http://192.168.1.20:8000",
      "http://172.20.0.2:8000",
    ]) {
      expect(shouldOptimizeImages(url)).toBe(false);
    }
  });

  it("falls back to unoptimized when the URL is missing or invalid", () => {
    expect(shouldOptimizeImages(undefined)).toBe(false);
    expect(shouldOptimizeImages("not a url")).toBe(false);
  });
});
