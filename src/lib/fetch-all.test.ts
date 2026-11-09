import { describe, expect, it, vi } from "vitest";

import { fetchAllRows } from "./fetch-all";

function source(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  return vi.fn(async (from: number, to: number) => ({
    data: all.slice(from, to + 1),
    error: null,
  }));
}

describe("fetchAllRows", () => {
  it("returns a short first page without a second request", async () => {
    const fetchPage = source(3);
    const result = await fetchAllRows(fetchPage, { pageSize: 10 });

    expect(result.rows).toHaveLength(3);
    expect(result).toMatchObject({ failed: false, truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("reads past the per-response cap and keeps order", async () => {
    const fetchPage = source(25);
    const result = await fetchAllRows(fetchPage, { pageSize: 10 });

    expect(result.rows.map((row) => row.id)).toEqual(
      Array.from({ length: 25 }, (_, i) => i),
    );
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("makes one extra request when the total is an exact multiple", async () => {
    const fetchPage = source(20);
    const result = await fetchAllRows(fetchPage, { pageSize: 10 });

    expect(result.rows).toHaveLength(20);
    expect(result.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("flags truncation at the safety cap instead of pretending it is complete", async () => {
    const result = await fetchAllRows(source(1_000), {
      pageSize: 10,
      maxRows: 30,
    });

    expect(result.rows).toHaveLength(30);
    expect(result.truncated).toBe(true);
  });

  it("flags a failed page and keeps the rows read so far", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const result = await fetchAllRows(fetchPage, { pageSize: 2 });

    expect(result.failed).toBe(true);
    expect(result.rows).toHaveLength(2);
  });
});
