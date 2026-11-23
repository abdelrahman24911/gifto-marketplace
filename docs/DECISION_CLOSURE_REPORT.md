# Gifto — Decision Closure Report

**Date:** 2026-11-24
**Branch:** `muse/decision-closure-brevo` (created from `muse/gifto-autonomous-improvement` at `8c90221`)
**Status:** Documentation only. No business policy was decided on the owner's behalf. No hosted system was touched.

## Why these three decisions

The post-pilot polish pass is complete except for the three `NOT STARTED`
rows in `docs/MUSE_TEST_RESULTS.md` (post-pilot table, 2026-11-23):

1. **Live tracking integration** — needs a carrier API and owner credentials.
2. **Search similarity threshold / Arabic fuzzy proof** — needs a live/local
   Postgres with `pg_trgm`; the local Supabase instance is currently down (503).
3. **Settlement reconciliation / return-courier charge / delivery-date
   enforcement** — financial and fulfilment behaviour changes that need owner
   decisions and migration work.

The fourth remaining row, **vendor/admin dashboards English-only**, is a
deliberate pilot limitation, not an unresolved decision. It is recorded in
`docs/MUSE_TEST_RESULTS.md` as `NOT CHANGED` and is outside this report.

Nothing below is implemented unless it says **Already implemented**. Each
section separates what engineering can do safely from what requires explicit
owner approval.

---

## Decision 1 — Live tracking integration

### Exact decision required

Do we keep the current **handover record** (courier name, tracking reference,
handover time entered by the shop) as the whole delivery-tracking feature, or
do we integrate a carrier's tracking API so customers see live carrier events?
If we integrate, which carrier, what customer promise, and who supplies the
credentials?

### Options

| Option | What it means | Pros | Cons |
|---|---|---|---|
| **A. Handover record only (current)** | The shop records courier + tracking at shipment; Gifto stores and displays that static record. No carrier API. | No credentials, no new attack surface, no support burden; already built and tested. | Customers cannot see live carrier events; disputes rely on the recorded handover and the carrier's own site. |
| **B. Single-carrier API integration** | Integrate one carrier (for example Bosta) with webhook or polling, map carrier statuses to Gifto statuses, and show events/link to the customer. | Real tracking for the main carrier; fewer manual "where is my order" contacts. | Needs a carrier contract/API credentials, webhook endpoint, idempotency, status mapping, retries, security review, and support procedures. |
| **C. Multi-carrier aggregator / manual deep link** | Use an aggregator or generate a carrier tracking URL from the recorded reference. | Covers several carriers with one integration; a deep link alone is low effort. | Aggregator cost/complexity; carrier URL formats vary and can break; still not a guaranteed live event feed. |

### Recommendation (not a decision)

Keep **Option A for the closed pilot**. Revisit **Option B** only after a
carrier agreement, a verified sandbox/production send, and enough order volume
to justify the support cost. Do not promise "live tracking" in customer copy
until a real carrier event has been received and displayed end to end.

### Consequences

- **A:** no engineering work; the existing handover record remains the source
  of truth. Customer-facing copy must continue to say there is no live tracking.
- **B/C:** adds an external dependency and a new failure surface. Carrier
  outages, webhook replay, duplicate events, and status mapping must be handled
  without corrupting the order state machine. Hosted migration 42 must be
  applied before the courier columns exist.

### Already implemented

- `supabase/migrations/00000000000042_courier_tracking.sql` adds
  `order_vendors.courier_name`, `tracking_ref`, and `handed_over_at`, an index
  for the logistics list, and the 7-argument `set_order_vendor_status` RPC.
  Shipping requires a courier name (2–80 chars) and a tracking reference
  (3–80 chars) and stamps `handed_over_at` (lines 38–53, 67–75, 161–185).
- The guest-order RPC returns the handover record (lines 243–309).
- Vendor/admin ship forms collect courier and tracking:
  `src/app/vendor/orders/suborder-actions.tsx:116,127`,
  `src/app/vendor/orders/actions.ts:61-62,147-148`,
  `src/app/admin/orders/suborder-actions.tsx:102,113`,
  `src/app/admin/orders/actions.ts:56-57,125-126`.
- Customer, vendor, and admin order pages display the handover record:
  `src/app/[locale]/(storefront)/orders/[id]/page.tsx:394-399`,
  `src/app/[locale]/(storefront)/account/orders/[id]/page.tsx:310-315`,
  `src/app/admin/orders/[id]/page.tsx:222-229`,
  `src/app/vendor/orders/[id]/page.tsx:139-144`.
- Admin logistics list and courier search:
  `src/app/admin/logistics/page.tsx:61-72,221-231`.
- RLS coverage: `supabase/tests/rls_orders_test.sql:1170-1172,1223-1235`
  and `supabase/tests/rls_guest_orders_test.sql:353-359`.

### Not implemented

- No carrier API client, webhook route, polling worker, event table, status
  mapping, tracking URL generation, or carrier credential management.
- No customer notification triggered by a carrier event.
- The migration itself states: "No courier API is integrated and no live
  tracking status is promised — these fields are the handover record only"
  (`00000000000042_courier_tracking.sql:35-36`).

### Explicitly blocked and why

- **Owner/carrier choice and credentials:** no carrier account, API key, or
  webhook secret exists in the repository or environment.
- **Hosted schema:** production was observed at migration 27 on 2026-11-22, so
  migration 42 is not applied there. See
  `docs/HOSTED_COURIER_SCHEMA_INVESTIGATION.md`.
- **Local runtime proof:** local Supabase returns 503, so the courier pages
  cannot be exercised against a database in this session.

### Safe to implement without owner input

- Keep and document the handover-only behaviour.
- Add/maintain unit and RLS tests for the static handover record.
- Do not add a carrier integration, tracking URL, or "live" customer copy.

### Requires owner approval

- Carrier selection and commercial/API agreement.
- Credential provisioning and data-sharing/privacy review.
- Customer-facing promise and support process for live tracking.
- Applying migration 42 (and the rest of 28–71) to hosted environments.

---

## Decision 2 — Search similarity threshold / Arabic fuzzy proof

### Exact decision required

What similarity threshold should product search use, and should Arabic text be
normalized (alef/hamza variants, tashkeel, tatweel) before matching? What
quality evidence is required before changing search behaviour?

### Current behaviour

`supabase/migrations/00000000000038_product_search_trigram.sql` enables
`pg_trgm`, adds GIN trigram indexes on `products.name` and
`products.description`, and defines `search_products()` (lines 35–41, 52–79).
The RPC matches:

- substring via `ILIKE '%term%'` with backslash escaping (lines 76–79,
  111–114),
- fuzzy via the `%` operator on name/description (lines 119–120),
- ranks by name-first, then `similarity()` (lines 123–145).

The `%` operator uses PostgreSQL's `pg_trgm.similarity_threshold`, which
defaults to **0.3** when not set. The migration does not call `set_limit()` or
otherwise pin a threshold, and there is no Arabic normalization step. The app
passes the raw trimmed query to the RPC (`src/lib/catalog.ts:939-1010`), and
the search page calls that function
(`src/app/[locale]/(storefront)/search/page.tsx:69-79`).

### Options

| Option | What it means | Pros | Cons |
|---|---|---|---|
| **A. Keep the implicit default** | Continue using the server's default `pg_trgm` threshold (0.3) and no Arabic normalization; add documentation/tests only. | No behaviour change; no migration; current ranking stays stable. | The threshold is invisible and environment-dependent; Arabic variants may miss; no evidence of quality. |
| **B. Pin the threshold and prove it** | Set the threshold explicitly to the current default (0.3) inside the RPC or a reviewed migration, and add a DB-backed test corpus (English + Arabic) that asserts expected matches/non-matches. | Makes current behaviour intentional and testable; no user-visible change if 0.3 is used; creates evidence for later tuning. | Needs a Postgres with `pg_trgm`; a migration if the threshold is pinned in SQL; tests must be maintained. |
| **C. Tune threshold + Arabic normalization** | Choose a different threshold (for example 0.2 for recall or 0.4 for precision) and normalize Arabic before matching; add a corpus and ranking checks. | Better Arabic recall/precision; deliberate quality bar. | Changes search results; can increase false positives or hide valid matches; needs owner acceptance, migration, and QA in both locales. |

### Recommendation (not a decision)

Start with **Option B as a behaviour-preserving step**: pin the threshold at
the current default and prove it with a DB-backed corpus. Treat Arabic
normalization (Option C) as a separate, owner-approved behaviour change after
the corpus shows a concrete miss rate. Do not silently change ranking or
threshold in application code.

### Consequences

- A/B: no customer-visible change if the pinned value is 0.3.
- C: search results change; support and vendor expectations may change; a
  migration and both-locale QA are required.
- Any threshold change affects recall/precision and should be measured against
  a fixed corpus, not judged by a single manual search.

### Already implemented

- `pg_trgm` extension and both GIN indexes
  (`00000000000038_product_search_trigram.sql:35-41`).
- Ranked `search_products()` RPC with substring, fuzzy, category, price, and
  pagination support (lines 52–148).
- LIKE escaping inside the RPC (lines 76–79).
- App call and error fallback (`src/lib/catalog.ts:949-1010`).
- RLS TEST 21A asserts the extension and both indexes exist
  (`supabase/tests/rls_catalog_test.sql:559-571`).
- Vitest covers the RPC call shape and empty/error paths
  (`src/lib/catalog.test.ts:295,412-459`).

### Not implemented

- No explicit threshold (`set_limit`) and no assertion of the active threshold.
- No Arabic normalization (no `unaccent`, no custom alef/hamza/tashkeel
  normalization).
- No Arabic search corpus or DB-backed quality test.
- No runtime proof against a live/local Postgres in this session.

### Explicitly blocked and why

- **Database availability:** local Supabase returns 503; no local or hosted
  Postgres with `pg_trgm` was available to run a corpus.
- **Owner quality bar:** no decision on acceptable recall/precision or whether
  Arabic normalization is required for launch.
- **Hosted state:** production was observed at migration 27, so migration 38
  (search RPC/indexes) is not applied there.

### Safe to implement without owner input

- Add a read-only DB test that asserts `pg_trgm` and the GIN indexes exist and
  records the default threshold (no behaviour change).
- Document the current default and the lack of Arabic normalization.
- Add unit tests for query pass-through and error handling.
- Do not change the threshold or ranking without approval.

### Requires owner approval

- Pinning a threshold other than the current default.
- Adding Arabic normalization and accepting its matching trade-offs.
- Applying the resulting migration to hosted environments.
- Any customer-facing search-quality claim.

---

## Decision 3 — Settlement reconciliation / return-courier charge / delivery-date enforcement

This is one polish row but three separate policies. Each needs its own answer.

### 3a. Settlement reconciliation beyond UI arithmetic (COD cash ledger)

#### Exact decision required

Do we keep the current manual settlement batch plus payout proof, or add a
COD cash ledger/remittance reconciliation that independently ties delivered
orders, cash collected, commission due, settlements, and clawbacks?

#### Options

| Option | What it means | Pros | Cons |
|---|---|---|---|
| **A. Keep current manual batch** | Admin creates a settlement from earned commission, records payout proof, and the UI rebuilds totals from commission snapshots. | Already built and tested; no new money movement; fits a small pilot. | Reconciliation is manual and depends on admin discipline; no independent COD cash ledger; harder to audit at scale. |
| **B. Read-only COD reconciliation report/export** | Add a report/export that compares delivered orders, cash expected, commission due, settlement lines, and clawbacks without moving money. | Auditable; no financial-policy change; can be built and tested safely. | Still manual follow-up; needs a defined reconciliation formula and owner sign-off on what "matched" means. |
| **C. Full COD cash ledger + remittance batches + automation** | Record cash movements, remittance batches, and scheduled settlement creation. | Scales; strong audit trail. | Largest build; needs operational policy, minimum payouts, exception handling, and owner/finance approval. |

#### Recommendation (not a decision)

**Option B before public launch**, then **Option C** only if volume and finance
operations justify it. Keep Option A for the closed pilot.

#### Already implemented

- `create_settlement`, `mark_settlement_paid` with payout proof, void,
  clawback, and direct-repayment flows (migrations 25, 30, 36, 43, 50, 53, 55).
- `src/lib/finance.ts` rebuilds settlement gross/commission/net from
  commission-entry snapshots and surfaces missing/truncated reads instead of
  presenting arithmetic as exact (lines 145–176, 299–345, 387–421).
- Admin settlement UI, vendor finance ledger, CSV exports, and tests
  (`src/lib/finance.test.ts`).
- Payout proof requires amount, method, reference, and optional note
  (`supabase/migrations/00000000000036_payout_proof.sql`).

#### Not implemented

- No COD cash ledger, remittance batch, or independent cash-vs-ledger
  reconciliation report.
- No automated settlement cadence (still a manual admin batch).
- No finance-ops sign-off on a reconciliation formula.

#### Blocked

- Owner/finance decision on whether a COD ledger is required for launch.
- Production is at migration 27; migration 36 is a hard blocker for 28–71
  because two paid settlements have no payout proof
  (`docs/STAGE_B_MIGRATION_RECONCILIATION.md:10,18,31`).
- Local Supabase 503; no runtime finance verification this session.

#### Safe without owner input

- A read-only reconciliation export/report built from existing tables, with
  tests, and no money movement.
- Documentation of the current manual formula and its limits.

#### Requires owner approval

- Any new cash ledger or remittance batch.
- Automated settlement creation/cadence.
- The definition of a reconciled settlement and any finance-ops process change.
- Hosted migrations.

### 3b. Return-courier payer as a financial charge

#### Exact decision required

Should `return_courier_paid_by` remain a recorded label, or become a monetary
charge/reimbursement (amount, payer, and settlement/invoice treatment)?

#### Options

| Option | What it means | Pros | Cons |
|---|---|---|---|
| **A. Keep the label only (current)** | The vendor records inspection condition; the system derives `customer` or `vendor` as the payer but records no amount and moves no money. | Already built; no accounting change; simple for the pilot. | The label cannot be reconciled; the courier cost is handled entirely off-system. |
| **B. Record an amount and net it** | Add a return-courier amount and charge the responsible party, netting against the next settlement or a separate invoice. | Makes the policy financially real; auditable. | Needs owner-set amounts/rates, accounting treatment, refund/clawback interactions, and migration work. |
| **C. Reimburse/charge outside the system** | Keep the label but require an ops note/receipt outside Gifto. | No schema change. | No audit trail in Gifto; disputes depend on external records. |

#### Recommendation (not a decision)

Keep **Option A for the pilot**. Choose **Option B** only after the owner sets
the amount/rate, who bears it in each case, and how it interacts with
settlements and refunds.

#### Already implemented

- `refund_cases.inspection_condition` (`good` / `wrong_item` / `damaged`) and
  `return_courier_paid_by` (`customer` / `vendor`) with a CHECK constraint
  (`supabase/migrations/00000000000052_d09_inspection_condition_courier_payer.sql:39-65`).
- Vendor receipt records condition and derives the payer
  (lines 74–177); damaged/wrong-item returns cannot be restocked (lines
  230–242).
- Vendor/admin refund pages display the condition and payer
  (`src/app/vendor/refunds/[id]/page.tsx:173-187`,
  `src/app/admin/refunds/page.tsx:545-558`).
- Tests cover the condition/payer rules in the RLS refunds suite.

#### Not implemented

- No return-courier amount, charge, reimbursement, settlement line, or invoice.
- No accounting treatment for who ultimately bears the cost.

#### Blocked

- Owner decision on amounts/rates and financial treatment.
- Migration 52 is not applied on production (schema at 27).
- No finance data/runtime verification available.

#### Safe without owner input

- Keep the label and document that it is not a financial charge.
- Add tests that prevent a contradictory condition/payer combination.

#### Requires owner approval

- Any amount, charge, reimbursement, or settlement/invoice treatment.
- Customer/vendor communication about return-courier costs.
- Migration work.

### 3c. Preferred delivery date enforcement

#### Exact decision required

Should `preferred_delivery_date` remain an optional customer preference, or
become an enforceable fulfilment SLA with late-delivery flags, warnings, or
penalties?

#### Options

| Option | What it means | Pros | Cons |
|---|---|---|---|
| **A. Keep as a preference (current)** | Customer chooses tomorrow..+14 days; the shop sees it; no SLA or late flag. | Already built; honest (no courier slot system); no new policy. | Customers may expect a commitment; no operational measurement. |
| **B. Read-only late-delivery reporting** | Flag orders delivered after the preferred date and report vendor SLA, without blocking or penalising. | Creates evidence; no policy change; safe to build. | Does not enforce anything; needs a definition of "late" and timezone handling. |
| **C. Enforce/penalise** | Block, warn, or penalise vendors who miss the preferred date. | Stronger customer promise. | Needs owner policy, dispute process, and reliable carrier data; high support risk. |

#### Recommendation (not a decision)

Keep **Option A for the pilot**. Add **Option B** after carrier integration
provides reliable delivery timestamps. Consider **Option C** only with an
owner-approved policy and a dispute process.

#### Already implemented

- `orders.preferred_delivery_date` and `delivery_time_note`
  (`supabase/migrations/00000000000047_gift_shopper.sql:157`).
- Checkout validates the date to tomorrow..+14 days in both app and DB
  (`src/lib/gift-options.ts:19-22,63-102`;
  `00000000000047_gift_shopper.sql:199-201`).
- Customer, vendor, and admin order pages display the preference.
- Tests cover the date window and validation
  (`src/lib/gift-options.test.ts`).

#### Not implemented

- No SLA, late-delivery flag, penalty, or fulfilment report.
- No promised-delivery-time commitment or carrier slot integration.

#### Blocked

- Owner decision on whether the date is a promise or a preference.
- No reliable carrier delivery timestamps.
- Migration 47 is not applied on production (schema at 27).

#### Safe without owner input

- Keep the preference and its validation.
- Add a read-only late-delivery report/flag using existing `delivered_at` and
  `preferred_delivery_date`, with no blocking or penalty.
- Document the timezone/business-day rule used by any such report.

#### Requires owner approval

- Any SLA, penalty, blocking behaviour, or customer promise.
- Vendor/customer communication and dispute handling.
- Migration work.

---

## Summary

| # | Decision | Recommendation (not a decision) | Safe without owner? | Owner approval needed for |
|---|---|---|---|---|
| 1 | Live tracking integration | Handover record for the pilot; single-carrier integration later | Document/test the handover record only | Carrier, credentials, customer promise, hosted migration |
| 2 | Search threshold / Arabic fuzzy | Pin current 0.3 threshold and prove with a corpus; Arabic normalization as a separate change | Read-only DB assertions, docs, unit tests | Threshold/normalization change, quality bar, hosted migration |
| 3a | Settlement reconciliation | Read-only COD reconciliation report; full ledger later | Read-only report/export, tests | Cash ledger, automation, finance process |
| 3b | Return-courier charge | Keep label for the pilot; add amount/charge only with policy | Label + constraint tests | Amounts, charge/reimbursement, accounting |
| 3c | Delivery-date enforcement | Keep preference; add read-only late reporting later | Read-only late report | SLA, penalties, customer promise |

## What is blocked for all three

- Local Supabase is down (`/rest/v1/` returns 503), so no runtime DB proof was
  possible in this session.
- Production was observed at migration 27 (2026-11-22 read-only probes), so the
  migrations behind these features (38, 42, 47, 52, 36/43/53) are not applied
  there. Migration 36 is a hard blocker for the 28–71 sequence because two paid
  settlements have no payout proof.
- No owner decisions have been recorded for any of the three items.

## Approval checklist for the owner

- [ ] Live tracking: keep handover-only, or approve a carrier and credentials.
- [ ] Search: keep the current threshold, or approve a threshold/normalization change and quality bar.
- [ ] Settlement: keep manual batch, or approve a COD reconciliation report/ledger.
- [ ] Return courier: keep the label, or approve an amount/charge and accounting treatment.
- [ ] Delivery date: keep as a preference, or approve an SLA/late-reporting policy.
- [ ] Hosted migrations: resolve migration 36 legacy proof with finance, then approve staging-first application of 28–71.
