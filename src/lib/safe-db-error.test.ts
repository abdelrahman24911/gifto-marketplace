import { describe, expect, it } from "vitest";

import { safeDbError } from "./safe-db-error";

describe("safeDbError", () => {
  const FALLBACK = "Something went wrong. Please try again.";

  it("passes through friendly RPC validation messages", () => {
    expect(
      safeDbError(
        { code: "23514", message: "Stock cannot go below zero." },
        FALLBACK,
      ),
    ).toBe("Stock cannot go below zero.");
    expect(
      safeDbError(
        { code: "42501", message: "Only shop owners and managers can adjust stock." },
        FALLBACK,
      ),
    ).toBe("Only shop owners and managers can adjust stock.");
    expect(
      safeDbError(
        { code: "22023", message: "Enter a non-zero adjustment." },
        FALLBACK,
      ),
    ).toBe("Enter a non-zero adjustment.");
  });

  it("trims a friendly message", () => {
    expect(
      safeDbError({ code: "23514", message: "  Stock cannot go below zero. " }, FALLBACK),
    ).toBe("Stock cannot go below zero.");
  });

  it("blocks a genuine table check violation even with a friendly code", () => {
    expect(
      safeDbError(
        {
          code: "23514",
          message:
            'new row for relation "products" violates check constraint "products_price_minor_check"',
        },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });

  it("blocks unique-key and foreign-key internals", () => {
    expect(
      safeDbError(
        {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "vendors_slug_key"',
        },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
    expect(
      safeDbError(
        {
          code: "23503",
          message:
            'insert or update on table "orders" violates foreign key constraint "orders_vendor_id_fkey"',
        },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });

  it("blocks RLS denial text even with code 42501", () => {
    expect(
      safeDbError(
        {
          code: "42501",
          message:
            'new row violates row-level security policy for table "vendors"',
        },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });

  it("blocks missing-function and other PostgREST failures", () => {
    expect(
      safeDbError(
        { code: "PGRST202", message: "Could not find the function public.consume_auth_quota in the schema cache" },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
    expect(
      safeDbError({ code: "P0001", message: "division by zero" }, FALLBACK),
    ).toBe(FALLBACK);
  });

  it("blocks messages naming functions, columns, or relations", () => {
    expect(
      safeDbError(
        { code: "22023", message: 'column "price_minor" is of type integer' },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
    expect(
      safeDbError(
        { code: "22023", message: "function adjust_product_stock(unknown) does not exist" },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });

  it("falls back on a missing or empty error", () => {
    expect(safeDbError(null, FALLBACK)).toBe(FALLBACK);
    expect(safeDbError(undefined, FALLBACK)).toBe(FALLBACK);
    expect(safeDbError({ code: "23514", message: "" }, FALLBACK)).toBe(FALLBACK);
    expect(safeDbError({ code: "23514", message: null }, FALLBACK)).toBe(FALLBACK);
    expect(safeDbError({ message: "Stock cannot go below zero." }, FALLBACK)).toBe(
      FALLBACK,
    );
  });
});
