import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny stand-in for unstable_cache: stores results by key + args, so a
// second identical call is a cache hit, and records the options it was given.
const runtime = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  options: [] as { tags?: string[]; revalidate?: number | false }[],
  updated: [] as string[],
  updateTagThrows: false,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => Promise<unknown>,
    keyParts: string[],
    options: { tags?: string[]; revalidate?: number | false },
  ) => {
    runtime.options.push(options);
    return async (...args: unknown[]) => {
      const key = JSON.stringify([keyParts, args]);
      if (runtime.store.has(key)) return runtime.store.get(key);
      const value = await fn(...args);
      runtime.store.set(key, value);
      return value;
    };
  },
  updateTag: (tag: string) => {
    if (runtime.updateTagThrows) throw new Error("not in a Server Action");
    runtime.updated.push(tag);
  },
}));

import {
  CATALOG_CACHE_SECONDS,
  CATALOG_TAGS,
  cachedCatalogRead,
  revalidatePublicCatalog,
} from "./catalog-cache";

beforeEach(() => {
  runtime.store.clear();
  runtime.options.length = 0;
  runtime.updated.length = 0;
  runtime.updateTagThrows = false;
});

describe("cachedCatalogRead", () => {
  it("serves a repeat read from the cache", async () => {
    const read = vi.fn(async (n: number) => ({ value: n * 2, cacheable: true }));
    const cached = cachedCatalogRead("double", read, [CATALOG_TAGS.catalog]);

    expect(await cached(2)).toBe(4);
    expect(await cached(2)).toBe(4);
    expect(read).toHaveBeenCalledTimes(1);

    expect(await cached(3)).toBe(6);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("returns but never stores results marked uncacheable", async () => {
    const read = vi.fn(async () => ({
      value: { ok: false as const },
      cacheable: false,
    }));
    const cached = cachedCatalogRead("failing", read, [CATALOG_TAGS.shops]);

    expect(await cached()).toEqual({ ok: false });
    expect(await cached()).toEqual({ ok: false });
    expect(read).toHaveBeenCalledTimes(2);
    expect(runtime.store.size).toBe(0);
  });

  it("does not swallow real errors", async () => {
    const cached = cachedCatalogRead(
      "boom",
      async () => {
        throw new Error("database down");
      },
      [CATALOG_TAGS.catalog],
    );

    await expect(cached()).rejects.toThrow("database down");
  });

  it("registers its tags and a bounded expiry", () => {
    cachedCatalogRead("tagged", async () => ({ value: 1, cacheable: true }), [
      CATALOG_TAGS.categories,
    ]);

    expect(runtime.options[0]).toEqual({
      tags: ["categories"],
      revalidate: CATALOG_CACHE_SECONDS,
    });
  });
});

describe("revalidatePublicCatalog", () => {
  it("invalidates every catalog tag by default", () => {
    revalidatePublicCatalog();
    expect(runtime.updated.sort()).toEqual([
      "catalog",
      "categories",
      "occasions",
      "shops",
    ]);
  });

  it("can target specific tags", () => {
    revalidatePublicCatalog([CATALOG_TAGS.catalog]);
    expect(runtime.updated).toEqual(["catalog"]);
  });

  it("never throws, so it cannot fail the mutation that called it", () => {
    runtime.updateTagThrows = true;
    expect(() => revalidatePublicCatalog()).not.toThrow();
  });
});
