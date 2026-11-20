# Gifto — Hosted State (single source of truth)

**Observation date:** 2026-11-20
**Branch / HEAD at observation:** `muse/p0-fixes`, based on `audit/phase-2-refunds-orders-seo`
`34f30a61f050e41905ccf1bec982173487cda603`
**Observed by:** Muse (local clone only — no hosted Supabase, Vercel, or CI access)

> This file is the single hosted-state table for the repo (P0-01, H-17).
> Every hosted row below is **UNVERIFIED**: this session had no Supabase CLI
> login, no Vercel access, and no production credentials, and the task forbids
> accessing production credentials or mutating hosted services. Nothing in this
> table is asserted about the live project without an evidence entry saying
> how it was observed. The README's earlier hosted-state claims (migrations
> 1–27 applied, project ref `hqusykdyjpruysxezsrn`) are prior records, not
> re-verified here. Local, verifiable facts (migration files present, suite
> files present) are recorded as OBSERVED (local) and are not hosted claims.

## Hosted-state table

| Item | Expected | Observed | Evidence (command / dashboard) | Date |
|---|---|---|---|---|
| Migrations 1–24 applied on hosted Supabase | Applied | UNVERIFIED | No hosted access in this session; `supabase migration list` not run (no CLI login). README (prior record) states 1–27 are the verified hosted state. | 2026-11-20 |
| Migration 25 `00000000000025_atomic_settlement_payout.sql` applied on hosted Supabase | Applied | UNVERIFIED | No hosted access; `supabase migration list` not run. README (prior record) lists 25 among hosted migrations. | 2026-11-20 |
| Migration 26 `00000000000026_occasion_discovery.sql` applied on hosted Supabase | Applied | UNVERIFIED | No hosted access; `supabase migration list` not run. README (prior record) lists 26 among hosted migrations. | 2026-11-20 |
| Migration 27 `00000000000027_occasion_matching_rules.sql` applied on hosted Supabase | Applied | UNVERIFIED | No hosted access; `supabase migration list` not run. README (prior record) lists 27 among hosted migrations. | 2026-11-20 |
| Migration 28 `00000000000028_order_status_audit.sql` applied on hosted Supabase | Not applied (local-only per README) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. README states 28–30 are "applied locally only and have not been pushed to the hosted project" — that is a prior local claim, not a hosted observation. | 2026-11-20 |
| Migration 29 `00000000000029_delivery_coverage.sql` applied on hosted Supabase | Not applied (local-only per README) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | As migration 28. | 2026-11-20 |
| Migration 30 `00000000000030_refunds.sql` applied on hosted Supabase | Not applied (local-only per README) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | As migration 28. | 2026-11-20 |
| SMTP / notifications (P1-01, CR-02) | Live SMTP provider sending order, status, refund, support and password-reset email | OPEN — BLOCKED on an owner SMTP account (P1-01, 2026-11-20) | Mail module built: `src/lib/mail.ts` (nodemailer, env-configured, plain-text-first templates, EGP via `formatEgp`); sends hooked after the DB write in checkout (`placeOrder`), vendor/admin status actions, refund open/resolve actions, and support-status updates; password-reset route added (`/forgot-password`, `/auth/reset-password`, Supabase `generateLink` + same module). Verified locally only: 13 Vitest cases pass, including a real SMTP send to an in-process local sink (`src/lib/mail.test.ts`). **No provider has been chosen by the owner and no SMTP account exists, so no email actually leaves the app**: `getMailConfig()` returns null without `SMTP_HOST`/`MAIL_FROM` and every send is skipped with an ops-visible `[gifto-mail]` log entry. To go live: owner chooses an SMTP provider, creates the account, and sets `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` in Vercel (names only in `.env.example`; never commit values). No SMS/WhatsApp in this prompt. Support-page disclaimers now state email is sent only when configured. | 2026-11-20 |
| Vendor staff invite email (P1-14, H-07) | Invited teammate receives the invite email; existing account receives the added email | OPEN — BLOCKED on the same owner SMTP account as P1-01 | Invite flow built 2026-11-20: `generateLink` (type `invite`, no Supabase email sent) + membership row + `sendVendorStaffInviteEmail` via the P1-01 mail module; existing accounts get `sendVendorStaffAddedEmail`. **No SMTP provider exists yet, so the email is skipped with a `[gifto-mail]` log entry while the membership itself is still created** — the action tells the owner plainly that no email was sent. Supabase's own invite email is never relied on. To go live: same SMTP setup as the P1-01 row. | 2026-11-20 |
| Supabase Auth rate limits (P1-12, step 1) | Known values from the dashboard | UNVERIFIED | No Supabase dashboard access in this session (no hosted access; task forbids it). The app-level limits in `src/lib/rate-limit.ts` do not depend on these values, but a caller who talks to Supabase Auth directly is governed by them, so they must be read from the dashboard before launch. | 2026-11-20 |
| Supabase Auth JWT expiry (P1-12, step 1) | Known value from the dashboard | UNVERIFIED | As above — no dashboard access in this session. | 2026-11-20 |
| Supabase Auth password policy (P1-12, step 1) | Known policy from the dashboard | UNVERIFIED | As above — no dashboard access in this session. The app enforces a 6-character minimum in the reset flow only; signup/login rely on Supabase's policy. | 2026-11-20 |
| CAPTCHA for signup (P1-12, step 4) | Owner decision + provider, if any | OPEN — no provider added, no owner decision recorded | P1-12 evaluated CAPTCHA and deliberately added no provider unilaterally. Owner to decide whether signup gets a CAPTCHA (e.g. Supabase built-in CAPTCHA or a third-party provider) before launch; until then signup is limited by the app-level IP quota (5/hr) only. | 2026-11-20 |
| Migration 39 `00000000000039_auth_rate_limits.sql` applied on hosted Supabase | Not applied (local-only) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. Local RLS test `supabase/tests/rate_limits_test.sql` passes on disposable Postgres (P1-12). | 2026-11-20 |
| Migration 40 `00000000000040_admin_address_correction.sql` applied on hosted Supabase | Not applied (local-only) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. Extended local RLS suite `supabase/tests/rls_order_audit_test.sql` (TEST 7–10) passes on disposable Postgres (P1-13). | 2026-11-20 |
| Migration 41 `00000000000041_vendor_staff_roster.sql` applied on hosted Supabase | Not applied (local-only) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. Extended local RLS suite `supabase/tests/rls_vendor_dashboard_test.sql` (TEST 17–19) passes on disposable Postgres (P1-14). | 2026-11-20 |
| Migration 42 `00000000000042_courier_tracking.sql` applied on hosted Supabase | Not applied (local-only) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. Extended local RLS suites `supabase/tests/rls_orders_test.sql` (TEST 18) and `supabase/tests/rls_guest_orders_test.sql` (TEST 7b) pass on disposable Postgres (P1-15). | 2026-11-20 |
| Migration 43 `00000000000043_paid_return_clawback.sql` applied on hosted Supabase | Not applied (local-only) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. N-01 (CR-01/CR-03): paid-return commission clawback carried into the next settlement (D-08), zero-net batch pays with amount 0 and no proof, `record_clawback_direct_repayment` RPC. Local RLS suites `supabase/tests/rls_refunds_test.sql` (TEST 12–13) and `supabase/tests/rls_commissions_test.sql` (TEST 20, P1-05 reconciliation) pass on disposable Postgres; lint, typecheck, Vitest 435 tests, and `next build` pass. | 2026-11-20 |
| N-01 paid-return clawback (CR-01, CR-03) | Approving a refund on a paid settlement records a clawback against the shop's next settlement; paid settlement never edited | BUILT, locally verified (2026-11-20) | Migration 43 + admin refunds clawback preview, settlement detail clawback breakdown and zero-net form, vendor finance clawback section, runbook updated. Direct-repayment admin UI built in R-02 (migration 53) — see row below. | 2026-11-20 |
| Direct-repayment admin UI (N-01, D-08 fallback) | Admin can record a vendor's direct repayment of a clawback from the dashboard | BUILT, locally verified (2026-11-21) | R-02 (migration 53): `/admin/settlements` lists outstanding clawbacks with the amount still owed (net of partial applications) and a direct-repayment form per clawback (reference 3–200 chars, confirmed first, RPC is the authority); `record_clawback_direct_repayment` is now called from the dashboard. Local RLS suite `supabase/tests/rls_refunds_test.sql` (TEST 13, TEST 18) passes on disposable Postgres; lint, typecheck, Vitest 472 tests, and `next build` pass. | 2026-11-21 |
| Migration 44 `00000000000044_pending_commission_adjustments.sql` applied on hosted Supabase | Not applied (local-only) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. N-02: pending commission adjustment for pre-delivery refunds — approval while shipped records a pending row (rate from the frozen `order_vendors.commission_rate` snapshot), delivery converts it into an ordinary adjustment, cancel/return voids it visibly. Local RLS suite `supabase/tests/rls_refunds_test.sql` (TEST 14) passes on disposable Postgres; lint, typecheck, Vitest 435 tests, and `next build` pass. | 2026-11-20 |
| N-02 pending commission adjustment (pre-delivery refunds) | Refund approved while shipped reduces the commission earned at delivery, never the full pre-refund amount | BUILT, locally verified (2026-11-20) | Migration 44 + TEST 14 (ship→approve→deliver earns the reduced net; cancel/return voids visibly; partials accumulate to the cap; full refund earns zero net and is excluded from settlement). Admin refunds UI shows the pending reduction on approved cases. | 2026-11-20 |
| Migration 45 `00000000000045_cancel_refund_case.sql` applied on hosted Supabase | Not applied (local-only) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. N-03 (D-09): `cancel_refund_case` + `cancel_guest_refund_case` RPCs, shared cancel form on signed-in and guest order pages, admin queue shows who cancelled and when. Resolution-state CHECK redefined with a narrow guest-only carve-out (guest-cancelled rows carry resolved_by NULL). Local RLS suite `supabase/tests/rls_refunds_test.sql` (TEST 15) passes on disposable Postgres; lint, typecheck, Vitest 435 tests, and `next build` pass. | 2026-11-20 |
| N-03 cancel_refund_case (D-09) | The opener (signed-in or guest, token-verified) can cancel an open case; nobody else can; a resolved case cannot be cancelled | BUILT, locally verified (2026-11-20) | Migration 45 + TEST 15 (opener cancels with no money/stock effect; slot freed; wrong user/admin blocked; both race orders; guest cancel with resolved_by NULL). No admin-cancel or vendor-cancel path by design. | 2026-11-20 |
| N-04 coverage matching (H-06) — VERIFIED ALREADY DONE, no rebuild | Governorate names match tolerantly, area patterns escape LIKE wildcards, contract of `delivery_coverage_allows()` unchanged | VERIFIED ALREADY DONE in migration 37 (P1-06), no new migration | Read migration 37 + coverage code and ran `supabase/tests/rls_delivery_coverage_test.sql` (TEST 4 governorate variants both directions/Arabic/Giza reject/near-miss/checkout-level, TEST 5 LIKE escaping %, a_b, backslash/checkout-level) and `supabase/tests/rls_orders_test.sql` — all pass on disposable Postgres. Migration 37 header states it folds in N-04's matching fixes once; LIKE patterns escaped backslash-first with explicit `ESCAPE E'\\'`, governorates normalised via `normalize_governorate_name` (trim/collapse whitespace/case-fold/strip Governorate/محافظة/Arabic orthography → canonical English, unmappable falls back to case-insensitive trimmed compare, no fuzzy/substring matching); IMMUTABLE, same signature, both lists empty → allow; trigger untouched. | 2026-11-20 |
| Migration 46 `00000000000046_set_order_vendor_status_validation.sql` applied on hosted Supabase | Not applied (local-only) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. N-05: `set_order_vendor_status` (migration 42's 7-arg live version) redefined with the in-RPC transition edge check, placed after every existing validation and before the first write, raising the trigger's exact message (`A vendor suborder cannot move from "%" to "%".`, 23514). The BEFORE trigger is NOT removed or altered. Local RLS suite `supabase/tests/rls_order_audit_test.sql` (TEST 11) passes on disposable Postgres; lint, typecheck, Vitest 435 tests, and `next build` pass. | 2026-11-20 |
| Migration 51 `00000000000051_retire_legacy_order_rpcs.sql` applied on hosted Supabase | Not applied (local-only) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. R-03: drops the legacy no-check checkout RPCs `place_order`, `place_order_with_idempotency`, `place_guest_order`; only `place_order_with_price_check` / `place_guest_order_with_price_check` remain. Test order creation moves to `supabase/tests/test_helpers.sql` (gifto_test helpers, test infrastructure only, loaded by the RLS/concurrency runners, never by a migration). Local RLS suites (TEST 19 in rls_orders_test.sql, TEST 1 in rls_guest_orders_test.sql) pass on disposable Postgres; lint, typecheck, Vitest, and `next build` pass. | 2026-11-21 |
| Migration 52 `00000000000052_d09_inspection_condition_courier_payer.sql` applied on hosted Supabase | Not applied (local-only) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. R-05: `refund_cases.inspection_condition` (good/wrong_item/damaged) recorded by the vendor at receipt, `return_courier_paid_by` derived from it (customer for good, vendor for wrong/damaged) and tied by a CHECK constraint; `restock_refund_case` refuses damaged and wrong-item cases; pre-migration receipts backfilled as good/customer-paid. Local RLS suite `supabase/tests/rls_refunds_test.sql` (TEST 17) passes on disposable Postgres; lint, typecheck, Vitest, and `next build` pass. | 2026-11-21 |
| Migration 53 `00000000000053_settlement_clawback_only.sql` applied on hosted Supabase | Not applied (local-only) | UNVERIFIED (hosted); OBSERVED (local): file present in `supabase/migrations/` | No hosted access; `supabase migration list` not run. R-02: `create_settlement` distinguishes a clawback-only vendor (outstanding clawbacks, no new commission) from a vendor with nothing — the former gets a distinct 23514 error naming the amount still owed and directing the admin to record a direct repayment, and no empty batch is created (an empty batch would burn the clawback or sit unpayable); the latter keeps the generic message. Rollback verified to apply on disposable Postgres. Local RLS suite `supabase/tests/rls_refunds_test.sql` (TEST 18) passes; FIN-001 settlement concurrency passes; lint, typecheck, Vitest 472 tests, and `next build` pass. | 2026-11-21 |
| N-05 in-RPC transition validation | `set_order_vendor_status` rejects illegal edges itself, with the trigger's exact message and no audit event; legal edges unchanged | BUILT, locally verified (2026-11-20) | Migration 46 + TEST 11 (every legal edge succeeds with exactly one event each incl. admin delivered→returned; illegal edges placed→returned/delivered/shipped, delivered→shipped/confirmed, shipped→returned without refund flag, cancelled→confirmed, returned→confirmed/cancelled all rejected with the trigger's message, no state change, no event; with the BEFORE trigger disabled the RPC still rejects placed→returned and legal edges still work; trigger re-enabled and verified). Edge list diffed against migration 35's trigger and `src/lib/orders.ts` — all three agree. | 2026-11-20 |
| Migrations present locally | 53 migration files, 00000000000001–00000000000053 | OBSERVED (local): 53 migration files (+ 1 rollback file for migration 53) | `ls supabase/migrations/*.sql | grep -v rollback | wc -l` → 53 (recounted 2026-11-21, R-02; 53 added by R-02) | 2026-11-21 |
| RLS suites present locally | 16 suites | OBSERVED (local): 16 `*_test.sql` files + `storage_stub.sql` + `test_helpers.sql` | `ls supabase/tests/*_test.sql \| wc -l` → 16 (recounted 2026-11-21, R-03; `test_helpers.sql` added by R-03) | 2026-11-21 |
| Vercel production commit | Equals branch HEAD `34f30a6` if deployed from this branch | UNVERIFIED | No Vercel access in this session; `vercel ls` / dashboard not consulted. Do not assume production serves this HEAD. | 2026-11-20 |
| Production `is_demo` count | 0 | UNVERIFIED | No hosted database access; no read-only count query run. Nothing was deleted. | 2026-11-20 |
| Backups (Supabase) | On, with a known retention window | UNVERIFIED | No Supabase dashboard access in this session. | 2026-11-20 |
| PITR (point-in-time recovery) | On | UNVERIFIED | No Supabase dashboard access in this session. | 2026-11-20 |
| Staging Supabase project | Exists, separate from production | OPEN — does not exist as far as this session can establish | No staging project reference exists in the repo or README; no dashboard access to confirm. Treated as not existing until proven otherwise. **Staging setup task (P0-02):** owner to create a separate Supabase project (disposable data, its own project ref and keys) plus a staging Vercel environment pointing at it; a change reaches staging by deploying the branch there and a second person verifies it before any production deploy. Nothing in this repo can create the hosted staging project. | 2026-11-20 |
| Staging Vercel environment | Exists | OPEN — does not exist as far as this session can establish | No staging environment reference exists in the repo; no Vercel access to confirm. See staging Supabase task above. | 2026-11-20 |
| Monitoring (error tracking / uptime) | Live provider configured | OPEN — wired, not live (P0-02) | Sentry SDK `@sentry/nextjs` installed; `sentry.client/server/edge.config.ts` + `src/instrumentation.ts` added, all no-ops without a DSN (no DSN/key committed). UptimeRobot monitors defined in `docs/monitoring/UPTIME_ROBOT.md` (production homepage, 5-min checks) — **not yet created in the dashboard**, alert contact not yet supplied. **Provider choice (Sentry + UptimeRobot, free tiers) is Muse-recommended only; no separate explicit owner approval was recorded, so it is not an owner-approved decision.** To go live: owner creates a Sentry project and an UptimeRobot account, sets `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` in Vercel, and creates the two monitors. | 2026-11-20 |
| CI | GitHub Actions runs lint, typecheck, Vitest, and all 14 RLS suites on every push/PR | BUILT, NOT YET RUN ON GITHUB (P0-02) | `.github/workflows/ci.yml` created (app job: lint, typecheck, Vitest, build; rls job: disposable `supabase/postgres:17.11.0.003`, all migrations, `scripts/run-rls-suites.sh`). Locally verified 2026-11-20: lint pass, typecheck pass, Vitest 37 files / 357 tests pass, build pass, all 13 RLS suites pass on disposable local Postgres 16 with `scripts/auth-emulation.sql` (13 at the time; 14 after P0-04 added `concurrency_parent_status_test.sql`, all 14 pass — see README "Verifying RLS locally"). **The GitHub Actions run itself has not happened — this branch has not been pushed — so no run link/ID exists yet.** | 2026-11-20 |
| Backup drill | One recorded restore drill with matching row counts | BLOCKED (P0-02) | No backup dump or dashboard backup access was available in this session (no hosted access), so no restore was performed. Runnable procedure added: `scripts/backup-drill.sh <dump> <source counts>` restores into a disposable database and compares orders / order_vendors / commission_entries / settlements counts. To run: owner supplies a backup dump (or dashboard access) plus the source counts. | 2026-11-20 |

## P0-02 notes (2026-11-20)

- **Pre-existing typecheck failure fixed in this prompt:** `src/app/layout.tsx`
  used `LayoutProps<"/">`, a name that does not exist in this codebase
  (introduced in `70a4e14`); typecheck failed on the base HEAD. Fixed
  minimally to `{ children: ReactNode }` with a `ReactNode` import. Without
  this fix CI could never be green. Vitest and lint already passed on base.
- **Build required a database at build time:** `src/app/sitemap.ts` queried
  the catalog while prerendering, so `next build` failed without
  `NEXT_PUBLIC_SUPABASE_URL` and hung on a dummy URL. The sitemap is now
  `export const dynamic = "force-dynamic"` (live catalog data is generated
  per request, not baked in at build). Build now passes with only
  `NEXT_PUBLIC_SITE_URL` set. Runtime behaviour is unchanged apart from
  sitemap freshness.
- **RLS verification (first real run of the owner-reported claim):** all 13
  suites pass on disposable local Postgres 16 (2026-11-20, ~29s), after
  applying migrations 1–30 plus `storage_stub.sql` and the test-only
  `scripts/auth-emulation.sql` (emulates the Supabase platform's `auth`
  schema/roles on plain Postgres; skipped automatically where `auth.users`
  already exists, i.e. in the CI container). No suite was weakened, skipped,
  or edited. Three initial failures were gaps in the emulation itself
  (missing USAGE on the `auth` schema, `service_role` without BYPASSRLS) and
  were fixed in the emulation file only.
- **What CI still needs:** a push of this branch so GitHub Actions actually
  runs (no push was made in this session).

## P0-06 notes (2026-11-20) — legal pages approval state (H-16, still Partial)

All six routes verified present and footer-linked: `terms`, `privacy`,
`refund-policy`, `delivery-returns`, `help`, `contact` under
`src/app/(storefront)/`, sharing `src/components/policy-page.tsx`.

- **Checkout link (done):** `src/app/(storefront)/checkout/checkout-form.tsx`
  now shows Terms / Privacy Policy / Refund Policy links plus the line
  "By placing this order you agree to the Terms, the Privacy Policy and
  the Refund Policy" directly under the place-order button. No blocking
  checkbox (owner did not ask for one), no checkout redesign.
- **D-09 returns terms (done, from the owner decision recorded in P0-00):**
  `/refund-policy` and `/delivery-returns` now state the decided terms in
  customer language — 7 days from delivery, suborder-level, Gifto approves
  and the shop inspects, return courier paid by the customer unless the
  gift is wrong/damaged (then the shop pays), inspect-then-restock manually,
  never automatic. Their `reviewItems` gap lists were trimmed to what D-09
  does not answer. The refund-policy page also notes that a still-placed
  order can be cancelled from its order page (true for signed-in and guest
  orders since P0-05).
- **Approval: NONE supplied in this session.** No owner/lawyer approval of
  the final wording of any of the six pages, and no legal entity or contact
  details, were supplied. The draft banner ("Publishing status") therefore
  remains on **all six pages** — nothing was removed, and no page is final.
- **Still missing, per page (the in-page gap lists are the spec):**
  - Terms: legal entity + registered address + formal notice details;
    final liability / dispute-resolution / governing-law / jurisdiction
    wording; approved cancellation, suspension, account-closure rules;
    process for reporting unlawful/infringing content.
  - Privacy: entity name, registered address, data-controller contact;
    retention periods; access/correction/deletion process and response
    time; international-transfer and processor disclosures.
  - Refund policy: refund timing and method for COD orders; how damaged
    items are assessed and what evidence is needed; approved rules for
    replacements and for perishable/personalised gifts; formal escalation
    route if shop and customer cannot agree.
  - Delivery & returns: refund timing/method for COD; public support
    channel and response-time expectations.
  - Help: public support email, phone/WhatsApp, support hours; final
    seller-onboarding and invitation process.
  - Contact: public support email; phone/WhatsApp number and hours;
    registered business name and address.
- **Decided but NOT promised on the customer pages:** D-09 also says a
  customer can cancel their own open refund case — that is now built
  (N-03: `cancel_refund_case` RPC + UI, 2026-11-20), but the legal pages
  do not yet state it.
- **H-16 remains Partial.** It closes only when the owner/lawyer approves
  the final wording per page, the missing details above are supplied, and
  the banner is removed from the approved pages.

## P1-12 notes (2026-11-20) — auth and server-action rate limiting (H-12)

- **Step 1 (dashboard verification): NOT DONE — no access.** This session
  has no Supabase dashboard access and the task forbids hosted access, so
  the project's Auth rate limits, JWT expiry, and password policy are
  recorded UNVERIFIED in the table above, not assumed. Read them from the
  dashboard before launch.
- **What was built:** migration 39 (`auth_rate_limits` table +
  `consume_auth_quota` RPC, service-role only, mirroring migration 11's
  checkout quota shape); `src/lib/rate-limit.ts` (shared helper, 12 Vitest
  cases); `supabase/tests/rate_limits_test.sql` (new 15th RLS suite).
- **Limits (`src/lib/rate-limit.ts`, all windows rolling):** login IP 20/15
  min + per-email 10/15 min; signup IP 5/hr; password-reset request IP 5/hr
  + per-email 3/hr; password reset IP 10/hr + per-account 5/hr; order
  recovery IP 5/hr + per-target 5/hr; order claim IP 10/hr + per-order 5/hr;
  order cancel/refund IP 20/hr + per-order 5/hr; admin/vendor mutations
  per-account 120/hr + IP backstop 300/hr. The P1-01 reset and P1-02
  recovery guards were moved off the checkout quota table onto the auth
  table and now also carry an account bucket.
- **Fail-closed (step 3):** every auth quota check fails closed — a
  quota-service error denies the attempt with the retry message. The
  previous fail-open behaviour in the reset/recovery guards is gone.
  Checkout keeps its own fail-open behaviour; this prompt does not change
  it.
- **IP retention:** raw IPs are never stored or logged. Buckets are SHA-256
  hashes of scope + caller key; rows are pruned after 2 days by the RPC's
  opportunistic cleanup.
- **Login/signup gate:** those flows call Supabase Auth directly from the
  browser, so there is no server action to gate. `AuthForm` now calls
  `checkLoginQuota` / `checkSignupQuota` (new
  `src/app/[locale]/(auth)/quota-actions.ts`) before touching Supabase
  Auth; a refusal shows the retry message and the Auth call is skipped. A
  caller who talks to Supabase Auth directly bypasses this gate and relies
  on Supabase's own (UNVERIFIED) Auth limits.
- **Coverage:** all 38 admin/vendor mutation actions are gated
  (`checkMutationQuota` right after `requirePlatformAdmin()` /
  `requireVendorRole()`), plus login, signup, both reset actions,
  recovery, claim, both cancels, and all four refund actions. Deliberate
  skips: `loadProductPickerPageAction` (a read, not a mutation) and vendor
  `createSupportRequest` (already limited by the migration-23 DB trigger,
  5/15 min per account — stricter than the app quota).
- **Step 4 (CAPTCHA): OPEN.** No CAPTCHA provider was added unilaterally.
  Owner to decide before launch; see the table row above.

## What would unblock verification

- A Supabase CLI login (`supabase login`) plus the project database password,
  run read-only (`supabase migration list`, read-only `is_demo` count query),
  by the owner or an agent with hosted read access.
- Vercel dashboard / CLI read access for the production deployment commit.
- Supabase dashboard read access for backups, PITR, and staging project
  existence.

Until then, **do not deploy or pilot on an assumed hosted state**. In
particular, do not assume migrations 28–30 (refunds, order audit, delivery
coverage) exist on the hosted project — the only evidence is that they are
local files.

## Pre-existing verification failure found during P0-00 (not a hosted fact)

`npm run typecheck` fails on the base HEAD with one error, before any P0
change (P0-00 touched `docs/DECISIONS.md` only):

```
src/app/layout.tsx(67,50): error TS2304: Cannot find name 'LayoutProps'.
```

`LayoutProps` is used but never defined or imported in that file (introduced
in commit `70a4e14`, SEO phase). `npm run lint` passes; `npm run test`
(Vitest) passes — 37 files, 357 tests. The owner-reported claim that
"typecheck passes" on HEAD `34f30a6` is therefore **not verified — it fails
in a clean `npm ci` run**. This is a pre-existing finding, recorded here so
P0-02 CI is not blamed for it; it must be fixed before CI can ever be green.
**Update (P0-02, 2026-11-20): fixed** — `layout.tsx` now uses
`{ children: ReactNode }`; `npm run typecheck` passes. See "P0-02 notes"
below.

## UX Batch 1 — Accessibility + gift-shopper features (2026-11-20/21)

Baseline UI/UX rating 6.5/10 (up from ~5.5 at audit). This batch is worked
in the discovery loop ahead of remaining P2 backend work, on branch
`muse/p0-fixes`, local only, no push.

### Theme decision — LIGHT-ONLY (recorded 2026-11-20)

Gifto ships light-only. There is no dark mode, no `dark:` variant anywhere
in `src/`, and no theme toggle. This is deliberate, not an omission: the
brand palette (warm ivory paper, berry, gold) is defined once in
`src/app/globals.css` and every surface is built against it. Adding a dark
theme is a separate piece of work that needs an owner decision and a full
pass over every surface — a partial dark theme (some pages dark, some
light) would be worse than none. No UI doc exists in the repo, so this
file and the comment at the top of `globals.css` are the record.

### Accessibility (commit 1)

- Skip link: the storefront layout renders a "Skip to main content" link
  targeting `#main-content` (the storefront `<main>`, `tabIndex={-1}`).
  Admin/vendor dashboards already had their own skip link to
  `#dashboard-main` (`src/components/dashboard/dashboard-shell.tsx`) and
  are unchanged.
- Toast / announcement system: `src/components/toast-provider.tsx`
  (mounted once in the root layout) + `src/lib/toast.ts`. `notify()` shows
  a toast on the current page; `flash()` stores one in sessionStorage and
  the provider drains it on the next mount/navigation, so success/error
  feedback survives a navigation. Stored toasts are consumed exactly once
  and expire after 30s. The region is `aria-live="polite"` (`role="alert"`
  for errors). Existing per-component `aria-live` feedback (quick add,
  purchase panel) is kept and is NOT duplicated through toasts. Wired so
  far: cart remove / clear.
- Loading states: `loading.tsx` added for product detail
  (`shops/[slug]/[productSlug]`) and checkout, mirroring the existing
  search skeleton. Cart already had a loading state; admin/vendor already
  had `loading.tsx`.
- Toast wiring added later in this batch: order placed (flash, survives
  the navigation to the order page), reorder result (added / reduced /
  skipped, named), cart gift draft changes need no toast (the form
  itself is the feedback).

### Gift-shopper data (commit 2, migration 47)

- New tables `wishlists` (unique `(user_id, product_id)`, owner-only RLS)
  and `saved_addresses` (label/recipient/phone/address/city/governorate/
  notes, `is_default`, one default per customer via partial unique
  index). `orders` gains `gift_wrap` (free, no commission effect),
  `gift_message` (≤500), `preferred_delivery_date` (tomorrow..+14 days),
  `delivery_time_note` (≤200). Both price-check checkout RPCs accept
  the four fields as optional parameters, so existing 11-argument
  callers keep working. Rollback steps are in the migration header.
- Gift wrap is FREE by design — no owner decision for a wrap charge
  exists; if a fee is ever decided it must be priced by the database
  like all other money fields.

### Wishlist (commit 3)

- Save from product cards (quick-add and plain), product pages, and a
  `/wishlist` page (image/name/vendor/price, sold-out state, add to
  cart, remove with toast). Guests keep a localStorage wishlist;
  signed-in customers sync to the database (failed server writes roll
  the local change back). Header link with count badge, account links.
  This completes the owner's "finish wishlist UI" step.

### Gift wrap / message / delivery preference at checkout (commit 4, migration 48)

- Checkout gains a "Make it a gift" section (wrap checkbox, message,
  preferred delivery day, free-text time note) and a saved-address
  picker for signed-in customers (default address pre-fills delivery
  fields); the cart page shares the same gift draft through a
  `useSyncExternalStore` gift-options store (localStorage), so cart
  and checkout stay in step without hydration mismatches.
- Gift details show on the signed-in and guest order pages, the vendor
  order desk (vendors must see wrap/message/day to fulfil) and the
  admin order detail. Migration 48 adds the four fields to
  `get_guest_order` (RLS TEST 9).

### Address book (commit 5)

- `/account/addresses`: list (default first), add, set-as-default,
  delete with confirm. First address saved becomes the default;
  deleting the default promotes the oldest remaining address. Actions
  are owner-scoped twice (requireUser + `user_id` filters, RLS second
  boundary). Client/server validation mirrors migration 47's checks.
  Linked from the account page and the header account menu. Editing
  an address is deliberately not included — addresses are snapshots,
  so a customer adds a new one and deletes the stale one.

### Reorder (commit 6, migration 49)

- "Order these again" on the signed-in order detail page and the guest
  order page. Lines resolve server-side against LIVE prices and stock
  (uncached `loadLiveProductsByIds`): only still-listed, in-stock
  lines from shops still accepting orders are re-added, quantities
  clamp to live stock and the per-line maximum, duplicates merge, and
  removed products are skipped by name. The customer is told what was
  skipped or reduced in a toast, then lands on the cart to review
  before paying. Migration 49 adds `product_id` to
  `get_guest_order`'s item shape (RLS TEST 10); the id is already
  public on product pages.

### Still OPEN after this batch

- **No courier slot system.** The preferred delivery day is a
  *preference* the shop sees; shops still arrange delivery by phone
  per the existing model (migration 29 coverage). A real slot system
  needs a courier decision — recorded in the migration 47 header.
- Reviews, vendor/admin mobile polish, and any further UX work are
  not in this batch. The owner's WhatsApp plan (2026-11-21) sequences
  R-01, R-03, R-05, R-02, R-04/R-06 next, then remaining UX (reviews,
  vendor/admin mobile) and re-audit v4 — reorder and delivery
  preference in this batch overlap that plan's "remaining UX" list;
  the parent orchestrator should reconcile.
- Pre-existing, untouched by this batch: no SMTP provider chosen (no
  email actually leaves the app), monitoring wired but not live (no
  DSN), hosted state UNVERIFIED.

### Progress note

- UX Batch 1 is complete: accessibility, wishlist, gift wrap/message,
  delivery preference, address book, reorder — all six items built,
  tested and committed (see commits below). Vitest 466 (was 435 at
  base), RLS suites 16 (was 15), migrations 49 (was 46). UI/UX rating
  is not re-scored here — that is the re-audit's job (v4).

## R-01 — voided settlement restores consumed clawbacks (2026-11-21)

- Migration 50 redefines `void_settlement(uuid, text)` only: before the
  batch is marked voided, every `clawback_applications` row for the
  settlement is deleted and any clawback it had flipped to `consumed`
  is restored to `outstanding` with `consumed_at` cleared. Partially
  applied clawbacks stay `outstanding`; deleting their application
  restores the un-applied portion. `direct_repayment` clawbacks are
  never restored. The voided batch's `total_minor` / `clawback_minor`
  are unchanged (historical snapshot; rls_commissions TEST 14 asserts
  void never changes the original total).
- Regression test: `rls_refunds_test.sql` TEST 16 — create a settlement
  netting a -500 clawback (total 1500), void it (clawback outstanding
  again, no applications left, voided total unchanged), create the
  next settlement (total 1500, clawback re-netted exactly once), pay
  the net 1500 with proof. Rollback in
  `supabase/rollbacks/00000000000050_void_settlement_restore_clawbacks_rollback.sql`
  restores the migration-18 definition; verified to apply.
- Verification: lint, typecheck, Vitest 466, full RLS 16/16, build —
  all pass. Migrations now 50. R-01 is CLOSED in code; hosted apply
  is still UNVERIFIED (no hosted access).
