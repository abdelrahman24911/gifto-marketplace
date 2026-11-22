import type { OrderStatus } from "@/lib/supabase/database.types";

export type { OrderStatus };

/** Customer-facing wording for the order_status enum. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  shipped: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  partially_completed: "Partially completed",
};

export const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  placed: "bg-amber-50 text-amber-800 border-amber-200",
  confirmed: "bg-sky-50 text-sky-800 border-sky-200",
  shipped: "bg-indigo-50 text-indigo-800 border-indigo-200",
  delivered: "bg-emerald-50 text-emerald-800 border-emerald-200",
  cancelled: "bg-zinc-100 text-zinc-600 border-zinc-300",
  returned: "bg-rose-50 text-rose-800 border-rose-200",
  partially_completed: "bg-orange-50 text-orange-800 border-orange-200",
};

/** Short explanation of what each suborder state means for the customer. */
export const ORDER_STATUS_HELP: Record<OrderStatus, string> = {
  placed: "Waiting for the shop to confirm the order.",
  confirmed: "The shop confirmed the order and is preparing it.",
  shipped: "The shop handed the order to delivery.",
  delivered: "Delivered and paid in cash.",
  cancelled: "Cancelled — stock was returned to the shop.",
  returned: "Returned after delivery.",
  partially_completed:
    "Some shop lines completed; check each shop's status in the order.",
};

/**
 * Terminal states for a parent order. `partially_completed` is parent-only and
 * means at least one shop finished while another was cancelled or returned.
 */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  "delivered",
  "cancelled",
  "returned",
  "partially_completed",
];

/**
 * What a shop may do next with a suborder. Mirrors the database trigger
 * `assert_order_vendor_transition`; the database is still the real gate.
 */
export const VENDOR_NEXT_STATUSES: Partial<
  Record<
    OrderStatus,
    { value: OrderStatus; label: string; confirm?: string }[]
  >
> = {
  placed: [
    { value: "confirmed", label: "Confirm order" },
    { value: "cancelled", label: "Cancel order" },
  ],
  confirmed: [
    { value: "shipped", label: "Mark as shipped" },
    { value: "cancelled", label: "Cancel order" },
  ],
  shipped: [
    { value: "delivered", label: "Mark as delivered" },
    {
      value: "cancelled",
      label: "Delivery failed - cancel and restock",
      confirm:
        "Cancel this delivery and return its items to stock? This cannot be undone.",
    },
  ],
};

/** What a platform administrator may do next with a suborder. */
export const ADMIN_NEXT_STATUSES: Partial<
  Record<OrderStatus, { value: OrderStatus; label: string }[]>
> = {
  placed: [
    { value: "confirmed", label: "Confirm order" },
    { value: "cancelled", label: "Cancel order" },
  ],
  confirmed: [
    { value: "shipped", label: "Mark as shipped" },
    { value: "cancelled", label: "Cancel order" },
  ],
  shipped: [
    { value: "delivered", label: "Mark as delivered" },
    { value: "cancelled", label: "Cancel and restock" },
  ],
  delivered: [
    { value: "returned", label: "Mark as returned" },
  ],
};

export function isOrderStatus(value: string): value is OrderStatus {
  return value in ORDER_STATUS_LABELS;
}

export function isTerminalOrderStatus(status: string): boolean {
  return isOrderStatus(status) && TERMINAL_ORDER_STATUSES.includes(status);
}
