import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";

import { sha256Hex } from "@/lib/guest-order";

import { redeemGuestOrderRecovery } from "./actions";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: state.rpc }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: state.cookieSet }),
}));

vi.mock("next/navigation", () => ({
  // Real Next.js redirect() throws (NEXT_REDIRECT); a no-op mock would
  // let the action run past the redirect, which never happens in prod.
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const ORDER_ID = "62200000-0000-0000-0000-000000000001";
const TOKEN = "b".repeat(64);

function formData(order: string, token: string): FormData {
  const data = new FormData();
  data.set("order", order);
  data.set("token", token);
  return data;
}

describe("redeemGuestOrderRecovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rpc.mockResolvedValue({ data: null, error: null });
  });

  it("redeems a valid token by POST, rotates it, sets the cookie and sends the customer to the order", async () => {
    await expect(
      redeemGuestOrderRecovery(null, formData(ORDER_ID, TOKEN)),
    ).rejects.toThrow(`NEXT_REDIRECT:/orders/${ORDER_ID}`);

    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith("redeem_guest_recovery_token", {
      p_order_id: ORDER_ID,
      p_token_hash: sha256Hex(TOKEN),
      p_new_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const newHash = state.rpc.mock.calls[0][1].p_new_token_hash as string;
    expect(newHash).not.toBe(sha256Hex(TOKEN));

    expect(state.cookieSet).toHaveBeenCalledTimes(1);
    const cookie = state.cookieSet.mock.calls[0][0] as Record<string, unknown>;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.path).toBe(`/orders/${ORDER_ID}`);
    expect(cookie.value).toMatch(/^[0-9a-f]{64}$/);
    expect(cookie.value).not.toBe(TOKEN);

    expect(redirect).toHaveBeenCalledWith(`/orders/${ORDER_ID}`);
  });

  it("sends an invalid order id back to the recover page without calling the RPC", async () => {
    await expect(
      redeemGuestOrderRecovery(null, formData("not-a-uuid", TOKEN)),
    ).rejects.toThrow("NEXT_REDIRECT:/orders/recover?error=invalid");

    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.cookieSet).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/orders/recover?error=invalid");
  });

  it("sends a malformed token back to the recover page without calling the RPC", async () => {
    await expect(
      redeemGuestOrderRecovery(null, formData(ORDER_ID, "short")),
    ).rejects.toThrow("NEXT_REDIRECT:/orders/recover?error=invalid");

    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.cookieSet).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/orders/recover?error=invalid");
  });

  it("sends a rejected token back to the recover page without setting a cookie", async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: new Error("recovery token invalid"),
    });

    await expect(
      redeemGuestOrderRecovery(null, formData(ORDER_ID, TOKEN)),
    ).rejects.toThrow("NEXT_REDIRECT:/orders/recover?error=invalid");

    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.cookieSet).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/orders/recover?error=invalid");
  });
});
