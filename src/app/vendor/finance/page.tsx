import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { fetchAllRows } from "@/lib/fetch-all";
import { requireVendorRole } from "@/lib/vendor";
import {
  FINANCE_ENTRY_STATE_LABELS,
  FINANCE_ENTRY_STATE_STYLES,
  buildSettlementLineLookup,
  commissionEntriesById,
  getEntryFinanceState,
  settlementEffectiveStatus,
  settlementTotalsResult,
  totalsForEntries,
  totalsForFinanceState,
} from "@/lib/finance";
import { formatEgp } from "@/lib/money";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";

import type {
  CommissionEntryRecord,
  FinanceEntryState,
  SettlementRecord,
} from "@/lib/finance";

export const metadata = { title: "Finance — Gifto" };

const ENTRY_COLUMNS =
  "id, vendor_id, status, rate, base_minor, amount_minor, earned_at, reversed_at";

type FinanceOrderVendor = {
  id: string;
  order:
    | { public_reference: string | null }
    | { public_reference: string | null }[]
    | null;
  order_items: { product_name: string; quantity: number }[] | null;
};

type LedgerEntry = CommissionEntryRecord & {
  order_vendor: FinanceOrderVendor | FinanceOrderVendor[] | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatRate(rate: number) {
  const percent = rate * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

function orderReference(row: FinanceOrderVendor | undefined) {
  if (!row?.order) return "Order";
  const order = Array.isArray(row.order) ? row.order[0] : row.order;
  return order?.public_reference ?? "Order";
}

function financeHref(vendorId: string, page = 1) {
  const params = new URLSearchParams({ vendor: vendorId });
  if (page > 1) params.set("page", String(page));
  return `/vendor/finance?${params.toString()}`;
}

export default async function VendorFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string; page?: string }>;
}) {
  const { vendor, page: pageParam } = await searchParams;
  const { supabase, access } = await requireVendorRole(vendor);

  const requestedPage = parsePage(pageParam);
  const range = pageWindow(requestedPage);

  // Balances need every ledger row and settlement, so they are read in chunks
  // (PostgREST caps one response at 1,000 rows) and flagged if incomplete. The
  // visible ledger is a separate, paginated query that embeds the order and its
  // lines through the foreign key — no giant `.in()` URL and no second trip.
  const [entriesResult, settlementsResult, ledger] = await Promise.all([
    fetchAllRows<CommissionEntryRecord>((from, to) =>
      supabase
        .from("commission_entries")
        .select(ENTRY_COLUMNS)
        .eq("vendor_id", access.vendorId)
        .order("earned_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    fetchAllRows<SettlementRecord>(
      (from, to) =>
        supabase
          .from("settlements")
          .select(
            "id, vendor_id, status, total_minor, note, created_at, paid_at, created_by, paid_by, voided_at, voided_by, void_reason, settlement_lines(commission_entry_id, amount_minor, released_at, released_by, release_reason)",
          )
          .eq("vendor_id", access.vendorId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
          .returns<SettlementRecord[]>(),
    ),
    supabase
      .from("commission_entries")
      .select(
        `${ENTRY_COLUMNS}, order_vendor:order_vendors(id, order:orders(public_reference), order_items(product_name, quantity))`,
        { count: "exact" },
      )
      .eq("vendor_id", access.vendorId)
      .order("earned_at", { ascending: false })
      .order("id", { ascending: false })
      .range(range.from, range.to)
      .returns<LedgerEntry[]>(),
  ]);

  const entries = entriesResult.rows;
  const settlements = settlementsResult.rows;
  const ledgerRows = ledger.data ?? [];
  const ledgerTotal = ledger.count ?? entries.length;
  const currentPage = clampPage(requestedPage, ledgerTotal);

  // A stale link past the last page lands on the last real page.
  if (requestedPage > 1 && currentPage !== requestedPage) {
    redirect(financeHref(access.vendorId, currentPage));
  }

  const lookup = buildSettlementLineLookup(settlements);
  const entriesById = commissionEntriesById(entries);

  const settlementByEntry = new Map<string, SettlementRecord>();
  for (const settlement of settlements) {
    if (settlementEffectiveStatus(settlement) === "voided") continue;
    for (const line of settlement.settlement_lines) {
      if (!line.released_at) {
        settlementByEntry.set(line.commission_entry_id, settlement);
      }
    }
  }

  const unsettled = totalsForFinanceState(entries, lookup, "unsettled");
  const inOpenBatches = totalsForFinanceState(entries, lookup, "open");
  const paid = totalsForFinanceState(entries, lookup, "paid");
  const reversed = totalsForFinanceState(entries, lookup, "reversed");
  const earnedLifetime = totalsForEntries(
    entries.filter((entry) => entry.status === "earned"),
  );

  const loadError =
    entriesResult.failed || settlementsResult.failed || ledger.error;
  const totalsIncomplete =
    entriesResult.truncated || settlementsResult.truncated;

  const cards: {
    label: string;
    state: FinanceEntryState;
    totals: ReturnType<typeof totalsForFinanceState>;
    className: string;
    emphasis: string;
  }[] = [
    {
      label: "Available to settle",
      state: "unsettled",
      totals: unsettled,
      className: "border-amber-200 bg-amber-50",
      emphasis: "text-amber-950",
    },
    {
      label: "In open settlement",
      state: "open",
      totals: inOpenBatches,
      className: "border-sky-200 bg-sky-50",
      emphasis: "text-sky-950",
    },
    {
      label: "Paid commission",
      state: "paid",
      totals: paid,
      className: "border-emerald-200 bg-emerald-50",
      emphasis: "text-emerald-950",
    },
    {
      label: "Reversed",
      state: "reversed",
      totals: reversed,
      className: "border-line bg-paper-soft",
      emphasis: "text-ink",
    },
  ];

  return (
    <div className="w-full">
      <div>
        <h1 className="font-display text-2xl text-ink">Finance</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Commission on delivered suborders for {access.vendorName}. Gifto
          records its fee here; shop payouts are handled directly outside this
          dashboard.
        </p>
      </div>

      {loadError ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Finance data could not be loaded. Refresh the page to try again.
        </p>
      ) : null}

      {totalsIncomplete ? (
        <p
          role="status"
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          This shop has more ledger history than can be summed on this page, so
          the balances below are incomplete. Contact Gifto support for an exact
          statement.
        </p>
      ) : null}

      <section className="mt-6">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.state}
              className={`rounded-xl border px-4 py-3 ${card.className}`}
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-mute">
                {card.label}
              </dt>
              <dd className={`mt-1 text-xl font-semibold ${card.emphasis}`}>
                {formatEgp(card.totals.commissionMinor)}
              </dd>
              <p className="mt-1 text-xs text-ink-mute">
                {card.totals.count}{" "}
                {card.totals.count === 1 ? "suborder" : "suborders"} ·{" "}
                {formatEgp(card.totals.netMinor)} shop net
              </p>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-mute">
          Earned lifetime: {formatEgp(earnedLifetime.commissionMinor)} commission
          on {formatEgp(earnedLifetime.grossMinor)} delivered gross. Reversed
          commission is excluded from current balances.
        </p>
      </section>

      {settlements.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-mute">
            Settlement history
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Voided batches stay visible with their original lines and total.
            Their commission is available to settle again.
          </p>
          <ul className="mt-3 flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper-soft">
            {settlements.map((settlement) => {
              const status = settlementEffectiveStatus(settlement);
              const totalsResult = settlementTotalsResult(settlement, entriesById, {
                failed: entriesResult.failed,
                truncated: entriesResult.truncated,
              });
              const totals = totalsResult.totals;
              return (
                <li key={settlement.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                        Batch opened {formatDate(settlement.created_at)}
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            status === "paid"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : status === "voided"
                                ? "border-red-200 bg-red-50 text-red-800"
                                : "border-sky-200 bg-sky-50 text-sky-800"
                          }`}
                        >
                          {status}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-ink-soft">
                        {totals.count}{" "}
                        {totals.count === 1 ? "suborder" : "suborders"} ·{" "}
                        {formatEgp(totals.commissionMinor)} commission ·{" "}
                        {totals.netMinor === null
                          ? "Shop net unavailable"
                          : `${formatEgp(totals.netMinor)} shop net`}
                      </p>
                      {!totals.complete ? (
                        <p className="mt-1 text-xs text-amber-700">
                          {totalsResult.state === "read_failed"
                            ? "Gross and net are unavailable because commission data could not be read."
                            : totalsResult.state === "truncated"
                              ? "Gross and net are unavailable because commission history was truncated."
                              : "Gross and net are unavailable because a commission entry is missing."}
                        </p>
                      ) : null}
                      {status === "paid" && settlement.paid_at ? (
                        <p className="mt-1 text-xs text-ink-mute">
                          Recorded paid {formatDate(settlement.paid_at)}
                        </p>
                      ) : null}
                      {status === "voided" ? (
                        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                          Voided{" "}
                          {settlement.voided_at
                            ? formatDate(settlement.voided_at)
                            : "without a recorded date"}
                          . Reason:{" "}
                          {settlement.void_reason ?? "not recorded"}. Original
                          total was {formatEgp(settlement.total_minor)}.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-mute">
          Commission ledger
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Commission is recorded when a suborder is delivered. The rate is the
          one stored when the customer placed the order.
        </p>

        {ledgerRows.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong bg-paper-soft px-4 py-10 text-center text-sm text-ink-soft">
            No commission has been earned yet. Delivered suborders appear here.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper-soft">
            {ledgerRows.map((entry) => {
              const state = getEntryFinanceState(entry, lookup);
              const settlement = settlementByEntry.get(entry.id);
              const suborder = Array.isArray(entry.order_vendor)
                ? entry.order_vendor[0]
                : (entry.order_vendor ?? undefined);
              const items = (suborder?.order_items ?? [])
                .map((item) => `${item.product_name} × ${item.quantity}`)
                .join(", ");

              return (
                <li key={entry.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                        {orderReference(suborder)}
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${FINANCE_ENTRY_STATE_STYLES[state]}`}
                        >
                          {FINANCE_ENTRY_STATE_LABELS[state]}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-ink-soft">
                        {items || "Line items unavailable"}
                      </p>
                      <p className="mt-1 text-xs text-ink-mute">
                        Delivered {formatDate(entry.earned_at)} · rate{" "}
                        {formatRate(entry.rate)}
                        {state === "paid" && settlement?.paid_at
                          ? ` · recorded paid ${formatDate(settlement.paid_at)}`
                          : ""}
                      </p>
                    </div>
                    <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-right text-sm">
                      <dt className="text-ink-mute">Gross</dt>
                      <dt className="text-ink-mute">Commission</dt>
                      <dt className="text-ink-mute">Net</dt>
                      <dd className="font-medium text-ink">
                        {formatEgp(entry.base_minor)}
                      </dd>
                      <dd className="font-medium text-ink">
                        {formatEgp(entry.amount_minor)}
                      </dd>
                      <dd className="font-medium text-ink">
                        {formatEgp(entry.base_minor - entry.amount_minor)}
                      </dd>
                    </dl>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination
          page={currentPage}
          total={ledgerTotal}
          pageSize={DEFAULT_PAGE_SIZE}
          label="Commission ledger pages"
          buildHref={(page) => financeHref(access.vendorId, page)}
        />
      </section>
    </div>
  );
}
