"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  createPendingToast,
  takePendingToast,
  writePendingToast,
  type PendingToast,
  type ToastTone,
} from "@/lib/toast";

type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  /** Show a toast on the current page. */
  notify: (message: string, tone?: ToastTone) => void;
  /** Show a toast on the next page, after a navigation. Consumed once. */
  flash: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** Visible long enough to read, short enough not to linger. */
const TOAST_LIFETIME_MS = 6_000;

const TONE_CLASS: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-zinc-200 bg-white text-zinc-900",
};

/**
 * Toasts and polite announcements for the whole site, mounted once in the
 * root layout so they survive client-side navigation. `flash` covers the
 * case the provider itself remounts (full reload): the toast is stored in
 * sessionStorage and drained on the next mount.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (toast: Toast) => {
      setToasts((current) => {
        if (current.some((existing) => existing.id === toast.id)) {
          return current;
        }
        return [...current, toast];
      });
      const timer = setTimeout(() => dismiss(toast.id), TOAST_LIFETIME_MS);
      timers.current.set(toast.id, timer);
    },
    [dismiss],
  );

  // Drain a flashed toast on mount and after every navigation. The storage
  // read is consumed exactly once by takePendingToast, so a back/forward
  // navigation never resurfaces the same message. `flash()` already showed
  // the toast immediately with the same id; `show` dedupes by id, so the
  // drain only matters when the provider itself remounted (full reload).
  // The show is deferred a microtask: the drain is a cache read, not state
  // derived from the render, and must not set state synchronously in the
  // effect body.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const pending: PendingToast | null = takePendingToast(
      window.sessionStorage,
    );
    if (!pending) return;
    // queueMicrotask has no cancel; the show dedupes by id, so a drain
    // that lands after unmount is a harmless no-op.
    queueMicrotask(() =>
      show({ id: pending.id, message: pending.message, tone: pending.tone }),
    );
  }, [pathname, show]);

  useEffect(() => {
    const pendingTimers = timers.current;
    return () => {
      for (const timer of pendingTimers.values()) clearTimeout(timer);
      pendingTimers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      notify: (message, tone = "success") => {
        show({
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          message,
          tone,
        });
      },
      flash: (message, tone = "success") => {
        // Show now (the provider stays mounted across client navigation)
        // and persist the same id as a backup for a full reload, where the
        // provider remounts and the drain effect picks it up. `show`
        // dedupes by id, so the toast is never displayed twice.
        const pending = createPendingToast(message, tone);
        show({ id: pending.id, message: pending.message, tone: pending.tone });
        if (typeof window === "undefined") return;
        writePendingToast(window.sessionStorage, pending);
      },
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-label={t("notifications")}
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-md items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${TONE_CLASS[toast.tone]}`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={t("dismiss")}
              className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
            >
              {t("dismiss")}
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
