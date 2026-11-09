import { unstable_cache, updateTag } from "next/cache";

/** Cache tags for shared, public storefront data. */
export const CATALOG_TAGS = {
  catalog: "catalog",
  shops: "shops",
  categories: "categories",
} as const;

export type CatalogTag = (typeof CATALOG_TAGS)[keyof typeof CATALOG_TAGS];

/**
 * Safety-net expiry. Mutations invalidate by tag immediately; this only bounds
 * staleness if an invalidation is ever missed (e.g. a change made outside the
 * app).
 */
export const CATALOG_CACHE_SECONDS = 60;

/** What a cached read produced, and whether it is safe to share. */
export type CatalogRead<R> = { value: R; cacheable: boolean };

class UncacheableResult<R> extends Error {
  constructor(readonly value: R) {
    super("uncacheable catalog result");
  }
}

/**
 * Wraps a PUBLIC catalog read in a shared, tag-invalidated cache.
 *
 * Only reads made with the cookie-less `createPublicClient()` may use this:
 * cached values are shared by every visitor. Results flagged `cacheable: false`
 * (failed reads, unknown slugs) are returned to the caller but never stored, so
 * an outage is not cached and arbitrary URLs cannot grow the cache.
 *
 * Function arguments are part of the cache key automatically.
 */
export function cachedCatalogRead<A extends unknown[], R>(
  name: string,
  read: (...args: A) => Promise<CatalogRead<R>>,
  tags: CatalogTag[],
): (...args: A) => Promise<R> {
  const cached = unstable_cache(
    async (...args: A) => {
      const result = await read(...args);
      if (!result.cacheable) throw new UncacheableResult(result.value);
      return result.value;
    },
    ["public-catalog", name],
    { tags, revalidate: CATALOG_CACHE_SECONDS },
  );

  return async (...args: A) => {
    try {
      return await cached(...args);
    } catch (error) {
      if (error instanceof UncacheableResult) return error.value as R;
      throw error;
    }
  };
}

/**
 * Drops cached storefront data so the next visit rebuilds it. Call from Server
 * Actions after a deliberate change to products, shops or categories (create,
 * edit, delete, publish, status change, manual stock adjustment).
 *
 * Do NOT call it per order: orders and cancellations only move stock labels,
 * the database enforces real stock at checkout, and invalidating on every order
 * would empty the cache at peak traffic. The expiry above bounds that staleness.
 */
export function revalidatePublicCatalog(
  tags: CatalogTag[] = Object.values(CATALOG_TAGS),
) {
  for (const tag of tags) {
    try {
      updateTag(tag);
    } catch {
      // Invalidation is best-effort: it must never fail the mutation that
      // called it (e.g. an order that was already placed). The expiry above
      // bounds how long anything can stay stale.
    }
  }
}
