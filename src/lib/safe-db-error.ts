/**
 * Safe database-error surfacing (Batch 3, P3).
 *
 * Supabase/PostgREST errors carry `code` + `message`, and the message is
 * only safe to show when it is one of our own friendly `raise exception`
 * texts. A genuine table check violation, a unique-key failure, or an RLS
 * denial arrives with a message that names the internals ("new row for
 * relation \"products\" violates check constraint ...", "duplicate key
 * value violates unique constraint ...", "new row violates row-level
 * security policy ..."), which must never reach the browser.
 *
 * The codebase already gates a few RPC call sites on the error code
 * (23514/42501/22023 — the codes our RPCs raise with friendly text), but
 * the code alone is not enough: a real check violation has code 23514 too.
 * This helper applies both gates — friendly code AND no internal-detail
 * fragment in the message — and falls back to an operation-specific
 * generic message otherwise. It is the same model as `safeCheckoutError`
 * in `guest-order.ts`, generalized for server actions.
 */

const FRIENDLY_ERROR_CODES = new Set(["23514", "42501", "22023"]);

/**
 * Fragments that only appear in internal Postgres/PostgREST messages.
 * Friendly `raise exception` texts are plain sentences and never contain
 * these.
 */
const INTERNAL_DETAIL_PATTERN =
  /violates|constraint|duplicate key|relation "|column "|schema "|key \(|function |operator does not exist|syntax error|permission denied for|row-level security/i;

export type DbErrorLike = {
  code?: string | null;
  message?: string | null;
} | null | undefined;

/**
 * Returns the database error's message when it is a friendly, user-facing
 * validation message, otherwise the caller-supplied generic fallback.
 */
export function safeDbError(error: DbErrorLike, fallback: string): string {
  const message = error?.message?.trim();
  if (!message) return fallback;
  if (!error?.code || !FRIENDLY_ERROR_CODES.has(error.code)) return fallback;
  if (INTERNAL_DETAIL_PATTERN.test(message)) return fallback;
  return message;
}
