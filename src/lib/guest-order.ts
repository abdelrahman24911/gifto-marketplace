import { createHash, randomBytes } from "node:crypto";

/**
 * Server-only helpers for guest checkout.
 *
 * The raw guest token is generated in the browser, sent over HTTPS with the
 * checkout submission, and stored only as a SHA-256 hash in Postgres. The raw
 * token lives in an HttpOnly, order-scoped cookie and never appears in a URL.
 */

export const GUEST_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
export const PUBLIC_REFERENCE_PATTERN = /^GFT-[0-9A-F]{12}$/;
/** Server-side guest token lifetime, mirrored by the DB trigger (P1-02). */
export const GUEST_TOKEN_LIFETIME_DAYS = 7;
export const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const GUEST_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Generates a fresh guest token server-side (P1-02 recovery rotation).
 * Same shape as the browser-generated token: 32 random bytes as hex.
 */
export function createGuestToken(): string {
  return randomBytes(32).toString("hex");
}

export function isValidGuestToken(value: unknown): value is string {
  return typeof value === "string" && GUEST_TOKEN_PATTERN.test(value);
}

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value);
}

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

/** One cookie per guest order, scoped to that order's confirmation path. */
export function guestCookieName(orderId: string): string {
  return `gifto_guest_${orderId}`;
}

/** Persisted only as a hash; never store or send a raw IP address. */
export function checkoutRateBucket(ip: string): string {
  return sha256Hex(`gifto-checkout:${ip.trim().toLowerCase()}`);
}

/**
 * Extracts a caller address for rate-limit bucketing.
 *
 * `x-real-ip` is a single-value header that a correctly configured edge proxy
 * overwrites on every request, so it is preferred. `x-forwarded-for` is a
 * comma-separated chain that clients can freely prepend to, so the *last*
 * value (the one the closest trusted proxy appended) is used as the fallback —
 * taking the first entry would let a caller rotate spoofed addresses and defeat
 * the rate limit entirely.
 *
 * The returned value is clamped and reduced to a comparable form; it is hashed
 * by `checkoutRateBucket` and never stored raw.
 */
export function clientIpFromHeaders(
  forwardedFor: string | null,
  realIp: string | null,
): string {
  const real = normalizeIpCandidate(realIp);
  if (real) return real;

  const chain = forwardedFor
    ?.split(",")
    .map((part) => normalizeIpCandidate(part))
    .filter((part): part is string => part !== null);

  const last = chain && chain.length > 0 ? chain[chain.length - 1] : null;
  return last ?? "unknown";
}

function normalizeIpCandidate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered.length > 100) return null;
  return lowered;
}

const SAFE_DB_ERROR =
  /^(Enter |Only \d+ of |Quantity |Each product |An order can contain |Your cart |You must be signed in|One or more products)/;

/**
 * The database raises customer-friendly validation messages. Anything else
 * (constraint/index names, internal SQL details) is replaced with a generic
 * message so it never reaches the browser.
 */
export function safeCheckoutError(message: unknown): string {
  if (typeof message !== "string") {
    return "We couldn't place your order. Please try again.";
  }

  const trimmed = message.trim();

  if (
    SAFE_DB_ERROR.test(trimmed) ||
    /is no longer available\.$/.test(trimmed) ||
    /is not accepting orders right now\.$/.test(trimmed) ||
    /does not deliver to this address\.$/.test(trimmed)
  ) {
    return trimmed;
  }

  return "We couldn't place your order. Please try again.";
}
