import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactElement, ReactNode } from "react";

import { FilterPill } from "@/components/dashboard/filter-pill";

import type { CommissionEntryRecord } from "@/lib/finance";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireVendorRole: vi.fn(),
  fetchAllRows: vi.fn(),
  Pagination: vi.fn(() => null),
}));

vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/vendor", () => ({
  requireVendorRole: mocks.requireVendorRole,
}));
vi.mock("@/lib/fetch-all", () => ({ fetchAllRows: mocks.fetchAllRows }));
vi.mock("@/components/pagination", () => ({
  Pagination: mocks.Pagination,
}));

import VendorFinancePage from "./page";

const ledgerQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  returns: vi.fn(),
};

ledgerQuery.select.mockReturnValue(ledgerQuery);
ledgerQuery.eq.mockReturnValue(ledgerQuery);
ledgerQuery.gte.mockReturnValue(ledgerQuery);
ledgerQuery.order.mockReturnValue(ledgerQuery);
ledgerQuery.range.mockReturnValue(ledgerQuery);

const supabase = { from: vi.fn(() => ledgerQuery) };

const lifetimeEntries: CommissionEntryRecord[] = Array.from(
  { length: 30 },
  (_, index) => ({
    id: `entry-${index}`,
    vendor_id: "vendor-1",
    status: "earned",
    rate: 0.1,
    base_minor: 1_000,
    amount_minor: 100,
    earned_at: `2026-10-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
    reversed_at: null,
  }),
);

function findByType(
  node: ReactNode,
  type: unknown,
): ReactElement<Record<string, unknown>> | null {
  if (node === null || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findByType(child, type);
      if (match) return match;
    }
    return null;
  }

  const element = node as ReactElement<{ children?: ReactNode }>;
  if (element.type === type) {
    return element as ReactElement<Record<string, unknown>>;
  }

  return findByType(element.props?.children, type);
}

function findAllByType(
  node: ReactNode,
  type: unknown,
): ReactElement<Record<string, unknown>>[] {
  const found: ReactElement<Record<string, unknown>>[] = [];
  const walk = (current: ReactNode): void => {
    if (current === null || typeof current !== "object") return;
    if (Array.isArray(current)) {
      for (const child of current) walk(child);
      return;
    }
    const element = current as ReactElement<{ children?: ReactNode }>;
    if (element.type === type) {
      found.push(element as ReactElement<Record<string, unknown>>);
    }
    walk(element.props?.children);
  };
  walk(node);
  return found;
}

describe("VendorFinancePage pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    ledgerQuery.returns.mockResolvedValue({
      data: [],
      error: null,
      count: 5,
    });
    mocks.fetchAllRows
      .mockResolvedValueOnce({
        rows: lifetimeEntries,
        failed: false,
        truncated: false,
      })
      .mockResolvedValueOnce({ rows: [], failed: false, truncated: false });
    mocks.requireVendorRole.mockResolvedValue({
      supabase,
      access: {
        vendorId: "vendor-1",
        vendorName: "Gifto Shop",
        vendorSlug: "gifto-shop",
        vendorStatus: "active",
        role: "owner",
      },
    });
  });

  it("uses the filtered ledger count instead of lifetime entries", async () => {
    const tree = await VendorFinancePage({
      searchParams: Promise.resolve({
        vendor: "vendor-1",
        range: "7d",
        page: "2",
      }),
    });

    expect(ledgerQuery.select).toHaveBeenCalledWith(
      expect.stringContaining("order_items(product_name, quantity)"),
      { count: "exact" },
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/vendor/finance?vendor=vendor-1&range=7d",
    );

    const pagination = findByType(tree, mocks.Pagination);
    expect(pagination?.props).toMatchObject({ page: 1, total: 5 });
  });

  it("renders the finance view tabs as pending-state filter pills", async () => {
    const tree = await VendorFinancePage({
      searchParams: Promise.resolve({
        vendor: "vendor-1",
        range: "7d",
        page: "1",
      }),
    });

    const tabs = findAllByType(tree, FilterPill);
    expect(tabs).toHaveLength(2);
    expect(tabs.map((tab) => tab.props.href)).toEqual([
      "/vendor/finance?vendor=vendor-1&range=7d",
      "/vendor/finance?vendor=vendor-1&view=settlements&range=7d",
    ]);
    // Earnings is the active view for the default (no view param) render.
    expect(tabs[0].props.active).toBe(true);
    expect(tabs[1].props.active).toBe(false);
  });
});
