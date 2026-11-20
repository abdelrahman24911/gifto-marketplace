// Sentry server-side error tracking (P0-02, H-17).
// Disabled unless SENTRY_DSN is set — no DSN is committed here.
// Free tier: https://sentry.io. Provider choice is Muse-recommended only;
// owner approval is still pending, and no DSN is set, so nothing is live.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}
