/**
 * Guest recovery-token extraction (S-07).
 *
 * Kept in its own module with no Node imports: the recovery confirm
 * form is a client component, and `@/lib/guest-order` pulls in
 * `node:crypto` (sha256Hex), which cannot be bundled for the browser.
 * `guest-order.ts` re-exports this helper so server-side callers keep
 * a single import path.
 */

/**
 * Extracts a guest recovery token from pasted text: the raw 64-hex
 * code, or a full recovery link carrying the token as `#token=...`
 * (the emailed link's fragment) or `?token=...`. Anything else is
 * returned trimmed and unchanged, so the pattern validation in the
 * redeem action still rejects it — pasting the whole link is a
 * convenience, not a bypass.
 */
export function extractRecoveryToken(input: string): string {
  const trimmed = input.trim();
  const fromParam = trimmed.match(/[#?&]token=([^&#\s]+)/);
  if (fromParam) return fromParam[1];
  return trimmed;
}
