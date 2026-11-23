import { startOfBusinessDayOffset } from "@/lib/business-time";
import { egpDecimal, toCsv } from "@/lib/csv";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  buildSettlementLineLookup,
  FINANCE_ENTRY_STATE_LABELS,
  getEntryFinanceState,
} from "@/lib/finance";
import { requireVendorRole } from "@/lib/vendor";

import type {
  CommissionEntryRecord,
  SettlementRecord,
} from "@/lib/finance";

const ENTRY_COLUMNS =
  "id, vendor_id, status, rate, base_minor, amount_minor, earned_at, reversed_at";

type FinanceRange = "7d" | "30d" | "90d" | "all";

const RANGE_DAYS: Record<FinanceRange, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

function isFinanceRange(value: string | null): value is FinanceRange {
  return value === "7d" || value === "30d" || value === "90d" || value === "all";
}

type LedgerExportRow = CommissionEntryRecord & {
  order_vendor:
    | { order: { public_reference: string | null } | null }
    | { order: { public_reference: string | null } | null }[]
    | null;
};

/**
 * GET /vendor/finance/export?vendor=<id>&range=<7d|30d|90d|all>
 *
 * Downloads the whole commission ledger for the selected range as CSV
 * (all rows, not just the visible page). Same range and state rules as
 * the finance page. A range with more rows than the read cap returns 422
 * so the export never silently drops rows — narrow the range instead.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const range: FinanceRange = isFinanceRange(url.searchParams.get("range"))
    ? (url.searchParams.get("range") as FinanceRange)
    : "all";
  const days = RANGE_DAYS[range];
  const rangeStart =
    days === null
      ? null
      : startOfBusinessDayOffset(new Date(), days - 1);

  const { supabase, access } = await requireVendorRole(
    url.searchParams.get("vendor"),
  );

  const [entriesResult, settlementsResult] = await Promise.all([
    fetchAllRows<LedgerExportRow>((from, to) => {
      let query = supabase
        .from("commission_entries")
        .select(
          `${ENTRY_COLUMNS}, order_vendor:order_vendors(order:orders(public_reference))`,
        )
        .eq("vendor_id", access.vendorId)
        .order("earned_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (rangeStart) {
        query = query.gte("earned_at", rangeStart.toISOString());
      }
      return query.returns<LedgerExportRow[]>();
    }),
    fetchAllRows<SettlementRecord>((from, to) =>
      supabase
        .from("settlements")
        .select(
          "id, vendor_id, status, total_minor, clawback_minor, note, created_at, paid_at, created_by, paid_by, voided_at, voided_by, void_reason, paid_amount_minor, transfer_method, transfer_reference, proof_note, settlement_lines(commission_entry_id, amount_minor, released_at, released_by, release_reason)",
        )
        .eq("vendor_id", access.vendorId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
        .returns<SettlementRecord[]>(),
    ),
  ]);

  if (entriesResult.failed || settlementsResult.failed) {
    return new Response("Finance data could not be read. Try again.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (entriesResult.truncated || settlementsResult.truncated) {
    return new Response(
      "Too many rows to export in one file. Narrow the date range and try again.",
      {
        status: 422,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }

  const lookup = buildSettlementLineLookup(settlementsResult.rows);
  const rows = entriesResult.rows.map((entry) => {
    const state = getEntryFinanceState(entry, lookup);
    const suborder = Array.isArray(entry.order_vendor)
      ? entry.order_vendor[0]
      : entry.order_vendor;
    const reference = suborder?.order?.public_reference ?? "";
    return [
      reference,
      new Date(entry.earned_at).toISOString().slice(0, 10),
      FINANCE_ENTRY_STATE_LABELS[state],
      egpDecimal(entry.base_minor),
      egpDecimal(entry.amount_minor),
      egpDecimal(entry.base_minor - entry.amount_minor),
      `${(entry.rate * 100).toFixed(2)}%`,
    ];
  });

  const csv = toCsv(
    ["Order", "Earned date", "State", "Gross (EGP)", "Commission (EGP)", "Net (EGP)", "Rate"],
    rows,
  );

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="gifto-finance-ledger-${range}.csv"`,
    },
  });
}
