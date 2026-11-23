import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processMailOutbox: vi.fn(),
}));

vi.mock("@/lib/mail", () => ({
  processMailOutbox: mocks.processMailOutbox,
}));

import { GET, POST } from "./route";

const SECRET = "test-cron-secret";

function makeRequest(authorization?: string): Request {
  return new Request("http://localhost:3000/api/cron/mail-outbox", {
    headers: authorization ? { authorization } : {},
  });
}

describe("cron mail-outbox route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", SECRET);
    mocks.processMailOutbox.mockResolvedValue({
      sent: 2,
      failed: 1,
      remaining: 3,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is fail-closed when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    expect(mocks.processMailOutbox).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong bearer token without running the worker", async () => {
    for (const header of [undefined, "Bearer wrong", SECRET, `Bearer ${SECRET}x`]) {
      const response = await GET(makeRequest(header));
      expect(response.status).toBe(401);
    }
    expect(mocks.processMailOutbox).not.toHaveBeenCalled();
  });

  it("runs the retry worker with the existing 25-row batch and reports counts", async () => {
    const response = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(mocks.processMailOutbox).toHaveBeenCalledWith({ limit: 25 });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      sent: 2,
      failed: 1,
      remaining: 3,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts POST for manual invocations with the same auth", async () => {
    const response = await POST(makeRequest(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(mocks.processMailOutbox).toHaveBeenCalledTimes(1);
  });

  it("passes a skipped run through instead of claiming a send", async () => {
    mocks.processMailOutbox.mockResolvedValue({
      sent: 0,
      failed: 0,
      remaining: 4,
      skipped: "unconfigured",
    });
    const response = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      sent: 0,
      failed: 0,
      remaining: 4,
      skipped: "unconfigured",
    });
  });
});
