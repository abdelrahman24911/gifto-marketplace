import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthQuotaResult } from "@/lib/rate-limit";

const state = vi.hoisted(() => ({
  quota: null as AuthQuotaResult | null,
  signInError: null as { message: string } | null,
  signIn: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkAuthQuota: vi.fn(async () => state.quota),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithPassword: state.signIn },
  })),
}));

vi.mock("@/lib/auth-redirect", () => ({
  getSafeAuthPath: (path?: string | null) => path ?? "/account",
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    state.redirect(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { checkLoginQuota, checkSignupQuota, signInAccount } from "./quota-actions";

function allowedQuota(): AuthQuotaResult {
  return { limited: false, unavailable: false, failure: null, message: null };
}

function limitedQuota(): AuthQuotaResult {
  return {
    limited: true,
    unavailable: false,
    failure: "limit",
    message: "Too many sign-in attempts. Please wait 15 minutes and try again.",
  };
}

function unavailableQuota(failure: "configuration" | "unavailable"): AuthQuotaResult {
  return {
    limited: true,
    unavailable: true,
    failure,
    message:
      failure === "configuration"
        ? "This action is temporarily unavailable because the rate-limit service is not configured. Please contact support."
        : "The rate-limit service is temporarily unavailable. Please try again in a few minutes.",
  };
}

describe("signInAccount quota gate (P3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.quota = allowedQuota();
    state.signInError = null;
    state.signIn.mockImplementation(async () => ({ error: state.signInError }));
  });

  it("returns the configuration message, not the rate-limit message, when the quota service is not configured", async () => {
    state.quota = unavailableQuota("configuration");
    const result = await signInAccount("user@example.com", "secret123");
    expect(result).toEqual({
      error:
        "This action is temporarily unavailable because the rate-limit service is not configured. Please contact support.",
    });
    expect(state.signIn).not.toHaveBeenCalled();
  });

  it("returns the service-unavailable message when the quota service errors", async () => {
    state.quota = unavailableQuota("unavailable");
    const result = await signInAccount("user@example.com", "secret123");
    expect(result?.error).toContain("temporarily unavailable");
    expect(result?.error).not.toContain("Too many");
    expect(state.signIn).not.toHaveBeenCalled();
  });

  it("returns the too-many message and skips Auth when genuinely over the limit", async () => {
    state.quota = limitedQuota();
    const result = await signInAccount("user@example.com", "secret123");
    expect(result).toEqual({
      error: "Too many sign-in attempts. Please wait 15 minutes and try again.",
    });
    expect(state.signIn).not.toHaveBeenCalled();
  });

  it("signs in with the normalized email and redirects when the quota allows", async () => {
    await expect(
      signInAccount("  User@Example.com ", "secret123", "/vendor"),
    ).rejects.toThrow("NEXT_REDIRECT:/vendor");
    expect(state.signIn).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret123",
    });
    expect(state.redirect).toHaveBeenCalledWith("/vendor");
  });

  it("returns the Auth error without redirecting when credentials are wrong", async () => {
    state.signInError = { message: "Invalid login credentials" };
    const result = await signInAccount("user@example.com", "wrong");
    expect(result).toEqual({ error: "Invalid login credentials" });
    expect(state.redirect).not.toHaveBeenCalled();
  });
});

describe("checkLoginQuota / checkSignupQuota (P3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.quota = allowedQuota();
  });

  it("passes the distinct unavailable message through for login", async () => {
    state.quota = unavailableQuota("configuration");
    const gate = await checkLoginQuota("user@example.com");
    expect(gate.limited).toBe(true);
    expect(gate.message).toContain("not configured");
    expect(gate.message).not.toContain("Too many");
  });

  it("passes the distinct unavailable message through for signup", async () => {
    state.quota = unavailableQuota("unavailable");
    const gate = await checkSignupQuota();
    expect(gate.limited).toBe(true);
    expect(gate.message).toContain("temporarily unavailable");
    expect(gate.message).not.toContain("Too many");
  });

  it("allows the attempt when the quota allows", async () => {
    expect(await checkLoginQuota("user@example.com")).toEqual({ limited: false });
    expect(await checkSignupQuota()).toEqual({ limited: false });
  });
});
