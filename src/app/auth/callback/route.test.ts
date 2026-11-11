import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession },
  }),
}));

describe("auth callback", () => {
  beforeEach(() => {
    vi.resetModules();
    exchangeCodeForSession.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gifto-marketplace.vercel.app/");
  });

  it("exchanges the confirmation code and redirects to a safe session destination", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=confirmation-code&next=%2Faccount%3Ftab%3Dorders",
      ),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("confirmation-code");
    expect(response.headers.get("location")).toBe(
      "https://gifto-marketplace.vercel.app/account?tab=orders",
    );
  });

  it("rejects an invalid code and keeps the error redirect canonical", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: new Error("expired"),
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        "http://attacker.example/auth/callback?code=expired&next=https%3A%2F%2Fattacker.example",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://gifto-marketplace.vercel.app/login?error=auth",
    );
  });
});
