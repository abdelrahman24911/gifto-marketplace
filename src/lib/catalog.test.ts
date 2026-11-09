import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryRecord = {
  table: string;
  select?: string;
  filters: string[];
  orders: string[];
  limit?: number;
};

type QueryChain = {
  select(columns: string): QueryChain;
  eq(column: string, value: unknown): QueryChain;
  ilike(column: string, value: string): QueryChain;
  gte(column: string, value: unknown): QueryChain;
  lte(column: string, value: unknown): QueryChain;
  order(column: string, options: { ascending: boolean }): QueryChain;
  limit(value: number): QueryChain;
  maybeSingle(): Promise<{ data: null; error: null }>;
  returns(): Promise<{ data: never[]; error: null }>;
};

const db = vi.hoisted(() => ({
  queries: [] as QueryRecord[],
}));

function fakeClient() {
  return {
    from(table: string) {
      const record: QueryRecord = { table, filters: [], orders: [] };
      db.queries.push(record);

      const chain: QueryChain = {
        select(columns) {
          record.select = columns;
          return chain;
        },
        eq(column, value) {
          record.filters.push(`eq:${column}=${String(value)}`);
          return chain;
        },
        ilike(column, value) {
          record.filters.push(`ilike:${column}=${value}`);
          return chain;
        },
        gte(column, value) {
          record.filters.push(`gte:${column}=${String(value)}`);
          return chain;
        },
        lte(column, value) {
          record.filters.push(`lte:${column}=${String(value)}`);
          return chain;
        },
        order(column, options) {
          record.orders.push(`${column}:${options.ascending ? "asc" : "desc"}`);
          return chain;
        },
        limit(value) {
          record.limit = value;
          return chain;
        },
        maybeSingle: async () => ({ data: null, error: null }),
        returns: async () => ({ data: [], error: null }),
      };

      return chain;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fakeClient(),
}));

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => fakeClient(),
}));

// unstable_cache needs Next's runtime; here it must just call through so the
// tests exercise the query shape. Caching behaviour is covered in
// catalog-cache.test.ts.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  updateTag: () => {},
}));

import {
  getNewArrivals,
  loadProductsByCategory,
  searchProducts,
} from "./catalog";

beforeEach(() => {
  db.queries.length = 0;
});

describe("public catalog queries", () => {
  it("filters non-public vendors in the database before applying the limit", async () => {
    await getNewArrivals(3);

    const query = db.queries[0];
    expect(query.table).toBe("products");
    expect(query.select).toContain("vendor:public_vendors!inner(");
    expect(query.filters).toEqual(["eq:status=active"]);
    expect(query.orders).toEqual(["created_at:desc"]);
    expect(query.limit).toBe(3);
  });

  it("keeps category filtering and limits on the inner-joined product query", async () => {
    await loadProductsByCategory("category-1", 7);

    const query = db.queries[0];
    expect(query.select).toContain("vendor:public_vendors!inner(");
    expect(query.filters).toEqual([
      "eq:category_id=category-1",
      "eq:status=active",
    ]);
    expect(query.limit).toBe(7);
  });

  it("keeps search filters and limits on the inner-joined product query", async () => {
    const result = await searchProducts({
      q: "vase",
      minMinor: 10_000,
      maxMinor: 50_000,
      limit: 12,
    });

    expect(result).toEqual({ ok: true, products: [] });

    const query = db.queries[0];
    expect(query.select).toContain("vendor:public_vendors!inner(");
    expect(query.filters).toEqual([
      "eq:status=active",
      "ilike:name=%vase%",
      "gte:price_minor=10000",
      "lte:price_minor=50000",
    ]);
    expect(query.limit).toBe(12);
  });
});
