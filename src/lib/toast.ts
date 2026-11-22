/**
 * Toast / announcement plumbing (UX Batch 1, accessibility).
 *
 * Success and error feedback after a mutation must reach the customer even
 * when the mutation ends in a navigation (order placed -> order page,
 * address saved -> address list). Inline `role="alert"` text unmounts with
 * the page, so the toast system has two paths:
 *
 *   * `notify` — shows a toast now, in the current page. For feedback that
 *     belongs to the page the customer is already on.
 *   * `flash` — writes the toast to sessionStorage; the provider drains it
 *     on the next mount / navigation and shows it there. For feedback that
 *     must survive a navigation. The stored toast is consumed exactly once
 *     and expires after 30 seconds, so a stale message never reappears.
 *
 * The rendered region is `aria-live="polite"` (assertive `role="alert"` for
 * errors) and keeps the existing per-component `aria-live` feedback intact —
 * components that already announce inline do not also call `notify`, so a
 * screen reader never hears the same message twice.
 */

export type ToastTone = "success" | "error" | "info";

export type PendingToast = {
  id: string;
  message: string;
  tone: ToastTone;
  createdAt: number;
};

/** sessionStorage key for the single pending cross-navigation toast. */
export const PENDING_TOAST_KEY = "gifto.toast.pending.v1";

/** A pending toast older than this is stale and is dropped unread. */
export const PENDING_TOAST_MAX_AGE_MS = 30_000;

export type ToastStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isToastTone(value: unknown): value is ToastTone {
  return value === "success" || value === "error" || value === "info";
}

export function createPendingToast(
  message: string,
  tone: ToastTone = "success",
  now: number = Date.now(),
): PendingToast {
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    message,
    tone,
    createdAt: now,
  };
}

/** Persists a toast for the next page. A later flash overwrites an earlier one. */
export function writePendingToast(
  storage: ToastStorage | null | undefined,
  toast: PendingToast,
): void {
  if (!storage) return;
  try {
    storage.setItem(PENDING_TOAST_KEY, JSON.stringify(toast));
  } catch {
    // Storage can be unavailable (private mode, quota). The toast is then
    // simply lost — the underlying mutation already succeeded.
  }
}

/**
 * Reads and consumes the pending toast, if any. Returns null when there is
 * nothing stored, the stored value is malformed, or it is older than
 * PENDING_TOAST_MAX_AGE_MS. The key is removed in every case, so a toast is
 * never shown twice.
 */
export function takePendingToast(
  storage: ToastStorage | null | undefined,
  now: number = Date.now(),
): PendingToast | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(PENDING_TOAST_KEY);
  } catch {
    return null;
  }
  try {
    storage.removeItem(PENDING_TOAST_KEY);
  } catch {
    // The read already happened; a stale key is harmless.
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.message !== "string" ||
      record.message.length === 0 ||
      !isToastTone(record.tone) ||
      typeof record.createdAt !== "number" ||
      !Number.isFinite(record.createdAt)
    ) {
      return null;
    }
    if (now - record.createdAt > PENDING_TOAST_MAX_AGE_MS) return null;
    return {
      id: record.id,
      message: record.message,
      tone: record.tone,
      createdAt: record.createdAt,
    };
  } catch {
    return null;
  }
}
