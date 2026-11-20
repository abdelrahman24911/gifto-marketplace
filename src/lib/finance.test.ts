import { describe, expect, it } from "vitest";

import {
  buildSettlementLineLookup,
  commissionEntriesById,
  getEntryFinanceState,
  isTransferMethod,
  settlementAdjustmentsMinor,
  settlementEarnedCommissionMinor,
  settlementEffectiveStatus,
  settlementLineGrossMinor,
  settlementTotals,
  settlementTotalsResult,
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
    paid_amount_minor: null,
    transfer_method: null,
    transfer_reference: null,
    proof_note: null,
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
    paid_amount_minor: 1_125,
    transfer_method: "bank_transfer",
    transfer_reference: "BANK-REF-1",
    proof_note: "Weekly remittance",
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
    paid_amount_minor: null,
    transfer_method: null,
    transfer_reference: null,
    proof_note: null,
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
      matchedCount: 1,
      missingEntryCount: 0,
      grossMinor: 4_000,
      commissionMinor: 400,
      netMinor: 3_600,
      complete: true,
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
      matchedCount: 1,
      missingEntryCount: 0,
      grossMinor: 7_500,
      commissionMinor: 1_125,
      netMinor: 6_375,
      complete: true,
    });
    expect(totals.commissionMinor).toBe(settlements[1].total_minor);
    expect(totals.netMinor).not.toBe(settlements[1].total_minor);
  });

  it("reports complete totals when every commission entry is present", () => {
    expect(
      settlementTotalsResult(
        settlements[0],
        commissionEntriesById(entries),
      ),
    ).toEqual({
      totals: {
        count: 1,
        matchedCount: 1,
        missingEntryCount: 0,
        grossMinor: 10_000,
        commissionMinor: 800,
        netMinor: 9_200,
        complete: true,
      },
      state: "complete",
    });
  });

  it("does not fabricate gross or net when one or more entries are missing", () => {
    const settlement = {
      ...settlements[0],
      settlement_lines: [
        ...settlements[0].settlement_lines,
        {
          commission_entry_id: "missing",
          amount_minor: 0,
          released_at: null,
          released_by: null,
          release_reason: null,
        },
      ],
    };

    expect(
      settlementTotalsResult(settlement, commissionEntriesById(entries)),
    ).toMatchObject({
      totals: {
        count: 2,
        matchedCount: 1,
        missingEntryCount: 1,
        grossMinor: null,
        commissionMinor: 800,
        netMinor: null,
        complete: false,
      },
      state: "missing_entries",
    });
  });

  it("tracks multiple missing entries and empty settlements", () => {
    const empty = settlementTotalsResult(
      { settlement_lines: [] },
      new Map(),
    );
    const missing = settlementTotalsResult(
      {
        settlement_lines: [
          { commission_entry_id: "a", amount_minor: 0, released_at: null, released_by: null, release_reason: null },
          { commission_entry_id: "b", amount_minor: 25, released_at: null, released_by: null, release_reason: null },
        ],
      },
      new Map(),
    );

    expect(empty).toMatchObject({
      totals: { count: 0, grossMinor: 0, commissionMinor: 0, netMinor: 0, complete: true },
      state: "complete",
    });
    expect(missing).toMatchObject({
      totals: { count: 2, matchedCount: 0, missingEntryCount: 2, grossMinor: null, netMinor: null, complete: false },
      state: "missing_entries",
    });
  });

  it("distinguishes failed reads and truncated pagination", () => {
    const settlement = settlements[0];
    const failed = settlementTotalsResult(settlement, new Map(), { failed: true });
    const truncated = settlementTotalsResult(
      settlement,
      commissionEntriesById(entries),
      { truncated: true },
    );

    expect(failed.state).toBe("read_failed");
    expect(failed.totals.complete).toBe(false);
    expect(failed.totals.grossMinor).toBeNull();
    expect(truncated.state).toBe("truncated");
    expect(truncated.totals.complete).toBe(false);
    expect(truncated.totals.netMinor).toBeNull();
  });

  it("preserves zero gross for a present commission entry", () => {
    const entry = { ...entries[0], id: "zero-gross", base_minor: 0 };
    const result = settlementTotalsResult(
      {
        settlement_lines: [
          {
            commission_entry_id: entry.id,
            amount_minor: 0,
            released_at: null,
            released_by: null,
            release_reason: null,
          },
        ],
      },
      commissionEntriesById([entry]),
    );

    expect(result).toMatchObject({
      state: "complete",
      totals: { grossMinor: 0, commissionMinor: 0, netMinor: 0, complete: true },
    });
    expect(settlementLineGrossMinor(entry)).toBe(0);
    expect(settlementLineGrossMinor(undefined)).toBeNull();
    expect(settlementLineGrossMinor(entry, "read_failed")).toBeNull();
    expect(settlementLineGrossMinor(entry, "truncated")).toBeNull();
  });

  it("keeps an empty failed read explicit and prioritizes failed over truncated", () => {
    const emptyFailed = settlementTotalsResult(
      { settlement_lines: [] },
      new Map(),
      { failed: true },
    );
    const both = settlementTotalsResult(
      settlements[0],
      commissionEntriesById(entries),
      { failed: true, truncated: true },
    );

    expect(emptyFailed).toMatchObject({
      state: "read_failed",
      totals: { grossMinor: null, netMinor: null, complete: false },
    });
    expect(both.state).toBe("read_failed");
  });

  it("renders unavailable gross for missing detail entries", () => {
    expect(settlementLineGrossMinor(undefined)).toBeNull();
    expect(settlementLineGrossMinor(entries[0])).toBe(entries[0].base_minor);
  });
});

describe("P1-05 payout proof helpers", () => {
  it("splits a settlement's net commission into earned and adjustments", () => {
    const byId = commissionEntriesById(entries);

    // The paid settlement's line equals its entry: no adjustments.
    expect(settlementEarnedCommissionMinor(settlements[1], byId)).toBe(1_125);
    expect(settlementAdjustmentsMinor(settlements[1], byId)).toBe(0);

    // A line reduced by a refund: earned 800, adjustment -400, net 400.
    const adjusted = {
      ...settlements[0],
      settlement_lines: [
        {
          commission_entry_id: "entry-open",
          amount_minor: 400,
          released_at: null,
          released_by: null,
          release_reason: null,
        },
      ],
    };
    expect(settlementEarnedCommissionMinor(adjusted, byId)).toBe(800);
    expect(settlementAdjustmentsMinor(adjusted, byId)).toBe(-400);
  });

  it("returns null instead of an incomplete adjustment", () => {
    const byId = commissionEntriesById(entries);
    const missing = {
      ...settlements[0],
      settlement_lines: [
        {
          commission_entry_id: "entry-missing",
          amount_minor: 100,
          released_at: null,
          released_by: null,
          release_reason: null,
        },
      ],
    };
    expect(settlementEarnedCommissionMinor(missing, byId)).toBeNull();
    expect(settlementAdjustmentsMinor(missing, byId)).toBeNull();
  });

  it("accepts only the three transfer methods", () => {
    expect(isTransferMethod("bank_transfer")).toBe(true);
    expect(isTransferMethod("cash")).toBe(true);
    expect(isTransferMethod("other")).toBe(true);
    expect(isTransferMethod("wire")).toBe(false);
    expect(isTransferMethod(null)).toBe(false);
    expect(isTransferMethod(undefined)).toBe(false);
  });
});
