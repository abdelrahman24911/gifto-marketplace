import type { SupportRequestStatus } from "@/lib/supabase/database.types";

export const SUPPORT_CATEGORIES = [
  { value: "orders", label: "Orders & delivery" },
  { value: "products", label: "Products & inventory" },
  { value: "finance", label: "Finance & settlements" },
  { value: "account", label: "Account & access" },
  { value: "other", label: "Something else" },
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]["value"];

export const SUPPORT_SUBJECT_MIN = 5;
export const SUPPORT_SUBJECT_MAX = 120;
export const SUPPORT_BODY_MIN = 20;
export const SUPPORT_BODY_MAX = 4000;

export function isSupportCategory(value: string): value is SupportCategory {
  return SUPPORT_CATEGORIES.some((category) => category.value === value);
}

export const SUPPORT_STATUSES: SupportRequestStatus[] = [
  "open",
  "in_progress",
  "resolved",
];

export const SUPPORT_STATUS_LABELS: Record<SupportRequestStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export function isSupportStatus(value: string): value is SupportRequestStatus {
  return SUPPORT_STATUSES.includes(value as SupportRequestStatus);
}

export function supportCategoryLabel(value: string) {
  return (
    SUPPORT_CATEGORIES.find((category) => category.value === value)?.label ??
    value
  );
}
