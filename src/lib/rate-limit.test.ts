import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authQuotaFailureMessage,
  authQuotaMessage,
  authRateBucket,
  checkAuthQuota,
  checkMutationQuota,
} from "./rate-limit";

const rpcMock = vi.hoisted(() => vi.fn());
const headersGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: rpcMock }),
}));

vi.mock("next/headers", () => ({
  headers: () => ({ get: headersGet }),
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setCallerIp(ip: string) {
  headersGet.mockImplementation((name: string) => {
    if (name === "x-forwarded-for") return ip;
    if (name === "x-real-ip") return null;
    return null;
  });
}

describe("authRateBucket", () => {
  it("is deterministic and hides the raw caller key", () => {
    const bucket = authRateBucket("login", "203.0.113.7");
    expect(bucket).toBe(authRateBucket("login", "203.0.113.7"));
    expect(bucket).toMatch(/^[0-9a-f]{64}$/);
    expect(bucket).not.toContain("203.0.113.7");
  });

  it("separates scopes and keys", () => {
    expect(authRateBucket("login", "203.0.113.7")).not.toBe(
      authRateBucket("signup", "203.0.113.7"),
    );
    expect(authRateBucket("login", "203.0.113.7")).not.toBe(
      authRateBucket("login", "203.0.113.8"),
    );
    expect(authRateBucket("login", "a@example.com")).not.toBe(
      authRateBucket("login", "b@example.com"),
    );
  });

  it("normalises case and surrounding whitespace", () => {
    expect(authRateBucket("login", "  USER@Example.com ")).toBe(
      authRateBucket("login", "user@example.com"),
    );
    expect(authRateBucket("login", " 203.0.113.7 ")).toBe(
      authRateBucket("login", "203.0.113.7"),
    );
  });
});

describe("authQuotaMessage", () => {
  it("states the wait time without leaking internals", () => {
    expect(authQuotaMessage("login")).toContain("15 minutes");
    expect(authQuotaMessage("signup")).toContain("an hour");
    for (const scope of ["login", "signup", "passwordResetRequest"] as const) {
      const message = authQuotaMessage(scope);
      expect(message).not.toMatch(/bucket|rpc|auth_rate_limits|consume_/i);
    }
  });

  it("distinguishes missing configuration from a service outage", () => {
    expect(authQuotaFailureMessage("configuration")).toContain(
      "not configured",
    );
    expect(authQuotaFailureMessage("unavailable")).toContain(
      "temporarily unavailable",
    );
    expect(authQuotaFailureMessage("configuration")).not.toBe(
      authQuotaMessage("login"),
    );
    expect(authQuotaFailureMessage("unavailable")).not.toBe(
      authQuotaMessage("login"),
    );
  });
});

describe("checkAuthQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCallerIp("203.0.113.7");
    rpcMock.mockResolvedValue({ data: 1, error: null });
  });

  it("allows an attempt under both limits and consumes IP then account buckets", async () => {
    const result = await checkAuthQuota("login", {
      accountKey: "user@example.com",
    });

    expect(result).toEqual({
      limited: false,
      unavailable: false,
      failure: null,
      message: null,
    });
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenNthCalledWith(1, "consume_auth_quota", {
      p_bucket: authRateBucket("login", "203.0.113.7"),
      p_limit: 20,
      p_window_seconds: 900,
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, "consume_auth_quota", {
      p_bucket: authRateBucket("login", "user@example.com"),
      p_limit: 10,
      p_window_seconds: 900,
    });
  });

  it("denies when the IP bucket is over its limit without checking the account", async () => {
    rpcMock.mockResolvedValue({ data: 21, error: null });

    const result = await checkAuthQuota("login", {
      accountKey: "user@example.com",
    });

    expect(result).toMatchObject({
      limited: true,
      unavailable: false,
      failure: "limit",
      message: authQuotaMessage("login"),
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("denies when the account bucket is over its limit", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: 3, error: null })
      .mockResolvedValueOnce({ data: 11, error: null });

    const result = await checkAuthQuota("login", {
      accountKey: "user@example.com",
    });

    expect(result).toMatchObject({
      limited: true,
      unavailable: false,
      failure: "limit",
      message: authQuotaMessage("login"),
    });
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("consumes only the IP bucket where no account exists", async () => {
    const result = await checkAuthQuota("signup");

    expect(result).toMatchObject({
      limited: false,
      unavailable: false,
      failure: null,
      message: null,
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("consume_auth_quota", {
      p_bucket: authRateBucket("signup", "203.0.113.7"),
      p_limit: 5,
      p_window_seconds: 3600,
    });
  });

  it("reports a missing RPC as a configuration error, not a rate limit", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message:
          "Could not find the function public.consume_auth_quota(p_bucket, p_limit, p_window_seconds) in the schema cache",
      },
    });

    const result = await checkAuthQuota("login", {
      accountKey: "user@example.com",
    });

    expect(result).toEqual({
      limited: true,
      unavailable: true,
      failure: "configuration",
      message: authQuotaFailureMessage("configuration"),
    });
    expect(result.message).not.toBe(authQuotaMessage("login"));
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("reports a missing table as a configuration error, not a rate limit", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST205",
        message:
          "Could not find the table 'public.auth_rate_limits' in the schema cache",
      },
    });

    const message = await checkMutationQuota("admin", "user-1");

    expect(message).toBe(authQuotaFailureMessage("configuration"));
    expect(message).not.toBe(authQuotaMessage("adminMutation"));
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("reports other RPC failures as service unavailable, not a rate limit", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await checkAuthQuota("login", {
      accountKey: "user@example.com",
    });

    expect(result).toMatchObject({
      limited: true,
      unavailable: true,
      failure: "unavailable",
      message: authQuotaFailureMessage("unavailable"),
    });
    expect(result.message).not.toBe(authQuotaMessage("login"));
  });

  it("fails closed when the quota RPC throws", async () => {
    rpcMock.mockRejectedValue(new Error("database down"));

    const result = await checkAuthQuota("login");

    expect(result).toMatchObject({
      limited: true,
      unavailable: true,
      failure: "unavailable",
      message: authQuotaFailureMessage("unavailable"),
    });
  });
});

describe("checkMutationQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCallerIp("203.0.113.7");
    rpcMock.mockResolvedValue({ data: 1, error: null });
  });

  it("returns null when the admin is under both limits", async () => {
    expect(await checkMutationQuota("admin", "user-1")).toBeNull();
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("returns the retry message when the vendor account bucket is over", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: 2, error: null })
      .mockResolvedValueOnce({ data: 121, error: null });

    expect(await checkMutationQuota("vendor", "user-1")).toBe(
      authQuotaMessage("vendorMutation"),
    );
  });
});
