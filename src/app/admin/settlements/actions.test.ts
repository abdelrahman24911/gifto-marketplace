import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mode: "missing" as "missing" | "failed" | "truncated" | "complete",
  authRejected: false,
  quotaError: null as string | null,
  fromCalls: 0,
  rpc: vi.fn(),
  // N-01: the mock settlement's line, stored total and clawback are
  // configurable so the clawback net can be exercised.
  lineAmountMinor: 800,
  entryAmountMinor: 800,
  totalMinor: 800,
  clawbackMinor: 0,
}));

vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: async () => {
    if (state.authRejected) {
      throw new Error("REDIRECT:/login");
    }

    return {
      user: { id: "admin-1" },
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
                  id: "settlement-1",
                  total_minor: state.totalMinor,
                  clawback_minor: state.clawbackMinor,
                  settlement_lines: [
                    {
                      commission_entry_id: "entry-1",
                      amount_minor: state.lineAmountMinor,
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
                  amount_minor: state.entryAmountMinor,
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

// P1-12: the quota limiter is covered by src/lib/rate-limit.test.ts and
// supabase/tests/rate_limits_test.sql; these tests exercise the action
// logic with the quota allowed, and one test flips state.quotaError to
// prove the refusal surfaces.
vi.mock("@/lib/rate-limit", () => ({
  checkMutationQuota: vi.fn(async () => state.quotaError),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import {
  createSettlement,
  markSettlementPaid,
  recordDirectRepayment,
} from "./actions";

// The mock settlement's derived net commission is 800 minor (EGP 8.00),
// so a valid payout proof pays exactly that amount with a reference.
function paidFormData(): FormData {
  const formData = new FormData();
  formData.set("settlement_id", "settlement-1");
  formData.set("paid_amount", "8.00");
  formData.set("transfer_method", "bank_transfer");
  formData.set("transfer_reference", "BANK-REF-1");
  return formData;
}

beforeEach(() => {
  state.mode = "missing";
  state.authRejected = false;
  state.quotaError = null;
  state.fromCalls = 0;
  state.lineAmountMinor = 800;
  state.entryAmountMinor = 800;
  state.totalMinor = 800;
  state.clawbackMinor = 0;
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

  it("refuses the mutation when the P1-12 quota is exceeded, before any read or RPC call", async () => {
    state.quotaError =
      "Too many changes. Please wait an hour and try again.";

    const result = await markSettlementPaid(null, paidFormData());

    expect(result).toEqual({
      error: "Too many changes. Please wait an hour and try again.",
      attempt: 1,
    });
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

    await expect(markSettlementPaid(null, paidFormData())).resolves.toMatchObject({
      success:
        "Commission receipt recorded. Gifto's receipt of the commission is now on file with the transfer reference.",
    });
    expect(state.rpc).toHaveBeenCalledWith("mark_settlement_paid", {
      p_settlement_id: "settlement-1",
      p_paid_amount_minor: 800,
      p_transfer_method: "bank_transfer",
      p_transfer_reference: "BANK-REF-1",
      p_proof_note: null,
    });
  });

  it("rejects a wrong amount, a missing reference and a bad method before the RPC", async () => {
    state.mode = "complete";

    const wrongAmount = paidFormData();
    wrongAmount.set("paid_amount", "9.00");
    await expect(
      markSettlementPaid(null, wrongAmount),
    ).resolves.toMatchObject({
      error:
        "The amount received (EGP 9.00) does not match the commission due (EGP 8.00).",
    });

    const noReference = paidFormData();
    noReference.set("transfer_reference", "");
    await expect(markSettlementPaid(null, noReference)).resolves.toMatchObject({
      error: "Enter the transfer reference (3–200 characters).",
    });

    const badMethod = paidFormData();
    badMethod.set("transfer_method", "wire");
    await expect(markSettlementPaid(null, badMethod)).resolves.toMatchObject({
      error: "Choose how the commission was transferred.",
    });

    expect(state.rpc).not.toHaveBeenCalled();
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

      const result = await markSettlementPaid(null, paidFormData());

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
    const firstFormData = paidFormData();
    const secondFormData = paidFormData();

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

  it("N-01: compares the paid amount to the clawback net, not the gross lines total", async () => {
    state.mode = "complete";
    // Lines total 1000, clawbacks 200, stored net 800.
    state.lineAmountMinor = 1000;
    state.entryAmountMinor = 1000;
    state.totalMinor = 800;
    state.clawbackMinor = 200;

    const netForm = paidFormData();
    await expect(markSettlementPaid(null, netForm)).resolves.toMatchObject({
      success: expect.any(String),
    });
    expect(state.rpc).toHaveBeenCalledWith("mark_settlement_paid", {
      p_settlement_id: "settlement-1",
      p_paid_amount_minor: 800,
      p_transfer_method: "bank_transfer",
      p_transfer_reference: "BANK-REF-1",
      p_proof_note: null,
    });

    state.rpc.mockClear();
    const grossForm = paidFormData();
    grossForm.set("paid_amount", "10.00");
    await expect(markSettlementPaid(null, grossForm)).resolves.toMatchObject({
      error:
        "The amount received (EGP 10.00) does not match the commission due (EGP 8.00).",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("N-01: rejects a stored total that does not match lines net of clawbacks", async () => {
    state.mode = "complete";
    state.lineAmountMinor = 1000;
    state.entryAmountMinor = 1000;
    state.totalMinor = 900;
    state.clawbackMinor = 200;

    const result = await markSettlementPaid(null, paidFormData());

    expect(result).toMatchObject({
      error:
        "The settlement total does not match its lines net of clawbacks. The settlement was not marked paid.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("N-01: records a fully clawback-offset batch as paid with amount 0 and no proof", async () => {
    state.mode = "complete";
    // Lines total 400, clawbacks 400, stored net 0: no transfer took place.
    state.lineAmountMinor = 400;
    state.entryAmountMinor = 400;
    state.totalMinor = 0;
    state.clawbackMinor = 400;

    const zeroForm = new FormData();
    zeroForm.set("settlement_id", "settlement-1");
    zeroForm.set("paid_amount", "0");

    await expect(markSettlementPaid(null, zeroForm)).resolves.toMatchObject({
      success:
        "No commission was due — this batch was fully offset by paid-return clawbacks.",
    });
    expect(state.rpc).toHaveBeenCalledWith("mark_settlement_paid", {
      p_settlement_id: "settlement-1",
      p_paid_amount_minor: 0,
      p_transfer_method: null,
      p_transfer_reference: null,
      p_proof_note: null,
    });

    state.rpc.mockClear();
    const proofForm = new FormData();
    proofForm.set("settlement_id", "settlement-1");
    proofForm.set("paid_amount", "0");
    proofForm.set("transfer_method", "bank_transfer");
    proofForm.set("transfer_reference", "BANK-REF-1");
    await expect(markSettlementPaid(null, proofForm)).resolves.toMatchObject({
      error:
        "This settlement is fully offset by clawbacks, so no transfer took place and no proof is recorded.",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});

describe("recordDirectRepayment (R-02, D-08)", () => {
  function repaymentFormData(
    overrides: { clawbackId?: string; reference?: string } = {},
  ): FormData {
    const formData = new FormData();
    formData.set("clawback_id", overrides.clawbackId ?? "clawback-1");
    formData.set("reference", overrides.reference ?? "BANK-REPAY-1");
    return formData;
  }

  it("validates the clawback id and the reference before any RPC call", async () => {
    await expect(
      recordDirectRepayment(null, new FormData()),
    ).resolves.toMatchObject({ error: "Missing clawback id." });
    expect(state.rpc).not.toHaveBeenCalled();

    await expect(
      recordDirectRepayment(
        null,
        repaymentFormData({ reference: "x" }),
      ),
    ).resolves.toMatchObject({
      error: "Enter the direct repayment reference (3–200 characters).",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("refuses the mutation when the P1-12 quota is exceeded, before any RPC call", async () => {
    state.quotaError =
      "Too many changes. Please wait an hour and try again.";

    const result = await recordDirectRepayment(
      null,
      repaymentFormData(),
    );

    expect(result).toEqual({
      error: "Too many changes. Please wait an hour and try again.",
      attempt: 1,
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("surfaces the RPC's refusal verbatim and reports success with the reference", async () => {
    state.rpc.mockResolvedValueOnce({
      error: {
        code: "23514",
        message: "This clawback is already resolved.",
      },
    });

    await expect(
      recordDirectRepayment(null, repaymentFormData()),
    ).resolves.toMatchObject({
      error: "This clawback is already resolved.",
    });

    await expect(
      recordDirectRepayment(null, repaymentFormData()),
    ).resolves.toMatchObject({
      success:
        "Direct repayment recorded. The clawback is resolved and will not be netted against a future settlement.",
    });
    expect(state.rpc).toHaveBeenCalledWith(
      "record_clawback_direct_repayment",
      {
        p_clawback_id: "clawback-1",
        p_reference: "BANK-REPAY-1",
      },
    );
  });

  it("hides an unexpected RPC failure behind the generic message", async () => {
    state.rpc.mockResolvedValueOnce({
      error: { code: "500", message: "boom" },
    });

    await expect(
      recordDirectRepayment(null, repaymentFormData()),
    ).resolves.toMatchObject({
      error:
        "The direct repayment could not be recorded. Refresh the page and try again.",
    });
  });
});

describe("createSettlement (R-02)", () => {
  it("surfaces the clawback-only error verbatim so the admin sees the next step", async () => {
    state.rpc.mockResolvedValueOnce({
      error: {
        code: "23514",
        message:
          "This shop has no new commission to settle, but still owes EGP 5.00 in paid-return clawbacks. Record a direct repayment instead — a clawback cannot be netted against a settlement with no commission in it.",
      },
    });

    const formData = new FormData();
    formData.set("vendor_id", "vendor-1");

    await expect(createSettlement(null, formData)).resolves.toMatchObject({
      error:
        "This shop has no new commission to settle, but still owes EGP 5.00 in paid-return clawbacks. Record a direct repayment instead — a clawback cannot be netted against a settlement with no commission in it.",
    });
  });
});
