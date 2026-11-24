import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const config = {
    profile: null as { id: string } | null,
    existingMember: null as { id: string } | null,
    pending: null as { id: string } | null,
    inviteLink: null as {
      user: { id: string };
      properties: { action_link: string };
    } | null,
    recoveryLink: null as {
      user: { id: string };
      properties: { action_link: string };
    } | null,
    expireError: null as { code?: string; message: string } | null,
    insertError: null as { code?: string; message: string } | null,
    quotaError: null as string | null,
    role: "owner",
    roleCalls: [] as unknown[][],
    inserts: [] as { table: string; values: Record<string, unknown> }[],
    updates: [] as { table: string; values: Record<string, unknown> }[],
    upserts: [] as { table: string; values: Record<string, unknown> }[],
    sendInvite: vi.fn(async () => ({ sent: true })),
    sendPending: vi.fn(async () => ({ sent: true })),
    deleteUser: vi.fn(async () => ({})),
  };

  function makeQuery(table: string) {
    let op = "select";
    let values: Record<string, unknown> | null = null;
    const filters: [string, unknown][] = [];

    const result = () => {
      if (op === "insert") return { data: null, error: config.insertError };
      if (op === "update") return { data: null, error: config.expireError };
      if (table === "profiles") return { data: config.profile, error: null };
      if (table === "vendor_members") {
        return { data: config.existingMember, error: null };
      }
      if (table === "vendor_invitations") {
        return { data: config.pending, error: null };
      }
      return { data: null, error: null };
    };

    const query = {
      select() {
        op = "select";
        return query;
      },
      update(next: Record<string, unknown>) {
        op = "update";
        values = next;
        config.updates.push({ table, values: next });
        return query;
      },
      insert(next: Record<string, unknown>) {
        op = "insert";
        values = next;
        config.inserts.push({ table, values: next });
        return query;
      },
      upsert(next: Record<string, unknown>) {
        config.upserts.push({ table, values: next });
        return query;
      },
      eq(_column: string, value: unknown) {
        filters.push(["eq", value]);
        return query;
      },
      lte(_column: string, value: unknown) {
        filters.push(["lte", value]);
        return query;
      },
      maybeSingle: async () => result(),
      then(
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) {
        void values;
        return Promise.resolve(result()).then(resolve, reject);
      },
    };

    return query;
  }

  const supabase = { from: (table: string) => makeQuery(table) };
  const admin = {
    from: (table: string) => makeQuery(table),
    auth: {
      admin: {
        generateLink: vi.fn(async (args: { type: string }) =>
          args.type === "invite"
            ? { data: config.inviteLink, error: null }
            : { data: config.recoveryLink, error: null },
        ),
        deleteUser: config.deleteUser,
      },
    },
  };

  return { config, supabase, admin };
});

vi.mock("@/lib/vendor", () => ({
  requireVendorRole: async (...args: unknown[]) => {
    state.config.roleCalls.push(args);
    return {
      supabase: state.supabase,
      access: {
        role: state.config.role,
        vendorId: "vendor-1",
        vendorName: "Flower Shop",
      },
      user: { id: "owner-1" },
      isPlatformAdmin: false,
    };
  },
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => state.admin,
}));

vi.mock("@/lib/mail", () => ({
  sendVendorStaffInviteEmail: state.config.sendInvite,
  sendVendorStaffPendingInviteEmail: state.config.sendPending,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkMutationQuota: async () => state.config.quotaError,
}));

vi.mock("@/lib/site-url", () => ({
  getSiteUrl: () => "https://gifto.example",
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { inviteVendorMember, revokeVendorInvitation } from "./actions";

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    form.set(key, value);
  }
  return form;
}

beforeEach(() => {
  state.config.profile = null;
  state.config.existingMember = null;
  state.config.pending = null;
  state.config.inviteLink = null;
  state.config.recoveryLink = null;
  state.config.expireError = null;
  state.config.insertError = null;
  state.config.quotaError = null;
  state.config.role = "owner";
  state.config.roleCalls = [];
  state.config.inserts = [];
  state.config.updates = [];
  state.config.upserts = [];
  state.config.sendInvite.mockClear();
  state.config.sendPending.mockClear();
  state.config.deleteUser.mockClear();
});

describe("vendor staff invitation actions", () => {
  it("validates email and role before loading the vendor session", async () => {
    await expect(
      inviteVendorMember(
        null,
        formData({ vendor: "vendor-1", email: "nope", role: "staff" }),
      ),
    ).resolves.toEqual({
      error: "Enter a valid email address.",
      attempt: 1,
    });

    await expect(
      inviteVendorMember(
        null,
        formData({
          vendor: "vendor-1",
          email: "teammate@example.com",
          role: "owner",
        }),
      ),
    ).resolves.toEqual({
      error: "Invite as manager or staff.",
      attempt: 1,
    });

    expect(state.config.roleCalls).toEqual([]);
  });

  it("creates a pending invitation for an existing account without membership", async () => {
    state.config.profile = { id: "profile-1" };

    const result = await inviteVendorMember(
      null,
      formData({
        vendor: "vendor-1",
        email: "Teammate@Example.com",
        role: "staff",
      }),
    );

    expect(state.config.roleCalls).toEqual([
      ["vendor-1", { verifyWithAuthServer: true }],
    ]);
    expect(state.config.updates).toEqual([
      {
        table: "vendor_invitations",
        values: { status: "expired" },
      },
    ]);
    expect(state.config.inserts).toEqual([
      {
        table: "vendor_invitations",
        values: {
          vendor_id: "vendor-1",
          email: "teammate@example.com",
          role: "staff",
          invited_by: "owner-1",
          auth_user_id: "profile-1",
        },
      },
    ]);
    expect(state.config.inserts.some((row) => row.table === "vendor_members"))
      .toBe(false);
    expect(state.config.sendPending).toHaveBeenCalledWith(
      "teammate@example.com",
      "Flower Shop",
      "staff",
      "https://gifto.example/account/invitations",
    );
    expect(result && "success" in result ? result.success : "").toContain(
      "get access after accepting",
    );
  });

  it("refuses a second pending invitation for the same email", async () => {
    state.config.profile = { id: "profile-1" };
    state.config.pending = { id: "invitation-1" };

    const result = await inviteVendorMember(
      null,
      formData({
        vendor: "vendor-1",
        email: "teammate@example.com",
        role: "manager",
      }),
    );

    expect(state.config.inserts).toEqual([]);
    expect(state.config.sendPending).not.toHaveBeenCalled();
    expect(result).toEqual({
      error:
        "That email already has a pending invitation for this shop. Revoke it before inviting again.",
      attempt: 1,
    });
  });

  it("mints an invite link for a new account and stores its auth user id", async () => {
    state.config.inviteLink = {
      user: { id: "invitee-1" },
      properties: {
        action_link: "https://gifto.example/auth/accept-invite?code=abc",
      },
    };

    const result = await inviteVendorMember(
      null,
      formData({
        vendor: "vendor-1",
        email: "new@example.com",
        role: "manager",
      }),
    );

    expect(state.config.inserts).toEqual([
      {
        table: "vendor_invitations",
        values: {
          vendor_id: "vendor-1",
          email: "new@example.com",
          role: "manager",
          invited_by: "owner-1",
          auth_user_id: "invitee-1",
        },
      },
    ]);
    expect(state.config.sendInvite).toHaveBeenCalledWith(
      "new@example.com",
      "Flower Shop",
      "manager",
      "https://gifto.example/auth/accept-invite?code=abc",
    );
    expect(result && "success" in result ? result.success : "").toContain(
      "after setting a password and accepting",
    );
  });

  it("verifies ownership before revoking and updates only the pending row", async () => {
    state.config.pending = { id: "invitation-1" };

    const result = await revokeVendorInvitation(
      null,
      formData({ vendor: "vendor-1", invitation_id: "invitation-1" }),
    );

    expect(state.config.roleCalls).toEqual([
      ["vendor-1", { verifyWithAuthServer: true }],
    ]);
    expect(state.config.updates).toEqual([
      {
        table: "vendor_invitations",
        values: {
          status: "revoked",
          revoked_at: expect.any(String),
        },
      },
    ]);
    expect(result).toEqual({ success: "Invitation revoked.", attempt: 1 });
  });

  it("rejects revocation for a manager", async () => {
    state.config.role = "manager";

    await expect(
      revokeVendorInvitation(
        null,
        formData({ vendor: "vendor-1", invitation_id: "invitation-1" }),
      ),
    ).resolves.toEqual({
      error: "Only the shop owner can manage staff.",
      attempt: 1,
    });
    expect(state.config.updates).toEqual([]);
  });
});
