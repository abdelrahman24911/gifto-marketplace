import { beforeEach, describe, expect, it, vi } from "vitest";

import { sha256Hex } from "@/lib/guest-order";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  cookieGet: vi.fn(),
  cookieDelete: vi.fn(),
  user: { id: "user-1" } as { id: string } | null,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: state.cookieGet,
    delete: state.cookieDelete,
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: state.rpc }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkAuthQuota: vi.fn(async () => ({
    limited: false,
    unavailable: false,
    message: null,
  })),
}));

vi.mock("@/lib/mail", () => ({
  notifyRefundCaseOpened: vi.fn(),
}));

import { claimGuestOrder } from "./claim-actions";
import { cancelGuestOrder } from "./cancel-actions";
import { cancelGuestRefundCase } from "./refund-actions";

const ORDER_ID = "62200000-0000-0000-0000-000000000001";
const CASE_ID = "63300000-0000-0000-0000-000000000001";
const TOKEN = "c".repeat(64);

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: "user-1" };
  state.rpc.mockResolvedValue({ data: null, error: null });
  state.cookieGet.mockImplementation((name: string) => ({
    name,
    value: TOKEN,
  }));
});

describe("guest order actions", () => {
  it("claims with the order-scoped cookie and clears current and legacy paths", async () => {
    await expect(
      claimGuestOrder(null, formData({ order_id: ORDER_ID })),
    ).rejects.toThrow(`NEXT_REDIRECT:/account/orders/${ORDER_ID}`);

    expect(state.rpc).toHaveBeenCalledWith("claim_guest_order", {
      p_order_id: ORDER_ID,
      p_token_hash: sha256Hex(TOKEN),
      p_user_id: "user-1",
    });
    expect(state.cookieDelete).toHaveBeenCalledWith({
      name: `gifto_guest_${ORDER_ID}`,
      path: "/",
    });
    expect(state.cookieDelete).toHaveBeenCalledWith({
      name: `gifto_guest_${ORDER_ID}`,
      path: `/orders/${ORDER_ID}`,
    });
    expect(state.cookieDelete).toHaveBeenCalledWith({
      name: `gifto_guest_${ORDER_ID}`,
      path: `/ar/orders/${ORDER_ID}`,
    });
  });

  it("refuses to claim when the browser has no valid guest cookie", async () => {
    state.cookieGet.mockReturnValue(undefined);

    await expect(
      claimGuestOrder(null, formData({ order_id: ORDER_ID })),
    ).resolves.toMatchObject({
      error: "This order link is not valid in this browser.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.cookieDelete).not.toHaveBeenCalled();
  });

  it("cancels a guest order using the same order-scoped cookie", async () => {
    await expect(
      cancelGuestOrder(null, formData({ order_id: ORDER_ID })),
    ).resolves.toMatchObject({
      success: "Order cancelled. Stock was returned to the shops.",
    });

    expect(state.rpc).toHaveBeenCalledWith("cancel_guest_order", {
      p_order_id: ORDER_ID,
      p_token_hash: sha256Hex(TOKEN),
    });
  });

  it("cancels a guest refund case using the same order-scoped cookie", async () => {
    await expect(
      cancelGuestRefundCase(
        null,
        formData({ order_id: ORDER_ID, case_id: CASE_ID }),
      ),
    ).resolves.toMatchObject({ success: "Refund request cancelled." });

    expect(state.rpc).toHaveBeenCalledWith("cancel_guest_refund_case", {
      p_order_id: ORDER_ID,
      p_token_hash: sha256Hex(TOKEN),
      p_case_id: CASE_ID,
    });
  });
});
