import { egpDecimal, toCsv } from "@/lib/csv";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  buildSettlementLineLookup,
  FINANCE_ENTRY_STATE_LABELS,
  getEntryFinanceState,
} from "@/lib/finance";
import { requirePlatformAdmin } from "@/lib/auth";

import type {
  CommissionEntryRecord,
  FinanceEntryState,
  SettlementRecord,
} from "@/lib/finance";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FINANCE_FILTERS: FinanceEntryState[] = [
  "unsettled",
  "open",
  "paid",
  "reversed",
];

type CommissionQueryRow = CommissionEntryRecord & {
  order_vendor: {
    order_id: string;
    order: { public_reference: string | null } | null;
  } | null;
  vendor: { name: string; slug: string } | null;
};

type SettlementQueryRow = SettlementRecord & {
  settlement_lines: SettlementRecord["settlement_lines"];
};

/**
 * GET /admin/commissions/export?state=<filter>&shop=<vendor uuid>
 *
 * Downloads the filtered commission ledger as CSV (all matching rows, not
 * just the visible page). The filter rules are the same as
 * src/app/admin/commissions/page.tsx: when settlement data cannot be read
 * in full, payout states are unavailable and only "earned"/"reversed"
 * filtering applies. A ledger larger than the read cap returns 422 so the
 * export never silently drops rows.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const { supabase } = await requirePlatformAdmin();

  const shopFilter =
    url.searchParams.get("shop") &&
    UUID_PATTERN.test(url.searchParams.get("shop") ?? "")
      ? (url.searchParams.get("shop") as string)
      : "";
  const requestedState = url.searchParams.get("state") ?? "all";

  const [commissionsResult, settlementsResult] = await Promise.all([
    fetchAllRows<CommissionQueryRow>((from, to) =>
      supabase
        .from("commission_entries")
        .select(
          "id, vendor_id, status, rate, base_minor, amount_minor, earned_at, reversed_at, order_vendor:order_vendors(order_id, order:orders(public_reference)), vendor:vendors(name, slug)",
        )
        .order("earned_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
        .returns<CommissionQueryRow[]>(),
    ),
    fetchAllRows<SettlementQueryRow>((from, to) =>
      supabase
        .from("settlements")
        .select(
          "id, vendor_id, status, total_minor, note, created_at, paid_at, created_by, paid_by, voided_at, voided_by, void_reason, settlement_lines(commission_entry_id, amount_minor, released_at, released_by, release_reason)",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
        .returns<SettlementQueryRow[]>(),
    ),
  ]);

  if (commissionsResult.failed || settlementsResult.failed) {
    return new Response("Commission data could not be read. Try again.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (commissionsResult.truncated || settlementsResult.truncated) {
    return new Response(
      "Too many rows to export in one file. Filter by shop and try again.",
      {
        status: 422,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }

  const entries = commissionsResult.rows;
  const settlements = settlementsResult.rows;
  const financeStateAvailable =
    !settlementsResult.failed && !settlementsResult.truncated;
  const lookup = financeStateAvailable
    ? buildSettlementLineLookup(settlements)
    : new Map();

  const stateFor = (entry: CommissionQueryRow): FinanceEntryState => {
    if (!financeStateAvailable) {
      return entry.status === "reversed" ? "reversed" : "unsettled";
    }
    return getEntryFinanceState(entry, lookup);
  };

  const filterIsAllowed = (value: string): boolean =>
    value === "all" ||
    FINANCE_FILTERS.includes(value as FinanceEntryState) ||
    value === "earned";
  const filter = filterIsAllowed(requestedState) ? requestedState : "all";

  const filtered = entries.filter((entry) => {
    if (shopFilter && entry.vendor_id !== shopFilter) return false;
    if (filter === "all") return true;
    if (filter === "earned") return entry.status === "earned";
    if (filter === "reversed") return entry.status === "reversed";
    return stateFor(entry) === filter;
  });

  const rows = filtered.map((entry) => {
    const state = stateFor(entry);
    const orderRef = entry.order_vendor?.order?.public_reference
      ? entry.order_vendor.order.public_reference
      : entry.order_vendor
        ? `#${entry.order_vendor.order_id.slice(0, 8)}`
        : "Order removed";
    return [
      entry.vendor?.name ?? "Removed shop",
      orderRef,
      new Date(entry.earned_at).toISOString().slice(0, 10),
      financeStateAvailable
        ? FINANCE_ENTRY_STATE_LABELS[state]
        : entry.status === "reversed"
          ? "Reversed"
          : "Earned",
      egpDecimal(entry.base_minor),
      `${(entry.rate * 100).toFixed(2)}%`,
      egpDecimal(entry.amount_minor),
      egpDecimal(entry.base_minor - entry.amount_minor),
    ];
  });

  const csv = toCsv(
    [
      "Shop",
      "Order",
      "Earned date",
      "State",
      "Gross (EGP)",
      "Rate",
      "Commission (EGP)",
      "Net (EGP)",
    ],
    rows,
  );

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        'attachment; filename="gifto-commissions.csv"',
    },
  });
}
