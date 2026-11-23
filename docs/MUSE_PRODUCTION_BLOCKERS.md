# Gifto — Production Blockers (final pass)

Branch `muse/gifto-autonomous-improvement`, HEAD `c5c2bdf`
(2026-11-23). Verdict unchanged: **NO-GO public launch,
CONDITIONAL GO closed pilot** — with the conditions below.

## What is NOT blocking the closed pilot

- All P0/P1/P2/P3/P4/P5/P6 code work on this branch is done and
  gated (lint, typecheck, Vitest 674/674, RLS 18/18, production
  build, C1 rehearsal passing, node:test 13/13).
- The full-site test pass is clean except F-01 (404 empty DOM,
  no-JS/crawler only, Medium-Low) and the browser-unverified items
  listed in `docs/MUSE_TEST_RESULTS.md`.
- The remaining code items are small and documented, not launch
  blockers: no automatic mail-outbox retry worker (manual admin retry
  is fine for the pilot), F-01.

## Owner-side blockers (only the owner can clear these)

| Blocker | Why it blocks | What the owner must do |
|---|---|---|
| **SMTP provider + sending domain not chosen** | No transactional email is delivered at all. All mail is skipped or queued in the outbox for manual admin retry. Password recovery, order notifications, and refund emails do not reach customers. | Pick Brevo (free 300/day) or Resend (free 3,000/mo, 100/day cap) — comparison was presented 2026-11-21 — plus the sending domain for SPF/DKIM/DMARC and `MAIL_FROM`. Credentials only via secure vault, never pasted in chat. Then verify a real send end-to-end. |
| **Hosted migration state unverified** | Migrations 1–71 apply cleanly on disposable Postgres, but the state of the hosted Supabase project (which migrations are actually applied there) is unknown. Deploying the app before migration 67 is applied breaks demo containment (the app reads `app_settings`). | Confirm hosted migration state; apply 28–71 in order on staging first, then production, following the deployment order: migration 67 BEFORE the app code that reads `app_settings`. |
| **No staging / backup drill** | No verified staging environment, no backup/PITR drill, no CI re-verification after the PR #1 merge. | Set up staging + run the backup restore drill (owner access required). |
| **Monitoring not live** | Sentry DSN unset, UptimeRobot monitors not created (approved 2026-11-20, never wired). | Supply the Sentry DSN (env only) and confirm UptimeRobot access; Muse wires them and verifies an alert fires. |
| **Legal pages still draft** | Six legal pages carry draft notices; no entity/contact details, no owner/lawyer approval. | Owner/lawyer review and approval; supply the real company details. Do not invent them. |
| **Isolated demo environment not set up** | Demo data and demo accounts still live in the production Supabase project; demo scripts now refuse without `GIFTO_ENVIRONMENT=demo` (Batch 4 behaviour change). | Follow `docs/DEMO_SEPARATION_CHECKLIST.md` (separate Supabase + Vercel demo projects, retire production demo data). Needs the owner's account access + go-ahead. |
| **R-04 coverage fail-open undecided** | Deliberate documented policy: when the delivery-coverage check cannot run, checkout proceeds. Flipping it to fail-closed changes who can order during an outage. | Owner decision + vendor/customer comms. Never flip silently. |
| **CAPTCHA on signup undecided** | No bot protection on signup; rate-limit bypass via direct Supabase Auth has no clean code-side guard. | Owner decision: enable Supabase Auth dashboard limits + CAPTCHA, or accept the risk for the pilot. |
| **Supabase Auth dashboard settings unverified** | Rate limits, email templates, and redirect URLs in the hosted Auth settings have not been checked. | Owner verifies in the dashboard (Muse cannot change hosted settings). |
| **C1 execution against production** | The C1 financial correction is prepared and rehearsed (ALL CHECKS PASSED) but must never run against production without the owner's explicit go-ahead. | Owner gives the go-ahead when the hosted state is known; C1 itself is not run by Muse unprompted. |
| **SEO indexing flag not flipped** | Correct for now (site is not public-ready). | Flip only when going public, after hosted verification. |
| **GitHub PATs pasted in chat (2026-11-20)** | Two tokens were pasted in chat; both failed git push with 403 despite API write access. They must be revoked/rotated. | Revoke/rotate both tokens; use the secure vault next time. |

## Code items remaining (engineer work, not launch blockers)

| Item | Status |
|---|---|
| F-01: 404 pages serve an empty DOM (no-JS/crawler only) | Recorded with root cause; no small safe fix (see `MUSE_TEST_RESULTS.md`). Browser renders correctly via hydration. |
| F-04: refund window at resolve | Deliberate non-change; needs an owner policy decision first (window governs opening, not admin processing time). |
| No automatic mail-outbox retry worker | Pilot: manual admin retry is fine. Public launch: add a cron/worker within the 5-attempt / 2-requeue caps. |
| Browser-unverified UI items (finance tab pending state, ConfirmSubmit, support preview, CSV download behaviour, filter pills, wishlist sync, banner visual rendering) | Need a real browser pass (Playwright blocked — Chromium download approval outstanding). |
| Polish / post-pilot items (from the re-audit) | Unescaped LIKE in admin logistics search; i18n key guard not wired into CI; vendor/admin dashboards English-only; no live tracking integration; review stars only on product pages; no similarity threshold / Arabic fuzzy proof for search; BreadcrumbList only on shop/product pages; settlement reconciliation is UI arithmetic only (no COD cash ledger); return-courier payer is a recorded label, not a financial charge; preferred delivery date is a preference with no fulfilment enforcement. None block the pilot. |

## Deliberately left alone (not blockers)

- **S-11** recovery code in plain email text: same secret and channel
  as the URL fragment, mitigated by `enqueue: false` so it is never
  persisted in the outbox. Revisit only for a redesign.
- **S-07** recovery fragment survival: unproven in a browser; verify a
  real recovery link end-to-end in a browser (both locales) once SMTP
  is live.
- **Rollbacks 59/61–65**: rolling back reintroduces the gaps those
  migrations closed, by design. Never apply a rollback outside the
  disposable test DB.
- **No commission percentage decided**: commission is per-vendor,
  admin-set, on product subtotal only, earned on delivery. The schema
  default of 10% is a column default, NOT a commercial offer. Never
  print a percentage to vendors.
- **No delivery fee amount, launch date, or order-volume guarantee**:
  D-06 (free delivery through launch, flat fee per shop later, review
  after 100 orders) and D-07 (no subscription at launch) stand.
