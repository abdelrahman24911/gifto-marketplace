import Link from "next/link";
import { notFound } from "next/navigation";

import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import { formatEgp } from "@/lib/money";
import {
  REFUND_CASE_STATUS_LABELS,
  REFUND_CASE_STATUS_STYLES,
  REFUND_RETURN_PATH_LABELS,
} from "@/lib/refunds";
import { requireVendorRole } from "@/lib/vendor";

import { VendorNotice, VendorPageHeader } from "../../ui";
import { AcknowledgeRefundForm } from "../acknowledge-refund-form";
import { ConfirmReceiptForm } from "../confirm-receipt-form";

import type { OrderStatus, RefundCaseStatus } from "@/lib/supabase/database.types";
import type { RefundReturnPath } from "@/lib/refunds";

export const metadata = { title: "Refund case — Gifto" };

type VendorRefundDetail = {
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
  order: {
    public_reference: string | null;
    recipient_name: string | null;
    contact_phone: string | null;
  } | null;
  order_vendor: {
    status: OrderStatus;
    subtotal_minor: number;
  } | null;
};

export default async function VendorRefundDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vendor?: string }>;
}) {
  const { id } = await params;
  const { vendor } = await searchParams;
  const { supabase, access } = await requireVendorRole(vendor);
  const vendorId = access.vendorId;

  const { data, error } = await supabase
    .from("refund_cases")
    .select(
      "id, order_id, order_vendor_id, vendor_id, source, status, reason, requested_amount_minor, refund_amount_minor, resolution_note, created_at, resolved_at, return_path, received_at, receipt_note, acknowledged_at, restocked_at, escalation_count, escalated_at, escalation_note, order:orders(public_reference, recipient_name, contact_phone), order_vendor:order_vendors(status, subtotal_minor)",
    )
    .eq("id", id)
    .eq("vendor_id", vendorId)
    .maybeSingle();

  if (error || !data) notFound();
  const refundCase = data as unknown as VendorRefundDetail;
  const reference =
    refundCase.order?.public_reference ?? `#${refundCase.order_id.slice(0, 8)}`;
  const createdAt = new Date(refundCase.created_at).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BUSINESS_TIME_ZONE,
  });

  return (
    <div className="w-full">
      <VendorPageHeader
        eyebrow="Refunds"
        title={`Refund ${reference}`}
        description="Review the request, acknowledge it, and confirm when the returned gift is back with you."
        actions={
          <Link
            href={`/vendor/refunds?vendor=${vendorId}`}
            className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-paper px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-berry/40 hover:bg-berry-soft"
          >
            All refunds
          </Link>
        }
      />

      <section className="mt-8 rounded-2xl border border-line bg-paper-soft p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide ${REFUND_CASE_STATUS_STYLES[refundCase.status]}`}
          >
            {REFUND_CASE_STATUS_LABELS[refundCase.status]}
          </span>
          <span className="text-xs text-ink-mute">
            {refundCase.source} request · {createdAt}
          </span>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <dt className="text-ink-mute">Customer</dt>
          <dd className="text-ink">
            {refundCase.order?.recipient_name ?? "—"}
            {refundCase.order?.contact_phone
              ? ` · ${refundCase.order.contact_phone}`
              : null}
          </dd>
          <dt className="text-ink-mute">Shop subtotal</dt>
          <dd className="tabular-nums text-ink">
            {formatEgp(refundCase.order_vendor?.subtotal_minor ?? 0)}
          </dd>
          <dt className="text-ink-mute">Amount requested</dt>
          <dd className="tabular-nums text-ink">
            {refundCase.requested_amount_minor === null
              ? "Not set"
              : formatEgp(refundCase.requested_amount_minor)}
          </dd>
          <dt className="text-ink-mute">Amount refunded</dt>
          <dd className="tabular-nums text-ink">
            {refundCase.refund_amount_minor === null
              ? "—"
              : formatEgp(refundCase.refund_amount_minor)}
          </dd>
          <dt className="text-ink-mute">Order status</dt>
          <dd className="text-ink">
            {refundCase.order_vendor?.status ?? "—"}
          </dd>
        </dl>

        <p className="mt-4 whitespace-pre-line border-t border-line pt-4 text-sm leading-relaxed text-ink-soft">
          {refundCase.reason}
        </p>

        {refundCase.resolution_note ? (
          <p className="mt-2 text-xs text-ink-mute">
            Gifto note: {refundCase.resolution_note}
          </p>
        ) : null}

        {refundCase.status === "approved" && refundCase.return_path ? (
          <div className="mt-4 rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink">
            <p className="font-medium">
              {REFUND_RETURN_PATH_LABELS[refundCase.return_path]}
            </p>
            <p className="mt-1 text-xs text-ink-mute">
              {refundCase.received_at
                ? `You confirmed receipt${refundCase.receipt_note ? ` — “${refundCase.receipt_note}”` : ""}.`
                : "The item has not been confirmed received yet."}
              {refundCase.restocked_at
                ? " Gifto restocked it after your inspection."
                : null}
            </p>
          </div>
        ) : null}

        {refundCase.status === "open" && refundCase.escalation_count > 0 ? (
          <div className="mt-4">
            <VendorNotice tone="warning">
              Escalated by the customer
              {refundCase.escalation_note
                ? `: “${refundCase.escalation_note}”`
                : ""}
              . Gifto is reviewing this refund again; the second decision is
              final.
            </VendorNotice>
          </div>
        ) : null}

        {refundCase.status === "open" || refundCase.status === "approved" ? (
          <div className="mt-6 flex flex-col gap-6 border-t border-line pt-5">
            {refundCase.acknowledged_at ? (
              <p className="text-sm text-ink-mute">
                Acknowledged by your shop.
              </p>
            ) : (
              <div>
                <h2 className="text-sm font-semibold text-ink">
                  Acknowledge this case
                </h2>
                <div className="mt-2">
                  <AcknowledgeRefundForm
                    caseId={refundCase.id}
                    vendorId={vendorId}
                  />
                </div>
              </div>
            )}

            {refundCase.status === "approved" &&
            refundCase.return_path === "physical_return" &&
            !refundCase.received_at ? (
              <div>
                <h2 className="text-sm font-semibold text-ink">
                  Confirm the returned item is back
                </h2>
                <p className="mt-1 text-xs text-ink-mute">
                  Inspect the gift first. Confirming receipt marks the order
                  returned; Gifto restocks it manually after your inspection.
                </p>
                <div className="mt-2">
                  <ConfirmReceiptForm
                    caseId={refundCase.id}
                    vendorId={vendorId}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="mt-6 border-t border-line pt-4 text-xs text-ink-mute">
          Gifto decides the refund amount. You never set the amount and never
          resolve the case — your role is to acknowledge, inspect, and
          confirm receipt.
        </p>
      </section>
    </div>
  );
}
