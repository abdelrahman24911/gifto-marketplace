import { BUSINESS_TIME_ZONE } from "@/lib/business-time";

import type { OrderStatus } from "@/lib/supabase/database.types";

export const ATTENTION_STATUSES: OrderStatus[] = [
  "placed",
  "confirmed",
  "shipped",
];

export const ADMIN_ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  placed: "border-warning/30 bg-warning-soft text-ink",
  confirmed: "border-berry/25 bg-berry-soft text-ink",
  shipped: "border-gold/40 bg-gold-soft text-ink",
  delivered: "border-success/25 bg-success-soft text-ink",
  cancelled: "border-line-strong bg-paper text-ink-mute",
  returned: "border-danger/25 bg-danger-soft text-ink",
  partially_completed: "border-line-strong bg-paper-deep text-ink-soft",
};

export function formatOrderDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  });
}
