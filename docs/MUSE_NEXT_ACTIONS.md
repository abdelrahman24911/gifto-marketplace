# Gifto — Next Actions (final pass)

Branch `muse/gifto-autonomous-improvement`, HEAD `c5c2bdf`
(2026-11-23). Verdict: NO-GO public, CONDITIONAL GO closed pilot.

## 1. (OWNER — the single most important next action) Choose the SMTP provider and sending domain, then verify a real send

Nothing else unblocks the pilot's communications: password recovery,
order notifications, and refund emails currently never reach a
customer — they are skipped or queued in the outbox for manual admin
retry. Pick Brevo (free 300/day) or Resend (free 3,000/mo, 100/day
cap) from the comparison presented 2026-11-21, plus the sending
domain for SPF/DKIM/DMARC and `MAIL_FROM`. Credentials only via the
secure vault, never pasted in chat. Then Muse verifies a real send
end-to-end (and the S-07 recovery-fragment check in a browser, both
locales). Until this is done, the pilot runs with manual admin mail
retry.

## 2. (OWNER) Confirm the hosted Supabase migration state and apply migrations 28–71 (staging first)

The app code on this branch requires migration 67 before deployment
(demo containment reads `app_settings`). Apply in order on staging,
verify, then production. Do not deploy the app before migration 67
is applied.

## 3. (OWNER) Decide the R-04 coverage fail-open policy

When the delivery-coverage check cannot run, checkout currently
proceeds (documented fail-open). Flipping to fail-closed changes who
can order during an outage — it needs the owner's decision plus
vendor/customer comms. Never flip silently.

## 4. (OWNER) Approve the Playwright Chromium download (or run the browser pass another way)

The full-site pass is complete over HTTP, but seven UI items remain
browser-unverified (finance tab pending state, ConfirmSubmit flows,
support preview, CSV download behaviour, filter-pill pending state,
wishlist client sync, banner visual rendering). The Chromium download
failed and its approval timed out; do not retry without the owner's
go-ahead. Once approved, run the browser pass against the local build
and close or log each item.

## 5. (OWNER) Set up the isolated demo environment

Follow `docs/DEMO_SEPARATION_CHECKLIST.md`: separate Supabase +
Vercel demo projects, retire production demo data. Demo scripts now
refuse without `GIFTO_ENVIRONMENT=demo`. Needs the owner's account
access + go-ahead. Until then, the production-project opt-in is how
demo seeding continues deliberately.

## 6. (OWNER) Wire monitoring (Sentry DSN + UptimeRobot)

Approved 2026-11-20, never wired. Supply the Sentry DSN (env only)
and confirm UptimeRobot access; Muse wires them and verifies an
alert fires.

## 7. (OWNER) Legal approval + real company details

The six legal pages are still draft. Owner/lawyer review and
approval; supply the real company details. Do not invent them.

## 8. (OWNER) Decide: CAPTCHA on signup + Supabase Auth dashboard limits

Rate-limit bypass via direct Supabase Auth has no clean code-side
guard. Owner decides whether to enable dashboard limits + CAPTCHA
or accept the risk for the pilot, and verifies the hosted Auth
settings (rate limits, email templates, redirect URLs).

## 9. (OWNER) Give the go-ahead for C1 execution against production (when ready)

C1 is prepared and rehearsed (ALL CHECKS PASSED) but must never run
against production without explicit go-ahead, and only once the
hosted migration state is known (action 2).

## 10. (OWNER) Revoke/rotate the two GitHub PATs pasted in chat (2026-11-20)

Both failed git push with 403. Use the secure vault next time.

## 11. (ENGINEER, after action 4) Close out the browser-unverified items

Run the browser pass, verify each of the seven items (action 4), and
fix anything it finds on this branch with tests and gates.

## 12. (ENGINEER, after action 1) Add the automatic mail-outbox retry worker

Pilot runs fine on manual admin retry. For public launch, add a
cron/worker that retries pending rows within the existing 5-attempt /
2-requeue caps.

## 13. (ENGINEER, post-pilot polish) The polish batch

Unescaped LIKE in admin logistics search; i18n key guard wired into
CI; vendor/admin dashboards English-only; live tracking integration;
review stars on product listings; search similarity threshold /
Arabic fuzzy proof; BreadcrumbList beyond shop/product pages;
settlement reconciliation beyond UI arithmetic (COD cash ledger);
return-courier payer as a financial charge; delivery-date fulfilment
enforcement. None block the pilot.

## 14. (OWNER, when going public) Flip the SEO indexing flag

Only after hosted verification, never before.

## 15. (OWNER, if wanted) Decide the refund-window-at-resolve policy (F-04)

The 7-day window is enforced when a case opens, not when it
resolves — deliberately, because the window governs the customer's
right to open a case, not the admin's processing time. If the owner
wants it enforced at resolve too, say so explicitly; it will be a
deliberate change with comms, not a silent flip.
