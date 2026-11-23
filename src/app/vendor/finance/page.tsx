import Link from "next/link";
import { redirect } from "next/navigation";

import { FilterPill } from "@/components/dashboard/filter-pill";
import { Pagination } from "@/components/pagination";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import {
  BUSINESS_TIME_ZONE,
  startOfBusinessDayOffset,
} from "@/lib/business-time";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  FINANCE_ENTRY_STATE_LABELS,
  FINANCE_ENTRY_STATE_STYLES,
  buildSettlementLineLookup,
  commissionEntriesById,
  getEntryFinanceState,
  settlementAdjustmentsMinor,
  settlementEarnedCommissionMinor,
  settlementEffectiveStatus,
  settlementTotalsResult,
  totalsForEntries,
  totalsForFinanceState,
  TRANSFER_METHOD_LABELS,
} from "@/lib/finance";
import { formatEgp } from "@/lib/money";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";
import { requireVendorRole } from "@/lib/vendor";

import {
  VendorEmpty,
  VendorFilterPill,
  VendorNotice,
  VendorPageHeader,
  VendorSectionHeading,
} from "../ui";

import type {
  CommissionClawbackRecord,
  CommissionEntryRecord,
  FinanceEntryState,
  SettlementRecord,
} from "@/lib/finance";

export const metadata = { title: "Finance — Gifto" };

type VendorClawbackRow = CommissionClawbackRecord & {
  clawback_applications: { settlement_id: string; amount_minor: number }[];
};

type VendorClawbackCaseRow = {
  id: string;
  order_vendor:
    | { order: { public_reference: string | null } | { public_reference: string | null }[] | null }
    | null;
};

const ENTRY_COLUMNS =
  "id, vendor_id, status, rate, base_minor, amount_minor, earned_at, reversed_at";

type FinanceView = "earnings" | "settlements";
type FinanceRange = "7d" | "30d" | "90d" | "all";

const FINANCE_RANGES: ReadonlyArray<{
  value: FinanceRange;
  label: string;
  days: number | null;
}> = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "all", label: "All time", days: null },
];

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
  return new Date(value).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
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

function financeHref(
  vendorId: string,
  view: FinanceView,
  range: FinanceRange,
  page = 1,
) {
  const params = new URLSearchParams({ vendor: vendorId });
  if (view !== "earnings") params.set("view", view);
  if (range !== "all") params.set("range", range);
  if (page > 1) params.set("page", String(page));
  return `/vendor/finance?${params.toString()}`;
}

function isFinanceRange(value: string | undefined): value is FinanceRange {
  return value === "7d" || value === "30d" || value === "90d" || value === "all";
}

export default async function VendorFinancePage({
  searchParams,
}: {
  searchParams: Promise<{
    vendor?: string;
    page?: string;
    view?: string;
    range?: string;
  }>;
}) {
  const {
    vendor,
    page: pageParam,
    view: viewParam,
    range: rangeParam,
  } = await searchParams;
  const { supabase, access } = await requireVendorRole(vendor);

  const view: FinanceView = viewParam === "settlements" ? "settlements" : "earnings";
  const range: FinanceRange = isFinanceRange(rangeParam) ? rangeParam : "all";
  const rangeOption = FINANCE_RANGES.find((option) => option.value === range)!;
  const rangeStart =
    rangeOption.days === null
      ? null
      : startOfBusinessDayOffset(new Date(), rangeOption.days - 1);

  const requestedPage = parsePage(pageParam);
  const rangeValues = pageWindow(requestedPage);

  let ledgerQuery = supabase
    .from("commission_entries")
    .select(
      `${ENTRY_COLUMNS}, order_vendor:order_vendors(id, order:orders(public_reference), order_items(product_name, quantity))`,
      { count: "exact" },
    )
    .eq("vendor_id", access.vendorId);

  if (rangeStart) {
    ledgerQuery = ledgerQuery.gte("earned_at", rangeStart.toISOString());
  }

  const [entriesResult, settlementsResult, ledger, clawbacksResult] =
    await Promise.all([
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
            "id, vendor_id, status, total_minor, clawback_minor, note, created_at, paid_at, created_by, paid_by, voided_at, voided_by, void_reason, paid_amount_minor, transfer_method, transfer_reference, proof_note, settlement_lines(commission_entry_id, amount_minor, released_at, released_by, release_reason)",
          )
          .eq("vendor_id", access.vendorId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
          .returns<SettlementRecord[]>(),
    ),
    ledgerQuery
      .order("earned_at", { ascending: false })
      .order("id", { ascending: false })
      .range(rangeValues.from, rangeValues.to)
      .returns<LedgerEntry[]>(),
    // N-01 (D-08): paid-return clawbacks against this shop.
    supabase
      .from("commission_clawbacks")
      .select(
        "id, commission_entry_id, refund_case_id, vendor_id, currency, amount_minor, reason, status, direct_repayment_reference, created_by, created_at, consumed_at, clawback_applications(settlement_id, amount_minor)",
      )
      .eq("vendor_id", access.vendorId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
  ]);

  const entries = entriesResult.rows;
  const settlements = settlementsResult.rows;
  const ledgerRows = ledger.data ?? [];
  const ledgerTotal = ledger.count ?? 0;
  const currentPage = clampPage(requestedPage, ledgerTotal);
  const clawbacks = (
    (clawbacksResult.data ?? []) as unknown as VendorClawbackRow[]
  ).map((clawback) => ({
    ...clawback,
    clawback_applications: clawback.clawback_applications ?? [],
  }));
  const clawbackCaseIds = Array.from(
    new Set(clawbacks.map((clawback) => clawback.refund_case_id)),
  );
  const { data: clawbackCaseData } = clawbackCaseIds.length
    ? await supabase
        .from("refund_cases")
        .select("id, order_vendor:order_vendors(order:orders(public_reference))")
        .in("id", clawbackCaseIds)
    : { data: [] };
  const clawbackCases = new Map(
    ((clawbackCaseData ?? []) as unknown as VendorClawbackCaseRow[]).map(
      (refundCase) => [refundCase.id, refundCase],
    ),
  );
  const outstandingClawbackMinor = clawbacks
    .filter((clawback) => clawback.status === "outstanding")
    .reduce(
      (sum, clawback) =>
        sum +
        Math.abs(clawback.amount_minor) -
        clawback.clawback_applications.reduce(
          (applied, application) => applied + application.amount_minor,
          0,
        ),
      0,
    );

  if (requestedPage > 1 && currentPage !== requestedPage) {
    redirect(financeHref(access.vendorId, view, range, currentPage));
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

  const totalsIncomplete =
    entriesResult.truncated || settlementsResult.truncated;

  const cards: {
    label: string;
    state: FinanceEntryState;
    totals: ReturnType<typeof totalsForFinanceState>;
    className: string;
  }[] = [
    {
      label: "Available to settle",
      state: "unsettled",
      totals: unsettled,
      className: "border-warning/30 bg-warning-soft",
    },
    {
      label: "In open settlement",
      state: "open",
      totals: inOpenBatches,
      className: "border-sky-200 bg-sky-50",
    },
    {
      label: "Paid commission",
      state: "paid",
      totals: paid,
      className: "border-success/25 bg-success-soft",
    },
    {
      label: "Reversed",
      state: "reversed",
      totals: reversed,
      className: "border-line bg-paper",
    },
  ];

  return (
    <div className="w-full">
      <VendorPageHeader
        eyebrow="Money"
        title="Finance"
        description={
          <>
            Commission on delivered shop lines for {access.vendorName}.
            Under D-08 the shop remits Gifto&apos;s commission every Sunday
            for the prior week&apos;s delivered orders; each batch below
            reconciles to the piaster, including the transfer reference
            Gifto recorded.
          </>
        }
        actions={
          <>
            <a
              href={`/vendor/finance/export?vendor=${access.vendorId}&range=${range}`}
              download
              className="rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
            >
              Download ledger (CSV)
            </a>
            <Link
              href={`/vendor/analytics?vendor=${access.vendorId}`}
              className="rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
            >
              Revenue analytics
            </Link>
          </>
        }
      />

      {totalsIncomplete ? (
        <div className="mt-4">
          <VendorNotice tone="warning" role="status">
            This shop has more ledger history than can be summed on this page,
            so the balances below are incomplete. Contact Gifto support for an
            exact statement.
          </VendorNotice>
        </div>
      ) : null}

      <section className="mt-6">
        {entriesResult.failed ? (
          <div>
            <VendorNotice tone="danger" role="alert">
              Commission balances could not be loaded.
            </VendorNotice>
            <RefreshButton />
          </div>
        ) : (
          <>
            <p className="text-xs text-ink-mute">
              Current balances — all time, not limited to the date range
              below. The ledger underneath follows the selected range.
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {cards.map((card) => (
                <div
                  key={card.state}
                  className={`rounded-2xl border px-4 py-4 ${card.className}`}
                >
                  <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
                    {card.label}
                  </dt>
                  <dd className="mt-1 font-display text-2xl leading-tight tabular-nums text-ink">
                    {formatEgp(card.totals.commissionMinor)}
                  </dd>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                    {card.totals.count}{" "}
                    {card.totals.count === 1 ? "suborder" : "suborders"} ·{" "}
                    {formatEgp(card.totals.netMinor)} shop net
                  </p>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink-mute">
              Earned lifetime: {formatEgp(earnedLifetime.commissionMinor)}{" "}
              commission on {formatEgp(earnedLifetime.grossMinor)} delivered
              gross. Reversed commission is excluded from current balances.
            </p>
          </>
        )}
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <nav aria-label="Finance views" className="flex gap-1">
          {(
            [
              { value: "earnings", label: "Earnings ledger" },
              { value: "settlements", label: "Settlements" },
            ] as const
          ).map((tab) => {
            const active = view === tab.value;
            return (
              // Same treatment as the filter pills (Batch 2): switching views
              // is a search-param-only navigation on this route, so a plain
              // Link left the old ledger on screen with no feedback and
              // users clicked again. FilterPill dims and spins until the
              // new view renders.
              <FilterPill
                key={tab.value}
                href={financeHref(access.vendorId, tab.value, range)}
                active={active}
                className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-berry text-berry-deep"
                    : "border-transparent text-ink-mute hover:text-ink"
                }`}
              >
                {tab.label}
              </FilterPill>
            );
          })}
        </nav>

        {view === "earnings" ? (
          <nav aria-label="Earnings date range" className="flex flex-wrap gap-2 pb-2">
            {FINANCE_RANGES.map((option) => (
              <VendorFilterPill
                key={option.value}
                href={financeHref(access.vendorId, view, option.value)}
                active={range === option.value}
              >
                {option.label}
              </VendorFilterPill>
            ))}
          </nav>
        ) : null}
      </div>

      {view === "settlements" ? (
        <section className="mt-6">
          <VendorSectionHeading
            title="Settlement history"
            description="All settlements, all time. Voided batches stay visible with their original lines and total. Their commission becomes available to settle again. Open a batch to reconcile it against the numbers Gifto recorded."
          />
          {settlementsResult.failed ? (
            <div className="mt-4">
              <VendorNotice tone="danger" role="alert">
                Settlement history could not be loaded.
              </VendorNotice>
              <RefreshButton />
            </div>
          ) : settlements.length === 0 ? (
            <div className="mt-4">
              <VendorEmpty title="No settlements yet">
                Gifto opens settlement batches from earned commission. They
                will appear here with their payment status.
              </VendorEmpty>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {settlements.map((settlement) => {
                const status = settlementEffectiveStatus(settlement);
                const totalsResult = settlementTotalsResult(
                  settlement,
                  entriesById,
                  {
                    failed: entriesResult.failed,
                    truncated: entriesResult.truncated,
                  },
                );
                const totals = totalsResult.totals;
                const earnedCommissionMinor =
                  settlementEarnedCommissionMinor(settlement, entriesById);
                const adjustmentsMinor = settlementAdjustmentsMinor(
                  settlement,
                  entriesById,
                );
                return (
                  <li
                    key={settlement.id}
                    className="rounded-2xl border border-line bg-paper-soft px-4 py-4 sm:px-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-display text-xl text-ink">
                          Batch opened {formatDate(settlement.created_at)}
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
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
                        {settlement.note ? (
                          <p className="mt-1 text-xs text-ink-mute">
                            {settlement.note}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                          Stored batch total
                        </p>
                        <p className="mt-1 font-display text-xl tabular-nums text-ink">
                          {formatEgp(settlement.total_minor)}
                        </p>
                      </div>
                    </div>

                    {status === "paid" && settlement.paid_at ? (
                      <p className="mt-2 text-xs text-ink-mute">
                        Recorded paid {formatDate(settlement.paid_at)}
                        {settlement.paid_amount_minor !== null
                          ? ` · ${formatEgp(settlement.paid_amount_minor)} received`
                          : ""}
                        {settlement.transfer_method
                          ? ` · ${TRANSFER_METHOD_LABELS[settlement.transfer_method]}`
                          : ""}
                        {settlement.transfer_reference
                          ? ` · reference ${settlement.transfer_reference}`
                          : ""}
                        {settlement.paid_amount_minor === 0 &&
                        !settlement.transfer_method
                          ? " · no transfer — fully offset by paid-return clawbacks"
                          : ""}
                      </p>
                    ) : null}
                    <details className="mt-3 rounded-xl border border-line bg-paper px-4 py-3">
                      <summary className="cursor-pointer text-sm font-medium text-ink">
                        Reconcile this batch
                      </summary>
                      <dl className="mt-3 space-y-1 text-sm">
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-mute">Delivered gross</dt>
                          <dd className="font-medium tabular-nums text-ink">
                            {totals.grossMinor === null
                              ? "Unavailable"
                              : formatEgp(totals.grossMinor)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-mute">Commission earned</dt>
                          <dd className="font-medium tabular-nums text-ink">
                            {earnedCommissionMinor === null
                              ? "Unavailable"
                              : formatEgp(earnedCommissionMinor)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-ink-mute">
                            Refund adjustments
                          </dt>
                          <dd className="font-medium tabular-nums text-ink">
                            {adjustmentsMinor === null
                              ? "Unavailable"
                              : formatEgp(adjustmentsMinor)}
                          </dd>
                        </div>
                        {settlement.clawback_minor > 0 ? (
                          <div className="flex justify-between gap-3">
                            <dt className="text-ink-mute">
                              Paid-return clawbacks
                            </dt>
                            <dd className="font-medium tabular-nums text-ink">
                              −{formatEgp(settlement.clawback_minor)}
                            </dd>
                          </div>
                        ) : null}
                        <div className="flex justify-between gap-3 border-t border-line pt-1">
                          <dt className="font-medium text-ink">
                            Net commission due
                          </dt>
                          <dd className="font-semibold tabular-nums text-ink">
                            {formatEgp(settlement.total_minor)}
                          </dd>
                        </div>
                        {status === "paid" ? (
                          <>
                            <div className="flex justify-between gap-3 border-t border-line pt-1">
                              <dt className="font-medium text-ink">
                                Amount Gifto received
                              </dt>
                              <dd className="font-semibold tabular-nums text-ink">
                                {settlement.paid_amount_minor === null
                                  ? "Not recorded"
                                  : formatEgp(settlement.paid_amount_minor)}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-ink-mute">
                                Transfer method
                              </dt>
                              <dd className="font-medium text-ink">
                                {settlement.transfer_method
                                  ? TRANSFER_METHOD_LABELS[
                                      settlement.transfer_method
                                    ]
                                  : "Not recorded"}
                              </dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-ink-mute">
                                Transfer reference
                              </dt>
                              <dd className="font-medium text-ink">
                                {settlement.transfer_reference ??
                                  "Not recorded"}
                              </dd>
                            </div>
                            {settlement.proof_note ? (
                              <div className="flex justify-between gap-3">
                                <dt className="text-ink-mute">Proof note</dt>
                                <dd className="font-medium text-ink">
                                  {settlement.proof_note}
                                </dd>
                              </div>
                            ) : null}
                          </>
                        ) : null}
                      </dl>
                      <p className="mt-2 text-xs text-ink-mute">
                        These are the same numbers Gifto recorded for this
                        batch, to the piaster. If a figure looks wrong,
                        contact Gifto support before the next Sunday
                        remittance.
                      </p>
                    </details>
                    {status === "voided" ? (
                      <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                        Voided{" "}
                        {settlement.voided_at
                          ? formatDate(settlement.voided_at)
                          : "without a recorded date"}
                        . Reason: {settlement.void_reason ?? "not recorded"}.
                        Original total was {formatEgp(settlement.total_minor)}.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {clawbacksResult.error ? (
            <section className="mt-8">
              <VendorNotice tone="warning" role="status">
                Paid-return clawbacks could not be loaded. The settlement
                list above is unaffected.
              </VendorNotice>
            </section>
          ) : clawbacks.length > 0 ? (
            <section className="mt-8">
              <VendorSectionHeading
                title="Paid-return clawbacks"
                description="Refunds approved after a batch was paid are carried into the next settlement instead of changing the paid batch. An outstanding clawback is taken from the next batch Gifto opens for this shop."
              />
              {outstandingClawbackMinor > 0 ? (
                <p className="mt-3 text-sm text-ink-soft">
                  Outstanding clawbacks:{" "}
                  <strong className="text-ink">
                    {formatEgp(outstandingClawbackMinor)}
                  </strong>{" "}
                  to be taken from the next settlement.
                </p>
              ) : null}
              <ul className="mt-3 flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper-soft">
                {clawbacks.map((clawback) => {
                  const refundCase = clawbackCases.get(clawback.refund_case_id);
                  const order = refundCase?.order_vendor?.order;
                  const orderReference = order
                    ? (Array.isArray(order) ? order[0] : order)
                        ?.public_reference ?? "Order reference unavailable"
                    : "Order reference unavailable";
                  const appliedMinor = clawback.clawback_applications.reduce(
                    (sum, application) => sum + application.amount_minor,
                    0,
                  );
                  return (
                    <li key={clawback.id} className="px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">
                            {orderReference}
                          </p>
                          <p className="mt-1 text-xs text-ink-mute">
                            {clawback.status === "outstanding"
                              ? `Outstanding · ${formatEgp(Math.abs(clawback.amount_minor) - appliedMinor)} still to be taken from the next settlement`
                              : clawback.status === "consumed"
                                ? "Consumed by a later settlement"
                                : `Repaid directly${clawback.direct_repayment_reference ? ` · reference ${clawback.direct_repayment_reference}` : ""}`}
                          </p>
                        </div>
                        <p className="font-medium tabular-nums text-ink">
                          −{formatEgp(Math.abs(clawback.amount_minor))}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </section>
      ) : (
        <section className="mt-6">
          <VendorSectionHeading
            title="Commission ledger"
            description={`Commission is recorded when a suborder is delivered. The rate is the one stored when the customer placed the order. Showing ${range === "all" ? "all time" : `the last ${rangeOption.label.toLowerCase()}`}.`}
          />

          {ledger.error ? (
            <div className="mt-4">
              <VendorNotice tone="danger" role="alert">
                The commission ledger could not be loaded.
              </VendorNotice>
              <RefreshButton />
            </div>
          ) : (
            <>
              {ledgerRows.length === 0 ? (
                <div className="mt-4">
                  <VendorEmpty
                title={
                  range === "all"
                    ? "No commission earned yet"
                    : "No commission in this period"
                }
                action={
                  range !== "all" ? (
                    <Link
                      href={financeHref(access.vendorId, view, "all")}
                      className="text-sm font-medium text-berry hover:text-berry-deep"
                    >
                      Show all time
                    </Link>
                  ) : null
                }
              >
                {range === "all"
                  ? "Delivered suborders appear here once commission is recorded."
                  : "Try a longer date range to see earlier delivered lines."}
                  </VendorEmpty>
                </div>
              ) : (
                <ul className="mt-4 flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper-soft">
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
                        <dd className="font-medium tabular-nums text-ink">
                          {formatEgp(entry.base_minor)}
                        </dd>
                        <dd className="font-medium tabular-nums text-ink">
                          {formatEgp(entry.amount_minor)}
                        </dd>
                        <dd className="font-medium tabular-nums text-ink">
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
                buildHref={(page) =>
                  financeHref(access.vendorId, view, range, page)
                }
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}
