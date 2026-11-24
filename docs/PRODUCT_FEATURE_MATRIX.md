# Gifto — Product Feature Matrix

- **Audit date:** 2026-11-24
- **Worktree:** `~/workspace/gifto-master-audit`, HEAD `54c780b`
- **Source:** specialist inventory (`/tmp/gifto-audit/features.md`, 100 features, full per-feature evidence) reconciled against live hosted verification (`DATABASE_AND_MIGRATIONS.md` §2).
- **Method:** read-only route/server-action/lib/migration/test inventory. No Playwright run, no Chromium download. Hosted verification is now **complete** (see §1) — this supersedes the specialist report's "Hosted: UNKNOWN for every feature".

## 0. Status definitions

- **DONE** — implemented AND adequately tested (unit + integration/RLS and/or E2E evidence in repo).
- **IMPLEMENTED** — exists in code and wired to a real backend; verification incomplete in some dimension (typically: E2E not run in CI, or a runtime behaviour never exercised against hosted).
- **PARTIAL** — important parts missing.
- **BLOCKED** — identified dependency not yet satisfied.
- **NOT STARTED** — absent (includes deliberate non-features, marked as such).
- **DEPRECATED / UNKNOWN** — none in this audit.
- DONE is never awarded on a passing build alone. "Hosted" below means verified against live hosted Supabase on 2026-11-24 unless stated otherwise.

## 1. Coordinator reconciliation — what changed vs the specialist report

The specialist report was written before hosted access existed, so it recorded Hosted: UNKNOWN for every feature and marked V-14 BLOCKED on the courier-column dispute. Live hosted verification changes three things:

1. **Hosted verification is complete.** Migrations 1–71 applied; courier columns present; zero real schema drift; demo orders disabled. Every feature below that depends on migrations 28–71 is now hosted-verified at the schema level. Runtime behaviour on hosted (real orders, real sends) is still unverified — schema presence is not behaviour proof.
2. **V-14 courier handover: BLOCKED → PARTIAL.** The hosted schema is live, the vendor ship form and admin logistics page exist, but the `dc5a59e` degradation removed courier display from the vendor orders list at HEAD, so the vendor cannot see courier data the database already holds. Partial, not blocked.
3. **C-32 i18n CI wiring: now VERIFIED.** `check:i18n` runs in the `app` job of `.github/workflows/ci.yml` (line 42; fix commit `63a27e3` is an ancestor of HEAD). The specialist report's "unconfirmed" is resolved.
4. **A-16 / B-08: the migration-36 story changed.** The backfill was not merely committed — it executed on hosted. The two paid settlements now carry `LEGACY-` proof. C1 is dead on hosted. A-16 stays PARTIAL (no proof attachment/upload, no bank-statement reconciliation) and the forward-correction decision is now the open item.

**Revised counts: DONE 4 · IMPLEMENTED 79 · PARTIAL 11 · BLOCKED 2 · NOT STARTED 4 = 100.**

## 2. Counts

| Status | Count | Features |
|---|---|---|
| DONE | 4 | C-11, C-17, C-18, A-21 |
| IMPLEMENTED | 79 | see §3–§6 |
| PARTIAL | 11 | C-15, C-22, C-29, C-39, V-14, A-16, A-24, B-03, B-06, B-08, B-10 |
| BLOCKED | 2 | C-35 (SMTP not live), A-25 (monitoring not wired) |
| NOT STARTED | 4 | C-20, C-36, C-37, V-02 (deliberate) |
| DEPRECATED / UNKNOWN | 0 | — |

## 3. Customer (C-01–C-39)

| ID | Feature | Status | Evidence (file / test) | Hosted |
|---|---|---|---|---|
| C-01 | Homepage | IMPLEMENTED | `page.tsx` loads occasions/categories/shops/previews via `catalog.ts`; graceful fallbacks | Schema n/a; runtime unverified |
| C-02 | Category browsing | IMPLEMENTED | `categories/[slug]/page.tsx`, BreadcrumbList JSON-LD; unknown slug → 404 | — |
| C-03 | Product discovery (sort/filter/pagination) | IMPLEMENTED | `product-sort.ts`, `pagination.ts` (25/page); invalid params fall back | — |
| C-04 | Search | IMPLEMENTED | `search/page.tsx` → `searchProducts`; no-result state; no typo tolerance | — |
| C-05 | Gift Finder quiz | IMPLEMENTED | `GET /api/gift-finder`, `gift-finder.ts`; invalid → 400, DB failure → 503 | — |
| C-06 | Occasions pages | IMPLEMENTED | `occasions.ts`, matching rules, product picker; slug fix migration 68 | Migrations 68 applied ✓ |
| C-07 | Shop pages | IMPLEMENTED | `shops/[slug]/page.tsx`, BreadcrumbList; paused/non-approved excluded at query | — |
| C-08 | Product pages | IMPLEMENTED | Gallery, purchase panel, Product JSON-LD; slug redirect 308 verified locally | — |
| C-09 | Review stars on listings | IMPLEMENTED | Bulk approved-review query (`catalog.ts:257+`); six listing surfaces | — |
| C-10 | Submit a product review | IMPLEMENTED | `review-actions.ts`, migration 54; vendor self-review barred (mig. 56); admin moderation once-only | Migration 54 applied ✓; purchase-eligibility gating **not traced — verify before pilot** |
| C-11 | Wishlist (save/restore/remove) | **DONE** | `wishlist/actions.ts:40` resolves vendors from `public_vendors` (silent-drop bug fixed); E2E verified 8/8 on owner's machine | — |
| C-12 | Cart | IMPLEMENTED | `cart.ts` + `cart-store.ts`; stale prices handled at checkout | — |
| C-13 | Buy Now | IMPLEMENTED | `buy-now.ts`, quantity validation | — |
| C-14 | Reorder | IMPLEMENTED | `reorder.ts`; changed products resolved with diff, not silently re-added | — |
| C-15 | Gift options (wrap/message/delivery date) | PARTIAL | Wrap/message/date recorded (mig. 47–48); **delivery-date fulfilment enforcement missing** | Migrations 47–48 applied ✓ |
| C-16 | Checkout (authenticated) | IMPLEMENTED | `placeOrder` → `place_order_with_price_check`; idempotency key; quota + rate limits | — |
| C-17 | Price-consent (PRICE_CHANGED) flow | **DONE** | Expected-prices payload; refusal audit trail (mig. 62, 64); browser-verified locally | Migrations 62/64 applied ✓ |
| C-18 | Guest checkout | **DONE** | Idempotency, recovery token, demo-vendor refusal; guest order GFT-E4F32BAF5ABB placed locally | — |
| C-19 | COD (only payment method) | IMPLEMENTED | `payment_method` on orders; no gateway code anywhere; cash handling → B-03 | — |
| C-20 | Online / card payment | NOT STARTED | Deliberate launch scope (D-06/D-07: COD-only at launch) | — |
| C-21 | Delivery info & governorate coverage | IMPLEMENTED | `governorates.ts` (27 governorates, EN/AR); coverage enforced in checkout txn (mig. 29) | Migration 29 applied ✓ |
| C-22 | Same-day delivery rules | PARTIAL | `business-time.ts` cutoff helpers exist; **no server-side same-day rule enforced**; +1-day floor is UI-only | — |
| C-23 | Order confirmation | IMPLEMENTED | Order page + `notifyOrderPlaced` (best-effort after F-03 fix) | Email depends on C-35 |
| C-24 | Order tracking (status timeline) | IMPLEMENTED | Guest (token) + account order pages; suborder timestamps; courier block when shipped | Courier columns present ✓ |
| C-25 | Order history | IMPLEMENTED | `account/orders/page.tsx` via `account-orders.ts` | — |
| C-26 | Order cancellation (customer) | IMPLEMENTED | `cancelOrder` / `cancelGuestOrder`; placed/confirmed only (mig. 46); N-02 explicit approval (mig. 71, RLS TEST 14f) | Migrations 46/71 applied ✓ |
| C-27 | Returns / refund case — open | IMPLEMENTED | `openRefundCase` / `openGuestRefundCase`; 7-day window (D-09); inspection condition + courier payer (mig. 52/58/61) | Migrations 52/58/61 applied ✓ |
| C-28 | Refund case — escalate / cancel | IMPLEMENTED | Escalate/cancel (auth + guest); guest cancel expiry (mig. 66) | Migration 66 applied ✓ |
| C-29 | Account profile | PARTIAL | `account/page.tsx` exists; **no profile-edit UI found** (name/phone change has no customer path) | — |
| C-30 | Saved addresses | IMPLEMENTED | CRUD + default handling (`saved-address.ts`) | — |
| C-31 | Guest order recovery & claim | IMPLEMENTED | Recovery email link, single-use token, claim-to-account | Email depends on C-35 |
| C-32 | Arabic / English + RTL | IMPLEMENTED | next-intl, 648 keys / 788 calls; **CI wiring now VERIFIED** (`ci.yml:42`, `63a27e3`) | — |
| C-33 | Customer contact / support request | IMPLEMENTED | `contact/page.tsx` → `support_requests`; no in-app reply thread (replies by email) | Migration 69 applied ✓ |
| C-34 | Help / delivery-returns / legal pages | IMPLEMENTED | Six legal pages retained; **all carry draft notices** — final legal approval external | — |
| C-35 | Email notifications | **BLOCKED** | `mail.ts` notify functions + outbox (mig. 63) complete; **Brevo decided 2026-11-23 but no account/sender/DNS/credentials, no real send verified** | Migrations 63/65 applied ✓; delivery blocked on SMTP config |
| C-36 | In-app / push notifications | NOT STARTED | Email-only by design at launch; no inbox, no push | — |
| C-37 | Live courier tracking | NOT STARTED | Deliberate; only courier name + tracking-ref text (V-14) | — |
| C-38 | SEO (sitemap/robots/JSON-LD) | IMPLEMENTED | `sitemap.ts`, `robots.ts`, Product/Organization/BreadcrumbList JSON-LD; **indexing flip gated on hosted verification** | Hosted verified — flip now an owner decision |
| C-39 | 404 pages | PARTIAL | Branded `not-found.tsx` exists; **F-01: empty DOM pre-hydration** (40 visible chars, no-JS/crawler only); three fix attempts rejected | — |

## 4. Vendor (V-01–V-22)

| ID | Feature | Status | Evidence | Hosted |
|---|---|---|---|---|
| V-01 | Manual onboarding (admin-created vendors) | IMPLEMENTED | `createVendor` + invite email + accept-invite flow; RLS onboarding suite | — |
| V-02 | Vendor self-registration | NOT STARTED | **Deliberate** — manual onboarding is the agreed model; do not "fix" | — |
| V-03 | Invitation acceptance / activation | IMPLEMENTED | `accept-invite/page.tsx`, `auth/callback/route.ts` | — |
| V-04 | Vendor auth & role gating | IMPLEMENTED | `auth.ts` (`requireUser`, `getRequestContext`); RLS vendor-dashboard suite | — |
| V-05 | Staff invites & roles (owner/manager/staff) | IMPLEMENTED | `vendor/settings/staff/actions.ts`; **last-owner-removal guard not confirmed — verify before pilot** | — |
| V-06 | Vendor dashboard / overview | IMPLEMENTED | `vendor/overview/page.tsx`, `admin-metrics.ts` / `vendor-analytics.ts` | — |
| V-07 | Product create / edit | IMPLEMENTED | `saveProduct`, category/tag/occasion pickers; vendor-scoped RLS | — |
| V-08 | Product delete (typed confirmation) | IMPLEMENTED | `deleteProduct` requires exact product name (`confirm-delete.ts`); added after live Plant Pot deletion | Live Plant Pot product **still unrestored** (data issue, not code) |
| V-09 | Product images (upload/delete) | IMPLEMENTED | Magic-byte rejection (`image-upload.ts`); verified via real upload locally | Storage buckets present ✓ |
| V-10 | Inventory — stock levels & manual adjustment | IMPLEMENTED | `adjust_product_stock` RPC (mig. 07); owner/manager only | Migration 07 applied ✓ |
| V-11 | Order list | IMPLEMENTED | `vendor/orders/page.tsx`; filter-pill pending state verified in browser pass | — |
| V-12 | Order detail | IMPLEMENTED | `vendor/orders/[id]/page.tsx` — suborder, items, commission entries, clawbacks, courier block | Courier columns present ✓ |
| V-13 | Status transitions (confirm/ship/deliver/cancel) | IMPLEMENTED | `set_order_vendor_status` RPC; edge validation in RPC + trigger (mig. 46); reason code required | Migration 46 applied ✓ |
| V-14 | Courier info & delivery handover at shipment | **PARTIAL** | Migration 42 RPC requires courier + tracking ref for `shipped`, stamps `handed_over_at`; vendor ship form collects them; **vendor orders list hides courier data at HEAD (`dc5a59e` degradation)** | **Columns + RPC verified live ✓** — the blocker is the UI degradation, not hosted |
| V-15 | Pause / resume orders | IMPLEMENTED | `setVendorAcceptingOrders` (owner-only); checkout refuses paused vendors (mig. 22) | Migration 22 applied ✓ |
| V-16 | Vendor analytics | IMPLEMENTED | `vendor-analytics.ts` (7d/30d/90d/all, 1,000-row all-time cap) | — |
| V-17 | Store settings (profile, logo, cover) | IMPLEMENTED | `saveVendorSettings`, logo/cover upload+remove | — |
| V-18 | Vendor finance / settlement visibility | IMPLEMENTED | `vendor/finance/page.tsx`, `finance.ts` net-due arithmetic; CSV export | — |
| V-19 | Vendor refunds (acknowledge/confirm/correct) | IMPLEMENTED | `vendor/refunds/actions.ts`; inspection condition re-derives courier payer; restock manual, never automatic (D-09) | — |
| V-20 | Vendor reviews view | IMPLEMENTED | `vendor/reviews/page.tsx` (new in `dc5a59e` — genuine work to extract on revert); no vendor reply path; no dedicated test | Migration 54 applied ✓ |
| V-21 | Vendor support | IMPLEMENTED | `vendor/support/page.tsx` + `createSupportRequest`; replies by email only | — |
| V-22 | Tag suggestions | IMPLEMENTED | `tag-actions.ts`; admin review; dedup per shop | — |

## 5. Admin (A-01–A-26)

| ID | Feature | Status | Evidence | Hosted |
|---|---|---|---|---|
| A-01 | Admin auth & gating | IMPLEMENTED | `requirePlatformAdmin`; every `/admin/*` route gated; 133 policies | RLS verified live ✓ |
| A-02 | Admin dashboard & metrics | IMPLEMENTED | `admin/page.tsx`, `admin-metrics.ts`; `dashboard-mobile.spec.ts` quota-sensitive (harness limit, not product bug) | — |
| A-03 | Vendor management (approve/suspend/reject) | IMPLEMENTED | `setVendorStatus` + ConfirmSubmit; suspended excluded from storefront + checkout (mig. 15) | Migration 15 applied ✓ |
| A-04 | Vendor creation (admin) | IMPLEMENTED | See V-01 | — |
| A-05 | Categories CRUD | IMPLEMENTED | `create/update/deleteCategory`; **delete guard for categories with products not confirmed — verify** | — |
| A-06 | Tags CRUD + suggestion review | IMPLEMENTED | `admin/tags/actions.ts`; dedup, activation toggling | — |
| A-07 | Occasions CRUD + picker + matching rules | IMPLEMENTED | `admin/occasions/actions.ts` (save/visibility/order/picker/rules) | — |
| A-08 | Products (admin list + CSV export) | IMPLEMENTED | `admin/products/export/route.ts`; browser pass verified CSV 200 | — |
| A-09 | Orders (admin list + detail) | IMPLEMENTED | Filters incl. pending filter-pill; contact masking (A-11) | — |
| A-10 | Admin suborder status override + address correction | IMPLEMENTED | `setAdminSuborderStatus`, `correctAdminOrderAddress`; same edge validation as V-13 | — |
| A-11 | Contact masking (admin) | IMPLEMENTED | `mask-contact.ts` on admin orders list; full contact on detail (confirm scope is intended) | — |
| A-12 | Logistics / courier management | IMPLEMENTED | `admin/logistics/page.tsx` selects courier columns; LIKE-escaping with literal `%`/`_` tests; **restored by fix 3a** | Columns verified live ✓ |
| A-13 | Commissions — list & per-vendor rate config | IMPLEMENTED | `setCommissionRate`; per-vendor, subtotal-only, earned on delivery; 10% DB default is NOT a commercial offer | — |
| A-14 | Commissions CSV export | IMPLEMENTED | `admin/commissions/export/route.ts`; browser-verified | — |
| A-15 | Settlements — create / mark paid / void | IMPLEMENTED | `createSettlement` / `markSettlementPaid` / `voidSettlement` / `recordDirectRepayment`; concurrency-safe mark-paid (FIN-001) | — |
| A-16 | Payout reconciliation / payout proof | PARTIAL | Mark-paid requires bank transfer reference (D-08); **two paid settlements carry fabricated `LEGACY-` proof executed on hosted; no proof attachment/upload; no bank-statement reconciliation**; C1 dead — forward correction is the open decision | Proof state verified live ✓ |
| A-17 | Refunds (admin resolve / restock) | IMPLEMENTED | `resolveRefundCase`, manual restock after inspection; cancelled-refund approval explicit (mig. 71, RLS TEST 14f) | Migration 71 applied ✓ |
| A-18 | Review moderation | IMPLEMENTED | Approve/reject once-only RPC | — |
| A-19 | Support queue — reply & status | IMPLEMENTED | `updateSupportRequestStatus`; F-02 FK-embed fix + 2 regression tests (mig. 69 `replied_by`) | Migration 69 applied ✓ |
| A-20 | Price-consent refusals log | IMPLEMENTED | `admin/price-consent-refusals/page.tsx` (mig. 64) | Migration 64 applied ✓ |
| A-21 | Mail outbox — admin retry / requeue | **DONE** | `retryMailOutbox` / `requeueMailOutboxRow`; caps 5 attempts / 2 requeues; retry refused while SMTP unconfigured | Migrations 63/65 applied ✓ |
| A-22 | Mail retry worker (cron, automatic) | IMPLEMENTED | `GET /api/cron/mail-outbox` (CRON_SECRET, timing-safe); `vercel.json` `*/5`; **live cron run never verified** | Cron + secret are Vercel-side; unverified |
| A-23 | Admin analytics | IMPLEMENTED | `admin/analytics/page.tsx` aggregates | — |
| A-24 | Audit logs | PARTIAL | Order-status audit trail in DB (mig. 28), price-consent trail (mig. 62), settlement releases; **no admin UI to view audit events**; admin actions have no dedicated audit table | Migrations 28/62 applied ✓ |
| A-25 | Monitoring (Sentry + UptimeRobot) | **BLOCKED** | SDK installed, configs exist; **DSN unset, monitors not created; approved 2026-11-20 but never wired; no alert ever fired** | Unverified (dashboard-side) |
| A-26 | Environment banner | IMPLEMENTED | Amber demo / sky staging / absent prod+dev; browser-verified | `demo_orders_allowed = false` verified live ✓ |

## 6. Business operations (B-01–B-13)

| ID | Feature | Status | Evidence | Hosted |
|---|---|---|---|---|
| B-01 | Commission — per-vendor, subtotal-only, earned on delivery | IMPLEMENTED | `commission_entries` at delivery; rate-change prospectivity not explicitly traced | — |
| B-02 | Multi-vendor order splitting | IMPLEMENTED | `_create_order` splits per vendor; parent status derived (mig. 31 lock-order fix); concurrency test PASS | Migration 31 applied ✓ |
| B-03 | COD collection & vendor cash holding | PARTIAL | D-08 weekly Sunday remittance is policy, not code; **no COD cash ledger — cash collected/held/remitted is untracked** | — |
| B-04 | Vendor settlement (weekly cycle) | IMPLEMENTED | Mechanics complete; weekly schedule is a manual admin action — no automated job | — |
| B-05 | Delivery charges | IMPLEMENTED | `delivery_fee_minor` per suborder; D-06 free through launch; **confirm live fee is actually 0 at launch** | — |
| B-06 | Return courier charges & payer | PARTIAL | Payer derived from inspection condition (D-09); **payer is a label, not a financial charge — no amount recorded, invoiced, or deducted** | — |
| B-07 | Refund calculations & clawbacks | IMPLEMENTED | Commission reversal + `commission_clawbacks`; paid-return clawback (mig. 43); void restores (mig. 50); TEST 14f | Migrations 43/50 applied ✓ |
| B-08 | Reconciliation | PARTIAL | Settlement net-due arithmetic over app tables only; no bank/cash matching (B-03); no payout proof (A-16); **migration-36 backfill executed on hosted — C1 dead** | Settlements verified live ✓ |
| B-09 | Order lifecycle & parent status | IMPLEMENTED | Suborder machine + derived parent status; audit trail (mig. 28); concurrency PASS | Migration 28 applied ✓ |
| B-10 | Stock reservation & restoration | PARTIAL | Checkout decrements stock in RPC; refund restock manual by design; **cancellation stock-restore path not traced — confirm before pilot** | — |
| B-11 | Customer / vendor communication | IMPLEMENTED | Email-only; support threads; no in-app messaging, no SMS/WhatsApp | Depends on C-35 |
| B-12 | Demo containment | IMPLEMENTED | Migration 67 containment, `demo-containment.ts`, mail demo guard, script target guards | Migration 67 applied ✓; `demo_orders_allowed=false` verified live |
| B-13 | ConfirmSubmit (destructive-action confirmation) | IMPLEMENTED | `confirm-submit.tsx` used across admin/vendor forms; per-form coverage — a form that forgets it has no global guard | — |

## 7. Prior-claimed additions — all confirmed present

All 11 claimed Phase 2 additions verified in the worktree at `54c780b`: vendor order-detail page; product-delete typed confirmation; ConfirmSubmit; contact masking; CSV exports (3 routes); mail outbox; environment banner; review stars on six listing surfaces; BreadcrumbList JSON-LD (category/occasion/shop/product); mail retry worker (cron); LIKE-escaping in logistics search. None was found missing or reverted. The Codex logistics workaround exists only on the separate local-only branch `codex/logistics-wip`, not in this worktree — except that its degradation content was preserved in committed `dc5a59e` (see V-14, A-16, `DATABASE_AND_MIGRATIONS.md` §5).

## 8. Top gaps (pilot-blocking first)

1. **SMTP not live (C-35).** Every notification queues and never delivers until Brevo credentials + sender/domain verification + a real send test. The cron worker cannot be verified live either.
2. **No COD cash ledger (B-03) + payout proof gap (A-16).** Commission is computed, but cash held by vendors is untracked and the two paid settlements carry fabricated proof. Do not scale past a tightly-controlled pilot until a ledger + proof capture exist.
3. **Vendor courier UI degraded at HEAD (V-14).** Revert `dc5a59e` degradation; hosted already has the data.
4. **Monitoring not live (A-25).** Sentry DSN unset, no UptimeRobot monitors; approved but never wired.
5. **Delivery-date / same-day enforcement missing (C-15, C-22) + return-courier charge not financialised (B-06).** Recorded preferences with no fulfilment or money enforcement; needs owner rules.
6. **Stock restore on cancellation unconfirmed (B-10).** Confirm the RPC restores reserved stock on cancel before pilot.
7. **No audit-log UI (A-24), no profile edit (C-29), no vendor review replies (V-20), no in-app notifications (C-36).** Real but non-blocking; audit-log UI matters most for operations.
8. **F-01 404 empty DOM (C-39).** Known, investigated, no safe fix; affects crawlers/no-JS only.
9. **Live data issue (not code): Nile Blossoms "Plant Pot" still unrestored** after the 2026-11-23 accidental delete; restore it or confirm with the vendor before pilot.
10. **Five items not fully traced — flagged, not assumed:** review purchase-eligibility gating (C-10), category-delete guard (A-05), last-owner-removal guard (V-05), commission rate-change prospectivity (A-13/B-01), cancel stock-restore (B-10).

## 9. What is genuinely strong

- Checkout integrity: idempotency, price-consent, quota/rate-limit, vendor-pause and demo-vendor guards, SECURITY DEFINER RPCs with revoked public grants, 71-migration chain applied clean in 18 RLS suites.
- Refund/settlement machinery: explicit inspection conditions, clawbacks, void-restore, concurrency-safe mark-paid, cancelled-refund approval (migration 71, RLS TEST 14f).
- Mail outbox design: never-throw sends, demo guard, 5-attempt/2-requeue caps, cron + manual retry sharing one code path.
- Demo containment is load-bearing in code (migration 67, `demo-containment.ts`, mail guard), not just deployment separation — and hosted now confirms `demo_orders_allowed = false`.
