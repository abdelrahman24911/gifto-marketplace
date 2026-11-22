// Sentry edge-runtime error tracking (P0-02, H-17).
// Disabled unless SENTRY_DSN is set — no DSN is committed here.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
  });
}
