import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
}));

import { GET } from "./route";

const query = {
  select: vi.fn(),
  ilike: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  returns: vi.fn(),
};

for (const method of ["select", "ilike", "eq", "order", "range"] as const) {
  query[method].mockReturnValue(query);
}

const supabase = { from: vi.fn(() => query) };

const ROWS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: 'Rose "Deluxe" Bouquet, red',
    slug: "rose-deluxe-bouquet",
    status: "active",
    stock: 12,
    price_minor: 145000,
    created_at: "2026-10-05T10:00:00.000Z",
    vendor: { name: "Nile Blossoms", slug: "nile-blossoms" },
    category: { name: "Flowers", slug: "flowers" },
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Plant Pot",
    slug: "plant-pot",
    status: "draft",
    stock: 0,
    price_minor: 9900,
    created_at: "2026-09-01T08:30:00.000Z",
    vendor: null,
    category: null,
  },
];

describe("GET /admin/products/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePlatformAdmin.mockResolvedValue({ supabase });
    query.returns.mockResolvedValue({ data: ROWS, error: null });
  });

  it("exports the catalogue as CSV with the admin guard applied", async () => {
    const response = await GET(
      new Request("http://localhost/admin/products/export"),
    );

    expect(mocks.requirePlatformAdmin).toHaveBeenCalledTimes(1);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="gifto-products.csv"',
    );
    const text = await response.text();
    expect(text).toContain(
      "Product,Slug,Shop,Category,Status,Price (EGP),Stock,Created",
    );
    // RFC 4180 quoting: the comma and quotes in the first product name.
    expect(text).toContain(
      '"Rose ""Deluxe"" Bouquet, red",rose-deluxe-bouquet,Nile Blossoms,Flowers,Active,1450.00,12,2026-10-05',
    );
    // Removed shop / missing category fall back to readable values.
    expect(text).toContain(
      "Plant Pot,plant-pot,Removed shop,,Draft,99.00,0,2026-09-01",
    );
  });

  it("applies the page's filters and sort, sanitising the search", async () => {
    const response = await GET(
      new Request(
        "http://localhost/admin/products/export?q=%25a_b%5Cc&status=active&shop=not-a-uuid&sort=price-desc",
      ),
    );

    expect(response.status).toBe(200);
    // LIKE pattern characters are stripped before the ilike search (R-06).
    expect(query.ilike).toHaveBeenCalledWith("name", "%abc%");
    expect(query.eq).toHaveBeenCalledWith("status", "active");
    expect(query.eq).not.toHaveBeenCalledWith(
      "vendor_id",
      expect.anything(),
    );
    expect(query.order).toHaveBeenCalledWith("price_minor", {
      ascending: false,
    });
  });

  it("returns 503 when the catalogue cannot be read", async () => {
    query.returns.mockResolvedValue({ data: null, error: { message: "boom" } });

    const response = await GET(
      new Request("http://localhost/admin/products/export"),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toContain("could not be read");
  });

  it("returns 422 instead of a silently truncated export", async () => {
    query.returns.mockResolvedValue({
      data: Array.from({ length: 1000 }, (_, i) => ({
        ...ROWS[0],
        id: `row-${i}`,
      })),
      error: null,
    });

    const response = await GET(
      new Request("http://localhost/admin/products/export"),
    );

    expect(response.status).toBe(422);
    expect(await response.text()).toContain("Too many rows");
  });
});
