export const ORDER_STATUS_REASON_LABELS = {
  customer_refused: "Customer refused delivery",
  unreachable: "Customer unreachable",
  wrong_address: "Wrong or incomplete address",
  customer_request: "Customer requested cancellation",
  out_of_stock: "Items out of stock",
  damaged: "Damaged in transit",
  duplicate: "Duplicate order",
  fraud: "Suspected fraud",
  admin_override: "Administrative override",
  other: "Other (add a note)",
} as const;

export type OrderStatusReasonCode = keyof typeof ORDER_STATUS_REASON_LABELS;

export function isOrderStatusReasonCode(
  value: string,
): value is OrderStatusReasonCode {
  return value in ORDER_STATUS_REASON_LABELS;
}

export const VENDOR_FAILED_DELIVERY_REASONS: OrderStatusReasonCode[] = [
  "customer_refused",
  "unreachable",
  "wrong_address",
  "customer_request",
  "damaged",
  "other",
];
