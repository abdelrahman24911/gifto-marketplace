import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  roleCalls: [] as unknown[][],
  rpcError: null as { code?: string; message: string } | null,
  rpc: vi.fn(async () => ({
    error: null as { code?: string; message: string } | null,
  })),
  quotaError: null as string | null,
}));

vi.mock("@/lib/vendor", () => ({
  requireVendorRole: async (...args: unknown[]) => {
    state.roleCalls.push(args);
    return {
      supabase: { rpc: state.rpc },
      user: { id: "user-1" },
    };
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkMutationQuota: async () => state.quotaError,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  acknowledgeRefundCase,
  confirmRefundReceipt,
  correctInspectionCondition,
} from "./actions";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const VENDOR_ID = "22222222-2222-4222-8222-222222222222";

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    form.set(key, value);
  }
  return form;
}

describe("vendor refund actions auth verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.roleCalls = [];
    state.rpcError = null;
    state.quotaError = null;
    state.rpc.mockImplementation(async () => ({ error: state.rpcError }));
  });

  it("verifies the Auth server session before acknowledging a case", async () => {
    const result = await acknowledgeRefundCase(
      null,
      formData({ case_id: CASE_ID, vendor_id: VENDOR_ID }),
    );

    expect(state.roleCalls).toEqual([
      [VENDOR_ID, { verifyWithAuthServer: true }],
    ]);
    expect(state.rpc).toHaveBeenCalledWith("acknowledge_refund_case", {
      p_case_id: CASE_ID,
    });
    expect(result).toEqual({
      success: "Refund case acknowledged.",
      attempt: 1,
    });
  });

  it("verifies the Auth server session before confirming receipt", async () => {
    const result = await confirmRefundReceipt(
      null,
      formData({
        case_id: CASE_ID,
        vendor_id: VENDOR_ID,
        condition: "good",
        note: "",
      }),
    );

    expect(state.roleCalls).toEqual([
      [VENDOR_ID, { verifyWithAuthServer: true }],
    ]);
    expect(state.rpc).toHaveBeenCalledWith("confirm_refund_receipt", {
      p_case_id: CASE_ID,
      p_note: null,
      p_condition: "good",
    });
    expect(result && "success" in result ? result.success : "").toContain(
      "Return confirmed received.",
    );
  });

  it("verifies the Auth server session before correcting an inspection", async () => {
    const result = await correctInspectionCondition(
      null,
      formData({
        case_id: CASE_ID,
        vendor_id: VENDOR_ID,
        condition: "damaged",
      }),
    );

    expect(state.roleCalls).toEqual([
      [VENDOR_ID, { verifyWithAuthServer: true }],
    ]);
    expect(state.rpc).toHaveBeenCalledWith(
      "correct_refund_inspection_condition",
      {
        p_case_id: CASE_ID,
        p_condition: "damaged",
      },
    );
    expect(result && "success" in result ? result.success : "").toContain(
      "Inspection corrected to damaged.",
    );
  });

  it("does not verify the session for malformed input", async () => {
    const result = await acknowledgeRefundCase(
      null,
      formData({ case_id: "not-a-uuid", vendor_id: VENDOR_ID }),
    );

    expect(state.roleCalls).toEqual([]);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: "That refund case could not be found.",
      attempt: 1,
    });
  });
});
