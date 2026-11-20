import { describe, expect, it } from "vitest";

import {
  PENDING_TOAST_KEY,
  createPendingToast,
  takePendingToast,
  writePendingToast,
  type ToastStorage,
} from "@/lib/toast";

function memoryStorage(): ToastStorage & { size: () => number } {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    size: () => store.size,
  };
}

describe("pending toasts (cross-navigation announcements)", () => {
  it("round-trips a toast and consumes it exactly once", () => {
    const storage = memoryStorage();
    const toast = createPendingToast("Order placed.", "success", 1_000);
    writePendingToast(storage, toast);
    expect(takePendingToast(storage, 2_000)).toEqual(toast);
    expect(takePendingToast(storage, 2_000)).toBeNull();
    expect(storage.size()).toBe(0);
  });

  it("drops a toast older than the max age", () => {
    const storage = memoryStorage();
    writePendingToast(storage, createPendingToast("Stale.", "info", 1_000));
    expect(takePendingToast(storage, 1_000 + 30_001)).toBeNull();
    expect(storage.getItem(PENDING_TOAST_KEY)).toBeNull();
  });

  it("keeps a toast just inside the max age", () => {
    const storage = memoryStorage();
    writePendingToast(storage, createPendingToast("Fresh.", "info", 1_000));
    expect(takePendingToast(storage, 1_000 + 30_000)?.message).toBe("Fresh.");
  });

  it("drops malformed stored values instead of throwing", () => {
    const storage = memoryStorage();
    storage.setItem(PENDING_TOAST_KEY, "{not json");
    expect(takePendingToast(storage)).toBeNull();
    storage.setItem(
      PENDING_TOAST_KEY,
      JSON.stringify({ id: "x", message: "", tone: "success", createdAt: 1 }),
    );
    expect(takePendingToast(storage)).toBeNull();
    storage.setItem(
      PENDING_TOAST_KEY,
      JSON.stringify({
        id: "x",
        message: "Hi",
        tone: "loud",
        createdAt: 1,
      }),
    );
    expect(takePendingToast(storage)).toBeNull();
  });

  it("a later flash overwrites an earlier pending toast", () => {
    const storage = memoryStorage();
    writePendingToast(storage, createPendingToast("First.", "success", 1_000));
    writePendingToast(storage, createPendingToast("Second.", "error", 2_000));
    expect(takePendingToast(storage, 3_000)?.message).toBe("Second.");
  });

  it("tolerates missing storage", () => {
    expect(takePendingToast(null)).toBeNull();
    expect(() =>
      writePendingToast(null, createPendingToast("Hi.", "success", 1)),
    ).not.toThrow();
  });
});
