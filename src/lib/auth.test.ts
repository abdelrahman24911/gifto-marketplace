import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const getUser = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims, getUser }, from }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

// React's request-scoped cache() is a no-op outside a server render, which is
// exactly what these tests need: every call re-runs the underlying function.
const USER_ID = "user-1";

function stubTables({ admin = false }: { admin?: boolean } = {}) {
  from.mockImplementation((table: string) => {
    const result =
      table === "profiles"
        ? { data: { is_platform_admin: admin } }
        : {
            data: [
              {
                role: "owner",
                vendor: { id: "v1", name: "Shop", slug: "shop", status: "active" },
              },
            ],
          };
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.order = () => Promise.resolve(result);
    builder.maybeSingle = () => Promise.resolve(result);
    return builder;
  });
}

beforeEach(() => {
  vi.resetModules();
  getClaims.mockReset();
  getUser.mockReset();
  from.mockReset();
  stubTables();
});

describe("requireVendorRole session verification", () => {
  it("reads identity from verified claims without an Auth-server call", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: USER_ID, email: "a@b.c" } },
    });
    const { requireVendorRole } = await import("./vendor");

    const session = await requireVendorRole();

    expect(session.user).toEqual({ id: USER_ID, email: "a@b.c" });
    expect(session.access.vendorId).toBe("v1");
    expect(getUser).not.toHaveBeenCalled();
  });

  it("redirects anonymous visitors to sign-in", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    const { requireVendorRole } = await import("./vendor");

    await expect(requireVendorRole()).rejects.toThrow("REDIRECT:/login");
  });

  it("confirms the session with the Auth server when verification is requested", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    const { requireVendorRole } = await import("./vendor");

    await requireVendorRole(null, { verifyWithAuthServer: true });

    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("rejects a revoked session even though its token still verifies", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
    getUser.mockResolvedValue({ data: { user: null } });
    const { requireVendorRole } = await import("./vendor");

    await expect(
      requireVendorRole(null, { verifyWithAuthServer: true }),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("rejects when the Auth server reports a different user", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
    getUser.mockResolvedValue({ data: { user: { id: "someone-else" } } });
    const { requireVendorRole } = await import("./vendor");

    await expect(
      requireVendorRole(null, { verifyWithAuthServer: true }),
    ).rejects.toThrow("REDIRECT:/login");
  });
});

describe("requireUser / requirePlatformAdmin", () => {
  it("requireUser only calls the Auth server when asked to", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
    getUser.mockResolvedValue({ data: { user: null } });
    const { requireUser } = await import("./auth");

    await expect(requireUser()).resolves.toMatchObject({
      user: { id: USER_ID },
    });
    expect(getUser).not.toHaveBeenCalled();

    await expect(
      requireUser({ verifyWithAuthServer: true }),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("requirePlatformAdmin always confirms the session with the Auth server", async () => {
    stubTables({ admin: true });
    getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
    getUser.mockResolvedValue({ data: { user: null } });
    const { requirePlatformAdmin } = await import("./auth");

    await expect(requirePlatformAdmin()).rejects.toThrow("REDIRECT:/login");
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("requirePlatformAdmin rejects non-admin profiles", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    const { requirePlatformAdmin } = await import("./auth");

    await expect(requirePlatformAdmin()).rejects.toThrow("REDIRECT:/");
  });

  it("requirePlatformAdmin admits a confirmed admin", async () => {
    stubTables({ admin: true });
    getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    const { requirePlatformAdmin } = await import("./auth");

    await expect(requirePlatformAdmin()).resolves.toMatchObject({
      user: { id: USER_ID },
    });
  });

  it("requirePlatformAdmin does NOT sign out on a transient Auth-server failure", async () => {
    // QA 2026-11-23: the admin session dropped after ~1–2 minutes because
    // one failed getUser() round trip was treated as an invalid session.
    stubTables({ admin: true });
    getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", status: 0 },
    });
    const { requirePlatformAdmin } = await import("./auth");

    await expect(requirePlatformAdmin()).resolves.toMatchObject({
      user: { id: USER_ID },
    });
    // Retried exactly once, then trusted the verified claims for this render.
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it("requirePlatformAdmin recovers when the retry succeeds", async () => {
    stubTables({ admin: true });
    getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
    getUser
      .mockResolvedValueOnce({
        data: { user: null },
        error: { name: "AuthRetryableFetchError", status: 503 },
      })
      .mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null });
    const { requirePlatformAdmin } = await import("./auth");

    await expect(requirePlatformAdmin()).resolves.toMatchObject({
      user: { id: USER_ID },
    });
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it("requirePlatformAdmin still rejects an explicit 401 without retrying", async () => {
    stubTables({ admin: true });
    getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", status: 401 },
    });
    const { requirePlatformAdmin } = await import("./auth");

    await expect(requirePlatformAdmin()).rejects.toThrow("REDIRECT:/login");
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("requirePlatformAdmin still rejects a missing session without retrying", async () => {
    stubTables({ admin: true });
    getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", status: 400 },
    });
    const { requirePlatformAdmin } = await import("./auth");

    await expect(requirePlatformAdmin()).rejects.toThrow("REDIRECT:/login");
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("verified vendor actions also survive a transient Auth-server failure", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } } });
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", status: 0 },
    });
    const { requireVendorRole } = await import("./vendor");

    await expect(
      requireVendorRole(null, { verifyWithAuthServer: true }),
    ).resolves.toMatchObject({ user: { id: USER_ID } });
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
