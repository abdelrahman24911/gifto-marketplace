import { describe, expect, it } from "vitest";

import {
  buildSettlementLineLookup,
  commissionEntriesById,
  getEntryFinanceState,
  settlementEffectiveStatus,
  settlementTotals,
  totalsForFinanceState,
} from "@/lib/finance";

import type {
  CommissionEntryRecord,
  SettlementRecord,
} from "@/lib/finance";

const entries: CommissionEntryRecord[] = [
  {
    id: "entry-open",
    vendor_id: "vendor-1",
    status: "earned",
    rate: 0.08,
    base_minor: 10_000,
    amount_minor: 800,
    earned_at: "2026-11-01T10:00:00.000Z",
    reversed_at: null,
  },
  {
    id: "entry-paid",
    vendor_id: "vendor-1",
    status: "earned",
    rate: 0.15,
    base_minor: 7_500,
    amount_minor: 1_125,
    earned_at: "2026-11-02T10:00:00.000Z",
    reversed_at: null,
  },
  {
    id: "entry-unsettled",
    vendor_id: "vendor-1",
    status: "earned",
    rate: 0.1,
    base_minor: 5_000,
    amount_minor: 500,
    earned_at: "2026-11-03T10:00:00.000Z",
    reversed_at: null,
  },
  {
    id: "entry-reversed",
    vendor_id: "vendor-1",
    status: "reversed",
    rate: 0.1,
    base_minor: 3_000,
    amount_minor: 300,
    earned_at: "2026-11-04T10:00:00.000Z",
    reversed_at: "2026-11-05T10:00:00.000Z",
  },
  {
    id: "entry-released",
    vendor_id: "vendor-1",
    status: "earned",
    rate: 0.1,
    base_minor: 4_000,
    amount_minor: 400,
    earned_at: "2026-11-05T10:00:00.000Z",
    reversed_at: null,
  },
];

const settlements: SettlementRecord[] = [
  {
    id: "settlement-open",
    vendor_id: "vendor-1",
    status: "open",
    total_minor: 800,
    note: "Week 45",
    created_at: "2026-11-04T12:00:00.000Z",
    paid_at: null,
    created_by: "admin-1",
    paid_by: null,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    settlement_lines: [
      { commission_entry_id: "entry-open", amount_minor: 800, released_at: null, released_by: null, release_reason: null },
    ],
  },
  {
    id: "settlement-paid",
    vendor_id: "vendor-1",
    status: "paid",
    total_minor: 1_125,
    note: null,
    created_at: "2026-11-02T12:00:00.000Z",
    paid_at: "2026-11-03T12:00:00.000Z",
    created_by: "admin-1",
    paid_by: "admin-2",
    voided_at: null,
    voided_by: null,
    void_reason: null,
    settlement_lines: [
      { commission_entry_id: "entry-paid", amount_minor: 1_125, released_at: null, released_by: null, release_reason: null },
    ],
  },
  {
    id: "settlement-voided",
    vendor_id: "vendor-1",
    status: "voided",
    total_minor: 400,
    note: "Opened by mistake",
    created_at: "2026-11-05T12:00:00.000Z",
    paid_at: null,
    created_by: "admin-1",
    paid_by: null,
    voided_at: "2026-11-05T13:00:00.000Z",
    voided_by: "admin-3",
    void_reason: "Wrong payout week",
    settlement_lines: [
      {
        commission_entry_id: "entry-released",
        amount_minor: 400,
        released_at: "2026-11-05T13:00:00.000Z",
        released_by: "admin-3",
        release_reason: "Wrong payout week",
      },
    ],
  },
];

describe("finance helpers", () => {
  it("classifies entries by their settlement line and reversal state", () => {
    const lookup = buildSettlementLineLookup(settlements);
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    expect(getEntryFinanceState(byId.get("entry-open")!, lookup)).toBe("open");
    expect(getEntryFinanceState(byId.get("entry-paid")!, lookup)).toBe("paid");
    expect(getEntryFinanceState(byId.get("entry-unsettled")!, lookup)).toBe(
      "unsettled",
    );
    expect(getEntryFinanceState(byId.get("entry-reversed")!, lookup)).toBe(
      "reversed",
    );
    expect(getEntryFinanceState(byId.get("entry-released")!, lookup)).toBe(
      "unsettled",
    );
  });

  it("totals gross, commission and vendor net for the available batch", () => {
    const lookup = buildSettlementLineLookup(settlements);

    expect(totalsForFinanceState(entries, lookup, "unsettled")).toEqual({
      count: 2,
      grossMinor: 9_000,
      commissionMinor: 900,
      netMinor: 8_100,
    });
    expect(totalsForFinanceState(entries, lookup, "open")).toEqual({
      count: 1,
      grossMinor: 10_000,
      commissionMinor: 800,
      netMinor: 9_200,
    });
    expect(totalsForFinanceState(entries, lookup, "paid")).toEqual({
      count: 1,
      grossMinor: 7_500,
      commissionMinor: 1_125,
      netMinor: 6_375,
    });
  });

  it("uses the explicit void status and tolerates legacy soft-voided rows", () => {
    expect(
      settlementEffectiveStatus({
        status: "voided",
        voided_at: null,
      }),
    ).toBe("voided");
    expect(
      settlementEffectiveStatus({
        status: "open",
        voided_at: "2026-11-05T12:00:00.000Z",
      }),
    ).toBe("voided");
    expect(
      settlementEffectiveStatus({ status: "open", voided_at: null }),
    ).toBe("open");
    expect(
      settlementEffectiveStatus({ status: "paid", voided_at: null }),
    ).toBe("paid");
  });

  it("keeps voided line history while excluding it from active allocations", () => {
    const lookup = buildSettlementLineLookup(settlements);

    expect(lookup.has("entry-released")).toBe(false);

    const totals = settlementTotals(
      settlements[2],
      commissionEntriesById(entries),
    );

    expect(totals).toEqual({
      count: 1,
      grossMinor: 4_000,
      commissionMinor: 400,
      netMinor: 3_600,
    });
    expect(settlements[2].total_minor).toBe(totals.commissionMinor);
  });

  it("rebuilds a settlement payout from lines instead of using total_minor", () => {
    const totals = settlementTotals(
      settlements[1],
      commissionEntriesById(entries),
    );

    expect(totals).toEqual({
      count: 1,
      grossMinor: 7_500,
      commissionMinor: 1_125,
      netMinor: 6_375,
    });
    expect(totals.commissionMinor).toBe(settlements[1].total_minor);
    expect(totals.netMinor).not.toBe(settlements[1].total_minor);
  });
});
