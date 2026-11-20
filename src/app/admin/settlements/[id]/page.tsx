import { notFound } from "next/navigation";

import { Breadcrumb } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import {
  commissionEntriesById,
  settlementEffectiveStatus,
  settlementLineGrossMinor,
  settlementTotalsResult,
} from "@/lib/finance";
import { formatEgp } from "@/lib/money";

import {
  AdminActionLink,
  AdminNotice,
  AdminPageHeader,
  AdminStatStrip,
} from "../../ui";
import { SettlementPaidButton } from "./settlement-paid-button";
import { SettlementVoidButton } from "./settlement-void-button";

import type {
  CommissionEntryRecord,
  SettlementRecord,
} from "@/lib/finance";

export const metadata = { title: "Settlement — Admin — Gifto" };

type SettlementDetailRow = {
  id: string;
  vendor_id: string;
  status: SettlementRecord["status"];
  total_minor: number;
  note: string | null;
  created_at: string;
  paid_at: string | null;
  created_by: string | null;
  paid_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  vendor: { name: string; slug: string } | null;
  settlement_lines: {
    commission_entry_id: string;
    amount_minor: number;
    released_at: string | null;
    released_by: string | null;
    release_reason: string | null;
  }[];
};

type DetailCommissionEntry = CommissionEntryRecord & {
  order_vendor_id: string;
};

type OrderVendorRow = {
  id: string;
  delivered_at: string | null;
  order: { public_reference: string | null } | { public_reference: string | null }[] | null;
  order_items: { product_name: string; quantity: number }[] | null;
};

type ActorRow = {
  id: string;
  full_name: string | null;
  email: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  });
}

function formatRate(rate: number) {
  const percent = rate * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
}

function actorLabel(id: string | null, actors: ReadonlyMap<string, ActorRow>) {
  if (!id) return "Not recorded";
  const actor = actors.get(id);
  return actor?.full_name || actor?.email || "Removed administrator";
}

function orderReference(row: OrderVendorRow | undefined) {
  if (!row?.order) return "Order reference unavailable";
  const order = Array.isArray(row.order) ? row.order[0] : row.order;
  return order?.public_reference ?? "Order reference unavailable";
}

export default async function SettlementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requirePlatformAdmin();
  const now = new Date();

  const { data: settlementData, error: settlementError } = await supabase
    .from("settlements")
    .select(
      "id, vendor_id, status, total_minor, note, created_at, paid_at, created_by, paid_by, voided_at, voided_by, void_reason, vendor:vendors(name, slug), settlement_lines(commission_entry_id, amount_minor, released_at, released_by, release_reason)",
    )
    .eq("id", id)
    .maybeSingle();

  if (settlementError || !settlementData) notFound();

  const row = settlementData as unknown as SettlementDetailRow;
  const settlement: SettlementRecord = {
    id: row.id,
    vendor_id: row.vendor_id,
    status: row.status,
    total_minor: row.total_minor,
    note: row.note,
    created_at: row.created_at,
    paid_at: row.paid_at,
    created_by: row.created_by,
    paid_by: row.paid_by,
    voided_at: row.voided_at,
    voided_by: row.voided_by,
    void_reason: row.void_reason,
    settlement_lines: row.settlement_lines ?? [],
  };

  const entryIds = settlement.settlement_lines.map(
    (line) => line.commission_entry_id,
  );

  const { data: entryData, error: entryError } = entryIds.length
    ? await supabase
        .from("commission_entries")
        .select(
          "id, order_vendor_id, vendor_id, status, rate, base_minor, amount_minor, earned_at, reversed_at",
        )
        .in("id", entryIds)
    : { data: [], error: null };

  const detailEntries = (entryData ?? []) as DetailCommissionEntry[];
  const detailEntriesById = new Map(
    detailEntries.map((entry) => [entry.id, entry]),
  );
  const entries: CommissionEntryRecord[] = detailEntries;
  const entriesById = commissionEntriesById(entries);
  const totalsResult = settlementTotalsResult(settlement, entriesById, {
    failed: Boolean(entryError),
  });
  const totals = totalsResult.totals;

  const orderVendorIds = Array.from(
    new Set(detailEntries.map((entry) => entry.order_vendor_id)),
  );

  const { data: orderVendorData } = orderVendorIds.length
    ? await supabase
        .from("order_vendors")
        .select("id, delivered_at, order:orders(public_reference), order_items(product_name, quantity)")
        .in("id", orderVendorIds)
    : { data: [] };

  const orderVendors = new Map(
    ((orderVendorData ?? []) as unknown as OrderVendorRow[]).map((suborder) => [
      suborder.id,
      suborder,
    ]),
  );

  // P0-07 (returns-before-payout rule): the payout check for this batch.
  // The 7-day D-09 return window runs from each suborder's delivered_at; the
  // batch is safe to pay only when every window has closed AND no refund
  // case is open on any of its lines. A paid settlement can never be voided
  // and a refund on its lines can never be approved afterwards, so this
  // panel warns instead of blocking — the runbook holds the rule.
  const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const deliveredAts = [...orderVendors.values()]
    .map((suborder) => suborder.delivered_at)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime());
  const earliestDeliveredAt =
    deliveredAts.length > 0 ? new Date(Math.min(...deliveredAts)) : null;
  const latestDeliveredAt =
    deliveredAts.length > 0 ? new Date(Math.max(...deliveredAts)) : null;
  const returnWindowClosesAt =
    latestDeliveredAt === null
      ? null
      : new Date(latestDeliveredAt.getTime() + RETURN_WINDOW_MS);
  const returnWindowOpen =
    returnWindowClosesAt !== null &&
    returnWindowClosesAt.getTime() > now.getTime();
  // A line with no delivered date cannot prove its window has closed; the
  // runbook treats that as open.
  const missingDeliveredAt =
    orderVendorIds.length > 0 && deliveredAts.length < orderVendorIds.length;

  const { data: openRefundCaseData } = orderVendorIds.length
    ? await supabase
        .from("refund_cases")
        .select("id")
        .eq("status", "open")
        .in("order_vendor_id", orderVendorIds)
    : { data: [] };
  const openRefundCaseCount = (openRefundCaseData ?? []).length;
  const payoutAtRisk =
    returnWindowOpen || missingDeliveredAt || openRefundCaseCount > 0;

  const actorIds = Array.from(
    new Set(
      [
        row.created_by,
        row.paid_by,
        row.voided_by,
        ...settlement.settlement_lines.map((line) => line.released_by),
      ].filter((actorId): actorId is string => Boolean(actorId)),
    ),
  );

  const { data: actorData } = actorIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds)
    : { data: [] };

  const actors = new Map(
    ((actorData ?? []) as ActorRow[]).map((actor) => [actor.id, actor]),
  );

  const lines = [...settlement.settlement_lines].sort((a, b) => {
    const entryA = entriesById.get(a.commission_entry_id);
    const entryB = entriesById.get(b.commission_entry_id);
    return (entryA?.earned_at ?? "").localeCompare(entryB?.earned_at ?? "");
  });

  const effectiveStatus = settlementEffectiveStatus(settlement);

  const statusBadge = (
    <span
      className={`rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide ${
        effectiveStatus === "paid"
          ? "border-success/25 bg-success-soft text-ink"
          : effectiveStatus === "voided"
            ? "border-danger/25 bg-danger-soft text-ink"
            : "border-berry/25 bg-berry-soft text-ink"
      }`}
    >
      {effectiveStatus}
    </span>
  );

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { href: "/admin/settlements", label: "Settlements" },
          { label: row.vendor?.name ?? "Settlement" },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Settlement detail"
          title={row.vendor?.name ?? "Unknown shop"}
          description={`Opened ${formatDate(row.created_at)} · ${totals.count} delivered ${
            totals.count === 1 ? "suborder" : "suborders"
          }`}
          actions={
            <>
              {statusBadge}
              <AdminActionLink href="/admin/settlements">
                All settlements
              </AdminActionLink>
            </>
          }
        />
      </div>

      {!totals.complete ? (
        <div className="mt-4">
          <AdminNotice tone="warning" role="alert">
            {totalsResult.state === "read_failed"
              ? "Gross and shop net are unavailable because commission data could not be read."
              : totalsResult.state === "truncated"
                ? "Gross and shop net are unavailable because commission history was truncated."
                : "Gross and shop net are unavailable because one or more commission entries are missing."}
          </AdminNotice>
        </div>
      ) : null}

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "Delivered gross",
              value:
                totals.grossMinor === null
                  ? "Unavailable"
                  : formatEgp(totals.grossMinor),
              hint: "Shop subtotal on delivered lines",
            },
            {
              label: "Commission",
              value: formatEgp(totals.commissionMinor),
              hint: "Gifto's share",
              emphasis: "accent",
            },
            {
              label: "Shop net",
              value:
                totals.netMinor === null
                  ? "Unavailable"
                  : formatEgp(totals.netMinor),
              hint: "Amount due to the shop",
              emphasis: "positive",
            },
            {
              label:
                effectiveStatus === "voided"
                  ? "Original total"
                  : "Recorded total",
              value: formatEgp(row.total_minor),
              hint:
                effectiveStatus === "voided"
                  ? "Released for re-settlement"
                  : "Commission only",
            },
          ]}
        />
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-paper-soft p-4 text-sm">
          <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
            Opened by
          </h2>
          <p className="mt-1.5 font-medium text-ink">
            {actorLabel(row.created_by, actors)}
          </p>
          <p className="text-xs text-ink-mute">{formatDate(row.created_at)}</p>
        </div>
        <div className="rounded-xl border border-line bg-paper-soft p-4 text-sm">
          <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
            Paid by
          </h2>
          {effectiveStatus === "paid" ? (
            <>
              <p className="mt-1.5 font-medium text-ink">
                {actorLabel(row.paid_by, actors)}
              </p>
              <p className="text-xs text-ink-mute">
                {row.paid_at
                  ? formatDate(row.paid_at)
                  : "Payment date not recorded"}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-ink-soft">
              {effectiveStatus === "voided"
                ? "This batch was voided before payment."
                : "Not paid yet. Confirm the external payout before recording it."}
            </p>
          )}
        </div>
        {effectiveStatus === "voided" ? (
          <div className="rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm">
            <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
              Voided by
            </h2>
            <p className="mt-1.5 font-medium text-ink">
              {actorLabel(row.voided_by, actors)}
            </p>
            <p className="text-xs text-ink-mute">
              {row.voided_at
                ? formatDate(row.voided_at)
                : "Void date not recorded"}
            </p>
            <p className="mt-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink-mute">
              Reason
            </p>
            <p className="mt-1 whitespace-pre-wrap text-ink-soft">
              {row.void_reason ?? "No reason was recorded for this legacy void."}
            </p>
          </div>
        ) : null}
      </section>

      {row.note ? (
        <p className="mt-4 rounded-xl border border-line bg-paper-soft px-4 py-3 text-sm text-ink-soft">
          {row.note}
        </p>
      ) : null}

      {effectiveStatus === "open" ? (
        <section className="mt-6 rounded-2xl border border-success/25 bg-success-soft p-5">
          <h2 className="font-display text-2xl text-ink">Record payout</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            Transfer or hand over{" "}
            <strong className="text-ink">
              {totals.netMinor === null
                ? "an unavailable amount"
                : formatEgp(totals.netMinor)}
            </strong>{" "}
            to the shop. Marking this paid records the external payout; it does
            not move money.
          </p>
          {totals.complete ? (
            <div className="mt-3">
              {payoutAtRisk ? (
                <AdminNotice tone="warning" role="alert">
                  <strong>Do not mark this paid yet.</strong>{" "}
                  {openRefundCaseCount > 0
                    ? `There ${openRefundCaseCount === 1 ? "is" : "are"} ${openRefundCaseCount} open refund case${openRefundCaseCount === 1 ? "" : "s"} on this batch — resolve ${openRefundCaseCount === 1 ? "it" : "them"} first (see /admin/refunds). `
                    : null}
                  {returnWindowOpen && returnWindowClosesAt !== null
                    ? `The 7-day return window is still open — it closes ${formatDate(returnWindowClosesAt.toISOString())} (latest delivery ${latestDeliveredAt !== null ? formatDate(latestDeliveredAt.toISOString()) : "unknown"}). Wait, or exclude the affected entries and settle them in a later batch. `
                    : null}
                  {missingDeliveredAt
                    ? "At least one line has no delivered date recorded, so its return window cannot be proven closed. Confirm the delivery date by hand before paying. "
                    : null}
                  A paid settlement can never be voided and a refund on its
                  lines can never be approved afterwards. See
                  docs/RUNBOOK_RETURNS_AND_SETTLEMENTS.md.
                </AdminNotice>
              ) : (
                <AdminNotice tone="success" role="status">
                  Return-window check: earliest delivery{" "}
                  {earliestDeliveredAt !== null
                    ? formatDate(earliestDeliveredAt.toISOString())
                    : "unknown"}
                  , window closed; no open refund cases on this batch.
                </AdminNotice>
              )}
              <div className="mt-3">
                <SettlementPaidButton settlementId={row.id} />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-warning">
              Payout recording is disabled until the complete commission
              statement is available.
            </p>
          )}
          <div className="mt-6 border-t border-success/20 pt-4">
            <h3 className="font-display text-xl text-ink">Opened by mistake?</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Voiding keeps this batch and its lines for audit, releases the
              commission so it can be settled again, and cannot be undone. A
              reason is required.
            </p>
            <div className="mt-3">
              <SettlementVoidButton settlementId={row.id} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="font-display text-2xl text-ink">
          Included suborders ({lines.length})
        </h2>
        <p className="mt-1 text-xs text-ink-mute">
          Each line is a delivered shop suborder and the commission snapshot
          taken when that suborder was delivered.
        </p>

        {lines.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong bg-paper-soft px-4 py-8 text-center text-sm text-ink-soft">
            {effectiveStatus === "voided"
              ? "This legacy void has no preserved settlement lines."
              : "This settlement has no lines."}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper-soft">
            {lines.map((line) => {
              const entry = detailEntriesById.get(line.commission_entry_id);
              const lineGrossMinor = settlementLineGrossMinor(
                entry,
                totalsResult.state,
              );
              const suborder = entry
                ? orderVendors.get(entry.order_vendor_id)
                : undefined;
              const items = (suborder?.order_items ?? [])
                .map((item) => `${item.product_name} × ${item.quantity}`)
                .join(", ");

              return (
                <li key={line.commission_entry_id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {orderReference(suborder)}
                      </p>
                      <p className="mt-1 text-sm text-ink-soft">
                        {items || "Line items unavailable"}
                      </p>
                      <p className="mt-1 text-xs text-ink-mute">
                        Delivered{" "}
                        {entry
                          ? formatDate(entry.earned_at)
                          : "date unavailable"}
                        {entry ? ` · rate ${formatRate(entry.rate)}` : ""}
                      </p>
                      {line.released_at ? (
                        <p className="mt-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-xs text-ink-soft">
                          Released {formatDate(line.released_at)} by{" "}
                          {actorLabel(line.released_by, actors)}. Reason:{" "}
                          {line.release_reason ?? "not recorded"}.
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-ink-mute">
                        Gross{" "}
                        <span className="font-medium tabular-nums text-ink">
                          {lineGrossMinor === null
                            ? "Unavailable"
                            : formatEgp(lineGrossMinor)}
                        </span>
                      </p>
                      <p className="text-ink-mute">
                        Commission{" "}
                        <span className="font-medium tabular-nums text-ink">
                          {formatEgp(line.amount_minor)}
                        </span>
                      </p>
                    </div>
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
