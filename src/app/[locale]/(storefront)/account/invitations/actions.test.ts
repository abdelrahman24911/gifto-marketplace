import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireCalls: [] as unknown[][],
  quotaError: null as string | null,
  redirect: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async (...args: unknown[]) => {
    state.requireCalls.push(args);
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
  revalidatePath: state.revalidate,
}));

vi.mock("next/navigation", () => ({
  redirect: state.redirect,
}));

import { acceptVendorInvitation } from "./actions";

const INVITATION_ID = "11111111-1111-4111-8111-111111111111";

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    form.set(key, value);
  }
  return form;
}

beforeEach(() => {
  state.rpc.mockReset();
  state.requireCalls = [];
  state.quotaError = null;
  state.redirect.mockReset();
  state.revalidate.mockReset();
});

describe("acceptVendorInvitation", () => {
  it("rejects a missing invitation id before loading the session", async () => {
    await expect(
      acceptVendorInvitation(null, formData({})),
    ).resolves.toEqual({
      error: "Missing invitation id.",
      attempt: 1,
    });

    expect(state.requireCalls).toEqual([]);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("surfaces the RPC refusal without redirecting", async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: { code: "22023", message: "This invitation has expired." },
    });

    await expect(
      acceptVendorInvitation(
        null,
        formData({ invitation_id: INVITATION_ID }),
      ),
    ).resolves.toEqual({
      error: "This invitation has expired.",
      attempt: 1,
    });
    expect(state.redirect).not.toHaveBeenCalled();
  });

  it("calls the RPC and redirects to the accepted shop", async () => {
    state.rpc.mockResolvedValue({ data: "vendor-1", error: null });

    await acceptVendorInvitation(
      null,
      formData({ invitation_id: INVITATION_ID }),
    );

    expect(state.requireCalls).toEqual([[{ verifyWithAuthServer: true }]]);
    expect(state.rpc).toHaveBeenCalledWith("accept_vendor_invitation", {
      p_invitation_id: INVITATION_ID,
    });
    expect(state.revalidate).toHaveBeenCalledWith("/account/invitations");
    expect(state.revalidate).toHaveBeenCalledWith("/account");
    expect(state.redirect).toHaveBeenCalledWith(
      "/vendor/overview?vendor=vendor-1",
    );
  });

  it("stops on the mutation quota before calling the RPC", async () => {
    state.quotaError = "Too many changes. Please wait an hour and try again.";

    await expect(
      acceptVendorInvitation(
        null,
        formData({ invitation_id: INVITATION_ID }),
      ),
    ).resolves.toEqual({
      error: "Too many changes. Please wait an hour and try again.",
      attempt: 1,
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
