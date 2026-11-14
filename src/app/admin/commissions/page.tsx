import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import {
  buildSettlementLineLookup,
  getEntryFinanceState,
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

import {
  AdminActionLink,
  AdminFilterPill,
  AdminNotice,
  AdminPageHeader,
  AdminStatStrip,
} from "../ui";

import type {
  CommissionEntryRecord,
  FinanceEntryState,
  SettlementRecord,
} from "@/lib/finance";

export const metadata = { title: "Commissions — Admin — Gifto" };

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

type VendorOption = {
  id: string;
  name: string;
};

type CommissionFilter =
  | "all"
  | FinanceEntryState
  | "earned"
  | "reversed";

const FINANCE_FILTERS: FinanceEntryState[] = [
  "unsettled",
  "open",
  "paid",
  "reversed",
];

const STATE_LABELS: Record<FinanceEntryState, string> = {
  unsettled: "Unsettled",
  open: "In open batch",
  paid: "Paid",
  reversed: "Reversed",
};

const STATE_STYLES: Record<FinanceEntryState, string> = {
  unsettled: "border-warning/30 bg-warning-soft text-ink",
  open: "border-berry/25 bg-berry-soft text-ink",
  paid: "border-success/25 bg-success-soft text-ink",
  reversed: "border-line-strong bg-paper text-ink-mute",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function commissionHref({
  filter,
  shop,
  page = 1,
}: {
  filter: string;
  shop: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("state", filter);
  if (shop) params.set("shop", shop);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/admin/commissions?${search}` : "/admin/commissions";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    shop?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const { supabase } = await requirePlatformAdmin();

  const requestedPage = parsePage(params.page);
  const shopFilter =
    params.shop && UUID_PATTERN.test(params.shop) ? params.shop : "";

  const [commissionsResult, settlementsResult, vendorsResult] =
    await Promise.all([
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
      fetchAllRows<VendorOption>((from, to) =>
        supabase
          .from("vendors")
          .select("id, name")
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
          .returns<VendorOption[]>(),
      ),
    ]);

  const entries = commissionsResult.rows;
  const settlements = settlementsResult.rows;
  const vendors = vendorsResult.rows;
  const financeStateAvailable =
    !settlementsResult.failed && !settlementsResult.truncated;
  const lookup = financeStateAvailable
    ? buildSettlementLineLookup(settlements)
    : new Map();

  const filterIsAllowed = (value: string): value is CommissionFilter =>
    value === "all" ||
    FINANCE_FILTERS.includes(value as FinanceEntryState) ||
    value === "earned";
  const requestedFilter: CommissionFilter = filterIsAllowed(
    params.state ?? "",
  )
    ? (params.state as CommissionFilter)
    : "all";
  const filter: CommissionFilter = financeStateAvailable
    ? requestedFilter === "earned"
      ? "all"
      : requestedFilter
    : requestedFilter !== "all" &&
        requestedFilter !== "earned" &&
        requestedFilter !== "reversed"
      ? "all"
      : requestedFilter;

  const stateFor = (entry: CommissionQueryRow): FinanceEntryState => {
    if (!financeStateAvailable) {
      return entry.status === "reversed" ? "reversed" : "unsettled";
    }
    return getEntryFinanceState(entry, lookup);
  };

  const matchesFilter = (entry: CommissionQueryRow) => {
    if (filter === "all") return true;
    if (filter === "earned") return entry.status === "earned";
    if (filter === "reversed") return entry.status === "reversed";
    return stateFor(entry) === filter;
  };

  const filtered = entries.filter((entry) => {
    if (shopFilter && entry.vendor_id !== shopFilter) return false;
    return matchesFilter(entry);
  });
  const total = filtered.length;
  const currentPage = clampPage(requestedPage, total);

  if (requestedPage > 1 && currentPage !== requestedPage) {
    redirect(commissionHref({ filter, shop: shopFilter, page: currentPage }));
  }

  const range = pageWindow(currentPage);
  const visible = filtered.slice(range.from, range.to + 1);
  const filtersActive = filter !== "all" || Boolean(shopFilter);
  const earned = totalsForEntries(
    entries.filter((entry) => entry.status === "earned"),
  );
  const reversed = totalsForEntries(
    entries.filter((entry) => entry.status === "reversed"),
  );
  const thirtyDaysAgo = new Date().getTime() - 30 * 86_400_000;
  const recent = totalsForEntries(
    entries.filter(
      (entry) =>
        entry.status === "earned" &&
        Date.parse(entry.earned_at) >= thirtyDaysAgo,
    ),
  );
  const unsettled = financeStateAvailable
    ? totalsForFinanceState(entries, lookup, "unsettled")
    : null;

  const shopEntries = shopFilter
    ? entries.filter((entry) => entry.vendor_id === shopFilter)
    : entries;
  const filterOptions: Array<{
    value: CommissionFilter;
    label: string;
    count: number;
  }> = financeStateAvailable
    ? [
        { value: "all", label: "All", count: shopEntries.length },
        ...FINANCE_FILTERS.map((state) => ({
          value: state,
          label: STATE_LABELS[state],
          count: shopEntries.filter(
            (entry) => getEntryFinanceState(entry, lookup) === state,
          ).length,
        })),
      ]
    : [
        { value: "all", label: "All", count: shopEntries.length },
        {
          value: "earned",
          label: "Earned",
          count: shopEntries.filter((entry) => entry.status === "earned")
            .length,
        },
        {
          value: "reversed",
          label: "Reversed",
          count: shopEntries.filter((entry) => entry.status === "reversed")
            .length,
        },
      ];

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Commissions" },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Revenue ledger"
          title="Commissions"
          description="Every commission is snapshotted when a suborder is delivered. Reversed entries are kept for the audit trail; settlement and payout state comes from the finance ledger."
          actions={
            <AdminActionLink href="/admin/settlements">
              Open settlements
            </AdminActionLink>
          }
        />
      </div>

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "Earned lifetime",
              value: commissionsResult.failed
                ? "—"
                : formatEgp(earned.commissionMinor),
              hint: `${earned.count} entries · ${formatEgp(earned.grossMinor)} gross`,
              emphasis: "positive",
            },
            {
              label: "Last 30 days",
              value: commissionsResult.failed ? "—" : formatEgp(recent.commissionMinor),
              hint: `${recent.count} entries earned`,
              emphasis: "accent",
            },
            {
              label: "Awaiting settlement",
              value:
                commissionsResult.failed || !financeStateAvailable
                  ? "—"
                  : unsettled
                    ? formatEgp(unsettled.commissionMinor)
                    : "—",
              hint:
                financeStateAvailable && unsettled
                  ? `${unsettled.count} entries not in a batch`
                  : "Settlement state unavailable",
              emphasis:
                financeStateAvailable && (unsettled?.count ?? 0) > 0
                  ? "warning"
                  : "default",
            },
            {
              label: "Reversed",
              value: commissionsResult.failed
                ? "—"
                : formatEgp(reversed.commissionMinor),
              hint: `${reversed.count} entries · audit trail`,
            },
          ]}
        />
      </div>

      {commissionsResult.failed || !financeStateAvailable ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="alert">
            {commissionsResult.failed
              ? "Commission entries could not be loaded. Refresh the page to try again."
              : "Settlement data could not be read in full, so payout state is unavailable for these entries. Commission amounts and dates remain accurate."}
          </AdminNotice>
        </div>
      ) : null}

      {commissionsResult.truncated ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="status">
            This commission ledger is larger than the current read. Totals and
            filters below are incomplete; open the relevant shop finance page
            for an exact statement.
          </AdminNotice>
        </div>
      ) : null}

      {vendorsResult.failed || vendorsResult.truncated ? (
        <div className="mt-4">
          <AdminNotice tone="info" role="status">
            The shop filter list is incomplete. Commission results are
            unaffected.
          </AdminNotice>
        </div>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-col gap-4 border-b border-line pb-5">
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <AdminFilterPill
                key={option.value}
                href={commissionHref({
                  filter: option.value,
                  shop: shopFilter,
                })}
                active={filter === option.value}
              >
                {option.label}
                <span className="ml-1.5 text-xs opacity-65">
                  {option.count}
                </span>
              </AdminFilterPill>
            ))}
          </div>

          <form
            method="get"
            action="/admin/commissions"
            className="flex flex-wrap items-end gap-2"
          >
            {filter !== "all" ? (
              <input type="hidden" name="state" value={filter} />
            ) : null}
            <label className="min-w-56 flex-1">
              <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                Shop
              </span>
              <select
                name="shop"
                defaultValue={shopFilter}
                className="w-full rounded-full border border-line-strong bg-paper-soft px-4 py-2 text-sm text-ink focus:border-berry focus:outline-none focus:ring-2 focus:ring-berry/15"
              >
                <option value="">All shops</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-wine-deep"
            >
              Apply
            </button>
            {filtersActive ? (
              <Link
                href="/admin/commissions"
                className="px-2 py-2 text-sm text-ink-mute hover:text-berry-deep"
              >
                Clear
              </Link>
            ) : null}
          </form>
        </div>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs text-ink-mute">
            {total.toLocaleString("en-US")}{" "}
            {total === 1 ? "commission entry" : "commission entries"}
            {filtersActive ? " match these filters" : ""}
          </p>
          <p className="text-xs text-ink-mute">
            Newest first · page {currentPage} of{" "}
            {Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE))}
          </p>
        </div>

        {commissionsResult.failed ? null : visible.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={
                filtersActive
                  ? "No commissions match"
                  : "No commissions recorded"
              }
            >
              {filtersActive
                ? "Clear or adjust the filters to see more of the ledger."
                : "A commission entry is created when a suborder is marked delivered."}
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-paper-soft">
            {visible.map((entry) => {
              const state = stateFor(entry);
              const orderRef = entry.order_vendor?.order?.public_reference
                ? entry.order_vendor.order.public_reference
                : entry.order_vendor
                  ? `#${entry.order_vendor.order_id.slice(0, 8)}`
                  : "Order removed";
              const net = entry.base_minor - entry.amount_minor;
              const badgeStyle = financeStateAvailable
                ? STATE_STYLES[state]
                : entry.status === "reversed"
                  ? STATE_STYLES.reversed
                  : STATE_STYLES.paid;

              return (
                <li
                  key={entry.id}
                  className="border-b border-line px-5 py-4 last:border-b-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-words text-base font-medium text-ink">
                          {entry.vendor?.name ?? "Removed shop"}
                        </p>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${badgeStyle}`}
                        >
                          {financeStateAvailable
                            ? STATE_LABELS[state]
                            : state === "reversed"
                              ? "Reversed"
                              : "Earned"}
                        </span>
                        {!financeStateAvailable && entry.status === "earned" ? (
                          <span className="text-[0.65rem] text-ink-mute">
                            payout state unavailable
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">
                        <Link
                          href="/admin/orders"
                          className="font-medium text-berry hover:underline"
                        >
                          {orderRef}
                        </Link>
                        <span>
                          Earned {formatDate(entry.earned_at)}
                        </span>
                        {entry.reversed_at ? (
                          <span>Reversed {formatDate(entry.reversed_at)}</span>
                        ) : null}
                        <span className="font-mono text-ink-mute">
                          {entry.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>

                    <div className="grid w-full grid-cols-2 gap-4 text-left sm:w-auto sm:grid-cols-3 sm:text-right">
                      <div>
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                          Gross
                        </p>
                        <p className="mt-0.5 text-sm tabular-nums text-ink-soft">
                          {formatEgp(entry.base_minor)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                          Rate
                        </p>
                        <p className="mt-0.5 text-sm tabular-nums text-ink-soft">
                          {(entry.rate * 100).toFixed(2)}%
                        </p>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                          Commission
                        </p>
                        <p className="mt-0.5 font-display text-xl tabular-nums text-ink">
                          {formatEgp(entry.amount_minor)}
                        </p>
                        <p className="mt-0.5 text-[0.65rem] text-ink-mute">
                          {formatEgp(net)} shop net
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Pagination
          page={currentPage}
          total={total}
          pageSize={DEFAULT_PAGE_SIZE}
          label="Commission pages"
          buildHref={(page) =>
            commissionHref({ filter, shop: shopFilter, page })
          }
        />
      </section>
    </div>
  );
}
