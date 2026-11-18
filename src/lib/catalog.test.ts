import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryRecord = {
  table: string;
  select?: string;
  filters: string[];
  orders: string[];
  limit?: number;
  countRequested?: boolean;
  range?: [number, number];
};

type QueryChain = {
  select(columns: string, options?: { count?: string }): QueryChain;
  eq(column: string, value: unknown): QueryChain;
  in(column: string, values: readonly unknown[]): QueryChain;
  ilike(column: string, value: string): QueryChain;
  gte(column: string, value: unknown): QueryChain;
  lte(column: string, value: unknown): QueryChain;
  lt(column: string, value: unknown): QueryChain;
  order(column: string, options: { ascending: boolean }): QueryChain;
  limit(value: number): QueryChain;
  range(from: number, to: number): QueryChain;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
  returns(): Promise<{ data: unknown; error: unknown; count?: number | null }>;
};

type FakeResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

const db = vi.hoisted(() => ({
  queries: [] as QueryRecord[],
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
  results: {} as Record<string, FakeResult>,
}));

function fakeClient() {
  return {
    from(table: string) {
      const record: QueryRecord = { table, filters: [], orders: [] };
      db.queries.push(record);

      const chain: QueryChain = {
        select(columns, options) {
          record.select = columns;
          if (options?.count) record.countRequested = true;
          return chain;
        },
        eq(column, value) {
          record.filters.push(`eq:${column}=${String(value)}`);
          return chain;
        },
        in(column, values) {
          record.filters.push(`in:${column}=${values.map(String).join(",")}`);
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
        lt(column, value) {
          record.filters.push(`lt:${column}=${String(value)}`);
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
        range(from, to) {
          record.range = [from, to];
          return chain;
        },
        maybeSingle: async () =>
          db.results[table] ?? { data: null, error: null },
        returns: async () => db.results[table] ?? { data: [], error: null },
      };

      return chain;
    },
    async rpc(name: string, args: unknown) {
      db.rpcCalls.push({ name, args });
      return db.results.rpc ?? { data: [], error: null };
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
  loadGiftFinderPage,
  loadOccasion,
  loadOccasions,
  loadProductsByCategory,
  loadProductsByOccasion,
  searchProducts,
} from "./catalog";

beforeEach(() => {
  db.queries.length = 0;
  db.rpcCalls.length = 0;
  for (const key of Object.keys(db.results)) delete db.results[key];
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

describe("public occasion queries", () => {
  it("lists published occasions in curated order without joining products", async () => {
    db.results.occasions = {
      data: [
        {
          id: "occasion-1",
          name: "Graduation",
          slug: "graduation",
          description: "For the big day.",
          image_path: "graduation/hero.png",
          image_alt: "A graduation cap",
        },
      ],
      error: null,
    };

    const result = await loadOccasions();

    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: "occasion-1",
          name: "Graduation",
          slug: "graduation",
          description: "For the big day.",
          imagePath: "graduation/hero.png",
          imageAlt: "A graduation cap",
        },
      ],
    });

    const query = db.queries[0];
    expect(query.table).toBe("occasions");
    expect(query.select).toBe(
      "id, name, slug, description, image_path, image_alt",
    );
    expect(query.filters).toEqual(["eq:is_active=true"]);
    expect(query.orders).toEqual(["sort_order:asc", "created_at:asc"]);
  });

  it("resolves a published occasion by slug without checking redirects", async () => {
    db.results.occasions = {
      data: {
        id: "occasion-1",
        name: "Graduation",
        slug: "graduation",
        description: null,
        image_path: null,
        image_alt: null,
      },
      error: null,
    };

    const result = await loadOccasion("graduation");

    expect(result).toEqual({
      ok: true,
      data: {
        occasion: {
          id: "occasion-1",
          name: "Graduation",
          slug: "graduation",
          description: null,
          imagePath: null,
          imageAlt: null,
        },
        redirectFrom: null,
      },
    });
    expect(db.queries.map((query) => query.table)).toEqual(["occasions"]);
    expect(db.queries[0].filters).toEqual([
      "eq:slug=graduation",
      "eq:is_active=true",
    ]);
  });

  it("returns an empty collection without querying products when the RPC has no rows", async () => {
    const result = await loadProductsByOccasion("occasion-1");

    expect(result).toEqual({ ok: true, data: { items: [], total: 0 } });
    expect(db.rpcCalls).toEqual([
      {
        name: "get_occasion_products",
        args: { p_occasion_id: "occasion-1", p_limit: 60, p_offset: 0 },
      },
    ]);
    expect(db.queries).toEqual([]);
  });

  it("fetches cards for ranked products and preserves the RPC order", async () => {
    db.results.rpc = {
      data: [
        { id: "product-2", total_count: 2 },
        { id: "product-1", total_count: 2 },
      ],
      error: null,
    };
    db.results.products = {
      data: [
        {
          id: "product-1",
          name: "Rose",
          slug: "rose",
          price_minor: 10_000,
          stock: 1,
          vendor_id: "vendor-1",
          vendor: { name: "Shop", slug: "shop" },
          category: null,
          product_images: [],
        },
        {
          id: "product-2",
          name: "Hamper",
          slug: "hamper",
          price_minor: 20_000,
          stock: 2,
          vendor_id: "vendor-1",
          vendor: { name: "Shop", slug: "shop" },
          category: null,
          product_images: [],
        },
      ],
      error: null,
    };

    const result = await loadProductsByOccasion("occasion-1", 12);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(2);
    expect(result.data.items.map((product) => product.id)).toEqual([
      "product-2",
      "product-1",
    ]);

    const query = db.queries[0];
    expect(query.table).toBe("products");
    expect(query.select).toContain("vendor:public_vendors!inner(");
    expect(query.filters).toEqual([
      "in:id=product-2,product-1",
      "eq:status=active",
    ]);
  });

  it("reports a failed product fetch instead of an empty occasion", async () => {
    db.results.rpc = {
      data: [{ id: "product-1", total_count: 1 }],
      error: null,
    };
    db.results.products = { data: null, error: { message: "offline" } };

    const result = await loadProductsByOccasion("occasion-1");

    expect(result).toEqual({ ok: false });
  });
});

describe("public gift finder page", () => {
  it("filters, counts, and pages in the database", async () => {
    db.results.categories = {
      data: [{ id: "category-1", slug: "personalized-gifts" }],
      error: null,
    };
    db.results.products = { data: [], error: null, count: 13 };

    const result = await loadGiftFinderPage({
      recipient: "her",
      occasionSlug: "graduation",
      budget: "750-1000",
      offset: 8,
      limit: 8,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        products: [],
        total: 13,
        offset: 8,
        limit: 8,
        hasMore: true,
        occasionUnsupported: false,
      },
    });

    const [categoryQuery, productQuery] = db.queries;
    expect(categoryQuery.table).toBe("categories");
    expect(categoryQuery.filters).toEqual([
      "in:slug=flowers,personalized-gifts,gift-boxes",
      "eq:is_active=true",
    ]);
    expect(productQuery.table).toBe("products");
    expect(productQuery.select).toContain("vendor:public_vendors!inner(");
    expect(productQuery.filters).toEqual([
      "eq:status=active",
      "in:category_id=category-1",
      "gte:price_minor=75000",
      "lt:price_minor=100000",
    ]);
    expect(productQuery.orders).toEqual([
      "created_at:desc",
      "id:desc",
    ]);
    expect(productQuery.range).toEqual([8, 15]);
    expect(productQuery.countRequested).toBe(true);
  });

  it("returns an honest empty result for an unmapped occasion without querying", async () => {
    const result = await loadGiftFinderPage({
      recipient: "any",
      occasionSlug: "birthday",
      budget: "any",
      offset: 0,
      limit: 8,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        products: [],
        total: 0,
        offset: 0,
        limit: 8,
        hasMore: false,
        occasionUnsupported: true,
      },
    });
    expect(db.queries).toEqual([]);
  });

  it("returns an empty page when no mapped category is active", async () => {
    db.results.categories = { data: [], error: null };

    const result = await loadGiftFinderPage({
      recipient: "kids",
      occasionSlug: null,
      budget: "any",
      offset: 0,
      limit: 8,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { total: 0, occasionUnsupported: false },
    });
    expect(db.queries.map((query) => query.table)).toEqual(["categories"]);
  });

  it("fails honestly when the exact count is unavailable", async () => {
    db.results.products = { data: [], error: null, count: null };

    const result = await loadGiftFinderPage({
      recipient: "any",
      occasionSlug: null,
      budget: "any",
      offset: 0,
      limit: 8,
    });

    expect(result).toEqual({ ok: false });
  });
});
