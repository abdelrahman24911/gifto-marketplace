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

// D-09 return window (P1-04): 7 days from delivery. A suborder that is
// merely shipped has no delivered_at yet, so the window has not started
// and a case stays openable. Mirrors the window check in open_refund_case
// / open_guest_refund_case — the UI never offers a case the RPC rejects.
export const REFUND_WINDOW_DAYS = 7;

export function refundWindowEndsAt(deliveredAt: string): Date {
  const ends = new Date(deliveredAt);
  ends.setDate(ends.getDate() + REFUND_WINDOW_DAYS);
  return ends;
}

export function canRequestRefundWithinWindow(
  status: OrderStatus,
  deliveredAt: string | null | undefined,
): boolean {
  if (!canRequestRefund(status)) return false;
  if (status === "shipped" || !deliveredAt) return true;
  return refundWindowEndsAt(deliveredAt).getTime() > Date.now();
}

export type RefundReturnPath = "physical_return" | "no_return";

export const REFUND_RETURN_PATH_LABELS: Record<RefundReturnPath, string> = {
  physical_return: "Physical return required",
  no_return: "Refund without a return",
};

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
