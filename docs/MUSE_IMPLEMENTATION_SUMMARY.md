# Gifto — Implementation Summary (autonomous improvement mission)

Branch `muse/gifto-autonomous-improvement`, HEAD `c5c2bdf`
(43 commits above base `b369412`, the post-merge main of 2026-11-23).
Nothing pushed, merged, deployed, or written to any hosted system.
Tree clean at `c5c2bdf`.

## What was investigated

The mission was: take the branch from the merged P0/P1 state through
P2–P6, then run a full-site test pass and fix loop, and record the
results. The work was done in five batches plus the final pass,
verified-first throughout: every QA finding was checked against the
actual code before any fix, because the live deployed site (older
build) had produced phantom findings. The five "failing to load" admin
pages, the vendor Orders list, admin order detail, and the vendor
staff list were all VERIFIED-WORKING in current code — no change was
made for them.

## What was implemented, by batch

### Batch 1 — P0 demo containment + P1 financial correction (5 commits, HEAD `5308032`)

- **Migration 67** demo containment: `app_settings`
  (`demo_orders_allowed`, default false) + `_create_order` rejects
  demo vendors transactionally + rollback. Deployment order: apply
  migration 67 BEFORE deploying the app code that reads
  `app_settings`.
- App layer: `src/lib/demo-containment.ts`, placeOrder pre-check,
  demo-owner resume refusal, paused treatment on product/shop/buy-now
  pages; `database.types.ts` gains `app_settings` + `vendors.is_demo`.
- RLS suite TEST 1–8 + 5 unit tests.
- P1 C1 correction: `supabase/corrections/` + `scripts/rehearse-c1.sh`
  + seed; rehearsal ALL CHECKS PASSED. C1 never executed against
  production.
- TEST 21 double-mark-paid refusal + TEST 22 re-batch after void.

### Batch 2 — P2 dashboards, verified-first (20 commits, HEAD `d300047`)

- Vendor order-detail page with confirm/ship/close + refund link.
- Product delete requires typing the exact product name (UI + server
  re-check). Shared `ConfirmSubmit` for one-click money/destructive
  actions. Customer contact masking in admin orders list.
  Returned-order commission notes. Working Try again on load errors.
- Mail outbox no longer contradicts itself; Retry disabled while SMTP
  off.
- Migration 68 `ramdan-night` → `ramadan-night` with redirect +
  public preview per occasion. Migration 69 admin in-app replies on
  support requests (`admin_reply`/`replied_at`/`replied_by` + RLS
  TEST 20).
- CSV exports (vendor finance, admin commissions); sorting +
  required stock-change reason; filter-pill pending states; centred
  occasion delete dialog.
- One regression caught and fixed during final gates (`d300047`
  finance pagination).

### Batch 3 — P3 security + P4 UI/UX/perf (9 commits, HEAD `7548861`)

- `safeDbError` helper: vendor/admin/storefront actions no longer
  return raw database error text (constraint names, RLS policy text).
- Quota-gate service failure now shows a distinct "unavailable"
  message instead of the false "Too many attempts" lockout (the
  2026-11-22 lockout root-cause class).
- Shared magic-byte image verification on all upload surfaces
  (product images, vendor branding, occasions); preflight checks all
  three image buckets.
- Vendor finance tabs got the pending-state treatment; admin products
  CSV export; migration 70 window indexes (orders + commission
  entries).
- Verified with no change needed: auth/session guards, CSP/security
  headers, Storage policies, no N+1 queries, all lists paginate.

### Batch 4 — P5 demo separation + P6 validation (6 commits, HEAD `04b48d3`)

- `GIFTO_ENVIRONMENT` parsing (production/staging/demo/development,
  unknown values throw) + demo/staging environment banner in the root
  layout.
- Mail demo guard: no real email from a demo environment unless
  `GIFTO_DEMO_ALLOW_EMAIL=true`; blocked sends still enqueue; outbox
  processing refuses without touching a row.
- Demo-script target guard (seed/cleanup/passwords refuse unless
  `GIFTO_ENVIRONMENT=demo`, https only, refuse the known production
  project ref unless explicitly opted in) + new
  `scripts/reset-demo.mjs` and `npm run demo:reset`;
  `docs/DEMO_SEPARATION_CHECKLIST.md` (owner steps for isolated
  Supabase + Vercel demo projects, retiring production demo data).
- Migration 70 rollback added (67–70 all have rollbacks now).
- Behaviour change for the owner: demo scripts now refuse without
  `GIFTO_ENVIRONMENT=demo` set.

### Final pass — full-site test + fix loop (3 commits, HEAD `c5c2bdf`)

- **`50dc6da`** fix(admin): disambiguate support queue creator embed
  (PGRST201). Migration 69's `replied_by` FK made the
  `creator:profiles(...)` embed ambiguous; the support queue failed
  to load. Exported `ADMIN_SUPPORT_REQUEST_COLUMNS` with an explicit
  FK-qualified embed + 2 regression tests.
- **`17d440b`** fix(mail): `notifyOrderPlaced` must never throw and
  fail checkout. It was the only order notifier without a try/catch;
  `getSiteUrl()` throws on localhost in production, which turned an
  already-placed order into a customer-facing failure with no
  notification. Wrapped in try/catch like its siblings + 2 tests.
  Live-verified on the prod build.
- **`c5c2bdf`** fix(refunds): make cancelled-suborder approval
  explicit in `resolve_refund_case` (N-02). Migration 71 + rollback +
  RLS TEST 14f. No behaviour change.

## Most important bugs fixed

1. **Checkout could fail after the order was placed** (F-03) — a
   missing try/catch in the one mail notifier turned a notification
   failure into a customer-facing order failure. The money path now
   cannot be broken by the notification path.
2. **Admin support queue failed to load** (F-02) — an ambiguous
   PostgREST embed (PGRST201) emptied the queue. One FK-qualified
   embed fixed it.
3. **Pre-delivery refunds silently over-earned commission** (N-02,
   migration 44) — now recorded as pending adjustments converted at
   delivery, and the last silent path (cancelled before approval) is
   explicit and tested (migration 71).
4. **Demo vendors could keep taking orders in production** (P0,
   migration 67) — transactionally refused, with an app-layer
   pre-check and paused treatment.
5. **False lockouts** (Batch 3) — quota-gate service failures no
   longer present as "Too many attempts".
6. **Raw database errors leaked to clients** (Batch 3) — `safeDbError`
   everywhere.
7. **Fake images could be uploaded** (Batch 3 + final pass) —
   magic-byte verification on all upload surfaces, verified end-to-end
   with a real upload.

## Files created / modified (branch diff vs `b369412`)

147 files changed, 9,324 insertions, 698 deletions. Headline
additions: `src/lib/demo-containment.ts`, `src/lib/safe-db-error.ts`,
`src/lib/environment.ts` (+ banner component), mail demo guard in
`src/lib/mail.ts`, `src/lib/image-upload.ts` (shared magic-byte
validation), `scripts/reset-demo.mjs`, `scripts/rehearse-c1.sh`,
`supabase/corrections/`, `docs/DEMO_SEPARATION_CHECKLIST.md`,
migrations 67–71 (+ rollbacks in `supabase/rollbacks/`), the four
`docs/MUSE_*.md` reports in this final pass, and RLS TEST 14f in
`supabase/tests/rls_refunds_test.sql`.

## Tests and exact results (final HEAD `c5c2bdf`, 2026-11-23)

| Gate | Result |
|---|---|
| Lint (`npm run lint`) | PASS |
| Typecheck (`npm run typecheck`) | PASS |
| Vitest (`npm run test`) | **674/674, 75 files** (670 at Batch 4; +4 from F-02/F-03 tests) |
| RLS suites (`scripts/run-rls-suites.sh`, disposable Postgres 16.15) | **18/18 PASS** |
| Production build (`npm run build`, local Supabase env) | PASS |
| C1 rehearsal (`scripts/rehearse-c1.sh`, disposable DB) | **ALL CHECKS PASSED** |
| node:test (preflight + demo-target guard) | **13/13 PASS** |
| Migration chain 1–71 | Applies cleanly fresh (proven 18× by the RLS runner); rollback 71 round-trips |
| HTTP crawl (66 routes, all sessions) | 0 error markers; all 16 admin + 9 vendor sections 200 |
| Live action verifications | Guest checkout (prod), demo mail guard, magic-byte upload, PRICE_CHANGED, support reply, vendor confirm/ship, CSV exports, slug redirect — all verified (see `docs/MUSE_TEST_RESULTS.md`) |
| Secret scan over the branch diff | 0 matches; `git diff --check` clean |

## What remains unverified

- **Browser rendering/interaction** for: finance tab pending state,
  ConfirmSubmit flows, support preview, CSV download behaviour,
  filter-pill pending state, wishlist client sync, environment banner
  visuals. Playwright execution is blocked (Chromium download failed,
  approval timed out — do not retry without the owner's approval).
- **404 empty DOM** (F-01): root cause established, recorded, no
  small safe fix.
- **Owner-side blockers**: see `docs/MUSE_PRODUCTION_BLOCKERS.md`.
