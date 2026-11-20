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
  return_path: RefundReturnPath | null;
  received_at: string | null;
  receipt_note: string | null;
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
      "id, order_id, order_vendor_id, vendor_id, source, status, reason, requested_amount_minor, refund_amount_minor, resolution_note, created_at, resolved_at, return_path, received_at, receipt_note, acknowledged_at, restocked_at, escalation_count, escalated_at, escalation_note, first_resolved_at, order:orders(public_reference, recipient_name, contact_phone), order_vendor:order_vendors(status, subtotal_minor, vendor:vendors(name, slug))",
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
            settlement first.
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
                        Commission has been adjusted.
                      </p>
                    ) : null}
                    {refundCase.status === "approved" &&
                    refundCase.return_path ? (
                      <p className="mt-2 text-xs text-ink-mute">
                        {REFUND_RETURN_PATH_LABELS[refundCase.return_path]}
                        {refundCase.received_at
                          ? " · shop confirmed receipt"
                          : " · waiting for the shop to confirm receipt"}
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
                    {refundCase.resolution_note ? (
                      <p className="mt-2 text-xs text-ink-mute">
                        Note: {refundCase.resolution_note}
                      </p>
                    ) : null}

                    {refundCase.status === "approved" &&
                    refundCase.return_path === "physical_return" &&
                    refundCase.received_at &&
                    !refundCase.restocked_at ? (
                      <RestockRefundForm caseId={refundCase.id} />
                    ) : null}

                    {refundCase.status === "open" ? (
                      <ResolveRefundForm
                        caseId={refundCase.id}
                        suggestedMinor={suggested}
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
