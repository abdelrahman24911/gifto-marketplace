// Next.js instrumentation hook: loads the Sentry server/edge config on boot.
// The config files are no-ops when no DSN is set, so local development and
// CI run without any Sentry account (P0-02, H-17).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  } else {
    await import("../sentry.edge.config");
  }
}
