import { describe, expect, it } from "vitest";

import {
  GUEST_COOKIE_MAX_AGE_SECONDS,
  GUEST_COOKIE_PATH,
  GUEST_TOKEN_LIFETIME_DAYS,
  PUBLIC_REFERENCE_PATTERN,
  checkoutRateBucket,
  clientIpFromHeaders,
  createGuestToken,
  guestCookieCleanupSettings,
  guestCookieName,
  guestCookieSettings,
  isValidEmail,
  isValidGuestToken,
  isValidIdempotencyKey,
  legacyGuestCookieCleanupSettings,
  safeCheckoutError,
  sha256Hex,
} from "./guest-order";

describe("sha256Hex", () => {
  it("matches known SHA-256 digests", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("produces 64 lowercase hex characters", () => {
    expect(sha256Hex("a guest token")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isValidGuestToken", () => {
  it("accepts a 64-character lowercase hex digest", () => {
    expect(isValidGuestToken("a".repeat(64))).toBe(true);
  });

  it("rejects wrong length, uppercase and non-hex values", () => {
    expect(isValidGuestToken("a".repeat(63))).toBe(false);
    expect(isValidGuestToken("A".repeat(64))).toBe(false);
    expect(isValidGuestToken("g".repeat(64))).toBe(false);
    expect(isValidGuestToken("")).toBe(false);
    expect(isValidGuestToken(null)).toBe(false);
    expect(isValidGuestToken(42)).toBe(false);
  });
});

describe("isValidIdempotencyKey", () => {
  it("accepts UUID v4 values", () => {
    expect(isValidIdempotencyKey("8f14e45f-ceea-4a4b-8b1a-1b2c3d4e5f60")).toBe(
      true,
    );
  });

  it("rejects near-misses", () => {
    expect(isValidIdempotencyKey("not-a-uuid")).toBe(false);
    expect(isValidIdempotencyKey("8f14e45f-ceea-9a4b-8b1a-1b2c3d4e5f60")).toBe(
      false,
    );
    expect(isValidIdempotencyKey(undefined)).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts simple addresses", () => {
    expect(isValidEmail("shopper@example.com")).toBe(true);
    expect(isValidEmail("a.b+tag@mail.example.co.uk")).toBe(true);
  });

  it("rejects malformed or oversized addresses", () => {
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("two@@example.com")).toBe(false);
    expect(isValidEmail("spaces in@example.com")).toBe(false);
    expect(isValidEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});

describe("guestCookieName", () => {
  it("scopes the cookie to the order", () => {
    expect(guestCookieName("abc-123")).toBe("gifto_guest_abc-123");
  });
});

describe("guest cookie settings", () => {
  it("scopes the cookie by order name at the locale-independent root path", () => {
    const settings = guestCookieSettings("abc-123", "a".repeat(64));
    expect(GUEST_COOKIE_PATH).toBe("/");
    expect(settings).toMatchObject({
      name: "gifto_guest_abc-123",
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
    });
    expect(settings.secure).toBe(process.env.NODE_ENV === "production");
  });

  it("cleans the current path and both legacy order paths", () => {
    expect(guestCookieCleanupSettings("abc-123")).toEqual([
      { name: "gifto_guest_abc-123", path: "/" },
      { name: "gifto_guest_abc-123", path: "/orders/abc-123" },
      { name: "gifto_guest_abc-123", path: "/ar/orders/abc-123" },
    ]);
  });

  it("does not delete the fresh root cookie when only clearing legacy paths", () => {
    expect(legacyGuestCookieCleanupSettings("abc-123")).toEqual([
      { name: "gifto_guest_abc-123", path: "/orders/abc-123" },
      { name: "gifto_guest_abc-123", path: "/ar/orders/abc-123" },
    ]);
  });
});

describe("checkoutRateBucket", () => {
  it("hashes the address and never stores the raw value", () => {
    const bucket = checkoutRateBucket("203.0.113.7");
    expect(bucket).toMatch(/^[0-9a-f]{64}$/);
    expect(bucket).not.toContain("203.0.113.7");
  });

  it("is stable and case/whitespace insensitive", () => {
    expect(checkoutRateBucket(" 203.0.113.7 ")).toBe(
      checkoutRateBucket("203.0.113.7"),
    );
  });
});

describe("clientIpFromHeaders", () => {
  it("prefers the single-value real-ip header over the forwarded chain", () => {
    expect(clientIpFromHeaders("1.2.3.4, 5.6.7.8", "9.9.9.9")).toBe("9.9.9.9");
  });

  it("uses the last forwarded hop, not the client-supplied first entry", () => {
    expect(clientIpFromHeaders("1.2.3.4, 5.6.7.8", null)).toBe("5.6.7.8");
    expect(clientIpFromHeaders("spoofed, 5.6.7.8, 9.9.9.9", null)).toBe("9.9.9.9");
  });

  it("falls back to the forwarded chain then unknown", () => {
    expect(clientIpFromHeaders(null, "9.9.9.9")).toBe("9.9.9.9");
    expect(clientIpFromHeaders(null, null)).toBe("unknown");
    expect(clientIpFromHeaders("", "  ")).toBe("unknown");
    expect(clientIpFromHeaders("  ,  ", "  ")).toBe("unknown");
  });

  it("drops oversized values and clamps what remains", () => {
    expect(clientIpFromHeaders("x".repeat(500), null)).toBe("unknown");
    expect(clientIpFromHeaders(null, "x".repeat(500))).toBe("unknown");
    expect(clientIpFromHeaders("1.2.3.4", "y".repeat(500))).toBe("1.2.3.4");
  });

  it("normalizes case and surrounding whitespace", () => {
    expect(clientIpFromHeaders(null, "  2001:DB8::1 ")).toBe("2001:db8::1");
  });
});

describe("safeCheckoutError", () => {
  it("passes through customer-facing validation messages", () => {
    expect(
      safeCheckoutError("Quantity must be between 1 and 20."),
    ).toBe("Quantity must be between 1 and 20.");
    expect(
      safeCheckoutError("Enter the recipient name (2–120 characters)."),
    ).toBe("Enter the recipient name (2–120 characters).");
    expect(safeCheckoutError("“Rose Bouquet” is no longer available.")).toBe(
      "“Rose Bouquet” is no longer available.",
    );
    expect(safeCheckoutError("One or more products are no longer available.")).toBe(
      "One or more products are no longer available.",
    );
  });

  it("replaces internal database errors with a generic message", () => {
    const generic = "We couldn't place your order. Please try again.";
    expect(
      safeCheckoutError('duplicate key value violates unique constraint "orders_idempotency_key_uidx"'),
    ).toBe(generic);
    expect(safeCheckoutError("permission denied for table orders")).toBe(generic);
    expect(safeCheckoutError("").length).toBeGreaterThan(0);
    expect(safeCheckoutError(undefined)).toBe(generic);
    expect(safeCheckoutError({ message: "boom" })).toBe(generic);
  });
});

describe("guest token expiry and recovery (P1-02)", () => {
  it("generates a valid 64-hex guest token, different every time", () => {
    const first = createGuestToken();
    const second = createGuestToken();
    expect(isValidGuestToken(first)).toBe(true);
    expect(isValidGuestToken(second)).toBe(true);
    expect(first).not.toBe(second);
    expect(sha256Hex(first)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the 7-day token lifetime", () => {
    expect(GUEST_TOKEN_LIFETIME_DAYS).toBe(7);
  });

  it("validates public references (GFT- + 12 hex)", () => {
    expect(PUBLIC_REFERENCE_PATTERN.test("GFT-ABCDEF123456")).toBe(true);
    expect(PUBLIC_REFERENCE_PATTERN.test("GFT-abcdef123456")).toBe(false);
    expect(PUBLIC_REFERENCE_PATTERN.test("GFT-ABC123")).toBe(false);
    expect(PUBLIC_REFERENCE_PATTERN.test("ABCDEF123456")).toBe(false);
  });
});
