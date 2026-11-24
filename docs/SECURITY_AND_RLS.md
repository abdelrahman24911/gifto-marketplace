# Gifto — Security & RLS

- **Audit date:** 2026-11-24
- **Worktree:** `~/workspace/gifto-master-audit`, HEAD `54c780b`
- **Sources:** specialist security report (`/tmp/gifto-audit/security.md`, 18 issues); live hosted verification (`DATABASE_AND_MIGRATIONS.md` §2); testing re-run (`TESTING_AND_QUALITY.md` §2).
- **Headline change vs the specialist report:** the P0 was conditional on the hosted migration dispute. Hosted verification has now resolved it — migrations 1–71 are applied and policy definitions match with zero real drift. The P0 is therefore **closed as framed**, and the top live risks are the four P1s.

## 1. Findings summary

| Severity | Count | Status |
|---|---|---|
| P0 Critical | 1 | **Closed by hosted verification** (was conditional, not a code defect) |
| P1 High | 4 | Open — all bypass / fail-open / over-exposure paths around otherwise sound controls |
| P2 Medium | 8 | Open |
| P3 Low | 5 | Open |

No verified P0 code vulnerability was found in the worktree: every server action inspected gates on a server-verified session, RLS is enabled on all 40 public tables, no `using (true)` / fail-open policy exists, no hardcoded secret was found, and magic-byte upload validation covers all three upload surfaces.

## 2. P0 — closed by verification

### P0-1 — Hosted application of migrations 28–71 was UNKNOWN and disputed — CLOSED

The specialist report made every RLS/policy finding conditional on migrations 28–71 being applied on hosted, noting that if hosted were behind, the live database would enforce old policies/RPCs (guest tokens never expire server-side, auth quota absent, cancelled-refund approval implicit, demo containment absent) while deployed app code assumed the new behaviour — and the app cannot detect this drift at runtime (no migration-version check in `src/`).

**Resolution (verified live 2026-11-24):** hosted `schema_migrations` holds all 71 versions; courier columns, payout-proof columns, auth-quota RPC, demo-containment flag, and all 120 RLS/storage policies match the repo with zero real drift. The conditional premise is false. What remains true from P0-1: **the app still has no runtime migration-version check** — a future drift would again be silent. That residual is carried as a P2-level hardening item (roadmap Phase 2), not a P0.

## 3. P1 — High (all open)

### P1-1 — App-level auth rate limiting is bypassable; Supabase's own Auth limits are UNVERIFIED

Login/signup call Supabase Auth directly from the browser (`src/components/auth-form.tsx` → `supabase.auth.signUp` / `signInWithPassword` with only the public anon key). The client calls `checkLoginQuota` / `checkSignupQuota` first, but a caller who talks to Supabase Auth directly bypasses the app-level gate entirely and relies on Supabase's own Auth limits, which are **UNVERIFIED** (dashboard setting, no access in this audit). The app gate itself is sound and fail-closed (login 20 IP / 10 per-email per 15 min; signup 5 IP/hr; `checkAuthQuota` returns `limited: true` on any quota-service error). The 2026-11-22 sign-in lockout was the fail-closed side of this same gate. **Fix:** verify Supabase Auth dashboard limits + CAPTCHA, and record the result; consider moving login/signup behind a server action so the quota gate cannot be bypassed.

### P1-2 — Signed-in checkout proceeds when the quota service is unavailable (fail-open); only guests are blocked

If the quota table/RPC is down (or the migration missing), an authenticated account can place unlimited orders — inventory exhaustion, fake COD orders, price-consent probing — with no rate limit. The 60/hour/IP checkout limit (`CHECKOUT_RATE_LIMIT = 60`, `checkout/actions.ts:40`) silently disappears for signed-in users in exactly the degraded state an attacker would want. Guests are blocked in the same state. **Fix:** fail closed for signed-in checkout too (owner decision R-04, still open — see `LAUNCH_READINESS.md`).

### P1-3 — Vendor staff (lowest role) can read full customer PII; vendor views apply no masking

A staff account — the role most likely to be shared, phished, or held by a short-term worker — gets the full name/phone/email/home address of every customer who ordered from that shop. Masking (`mask-contact.ts`) exists only in the admin orders list. Combined with P1-4, an owner can silently expose customer PII to an arbitrary existing account. **Fix with P1-4:** mask PII in vendor list views and gate full contact to owner/manager; add a staff-vs-manager PII test.

### P1-4 — Vendor staff invites grant membership immediately, before the invite is accepted (or even delivered)

Any shop owner who knows (or guesses) an existing Gifto user's email can silently add that account to their shop — the account immediately passes `requireVendorRole()` and can read the shop's orders/finance (P1-3) without ever consenting or even knowing. For new accounts the invite link is the only gate, but the membership already exists if the email never arrives. This is a privilege grant without acceptance, not a UX wart. **Fix:** add an invite `status` + acceptance step; membership becomes effective only on acceptance.

## 4. P2 — Medium (all open)

| ID | Issue |
|---|---|
| P2-1 | Revoked/banned sessions remain usable for reads until JWT expiry; transient Auth-server failures fall back to trusting local claims. |
| P2-2 | No schema-validation library (zod absent); validation is hand-rolled per action and inconsistent. |
| P2-3 | No explicit CSRF protection found; reliance on framework behaviour is unverified (no negative test). |
| P2-4 | Public read surfaces have no rate limiting — scraping / enumeration / DoS (`/api/gift-finder` is public and unthrottled; only two API routes exist). |
| P2-5 | Raw Supabase Auth error text is returned to the browser on login/signup (user-enumeration / info-leak surface). |
| P2-6 | No central audit trail for admin/vendor mutations — only order-centric events are logged (see A-24). |
| P2-7 | Service-role client is used in unauthenticated code paths; a single RPC bug becomes a full RLS bypass. The service role is used at 16 sites; each needs its own authorization reasoning. |
| P2-8 | Email-notification failure is silent to the user/admin (logged only); no alerting on outbox backlog. |

## 5. P3 — Low (all open)

| ID | Issue |
|---|---|
| P3-1 | `.env.example` discloses the production Supabase project ref. |
| P3-2 | Guest cookie `secure` flag is off outside production. |
| P3-3 | Server-action body size limit is 30 MB (`next.config.ts`, `serverActions.bodySizeLimit: "30mb"`). |
| P3-4 | CSP allows `'unsafe-inline'` for styles; JSON-LD is the only inline script and is nonce-protected. |
| P3-5 | `x-forwarded-for` handling trusts the last hop; IP-based buckets can be skewed behind shared proxies. |

## 6. Verified strengths (do not regress)

1. **RLS on all 40 public tables**, 133 `CREATE POLICY` statements (121 distinct names); no `using(true)`; no fail-open policy.
2. **Four tables intentionally policy-less / service-role-only:** `app_settings`, `auth_rate_limits`, `checkout_rate_limits`, `guest_recovery_tokens` — verified live as zero-policy tables whose grants restrict them to the service role. **Open question:** confirm this posture is intentional for `app_settings` (which the app reads) vs an oversight — carried as a follow-up, not a finding.
3. **Guest tokens:** 256-bit, SHA-256-hashed, 7-day expiry; single-use recovery semantics.
4. **Magic-byte upload validation** on all three upload surfaces (product images, vendor logo/cover, occasion images) — extension-only validation nowhere.
5. **Money paths are single-RPC with `FOR UPDATE` row locks**; settlement payment atomic under concurrency (FIN-001 PASS, re-run in this audit).
6. **Error handling does not leak internals (mostly):** `safeDbError()` (friendly-code allow-list 23514/42501/22023 + internal-fragment denylist) used at 54 call sites. Exceptions: P2-5 (Auth errors) and two `error.message` passthroughs in `admin/actions.ts:197` and `vendor/settings/staff/actions.ts:146` — both `getSiteUrl()` configuration errors, low risk.
7. **Rate-limit design is careful:** SHA-256-hashed buckets (no raw IPs stored/logged), per-scope IP + account buckets, atomic `consume_auth_quota` upsert, 2-day pruning (migration 39), service-role-only RPC, fail-closed for auth/admin/vendor scopes (P1-2 is the checkout exception).
8. **Cron route is fail-closed:** Bearer `CRON_SECRET` timing-safe compare, 503 when unconfigured, 401 on wrong secret.
9. **No hardcoded secrets** found; credentials are env-only per owner decision. Secret scan 0 matches at `c5c2bdf` (one-off manual check, not a CI gate — see `TESTING_AND_QUALITY.md` T-07).
10. **Vendor isolation verified:** RLS tests assert a vendor sees only its own suborders/products/images and a pending shop sees nothing; the app layer reinforces it (`requireVendorRole()` + `.eq("vendor_id", …)` on every vendor page/action inspected). **Admin privilege paths:** single `is_platform_admin` boolean on `profiles`, checked server-side on every admin layout/action plus RLS admin policies; no second admin tier; MFA status **Unknown** (dashboard setting).

## 7. RLS test suite — coverage and gaps

- **Inventory:** 18 SQL suites (`supabase/tests/*_test.sql`), 17,294 lines, 469 `TEST … PASSED` markers. Suites are destructive by design and refuse to run unless `gifto.rls_test_disposable = 'yes'` is set — a good guard. Assertions are psql `RAISE`-on-failure (no pgTAP); any failure aborts the suite non-zero.
- **Re-run in this audit:** **18/18 PASS** on a fresh disposable local Postgres 16.15 (see `TESTING_AND_QUALITY.md` §2). Note the version/image difference: CI uses the Supabase `postgres:17.11.0.003` image; this audit's run exercised the auth-emulation path on PG 16.15. The pass proves the SQL against PG 16.15 + emulation, not against the Supabase 17.11 image CI uses.
- **Hosted RLS:** policy *definitions* verified live (120/120 by name, 0 real differences) — but definitions are not behaviour. Hosted RLS *enforcement* (policies actually applied by hosted PostgREST/Auth) was not behaviour-tested; that needs a hosted read-only probe, not a local suite.
- **Gaps (no tests exist):**
  - No storage-policy tests for the `vendor-media` / `occasion-images` buckets (suites use `storage_stub.sql` — storage RLS is tested against a stub, not real Supabase Storage).
  - No server-action authorization tests.
  - No CSRF / CSP-production / Auth-dashboard tests.
  - No staff-vs-manager PII test (P1-3) and no invite-acceptance test (P1-4 — there is no acceptance step to test).
  - No test for the mail-outbox write path / requeue race at SQL level, guest-recovery-token single-use/expiry race, or checkout quota fail-open (P1-2).
  - The suite tests the migration files as applied in order; it cannot catch hosted drift (now resolved for this run by the live comparison, but there is no ongoing guard).

## 8. Other areas checked (no finding above P3, or verified sound)

- **Password / magic-link flows:** password auth + email confirmation via Supabase Auth; password reset via admin `generateLink({type: "recovery"})` sent through Gifto's own SMTP module with a generic reply; staff invites via `generateLink({type: "invite"})` (P1-4 for membership timing). No OTP sign-in flow. Password strength / breach detection / MFA: **Unknown** — dashboard settings, not in repo.
- **Proxy trust:** `src/proxy.ts` refreshes auth cookies per request, guards `/account`, `/admin`, `/vendor` (convenience only; pages re-check), sets the per-request CSP nonce. It does not trust `x-forwarded-for` for auth decisions — only for rate-limit bucketing (P3-5).
- **Logging:** `console.error` only (rate-limit, mail, checkout paths); no PII/tokens/secrets in the logged fields inspected. No structured audit log (P2-6). Sentry configs exist and are no-ops when DSNs are unset; whether Sentry is configured on hosted is **Unknown**.
- **API abuse surface:** only two API routes — `/api/cron/mail-outbox` (fail-closed, verified) and `/api/gift-finder` (public, unthrottled — P2-4). All mutations are server actions.

## 9. Recommended fix order

1. **P0-1 — done** (hosted verification in this audit). Residual: add a runtime migration-version check so future drift is not silent.
2. **P1-1 + P1-2:** verify Supabase Auth dashboard limits/CAPTCHA; fail closed on signed-in checkout quota failure (owner decision R-04).
3. **P1-3 + P1-4 together:** mask vendor-list PII, gate full contact to owner/manager; add invite `status` + acceptance before membership is effective.
4. **P2-6 + P2-8:** admin audit log + terminal-mail-failure alerting (cheap, high forensic value).
5. **P2-2 / P2-3 / P2-5:** zod validation, CSRF negative test, generic Auth error strings.
6. **Test gaps:** storage-policy tests against real Storage, server-action authorization tests, staff-vs-manager PII test.
