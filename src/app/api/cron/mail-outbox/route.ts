import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { processMailOutbox } from "@/lib/mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Automatic mail-outbox retry worker (Phase 2, item 1).
 *
 * Vercel Cron calls this route on the schedule declared in vercel.json
 * (daily at 03:00 UTC, the Hobby-compatible cadence). It runs the same
 * `processMailOutbox` code path as
 * the admin retry button, so it inherits every existing safeguard:
 *   - at most MAIL_OUTBOX_MAX_ATTEMPTS (5) sends per retry cycle;
 *   - a demo environment is refused before any row is read, unless
 *     GIFTO_DEMO_ALLOW_EMAIL=true;
 *   - an unconfigured SMTP provider is refused before any row is read,
 *     so no attempt is burned and rows stay queued;
 *   - only `pending` rows are retried — terminally `failed` rows stay
 *     failed until an admin requeues them (capped at
 *     MAIL_OUTBOX_MAX_REQUEUES, migration 65 / S-10).
 *
 * Authentication is fail-closed: Vercel sends
 * `Authorization: Bearer $CRON_SECRET`, and the route refuses every
 * request when CRON_SECRET is unset or does not match. The comparison
 * is timing-safe. A missing secret returns 503 (misconfiguration);
 * a wrong secret returns 401.
 */
function readCronSecret(): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  return secret ? secret : null;
}

function isAuthorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const actual = Buffer.from(header, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (actual.length !== wanted.length) return false;
  return timingSafeEqual(actual, wanted);
}

async function run(request: Request): Promise<NextResponse> {
  const secret = readCronSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Cron is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await processMailOutbox({ limit: 25 });
  return NextResponse.json(
    {
      ok: true,
      sent: result.sent,
      failed: result.failed,
      remaining: result.remaining,
      ...(result.skipped ? { skipped: result.skipped } : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  return run(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return run(request);
}
