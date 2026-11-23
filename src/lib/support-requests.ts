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
export const SUPPORT_REPLY_MAX = 4000;

/** An empty reply means "leave the stored reply unchanged". */
export function validateAdminReply(reply: string): string | null {
  if (reply.trim().length === 0) return null;
  if (reply.trim().length > SUPPORT_REPLY_MAX) {
    return `A reply must be ${SUPPORT_REPLY_MAX} characters or fewer.`;
  }
  return null;
}

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

/**
 * Columns for the admin support queue list query.
 *
 * The creator embed MUST name its foreign key explicitly. `support_requests`
 * has two FKs to `profiles` (`created_by` and `replied_by`, the latter added
 * by migration 69 for admin replies), so a bare `creator:profiles(...)`
 * embed is ambiguous and PostgREST rejects the whole list query with
 * PGRST201 — the queue renders empty with a "could not be loaded" banner.
 */
export const ADMIN_SUPPORT_REQUEST_COLUMNS =
  "id, category, subject, body, status, admin_reply, replied_at, created_at, vendor:vendors(name, slug), creator:profiles!support_requests_created_by_fkey(full_name)";
