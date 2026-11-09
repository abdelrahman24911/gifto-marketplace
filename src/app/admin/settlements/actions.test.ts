import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mode: "missing" as "missing" | "failed" | "truncated" | "complete",
  authRejected: false,
  fromCalls: 0,
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: async () => {
    if (state.authRejected) {
      throw new Error("REDIRECT:/login");
    }

    return {
      supabase: {
        from(table: string) {
          state.fromCalls += 1;
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.in = () => builder;
        builder.order = () => builder;
        builder.range = () => builder;
        builder.maybeSingle = async () => ({
          data:
            table === "settlements"
              ? {
                  settlement_lines: [
                    {
                      commission_entry_id: "entry-1",
                      amount_minor: 800,
                      released_at: null,
                      released_by: null,
                      release_reason: null,
                    },
                  ],
                }
              : null,
          error: null,
        });
        builder.returns = async () => {
          if (state.mode === "failed") {
            return { data: null, error: new Error("read failed") };
          }

          if (state.mode === "complete") {
            return {
              data: [
                {
                  id: "entry-1",
                  vendor_id: "vendor-1",
                  status: "earned",
                  rate: 0.08,
                  base_minor: 10_000,
                  amount_minor: 800,
                  earned_at: "2026-11-01T10:00:00.000Z",
                  reversed_at: null,
                },
              ],
              error: null,
            };
          }

          if (state.mode === "truncated") {
            return {
              data: Array.from({ length: 1_000 }, (_, index) => ({
                id: `entry-${index}`,
                vendor_id: "vendor-1",
                status: "earned",
                rate: 0.08,
                base_minor: 10_000,
                amount_minor: 800,
                earned_at: "2026-11-01T10:00:00.000Z",
                reversed_at: null,
              })),
              error: null,
            };
          }

          return { data: [], error: null };
        };
        return builder;
      },
      rpc: state.rpc,
      },
    };
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { markSettlementPaid } from "./actions";

beforeEach(() => {
  state.mode = "missing";
  state.authRejected = false;
  state.fromCalls = 0;
  state.rpc.mockReset();
  state.rpc.mockResolvedValue({ error: null });
});

describe("markSettlementPaid verification guard", () => {
  it("rejects a direct action call when a commission entry is missing", async () => {
    const result = await markSettlementPaid(
      null,
      new FormData(),
    );

    expect(result).toMatchObject({ error: "Missing settlement id." });
    expect(state.rpc).not.toHaveBeenCalled();

    const formData = new FormData();
    formData.set("settlement_id", "settlement-1");
    const guarded = await markSettlementPaid(null, formData);

    expect(guarded).toMatchObject({
      error:
        "One or more commission entries are missing. The settlement was not marked paid.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("rejects direct action calls when the commission read fails", async () => {
    state.mode = "failed";
    const formData = new FormData();
    formData.set("settlement_id", "settlement-1");

    const result = await markSettlementPaid(null, formData);

    expect(result).toMatchObject({
      error:
        "Commission data could not be read. The settlement was not marked paid.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("rejects unauthorized callers before any settlement read or RPC call", async () => {
    state.authRejected = true;
    const formData = new FormData();
    formData.set("settlement_id", "settlement-1");

    await expect(markSettlementPaid(null, formData)).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(state.fromCalls).toBe(0);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("rejects a truncated commission-entry read without calling the RPC", async () => {
    state.mode = "truncated";
    const formData = new FormData();
    formData.set("settlement_id", "settlement-1");

    const result = await markSettlementPaid(null, formData);

    expect(result).toMatchObject({
      error:
        "Commission data is too large to verify safely. The settlement was not marked paid.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("preserves the existing RPC lifecycle for complete totals", async () => {
    state.mode = "complete";
    const formData = new FormData();
    formData.set("settlement_id", "settlement-1");

    await expect(markSettlementPaid(null, formData)).resolves.toMatchObject({
      success: "Settlement marked paid. The external payout should already be complete.",
    });
    expect(state.rpc).toHaveBeenCalledWith("mark_settlement_paid", {
      p_settlement_id: "settlement-1",
    });
  });

  it.each([
    ["paid", "This settlement is already paid."],
    ["voided", "This settlement was voided and cannot be marked paid."],
  ] as const)(
    "surfaces the existing %s lifecycle RPC error without false success",
    async (_state, message) => {
      state.mode = "complete";
      state.rpc.mockResolvedValue({
        error: { code: "23514", message },
      });
      const formData = new FormData();
      formData.set("settlement_id", "settlement-1");

      const result = await markSettlementPaid(null, formData);

      expect(result).toEqual({ error: message, attempt: 1 });
      expect(result && "success" in result).toBe(false);
    },
  );

  it("delegates a payout/void race to the RPC lifecycle guard without claiming mock concurrency guarantees", async () => {
    state.mode = "complete";
    state.rpc
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({
        error: {
          code: "23514",
          message: "This settlement was voided and cannot be marked paid.",
        },
      });
    const firstFormData = new FormData();
    firstFormData.set("settlement_id", "settlement-1");
    const secondFormData = new FormData();
    secondFormData.set("settlement_id", "settlement-1");

    // This only verifies application behavior when the RPC reports the
    // lifecycle outcome; row-lock concurrency is a database concern.
    const results = await Promise.all([
      markSettlementPaid(null, firstFormData),
      markSettlementPaid(null, secondFormData),
    ]);

    expect(results[0]).toMatchObject({ success: expect.any(String) });
    expect(results[1]).toMatchObject({
      error: "This settlement was voided and cannot be marked paid.",
    });
    expect(state.rpc).toHaveBeenCalledTimes(2);
  });
});
