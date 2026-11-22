import Link from "next/link";
import { redirect } from "next/navigation";

import { Pagination } from "@/components/pagination";
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
import { requireVendorRole } from "@/lib/vendor";

import {
  VendorEmpty,
  VendorFilterPill,
  VendorNotice,
  VendorPageHeader,
} from "../ui";

import type { RefundCaseStatus } from "@/lib/supabase/database.types";
import type { RefundReturnPath } from "@/lib/refunds";

export const metadata = { title: "Refunds — Gifto" };

type VendorRefundRow = {
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
  acknowledged_at: string | null;
  restocked_at: string | null;
  escalation_count: number;
  order: {
    public_reference: string | null;
    recipient_name: string | null;
    contact_phone: string | null;
  } | null;
  order_vendor: {
    status: string;
    subtotal_minor: number;
  } | null;
};

type RefundFilter = RefundCaseStatus | "all";

function refundsHref(vendorId: string, filter: RefundFilter, page = 1) {
  const params = new URLSearchParams({ vendor: vendorId });
  if (filter !== "open") params.set("status", filter);
  if (page > 1) params.set("page", String(page));
  return `/vendor/refunds?${params.toString()}`;
}

function orderReference(row: VendorRefundRow) {
  return row.order?.public_reference ?? `#${row.order_id.slice(0, 8)}`;
}

export default async function VendorRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{
    vendor?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const { vendor, status: statusParam, page: pageParam } = await searchParams;
  const { supabase, access } = await requireVendorRole(vendor);
  const vendorId = access.vendorId;

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
      "id, order_id, order_vendor_id, vendor_id, source, status, reason, requested_amount_minor, refund_amount_minor, resolution_note, created_at, resolved_at, return_path, received_at, acknowledged_at, restocked_at, escalation_count, order:orders(public_reference, recipient_name, contact_phone), order_vendor:order_vendors(status, subtotal_minor)",
      { count: "exact" },
    )
    .eq("vendor_id", vendorId);

  if (filter !== "all") {
    listQuery = listQuery.eq("status", filter);
  }

  const listResult = await listQuery
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(range.from, range.to);

  const total = listResult.count ?? 0;
  const currentPage = clampPage(requestedPage, total);

  if (requestedPage > 1 && currentPage !== requestedPage) {
    redirect(refundsHref(vendorId, filter, currentPage));
  }

  const cases = (listResult.data ?? []) as unknown as VendorRefundRow[];
  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  return (
    <div className="w-full">
      <VendorPageHeader
        eyebrow="Shop management"
        title="Refunds"
        description="Refund requests on your shop's orders. Acknowledge them, and confirm when a returned gift is back with you — Gifto decides the amount and restocks after your inspection."
      />

      <section className="mt-8">
        <div className="flex flex-wrap gap-2 border-b border-line pb-5">
          <VendorFilterPill
            href={refundsHref(vendorId, "all")}
            active={filter === "all"}
          >
            All
          </VendorFilterPill>
          {REFUND_CASE_STATUSES.map((status) => (
            <VendorFilterPill
              key={status}
              href={refundsHref(vendorId, status)}
              active={filter === status}
            >
              {REFUND_CASE_STATUS_LABELS[status]}
            </VendorFilterPill>
          ))}
        </div>

        {listResult.error ? (
          <div className="mt-6">
            <VendorNotice tone="danger" role="alert">
              Refund cases could not be loaded. Refresh the page to try again.
            </VendorNotice>
          </div>
        ) : cases.length === 0 ? (
          <div className="mt-6">
            <VendorEmpty
              title={
                filter === "open"
                  ? "No refunds need your attention"
                  : "No refund requests yet"
              }
            >
              {filter === "open"
                ? "New customer and guest requests on your orders will appear here."
                : "Choose another status to see more refund cases."}
            </VendorEmpty>
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
                const subtotal = refundCase.order_vendor?.subtotal_minor ?? 0;
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
                            href={`/vendor/refunds/${refundCase.id}?vendor=${vendorId}`}
                            className="font-medium text-ink hover:text-berry-deep hover:underline"
                          >
                            {orderReference(refundCase)}
                          </Link>
                          <span className="text-xs text-ink-mute">
                            {refundCase.source} request · {createdAt}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-ink-soft">
                          {refundCase.order?.recipient_name
                            ? `${refundCase.order.recipient_name}`
                            : null}
                          {refundCase.order?.contact_phone
                            ? ` · ${refundCase.order.contact_phone}`
                            : null}
                          {` · shop subtotal ${formatEgp(subtotal)}`}
                        </p>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-xs">
                        <dt className="text-ink-mute">Requested</dt>
                        <dd className="tabular-nums text-ink">
                          {refundCase.requested_amount_minor === null
                            ? "Not set"
                            : formatEgp(refundCase.requested_amount_minor)}
                        </dd>
                        <dt className="text-ink-mute">Refunded</dt>
                        <dd className="tabular-nums text-ink">
                          {refundCase.refund_amount_minor === null
                            ? "—"
                            : formatEgp(refundCase.refund_amount_minor)}
                        </dd>
                      </dl>
                    </div>

                    <p className="mt-4 whitespace-pre-line border-t border-line pt-4 text-sm leading-relaxed text-ink-soft">
                      {refundCase.reason}
                    </p>

                    {refundCase.status === "approved" &&
                    refundCase.return_path ? (
                      <p className="mt-2 text-xs text-ink-mute">
                        {REFUND_RETURN_PATH_LABELS[refundCase.return_path]}
                        {refundCase.received_at
                          ? " · you confirmed receipt"
                          : " · waiting for you to confirm receipt"}
                        {refundCase.restocked_at
                          ? " · restocked after inspection"
                          : null}
                      </p>
                    ) : null}
                    {refundCase.status === "open" &&
                    refundCase.escalation_count > 0 ? (
                      <p className="mt-2 text-xs font-medium text-ink">
                        Escalated by the customer — Gifto is reviewing this
                        refund again.
                      </p>
                    ) : null}
                    {refundCase.acknowledged_at ? (
                      <p className="mt-2 text-xs text-ink-mute">
                        Acknowledged by your shop.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <Pagination
              page={currentPage}
              total={total}
              pageSize={DEFAULT_PAGE_SIZE}
              buildHref={(page) => refundsHref(vendorId, filter, page)}
              label="Refund case pages"
            />
          </>
        )}
      </section>
    </div>
  );
}
