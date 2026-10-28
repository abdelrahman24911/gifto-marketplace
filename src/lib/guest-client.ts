/**
 * Browser-side guest checkout attempt.
 *
 * Both values are generated once per mounted checkout form and resubmitted on
 * retries. The idempotency key lets Postgres return the same order after a lost
 * response; the guest token becomes the order access credential and is stored
 * server-side only as a SHA-256 hash.
 */

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function fallbackUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export type GuestAttempt = {
  idempotencyKey: string;
  token: string;
};

export function createGuestAttempt(): GuestAttempt {
  return {
    idempotencyKey:
      typeof crypto.randomUUID === "function" ? crypto.randomUUID() : fallbackUuid(),
    token: randomHex(32),
  };
}
