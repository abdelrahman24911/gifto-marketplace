# Gifto — Brevo SMTP Setup

**Date:** 2026-11-24
**Branch:** `muse/decision-closure-brevo`
**Scope:** Prepare the existing SMTP mail module for Brevo without committing
credentials or changing application behaviour.
**Status:** Local Brevo SMTP configuration is in place and the verifier is
available. A live relay test was accepted on 2026-11-24; inbox receipt,
SPF/DKIM/DMARC, Vercel/hosted configuration, and app-triggered delivery remain
**unverified**. No credentials are committed.

## Executive summary

- The app already speaks generic SMTP through `nodemailer`
  (`src/lib/mail.ts`). **No application code change is required to use Brevo.**
- The only required work is owner-side: create the Brevo account, verify the
  sender/domain, create an SMTP key, set the environment variables in Vercel,
  and verify a real send.
- Brevo SMTP relay values to use:
  - host: `smtp-relay.brevo.com`
  - port: `587` with `SMTP_SECURE=false` (STARTTLS), or `465` with
    `SMTP_SECURE=true` (implicit TLS)
  - `SMTP_USER`: the Brevo SMTP login (the account email, or the generated
    `...@smtp-brevo.com` login Brevo shows on the SMTP page)
  - `SMTP_PASS`: the **Brevo SMTP key** (not the Brevo API v3 key)
  - `MAIL_FROM`: a sender address verified in Brevo
- DNS must be configured from the exact records Brevo shows for the sending
  domain: SPF, DKIM, and a DMARC policy chosen by the owner. Do not copy a DKIM
  value from a guide; use the dashboard value.
- Keep `CRON_SECRET` set to a long random value so the mail-outbox cron route
  is fail-closed but operational.
- The app's own mail and Supabase Auth's built-in emails are separate surfaces.
  The app's password-reset and staff-invite flows use `generateLink` plus the
  app mail module; other Supabase Auth emails (for example signup confirmation)
  use Supabase Auth's SMTP settings, which must be configured separately if the
  owner wants those through Brevo.

## Current mail architecture

Source: `src/lib/mail.ts`.

| Concern | Behaviour |
|---|---|
| Transport | `nodemailer.createTransport` with host/port/secure/auth and connection/socket timeouts (lines 188–200). |
| Configuration | `getMailConfig()` reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `SMTP_TIMEOUT_MS`; returns `null` without host or sender (lines 119–146). |
| Unconfigured behaviour | Every send is skipped, logged with `[gifto-mail]`, and (unless `enqueue: false`) written to `mail_outbox` for retry (lines 277–287). |
| Failure behaviour | A transport failure never rolls back the order/status/refund; it is logged and enqueued (lines 293–310). |
| Demo boundary | `GIFTO_ENVIRONMENT=demo` blocks real sends unless `GIFTO_DEMO_ALLOW_EMAIL=true`; the retry worker refuses the same way (lines 169–176, 261–275, 499–515). |
| Outbox caps | 5 attempts per retry cycle; at most 2 admin requeues; total bound 15 attempts (`MAIL_OUTBOX_MAX_ATTEMPTS=5`, `MAIL_OUTBOX_MAX_REQUEUES=2`, lines 85–95). |
| Cron | `/api/cron/mail-outbox` requires `Authorization: Bearer $CRON_SECRET`; missing secret → 503, wrong secret → 401; timing-safe comparison (`src/app/api/cron/mail-outbox/route.ts:31-79`). |
| Schedule | `vercel.json` calls the route every 5 minutes (`*/5 * * * *`). A Vercel plan that supports sub-daily cron is required. |

### What is enqueued vs never enqueued

| Email | Kind | Enqueued? | Why |
|---|---|---|---|
| Order placed (customer) | `order_placed_customer` | Yes | Safe to retry. |
| Order placed (vendor) | `order_placed_vendor` | Yes | Safe to retry. |
| Order placed (admin) | `order_placed_admin` | Yes | Safe to retry. |
| Order status | `order_status` | Yes | Safe to retry. |
| Refund opened | `refund_opened` | Yes | Safe to retry. |
| Refund resolved | `refund_resolved` | Yes | Safe to retry. |
| Support status | `support_status` | Yes | Safe to retry. |
| Staff invitation notice (existing account) | `staff_invited` | Yes | No single-use link; it points at the account invitations page. |
| Password reset | — | **No** (`enqueue: false`) | Single-use link must not be persisted. |
| Guest order recovery | — | **No** (`enqueue: false`) | Single-use link/code must not be persisted. |
| Vendor staff invite (new account) | — | **No** (`enqueue: false`) | Single-use invite link must not be persisted. |

## Required Brevo values

Set these in the deployment environment (Vercel) and in the local `.env.local`
only when testing. Never commit values.

| Variable | Brevo value | Notes |
|---|---|---|
| `SMTP_HOST` | `smtp-relay.brevo.com` | Brevo SMTP relay. |
| `SMTP_PORT` | `587` or `465` | 587 = STARTTLS; 465 = implicit TLS. |
| `SMTP_SECURE` | `false` for 587; `true` for 465 | The code also defaults to `true` when the port is 465. |
| `SMTP_USER` | Brevo SMTP login | Account email or the generated `...@smtp-brevo.com` login; not necessarily `MAIL_FROM`. |
| `SMTP_PASS` | Brevo SMTP key | Generate it in Brevo's SMTP/API settings. This is not the API v3 key. |
| `MAIL_FROM` | A verified sender, e.g. `Gifto <no-reply@your-domain>` | The address/domain must be verified in Brevo. |
| `MAIL_ADMIN_TO` | Comma-separated admin recipients, e.g. `ops@your-domain` | Optional. When empty, every profile with `is_platform_admin = true` is used; those profile addresses must be real. |
| `SMTP_TIMEOUT_MS` | `5000` (default) or `10000` | Raise only if Brevo connections time out; keep it bounded. |
| `CRON_SECRET` | Long random value | Required for the cron route; without it the route is fail-closed (503). |

Notes:

- If `SMTP_HOST` or `MAIL_FROM` is empty, `getMailConfig()` returns `null` and
  no email is sent. This is the current default and is intentional.
- The app does not require `SMTP_USER`/`SMTP_PASS` to be present to construct a
  transport, but Brevo relay authentication needs them.
- Do not put the Brevo API v3 key in `SMTP_PASS`; it will not authenticate the
  SMTP relay.
- New-order admin notifications use `MAIL_ADMIN_TO` when it is set. Otherwise
  the app resolves every profile with `is_platform_admin = true`; placeholder
  profile addresses such as `admin@gifto.example` must be replaced before
  relying on that fallback.

## DNS and sender authentication

Use the exact values Brevo displays for the sending domain. The general shape:

| Record | Purpose | Source of truth |
|---|---|---|
| SPF | Authorizes Brevo to send for the domain. | Brevo dashboard; commonly an `include:` for Brevo's SPF host, but use the exact record shown. |
| DKIM | Cryptographically signs messages. | Brevo dashboard provides the selector and public key. Do not invent these. |
| DMARC | Tells receivers what to do when SPF/DKIM fail. | Owner policy. Start with a monitoring policy (`p=none`) if the owner wants visibility, then tighten after verifying legitimate mail. |
| Return-Path / bounce domain | Bounce handling. | Brevo dashboard, if it asks for a subdomain/CNAME. |

Verification steps:

1. Add the records in the DNS provider.
2. Wait for propagation.
3. Use Brevo's domain verification and a DNS lookup tool to confirm SPF/DKIM.
4. Send a test to a mailbox at a provider with strict authentication (Gmail and
   Outlook) and inspect the authentication results.

Do not claim deliverability until the test messages pass SPF, DKIM, and DMARC
and land in the inbox (not spam) for the owner's test recipients.

## Supabase Auth is a separate surface

The app mail module covers order/refund/support mail, the staff pending-invite
notice for existing accounts, and the password-reset/staff-invite/recovery
messages that are generated with `generateLink` and sent through `sendMail`.

Supabase Auth can also send its own emails (for example signup confirmation or
magic links) using the SMTP settings in the Supabase dashboard. Those do **not**
read the app's `SMTP_*` variables. If the owner wants all Auth email through
Brevo:

1. Configure Supabase Auth SMTP with the same Brevo host/port/user/SMTP key.
2. Set the Auth sender name/address to a Brevo-verified sender.
3. Re-test the specific Auth flow (confirmation, recovery, invite) in the
   Supabase dashboard.

Do not assume app SMTP configuration covers Supabase Auth email.

## Owner setup procedure

1. Create the Brevo account and complete sender/domain verification.
2. Create an SMTP key in Brevo (SMTP & API → SMTP tab). Store it in the secure
   vault; never paste it into chat or a document.
3. Add the Brevo DNS records (SPF, DKIM, DMARC, any bounce record) and verify
   the domain.
4. In Vercel, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
   `SMTP_PASS`, `MAIL_FROM`, `MAIL_ADMIN_TO`, `SMTP_TIMEOUT_MS`, and
   `CRON_SECRET` for the target environment. Do not set them in a demo
   deployment unless test sends are explicitly intended.
5. Redeploy so the environment is loaded.
6. Run the local Brevo verifier first (see “Safe local verification” below), then
   send a test through the app (for example a support-status notification to a
   controlled recipient) and confirm:
   - the message arrives,
   - SPF/DKIM/DMARC pass,
   - the From address is the verified sender,
   - the outbox row (if any) is `sent`,
   - no secret or token appears in logs.
7. Verify password reset and guest recovery in both locales with a controlled
   mailbox.
8. Verify the cron route manually with the bearer secret, then confirm the
   Vercel cron schedule is active and the plan supports it.
9. Monitor the first real sends and the outbox for failures.

## Safe local verification

The existing tests use an injected transport or an in-process local SMTP sink;
they do not need Brevo credentials.

```powershell
npm test -- src/lib/mail.test.ts
```

What this proves:

- unconfigured sends are skipped and enqueued;
- demo sends are blocked;
- a real SMTP send works against a local sink;
- retry caps and requeue caps hold;
- single-use-link sends are not enqueued.

To verify the real Brevo relay, put the SMTP values in `.env.local` only and run:

```powershell
npm run mail:verify -- --check-only
npm run mail:verify -- --to=you@example.com
```

The first command validates the Brevo host, port/TLS pairing, sender format, and
the presence of the SMTP login/key without connecting. The second connects with
SMTP AUTH and sends one test message. The npm script loads `.env.local`
automatically, refuses non-Brevo hosts, mismatched TLS settings, missing
recipients, and sends from a demo environment; it prints only redacted
addresses and never prints `SMTP_PASS`. A successful send still does not prove
DNS authentication or deliverability to a strict inbox, so also inspect the
received headers and Brevo's dashboard.

It does **not** prove Brevo deliverability, DNS authentication, or the hosted
cron.

Local result on 2026-11-24: `--check-only` passed and one relay test was
accepted for the configured sender. Inbox receipt was not inspected from this
environment.

## What remains blocked

- Vercel/hosted environment values and a redeploy; only local `.env.local` is
  configured.
- Brevo sender/domain verification and DNS authentication evidence.
- Inbox receipt/deliverability on a controlled mailbox.
- Supabase Auth SMTP configuration, if separate Auth emails are in scope.
- Hosted migration 63/65 (mail_outbox) must be applied before the outbox/cron
  path can work in production; production was observed at migration 27.

## Acceptance criteria

- [ ] Brevo domain/sender verified.
- [x] `npm run mail:verify -- --check-only` passes with the local Brevo values.
- [x] `npm run mail:verify -- --to=<controlled mailbox>` sends one test message
  (Brevo relay accepted it on 2026-11-24; inbox receipt not inspected here).
- [ ] SPF, DKIM, and DMARC pass for a real test message.
- [ ] App test message arrives from the verified sender.
- [ ] Password reset and guest recovery arrive in both locales.
- [ ] Outbox shows the expected status and no secret/token leakage.
- [ ] Cron route returns 200 with the bearer secret and 401/503 without it.
- [ ] Vercel cron is scheduled on a plan that supports it.
- [ ] No credential is committed to the repository.

## Security rules

- Never commit `SMTP_PASS`, `CRON_SECRET`, or any Brevo key.
- Never paste credentials into chat or a ticket.
- Use the secure vault and rotate the SMTP key if it is exposed.
- Do not log message bodies, tokens, or reset links.
- Keep the demo deployment's mail blocked unless a deliberate test send is
  approved.
