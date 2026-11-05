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
 * commission snapshots behind each line.
 */
export function settlementTotals(
  settlement: Pick<SettlementRecord, "settlement_lines">,
  entriesById: ReadonlyMap<string, CommissionEntryRecord>,
): FinanceTotals {
  let grossMinor = 0;
  let commissionMinor = 0;
  let count = 0;

  for (const line of settlement.settlement_lines) {
    const entry = entriesById.get(line.commission_entry_id);
    grossMinor += entry?.base_minor ?? line.amount_minor;
    commissionMinor += line.amount_minor;
    count += 1;
  }

  return {
    count,
    grossMinor,
    commissionMinor,
    netMinor: grossMinor - commissionMinor,
  };
}

export function commissionEntriesById(
  entries: readonly CommissionEntryRecord[],
): Map<string, CommissionEntryRecord> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}
