import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
import { Breadcrumb, EmptyState } from "@/components/ui/section";
import { requirePlatformAdmin } from "@/lib/auth";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { formatEgp } from "@/lib/money";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageWindow,
  parsePage,
} from "@/lib/pagination";
import {
  REFUND_CASE_STATUSES,
  REFUND_CASE_STATUS_LABELS,
  REFUND_CASE_STATUS_STYLES,
  REFUND_RETURN_PATH_LABELS,
  isRefundCaseStatus,
} from "@/lib/refunds";

import {
  AdminFilterPill,
  AdminNotice,
  AdminPageHeader,
  AdminStatStrip,
} from "../ui";

import { ResolveRefundForm } from "./resolve-refund-form";
import { RestockRefundForm } from "./restock-refund-form";
import { CorrectInspectionForm } from "./correct-inspection-form";

import type { OrderStatus, RefundCaseStatus } from "@/lib/supabase/database.types";
import type { RefundReturnPath } from "@/lib/refunds";

export const metadata = { title: "Refunds - Admin - Gifto" };

type RefundQueueRow = {
  id: string;
  order_id: string;
  order_vendor_id: string;
  vendor_id: string;
  source: "customer" | "guest" | "admin";
  status: RefundCaseStatus;
  reason: string;
  requested_amount_minor: number | null;
  refund_amount_minor: number | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  return_path: RefundReturnPath | null;
  received_at: string | null;
  receipt_note: string | null;
  inspection_condition: "good" | "wrong_item" | "damaged" | null;
  return_courier_paid_by: "customer" | "vendor" | null;
  inspection_condition_previous:
    | "good"
    | "wrong_item"
    | "damaged"
    | null;
  inspection_corrected_by: string | null;
  inspection_corrected_at: string | null;
  acknowledged_at: string | null;
  restocked_at: string | null;
  escalation_count: number;
  escalated_at: string | null;
  escalation_note: string | null;
  first_resolved_at: string | null;
  order: {
    public_reference: string | null;
    recipient_name: string | null;
    contact_phone: string | null;
  } | null;
  order_vendor: {
    status: OrderStatus;
    subtotal_minor: number;
    vendor: { name: string; slug: string } | null;
  } | null;
};

type RefundFilter = RefundCaseStatus | "all";

function refundsHref(filter: RefundFilter, page = 1) {
  const params = new URLSearchParams();
  if (filter !== "open") params.set("status", filter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/refunds?${query}` : "/admin/refunds";
}

function countValue(result: { count: number | null; error: unknown }) {
  return result.error ? "-" : (result.count ?? 0);
}

function orderReference(row: RefundQueueRow) {
  return row.order?.public_reference ?? `#${row.order_id.slice(0, 8)}`;
}

export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status: statusParam, page: pageParam } = await searchParams;
  const { supabase } = await requirePlatformAdmin();

  const filter: RefundFilter =
    statusParam === "all"
      ? "all"
      : isRefundCaseStatus(statusParam)
        ? statusParam
        : "open";
  const requestedPage = parsePage(pageParam);
  const range = pageWindow(requestedPage);

  let listQuery = supabase
    .from("refund_cases")
    .select(
      "id, order_id, order_vendor_id, vendor_id, source, status, reason, requested_amount_minor, refund_amount_minor, resolution_note, created_at, resolved_at, resolved_by, return_path, received_at, receipt_note, inspection_condition, return_courier_paid_by, inspection_condition_previous, inspection_corrected_by, inspection_corrected_at, acknowledged_at, restocked_at, escalation_count, escalated_at, escalation_note, first_resolved_at, order:orders(public_reference, recipient_name, contact_phone), order_vendor:order_vendors(status, subtotal_minor, vendor:vendors(name, slug))",
      { count: "exact" },
    );

  if (filter !== "all") {
    listQuery = listQuery.eq("status", filter);
  }

  const [listResult, allCountResult, ...statusCountResults] =
    await Promise.all([
      listQuery
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(range.from, range.to),
      supabase
        .from("refund_cases")
        .select("id", { count: "exact", head: true }),
      ...REFUND_CASE_STATUSES.map((status) =>
        supabase
          .from("refund_cases")
          .select("id", { count: "exact", head: true })
          .eq("status", status),
      ),
    ]);

  const total = listResult.count ?? 0;
  const currentPage = clampPage(requestedPage, total);

  if (requestedPage > 1 && currentPage !== requestedPage) {
    redirect(refundsHref(filter, currentPage));
  }

  const cases = (listResult.data ?? []) as unknown as RefundQueueRow[];
  const counts = new Map(
    REFUND_CASE_STATUSES.map((status, index) => [
      status,
      statusCountResults[index]?.error
        ? null
        : (statusCountResults[index]?.count ?? 0),
    ]),
  );
  const openCount = counts.get("open");
  const approvedCount = counts.get("approved");
  const rejectedCount = counts.get("rejected");
  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  // N-01 (D-08): per-case paid-clawback preview. For each open case, find
  // the suborder's earned commission entry and any unreleased line in a
  // PAID settlement; the remaining paid amount caps the clawback an
  // approval would record. Approved cases also show any clawback already
  // recorded for them.
  type PaidEntryRow = {
    id: string;
    order_vendor_id: string;
    rate: number;
    status: string;
  };
  type PaidLineRow = {
    commission_entry_id: string;
    amount_minor: number;
    settlement: { status: string } | { status: string }[] | null;
  };
  type CaseClawbackRow = {
    refund_case_id: string;
    amount_minor: number;
    status: string;
  };

  const openSuborderIds = cases
    .filter((refundCase) => refundCase.status === "open")
    .map((refundCase) => refundCase.order_vendor_id);
  const { data: paidEntryData } = openSuborderIds.length
    ? await supabase
        .from("commission_entries")
        .select("id, order_vendor_id, rate, status")
        .in("order_vendor_id", openSuborderIds)
    : { data: [] };
  const paidEntries = (paidEntryData ?? []) as unknown as PaidEntryRow[];
  const paidEntryIds = paidEntries.map((entry) => entry.id);
  const { data: paidLineData } = paidEntryIds.length
    ? await supabase
        .from("settlement_lines")
        .select("commission_entry_id, amount_minor, settlement:settlements(status)")
        .is("released_at", null)
        .in("commission_entry_id", paidEntryIds)
    : { data: [] };
  const paidLines = (paidLineData ?? []) as unknown as PaidLineRow[];
  const { data: priorClawbackData } = paidEntryIds.length
    ? await supabase
        .from("commission_clawbacks")
        .select("commission_entry_id, amount_minor")
        .in("commission_entry_id", paidEntryIds)
    : { data: [] };
  const priorClawbacks = new Map<string, number>();
  for (const row of (priorClawbackData ?? []) as unknown as {
    commission_entry_id: string;
    amount_minor: number;
  }[]) {
    priorClawbacks.set(
      row.commission_entry_id,
      (priorClawbacks.get(row.commission_entry_id) ?? 0) + row.amount_minor,
    );
  }

  const paidClawbackPreviewBySuborder = new Map<
    string,
    { rate: number; remainingPaidMinor: number }
  >();
  for (const entry of paidEntries) {
    if (entry.status !== "earned") continue;
    const paidLine = paidLines.find((line) => {
      if (line.commission_entry_id !== entry.id) return false;
      const settlement = Array.isArray(line.settlement)
        ? line.settlement[0]
        : line.settlement;
      return settlement?.status === "paid";
    });
    if (!paidLine) continue;
    // Prior clawbacks are negative; the remaining paid amount is what a
    // new approval can still claw back.
    const remainingPaidMinor =
      paidLine.amount_minor +
      (priorClawbacks.get(entry.id) ?? 0);
    if (remainingPaidMinor > 0) {
      paidClawbackPreviewBySuborder.set(entry.order_vendor_id, {
        rate: entry.rate,
        remainingPaidMinor,
      });
    }
  }

  const caseIds = cases.map((refundCase) => refundCase.id);
  const { data: caseClawbackData } = caseIds.length
    ? await supabase
        .from("commission_clawbacks")
        .select("refund_case_id, amount_minor, status")
        .in("refund_case_id", caseIds)
    : { data: [] };
  const clawbackByCase = new Map(
    ((caseClawbackData ?? []) as unknown as CaseClawbackRow[]).map((row) => [
      row.refund_case_id,
      row,
    ]),
  );

  // N-02: pending adjustments recorded for approvals made before
  // delivery, so the approved-case line can say the reduction is still
  // to come instead of claiming the commission was already adjusted.
  type CasePendingRow = {
    refund_case_id: string;
    amount_minor: number;
  };
  const { data: casePendingData } = caseIds.length
    ? await supabase
        .from("pending_commission_adjustments")
        .select("refund_case_id, amount_minor")
        .in("refund_case_id", caseIds)
        .eq("status", "pending")
    : { data: [] };
  const pendingByCase = new Map(
    ((casePendingData ?? []) as unknown as CasePendingRow[]).map((row) => [
      row.refund_case_id,
      row,
    ]),
  );

  // N-03: who cancelled a case and when. A guest cancellation has no
  // resolver profile (resolved_by stays null by design), so it reads as
  // "the guest". The same lookup also resolves who corrected an
  // inspection (inspection_corrected_by), so the corrector is a name
  // here, not a bare UUID.
  type ResolverRow = {
    id: string;
    full_name: string | null;
    email: string;
  };
  const resolverIds = Array.from(
    new Set(
      cases
        .flatMap((refundCase) => [
          refundCase.status === "cancelled"
            ? refundCase.resolved_by
            : null,
          refundCase.inspection_corrected_by,
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: resolverData } = resolverIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", resolverIds)
    : { data: [] };
  const resolvers = new Map(
    ((resolverData ?? []) as unknown as ResolverRow[]).map((row) => [
      row.id,
      row,
    ]),
  );

  return (
    <div className="w-full">
      <Breadcrumb
        items={[
          { href: "/admin", label: "Administration" },
          { label: "Refunds" },
        ]}
      />

      <div className="mt-4">
        <AdminPageHeader
          eyebrow="Aftercare"
          title="Refunds"
          description="Review customer and guest refund requests, approve an amount, and adjust the shop's earned commission before settlement."
          actions={
            <Link
              href="/admin/settlements"
              className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
            >
              Open settlements
            </Link>
          }
        />
      </div>

      <div className="mt-6">
        <AdminStatStrip
          items={[
            {
              label: "Open cases",
              value: openCount ?? "-",
              hint: "Waiting for a decision",
              emphasis: openCount ? "warning" : "positive",
            },
            {
              label: "Approved",
              value: approvedCount ?? "-",
              hint: "Commission adjusted",
              emphasis: "positive",
            },
            {
              label: "Rejected",
              value: rejectedCount ?? "-",
              hint: "Closed with a note",
            },
            {
              label: "All cases",
              value: countValue(allCountResult),
              hint: "Every refund request",
              emphasis: "accent",
            },
          ]}
        />
      </div>

      <section className="mt-8">
        <div className="flex flex-col gap-4 border-b border-line pb-5">
          <div className="flex flex-wrap gap-2">
            <AdminFilterPill
              href={refundsHref("all")}
              active={filter === "all"}
            >
              All
              <span className="ml-1.5 text-xs opacity-65">
                {countValue(allCountResult)}
              </span>
            </AdminFilterPill>
            {REFUND_CASE_STATUSES.map((status) => (
              <AdminFilterPill
                key={status}
                href={refundsHref(status)}
                active={filter === status}
              >
                {REFUND_CASE_STATUS_LABELS[status]}
                <span className="ml-1.5 text-xs opacity-65">
                  {counts.get(status) ?? "-"}
                </span>
              </AdminFilterPill>
            ))}
          </div>
          <p className="text-xs text-ink-mute">
            Approving a refund reduces the shop&apos;s earned commission. If
            that commission is already in an active settlement, void the
            settlement first. If it is already paid, approving records a
            clawback against the shop&apos;s next settlement (D-08) instead.
          </p>
        </div>

        {listResult.error ? (
          <div className="mt-6">
            <AdminNotice tone="danger" role="alert">
              Refund cases could not be loaded. Refresh the page to try again.
            </AdminNotice>
          </div>
        ) : cases.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={
                filter === "open"
                  ? "No refunds need a decision"
                  : filter === "all"
                    ? "No refund requests yet"
                    : "No refunds match this filter"
              }
            >
              {filter === "open"
                ? "New customer and guest requests will appear here."
                : "Choose another status to see more refund cases."}
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs text-ink-mute">
                {total.toLocaleString("en-US")}{" "}
                {total === 1 ? "case" : "cases"}
              </p>
              <p className="text-xs text-ink-mute">
                Newest first · page {currentPage} of {pageCount}
              </p>
            </div>

            <ul className="mt-3 flex flex-col gap-4">
              {cases.map((refundCase) => {
                const vendor = refundCase.order_vendor?.vendor;
                const subtotal = refundCase.order_vendor?.subtotal_minor ?? 0;
                const suggested =
                  refundCase.requested_amount_minor ?? subtotal;
                const createdAt = new Date(
                  refundCase.created_at,
                ).toLocaleString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: BUSINESS_TIME_ZONE,
                });

                return (
                  <li
                    key={refundCase.id}
                    className={
                      refundCase.status === "open"
                        ? "rounded-2xl border border-warning/35 bg-warning-soft/40 p-5"
                        : "rounded-2xl border border-line bg-paper-soft p-5"
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${REFUND_CASE_STATUS_STYLES[refundCase.status]}`}
                          >
                            {REFUND_CASE_STATUS_LABELS[refundCase.status]}
                          </span>
                          <Link
                            href={`/admin/orders?q=${encodeURIComponent(orderReference(refundCase))}`}
                            className="font-medium text-ink hover:text-berry-deep hover:underline"
                          >
                            {orderReference(refundCase)}
                          </Link>
                          <span className="text-xs text-ink-mute">
                            {refundCase.source} request · {createdAt}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-ink-soft">
                          {vendor ? (
                            <Link
                              href={`/admin/shops?q=${encodeURIComponent(vendor.name)}`}
                              className="font-medium text-berry hover:underline"
                            >
                              {vendor.name}
                            </Link>
                          ) : (
                            "Unknown shop"
                          )}
                          {refundCase.order?.recipient_name
                            ? ` · ${refundCase.order.recipient_name}`
                            : null}
                          {refundCase.order?.contact_phone
                            ? ` · ${refundCase.order.contact_phone}`
                            : null}
                        </p>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-xs">
                        <dt className="text-ink-mute">Requested</dt>
                        <dd className="tabular-nums text-ink">
                          {refundCase.requested_amount_minor === null
                            ? "Not set"
                            : formatEgp(refundCase.requested_amount_minor)}
                        </dd>
                        <dt className="text-ink-mute">Shop subtotal</dt>
                        <dd className="tabular-nums text-ink">
                          {formatEgp(subtotal)}
                        </dd>
                      </dl>
                    </div>

                    <p className="mt-4 whitespace-pre-line border-t border-line pt-4 text-sm leading-relaxed text-ink-soft">
                      {refundCase.reason}
                    </p>

                    {refundCase.status === "approved" &&
                    refundCase.refund_amount_minor !== null ? (
                      <p className="mt-3 rounded-xl border border-success/25 bg-success-soft px-3 py-2 text-sm text-ink">
                        Approved {formatEgp(refundCase.refund_amount_minor)}.
                        {clawbackByCase.has(refundCase.id)
                          ? ` The commission was already paid out, so a clawback of ${formatEgp(Math.abs(clawbackByCase.get(refundCase.id)!.amount_minor))} was recorded against the shop's next settlement.`
                          : pendingByCase.has(refundCase.id)
                            ? ` The commission will be reduced by ${formatEgp(Math.abs(pendingByCase.get(refundCase.id)!.amount_minor))} when the suborder is delivered.`
                            : " Commission has been adjusted."}
                      </p>
                    ) : null}
                    {refundCase.status === "approved" &&
                    refundCase.return_path ? (
                      <p className="mt-2 text-xs text-ink-mute">
                        {REFUND_RETURN_PATH_LABELS[refundCase.return_path]}
                        {refundCase.received_at
                          ? " · shop confirmed receipt"
                          : " · waiting for the shop to confirm receipt"}
                        {refundCase.inspection_condition
                          ? ` · inspection: ${refundCase.inspection_condition === "good" ? "good condition" : refundCase.inspection_condition === "wrong_item" ? "wrong item" : "damaged"}`
                          : null}
                        {refundCase.return_courier_paid_by
                          ? ` · return courier paid by ${refundCase.return_courier_paid_by === "vendor" ? "the shop (wrong/damaged)" : "the customer"}`
                          : null}
                        {refundCase.inspection_condition_previous
                          ? ` · inspection corrected from ${refundCase.inspection_condition_previous === "good" ? "good condition" : refundCase.inspection_condition_previous === "wrong_item" ? "wrong item" : "damaged"}`
                          : null}
                        {refundCase.inspection_condition_previous &&
                        refundCase.inspection_corrected_by
                          ? ` · corrected by ${resolvers.get(refundCase.inspection_corrected_by)?.full_name || resolvers.get(refundCase.inspection_corrected_by)?.email || "Gifto"}`
                          : null}
                        {refundCase.inspection_condition_previous &&
                        refundCase.inspection_corrected_at
                          ? ` on ${new Date(refundCase.inspection_corrected_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: BUSINESS_TIME_ZONE })}`
                          : null}
                        {refundCase.receipt_note
                          ? ` · “${refundCase.receipt_note}”`
                          : null}
                        {refundCase.restocked_at
                          ? " · restocked after inspection"
                          : null}
                        {refundCase.acknowledged_at
                          ? " · shop acknowledged"
                          : null}
                      </p>
                    ) : null}
                    {refundCase.status === "open" &&
                    refundCase.escalation_count > 0 ? (
                      <p className="mt-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink">
                        Escalated by the customer
                        {refundCase.escalation_note
                          ? `: “${refundCase.escalation_note}”`
                          : ""}
                        . The first decision is on record; this second
                        decision is final.
                      </p>
                    ) : null}
                    {refundCase.status === "cancelled" &&
                    refundCase.resolved_at ? (
                      <p className="mt-2 text-xs text-ink-mute">
                        Cancelled by{" "}
                        {refundCase.resolved_by
                          ? (resolvers.get(refundCase.resolved_by)?.full_name ||
                            resolvers.get(refundCase.resolved_by)?.email ||
                            "the customer")
                          : "the guest"}{" "}
                        on{" "}
                        {new Date(refundCase.resolved_at).toLocaleString(
                          "en-GB",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: BUSINESS_TIME_ZONE,
                          },
                        )}
                        . No commission, stock, or settlement effect.
                      </p>
                    ) : null}
                    {refundCase.resolution_note ? (
                      <p className="mt-2 text-xs text-ink-mute">
                        Note: {refundCase.resolution_note}
                      </p>
                    ) : null}

                    {refundCase.status === "approved" &&
                    refundCase.return_path === "physical_return" &&
                    refundCase.received_at &&
                    !refundCase.restocked_at &&
                    refundCase.inspection_condition !== "damaged" &&
                    refundCase.inspection_condition !== "wrong_item" ? (
                      <RestockRefundForm caseId={refundCase.id} />
                    ) : null}
                    {refundCase.status === "approved" &&
                    refundCase.return_path === "physical_return" &&
                    refundCase.received_at &&
                    !refundCase.restocked_at &&
                    refundCase.inspection_condition === "damaged" ? (
                      <p className="mt-3 text-sm text-ink-mute">
                        Damaged return — never restocked (D-09). The item
                        stays out of stock.
                      </p>
                    ) : null}
                    {refundCase.status === "approved" &&
                    refundCase.return_path === "physical_return" &&
                    refundCase.received_at &&
                    !refundCase.restocked_at &&
                    refundCase.inspection_condition === "wrong_item" ? (
                      <p className="mt-3 text-sm text-ink-mute">
                        Wrong item — it is not the product the customer
                        ordered, so it cannot be restocked against this
                        order. Restock the actual item manually if it is
                        saleable.
                      </p>
                    ) : null}
                    {refundCase.status === "approved" &&
                    refundCase.return_path === "physical_return" &&
                    refundCase.received_at &&
                    !refundCase.restocked_at &&
                    refundCase.inspection_condition ? (
                      <CorrectInspectionForm
                        caseId={refundCase.id}
                        currentCondition={refundCase.inspection_condition}
                      />
                    ) : null}

                    {refundCase.status === "open" ? (
                      <ResolveRefundForm
                        caseId={refundCase.id}
                        suggestedMinor={suggested}
                        paidClawbackPreview={paidClawbackPreviewBySuborder.get(
                          refundCase.order_vendor_id,
                        )}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <Pagination
              page={currentPage}
              total={total}
              pageSize={DEFAULT_PAGE_SIZE}
              buildHref={(page) => refundsHref(filter, page)}
              label="Refund case pages"
            />
          </>
        )}
      </section>
    </div>
  );
}
