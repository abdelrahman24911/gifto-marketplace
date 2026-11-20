import type {
  OrderStatus,
  RefundCaseStatus,
} from "@/lib/supabase/database.types";

export const REFUND_CASE_STATUSES: RefundCaseStatus[] = [
  "open",
  "approved",
  "rejected",
  "cancelled",
];

export const REFUND_CASE_STATUS_LABELS: Record<RefundCaseStatus, string> = {
  open: "Open",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const REFUND_CASE_STATUS_STYLES: Record<RefundCaseStatus, string> = {
  open: "border-warning/30 bg-warning-soft text-ink",
  approved: "border-success/25 bg-success-soft text-ink",
  rejected: "border-danger/25 bg-danger-soft text-ink",
  cancelled: "border-line-strong bg-paper text-ink-mute",
};

export function isRefundCaseStatus(
  value: string | undefined,
): value is RefundCaseStatus {
  return Boolean(
    value && (REFUND_CASE_STATUSES as string[]).includes(value),
  );
}

export function canRequestRefund(status: OrderStatus): boolean {
  return status === "shipped" || status === "delivered" || status === "returned";
}

export function refundReasonError(reason: string): string | null {
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return "Describe the problem in at least 5 characters.";
  }
  if (trimmed.length > 1000) {
    return "Keep the description to 1000 characters or fewer.";
  }
  return null;
}
