// Sentry client-side error tracking (P0-02, H-17).
// Disabled unless NEXT_PUBLIC_SENTRY_DSN is set — no DSN is committed here.
// Free tier: https://sentry.io. Provider choice is Muse-recommended only;
// owner approval is still pending, and no DSN is set, so nothing is live.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Only a sample of transactions is traced; errors are always captured.
    tracesSampleRate: 0.1,
    // Do not send user PII (names, phone numbers, addresses) with events.
  });
}
