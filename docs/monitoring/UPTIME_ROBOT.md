# UptimeRobot — uptime monitoring (P0-02, H-17)

Provider: **UptimeRobot** (free tier, 50 monitors, 5-minute checks).
Status: **CONFIG DEFINED, NOT YET CREATED** — no UptimeRobot account or
monitor has been created in this session, and no API key exists in the repo.
The provider choice is Muse-recommended only; owner approval is still
pending. Creating the monitors below takes five minutes in the UptimeRobot
dashboard and needs no code change.

## Monitors to create (all HTTP(s), 5-minute interval)

| Monitor | URL | Keyword / expected | Alert contacts |
|---|---|---|---|
| Gifto production — homepage | https://gifto-marketplace.vercel.app/ | HTTP 200 | Owner (email/phone — **not yet supplied**; add the owner's alert contact in the dashboard) |
| Gifto production — health | https://gifto-marketplace.vercel.app/ | HTTP 200 | Owner (as above) |

Notes:

- The production URL is the repo's published homepage
  (`https://gifto-marketplace.vercel.app`); it is public, not a secret.
- Do not monitor a staging URL until staging exists (P0-01: staging is
  OPEN / does not exist).
- UptimeRobot alerts go to the owner's email/SMS as configured in the
  dashboard. Record the alert contact here once it is set.
- Error tracking is separate: Sentry (see `sentry.client.config.ts`,
  `sentry.server.config.ts`, `sentry.edge.config.ts`) — also DSN-unset and
  not live until the owner creates a Sentry project and sets
  `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`.
