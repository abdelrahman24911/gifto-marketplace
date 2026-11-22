import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(
    async (): Promise<{
      error: { code: string; message: string } | null;
    }> => ({ error: null }),
  ),
  rpcError: null as { code: string; message: string } | null,
}));

vi.mock("@/lib/auth", () => ({
  requirePlatformAdmin: async () => ({
    user: { id: "admin-1" },
    supabase: { rpc: state.rpc },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkMutationQuota: vi.fn(async () => null),
}));

// actions.ts imports the mail module for the resolve path; it is
// server-only, so stub it here — this test covers the correction
// action only and never sends mail.
vi.mock("@/lib/mail", () => ({
  notifyRefundCaseResolved: vi.fn(),
}));

import { correctInspectionCondition } from "./actions";

const CASE_ID = "11111111-1111-4111-8111-111111111111";

function formData(condition: string, caseId = CASE_ID): FormData {
  const form = new FormData();
  form.set("case_id", caseId);
  form.set("condition", condition);
  return form;
}

describe("correctInspectionCondition (admin, R-05 residual)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rpcError = null;
    state.rpc.mockImplementation(async () => ({ error: state.rpcError }));
  });

  it("calls the correction RPC with the case and the new condition", async () => {
    const result = await correctInspectionCondition(
      null,
      formData("damaged"),
    );
    expect(state.rpc).toHaveBeenCalledWith(
      "correct_refund_inspection_condition",
      { p_case_id: CASE_ID, p_condition: "damaged" },
    );
    expect(result).toEqual({
      success:
        "Inspection corrected to damaged. The shop pays the return courier and a damaged item is never restocked.",
      attempt: 1,
    });
  });

  it("rejects an invalid case id without calling the RPC", async () => {
    const result = await correctInspectionCondition(
      null,
      formData("good", "not-a-uuid"),
    );
    expect(result).toEqual({
      error: "That refund case could not be found.",
      attempt: 1,
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("rejects an unknown condition without calling the RPC", async () => {
    const result = await correctInspectionCondition(
      null,
      formData("pristine"),
    );
    expect(result).toEqual({
      error: "Choose what arrived: good condition, wrong item, or damaged.",
      attempt: 1,
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("surfaces the database refusal (same value, restocked, not approved)", async () => {
    state.rpcError = {
      code: "23514",
      message: "The inspection cannot be corrected after restock.",
    };
    const result = await correctInspectionCondition(
      null,
      formData("good"),
    );
    expect(result).toEqual({
      error: "The inspection cannot be corrected after restock.",
      attempt: 1,
    });
  });
});
