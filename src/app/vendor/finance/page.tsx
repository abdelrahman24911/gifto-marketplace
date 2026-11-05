import { requireVendorRole } from "@/lib/vendor";
import {
  FINANCE_ENTRY_STATE_LABELS,
  FINANCE_ENTRY_STATE_STYLES,
  buildSettlementLineLookup,
  commissionEntriesById,
  getEntryFinanceState,
  settlementEffectiveStatus,
  settlementTotals,
  totalsForEntries,
  totalsForFinanceState,
} from "@/lib/finance";
import { formatEgp } from "@/lib/money";

import type {
  CommissionEntryRecord,
  FinanceEntryState,
  SettlementRecord,
} from "@/lib/finance";

export const metadata = { title: "Finance — Gifto" };

type FinanceCommissionEntry = CommissionEntryRecord & {
  order_vendor_id: string;
};

type FinanceOrderVendor = {
  id: string;
  order:
    | { public_reference: string | null }
    | { public_reference: string | null }[]
    | null;
  order_items: { product_name: string; quantity: number }[] | null;
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

export default async function VendorFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { vendor } = await searchParams;
  const { supabase, access } = await requireVendorRole(vendor);

  const [
    { data: entryData, error: entriesError },
    { data: settlementData, error: settlementsError },
  ] = await Promise.all([
    supabase
      .from("commission_entries")
      .select(
        "id, order_vendor_id, vendor_id, status, rate, base_minor, amount_minor, earned_at, reversed_at",
      )
      .eq("vendor_id", access.vendorId)
      .order("earned_at", { ascending: false }),
    supabase
      .from("settlements")
      .select(
        "id, vendor_id, status, total_minor, note, created_at, paid_at, created_by, paid_by, voided_at, voided_by, void_reason, settlement_lines(commission_entry_id, amount_minor, released_at, released_by, release_reason)",
      )
      .eq("vendor_id", access.vendorId)
      .order("created_at", { ascending: false }),
  ]);

  const entries = (entryData ?? []) as FinanceCommissionEntry[];
  const settlements = (settlementData ?? []) as unknown as SettlementRecord[];
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

  const orderVendorIds = Array.from(
    new Set(entries.map((entry) => entry.order_vendor_id)),
  );

  const { data: orderVendorData } = orderVendorIds.length
    ? await supabase
        .from("order_vendors")
        .select(
          "id, order:orders(public_reference), order_items(product_name, quantity)",
        )
        .in("id", orderVendorIds)
    : { data: [] };

  const orderVendors = new Map(
    ((orderVendorData ?? []) as unknown as FinanceOrderVendor[]).map((row) => [
      row.id,
      row,
    ]),
  );

  const loadError = entriesError ?? settlementsError;

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
              const totals = settlementTotals(settlement, entriesById);
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
                        {formatEgp(totals.netMinor)} shop net
                      </p>
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

        {entries.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong bg-paper-soft px-4 py-10 text-center text-sm text-ink-soft">
            No commission has been earned yet. Delivered suborders appear here.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper-soft">
            {entries.map((entry) => {
              const state = getEntryFinanceState(entry, lookup);
              const settlement = settlementByEntry.get(entry.id);
              const suborder = orderVendors.get(entry.order_vendor_id);
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
      </section>
    </div>
  );
}
