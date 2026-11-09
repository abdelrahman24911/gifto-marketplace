import type {
  CommissionStatus,
  SettlementStatus,
} from "@/lib/supabase/database.types";

export type CommissionEntryRecord = {
  id: string;
  vendor_id: string;
  status: CommissionStatus;
  rate: number;
  base_minor: number;
  amount_minor: number;
  earned_at: string;
  reversed_at: string | null;
};

export type SettlementLineRecord = {
  commission_entry_id: string;
  amount_minor: number;
  released_at: string | null;
  released_by: string | null;
  release_reason: string | null;
};

export type SettlementRecord = {
  id: string;
  vendor_id: string;
  status: SettlementStatus;
  total_minor: number;
  note: string | null;
  created_at: string;
  paid_at: string | null;
  created_by: string | null;
  paid_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  settlement_lines: SettlementLineRecord[];
};

export type SettlementEffectiveStatus = "open" | "paid" | "voided";

type ActiveSettlementStatus = Exclude<SettlementEffectiveStatus, "voided">;

export type FinanceEntryState = "unsettled" | "open" | "paid" | "reversed";

export type FinanceTotals = {
  count: number;
  grossMinor: number;
  commissionMinor: number;
  netMinor: number;
};

/**
 * Gross and net can only be rebuilt from commission snapshots. When a line's
 * snapshot is missing, those figures are unavailable rather than replaced by
 * the settlement's commission amount. Commission itself is snapshotted on the
 * settlement line and stays exact.
 */
export type SettlementTotals = {
  count: number;
  matchedCount: number;
  missingEntryCount: number;
  grossMinor: number | null;
  commissionMinor: number;
  netMinor: number | null;
  complete: boolean;
};

export type SettlementTotalsReadState =
  | "complete"
  | "missing_entries"
  | "read_failed"
  | "truncated";

export type SettlementTotalsResult = {
  totals: SettlementTotals;
  state: SettlementTotalsReadState;
};

export type SettlementLineLookup = Map<
  string,
  { settlementId: string; status: ActiveSettlementStatus }
>;

export const FINANCE_ENTRY_STATE_LABELS: Record<FinanceEntryState, string> = {
  unsettled: "Unsettled",
  open: "In open batch",
  paid: "Paid",
  reversed: "Reversed",
};

export const FINANCE_ENTRY_STATE_STYLES: Record<FinanceEntryState, string> = {
  unsettled: "border-amber-200 bg-amber-50 text-amber-800",
  open: "border-sky-200 bg-sky-50 text-sky-800",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-800",
  reversed: "border-line-strong bg-paper text-ink-mute line-through",
};

export function settlementEffectiveStatus(
  settlement: Pick<SettlementRecord, "status" | "voided_at">,
): SettlementEffectiveStatus {
  if (settlement.status === "voided" || settlement.voided_at) return "voided";
  return settlement.status;
}

export function buildSettlementLineLookup(
  settlements: readonly SettlementRecord[],
): SettlementLineLookup {
  const lookup: SettlementLineLookup = new Map();

  for (const settlement of settlements) {
    const status = settlementEffectiveStatus(settlement);
    if (status === "voided") continue;

    for (const line of settlement.settlement_lines) {
      if (line.released_at) continue;

      lookup.set(line.commission_entry_id, {
        settlementId: settlement.id,
        status: status === "paid" ? "paid" : "open",
      });
    }
  }

  return lookup;
}

export function getEntryFinanceState(
  entry: Pick<CommissionEntryRecord, "id" | "status">,
  lookup: SettlementLineLookup,
): FinanceEntryState {
  if (entry.status === "reversed") return "reversed";

  const line = lookup.get(entry.id);
  return line ? line.status : "unsettled";
}

export function totalsForFinanceState(
  entries: readonly CommissionEntryRecord[],
  lookup: SettlementLineLookup,
  state: FinanceEntryState,
): FinanceTotals {
  return totalsForEntries(
    entries.filter((entry) => getEntryFinanceState(entry, lookup) === state),
  );
}

export function totalsForEntries(
  entries: readonly Pick<
    CommissionEntryRecord,
    "base_minor" | "amount_minor"
  >[],
): FinanceTotals {
  return entries.reduce<FinanceTotals>(
    (totals, entry) => ({
      count: totals.count + 1,
      grossMinor: totals.grossMinor + entry.base_minor,
      commissionMinor: totals.commissionMinor + entry.amount_minor,
      netMinor: totals.netMinor + entry.base_minor - entry.amount_minor,
    }),
    { count: 0, grossMinor: 0, commissionMinor: 0, netMinor: 0 },
  );
}

/**
 * A settlement's stored total is the platform commission collected in the
 * batch, not the vendor's payout. Gross and vendor net must be rebuilt from the
 * commission snapshots behind each line. A missing snapshot makes gross and
 * net unavailable; the line's commission amount is never substituted for gross.
 */
export function settlementTotals(
  settlement: Pick<SettlementRecord, "settlement_lines">,
  entriesById: ReadonlyMap<string, CommissionEntryRecord>,
): SettlementTotals {
  let grossMinor = 0;
  let commissionMinor = 0;
  let matchedCount = 0;
  let count = 0;

  for (const line of settlement.settlement_lines) {
    count += 1;
    commissionMinor += line.amount_minor;

    const entry = entriesById.get(line.commission_entry_id);
    if (!entry) continue;

    matchedCount += 1;
    grossMinor += entry.base_minor;
  }

  const missingEntryCount = count - matchedCount;
  const complete = missingEntryCount === 0;

  return {
    count,
    matchedCount,
    missingEntryCount,
    grossMinor: complete ? grossMinor : null,
    commissionMinor,
    netMinor: complete ? grossMinor - commissionMinor : null,
    complete,
  };
}

export function settlementLineGrossMinor(
  entry: Pick<CommissionEntryRecord, "base_minor"> | undefined,
  state: SettlementTotalsReadState = "complete",
): number | null {
  if (state === "read_failed" || state === "truncated") return null;
  return entry?.base_minor ?? null;
}

/**
 * Adds the reason the commission snapshots are incomplete. Failed reads and
 * truncated pagination are page-level conditions; a missing entry is a
 * per-settlement condition. Callers must show the state instead of presenting
 * the affected gross/net figures as exact.
 */
export function settlementTotalsResult(
  settlement: Pick<SettlementRecord, "settlement_lines">,
  entriesById: ReadonlyMap<string, CommissionEntryRecord>,
  read: { failed?: boolean; truncated?: boolean } = {},
): SettlementTotalsResult {
  const totals = settlementTotals(settlement, entriesById);

  if (read.failed) {
    return {
      totals: {
        ...totals,
        grossMinor: null,
        netMinor: null,
        complete: false,
      },
      state: "read_failed",
    };
  }

  if (read.truncated) {
    return {
      totals: {
        ...totals,
        grossMinor: null,
        netMinor: null,
        complete: false,
      },
      state: "truncated",
    };
  }
  if (!totals.complete) return { totals, state: "missing_entries" };
  return { totals, state: "complete" };
}

export function commissionEntriesById(
  entries: readonly CommissionEntryRecord[],
): Map<string, CommissionEntryRecord> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}
