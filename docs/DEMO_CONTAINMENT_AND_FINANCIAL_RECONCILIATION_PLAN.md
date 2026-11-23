# Demo Containment and Financial Reconciliation Plan

**Status:** Planning complete; nothing approved to execute.
**Date:** 2026-11-23
**Repository:** `C:\Users\bodyo\OneDrive\Desktop\gifto-marketplace`
**Branch:** `main` at `2f18878f09bc2e2898265847f991c8f7fa09a52c`
**Production Supabase project:** `hqusykdyjpruysxezsrn.supabase.co`
**Report scope:** Read-only analysis and an implementation plan. The only permitted write is this report.

> **Execution decision: NOT APPROVED.** Do not pause vendors, correct settlements, delete demo records, apply migrations, deploy, or change infrastructure until the owner reviews this report and separately approves each write phase.

---

## 1. Executive Summary

1. **Production is paused at migration 27 while the deployed application appears newer.** The database lacks migrations 28-66, including proof columns, current checkout RPCs, refunds, reviews, mail outbox, and wishlist storage. The public site exposes post-47 wishlist, gift, saved-address, and price-consent UI. The exact Vercel commit and server environment are still unverified, so the drift is high-confidence but not fully proven.
2. **Five demo vendors are currently able to accept orders.** Four are active and public: Alexandria Toy Corner, Cairo Cocoa & Confections, Legacy Engraving Studio, and Nile Blossoms. Delta Dried Flowers is pending but also has `is_accepting_orders=true`. The only non-demo vendor, Abdelrahman Osama, is pending and outside the proposed scope.
3. **The safe immediate containment is a pause, not a hide.** Setting `is_accepting_orders=false` on all five demo vendors preserves their active/pending records, vendor dashboards, existing order visibility, and storefront pages with a paused notice. Hiding via vendor status would remove active vendors from `public_vendors` and from `requireVendorRole`, breaking vendor order access.
4. **The four owner-confirmed test orders are separate from the two paid settlements.** The four orders contain 5 suborders, 6 line items, 6 inventory movements, and only 2 commissions. Those 2 commissions are in a voided settlement whose lines are released. The two paid settlements contain 11 different delivered orders. C1 does not touch the four test orders, and deleting the four would not clear the migration-36 blocker.
5. **Owner has selected C1 for the two paid settlements.** Both rows are synthetic fixtures from commit `473fa27`, not real payouts. C1 sets each settlement to `open`, clears `paid_at` and `paid_by`, and preserves IDs, totals, notes, settlement lines, commission entries, vendor associations, and `created_at`. It fabricates no proof.
6. **Migration 36 must be preceded by C1.** The current two paid rows lack proof and violate `settlements_payout_proof_matches`. C1 removes the blocker honestly. Migration 36 is still required for future proof-backed payouts and must be applied as part of the reviewed 28-66 chain.
7. **A separate demo environment is required for a safe, functional demonstration.** Production should remain paused and eventually cleaned, while a distinct Supabase project and a protected Vercel demo deployment hold disposable demo data, demo auth users, demo storage, and no production secrets.
8. **Cleanup is blocked by financial and foreign-key dependencies.** No demo vendor can be deleted while its orders, commissions, or settlements exist. The current main cleanup script does not touch orders or finance. The branch cleanup is broader but unsafe as-is: it deletes all 44 orders, removes shared seed tags/occasions, has no immutable snapshot, and does not hard-deny the production project.
9. **No operational write was performed.** This report was written as the sole authorized artifact. It records read-only findings and exact review drafts. The working tree was already dirty and must be preserved.

Recommended order:

1. Owner reviews and approves this plan.
2. Pause the five demo vendors.
3. Create and verify the isolated demo environment; keep production paused.
4. Run C1 on a staging clone, then production, before Migration 36.
5. Back up, apply 28-66, validate, and keep the deployed application compatible.
6. Clean production demo data only after the demo environment works and the owner approves an explicit snapshot/manifest.

---

## 2. Scope, Constraints, and Owner Decisions

### 2.1 Authorized scope

- Read-only inspection of the repository, production schema/data exposed through repository credentials, and public deployment.
- Read-only planning for Phase 0, Phase 1/C1, Phase 1B, Phase 1C, Phase 1D, testing, backup, and approval gates.
- Writing only `docs/DEMO_CONTAINMENT_AND_FINANCIAL_RECONCILIATION_PLAN.md`.

### 2.2 Explicit non-actions

- No database `INSERT`, `UPDATE`, `DELETE`, DDL, migration, or RLS change.
- No Storage deletion or policy change.
- No Supabase project, Auth, or Vercel environment change.
- No application code, script, config, or `.env` change.
- No commit, push, PR, deployment, or production test order.
- No deletion of the four test orders, any settlement, any user, any product, or any Storage object.
- No claim that a bank transfer was verified.

### 2.3 Owner decisions carried into this plan

| Decision | Status | Effect |
| --- | --- | --- |
| Four ambiguous COD orders are intentional demo/testing data, not real customers | Confirmed | They are held until separate cleanup approval. |
| The two paid settlements are synthetic fixtures from `473fa27` | Confirmed | C1 is the chosen correction; no fake payout proof. |
| C1 for both paid settlements | Selected | Set open, clear paid fields, preserve the rest. |
| No demo exception in Migration 36 | Confirmed | Do not weaken the proof constraint for demo rows. |
| Separate demo environment for sales demonstrations | Confirmed direction | Production is not the demo environment. |
| Immediate goal is a functional vendor demonstration | Confirmed | The demo environment must support the full vendor flow. |
| Read-only planning; only this report may be written | Confirmed | No operational changes in this task. |

### 2.4 Security and evidence constraints

- Do not expose secrets from `.env.local`, Vercel, Supabase, or SMTP.
- Do not place customer names, phone numbers, addresses, full emails, or guest tokens in this report.
- Snapshot exports containing order records must be stored in an approved ops location with restricted access.
- Production read-only probes used the service-role key already present in the repository environment; no secret value is recorded here.

---

## 3. Current Repository, Deployment, Database, Storage, and Discrepancies

### 3.1 Repository state

- Branch: `main`, tracking `origin/main`, with no ahead/behind marker shown.
- HEAD: `2f18878f09bc2e2898265847f991c8f7fa09a52c` (`fix(storefront): localize wishlist and switch locale without refresh`).
- The working tree is dirty with many modified locale, checkout, auth, navigation, occasion, carousel, rate-limit, guest-order, and test files. Preserve every change.
- New untracked artifacts include:
  - `docs/DEPLOYMENT_PREFLIGHT_AND_STAGING_REHEARSAL.md`
  - `docs/MIGRATION_36_FINANCIAL_RECONCILIATION.md`
  - `docs/STAGE_B_MIGRATION_RECONCILIATION.md`
  - `scripts/check-deployment-preflight.mjs`
  - occasion-carousel component/lib/test files
- This report is new and does not overwrite those documents.
- The branch `demo/catalogue-seed` exists locally and remotely and contains the broader demo seed/cleanup work. It is not checked out.

### 3.2 Deployment and database state

| Item | Observed state | Confidence |
| --- | --- | --- |
| Production database schema | Consistent with migration 27 | High; read-only OpenAPI/PostgREST probes |
| Migrations 28-66 | Not observed as applied | High |
| Legacy order RPCs | Still present | High |
| Deployed Vercel app | Appears newer than the database; public wishlist/gift/consent UI is live | High for age direction; exact SHA unverified |
| Vercel project | `gifto-marketplace` in the repository's `.vercel/project.json` | High |
| Exact deployed commit | Unknown | Unverified |
| Vercel server environment | Unknown which Supabase URL/keys it uses | Unverified |
| Production checkout | Current HEAD calls `place_order_with_price_check` and `place_guest_order_with_price_check`; those RPCs are absent | Inferred high-confidence; no test order attempted |
| Production preflight | `npm run preflight:deploy` is expected to fail until migration 39 exists | High; Stage B record |
| Backup/PITR | Not verified in this session | Unverified |
| Staging project | None verified | Unverified |

The four demo orders do not prove the production checkout works. They are consistent with fixtures or service-role seed operations. Do not use them as checkout acceptance evidence.

### 3.3 Production data inventory

| Object | Count |
| --- | ---: |
| Vendors | 6 total: 5 demo, 1 non-demo pending |
| Active demo vendors | 4 |
| Pending demo vendors | 1 (Delta Dried Flowers) |
| Orders | 44 |
| `order_vendors` | 47 |
| Guest orders | 36 |
| `order_items` | 88 |
| `inventory_movements` | 98 |
| `commission_entries` | 26 (24 earned, 2 reversed) |
| Settlements | 4 (2 paid, 1 open, 1 voided) |
| `settlement_lines` | 24 (11 in the two paid rows, 6 Cairo, 7 released Alex) |
| Demo products | 70 |
| `product_images` rows | 71 |
| Product-image Storage objects | 90 under 4 demo vendor prefixes |
| Unreferenced product-image objects | 19; all 71 DB paths have an object |
| Vendor-media objects | 8 under 4 demo vendor prefixes |
| Occasion-image objects | 8 under 6 occasion prefixes |
| Demo auth users | 6 by `@demo.gifto.example` domain |
| Profiles | 12 total; 6 demo-domain; 1 platform admin |
| Vendor members | 5 |
| Vendor status-history rows | 5 |
| Support requests | 5 |
| Tag suggestions | 3 pending |
| Tags | 15 |
| Product-tag links | 322 |
| Occasions | 6 |
| Occasion-product links | 60 |
| Occasion-tag links | 15 |
| Product reviews | Not present; table arrives in 54 |
| Refund cases | Not present; table arrives in 30 |
| Commission adjustments | Not present; table arrives in 30 |
| Commission clawbacks | Not present; table arrives in 43 |

All 47 `order_vendors` rows belong to the four active demo vendors; Delta has no orders. The 44 parent orders therefore all contain at least one demo vendor. This does not by itself authorize deletion of all 44: only four were explicitly confirmed by the owner.

### 3.4 Exact demo vendor scope

| Vendor | ID | Status | Accepting orders |
| --- | --- | --- | --- |
| Alexandria Toy Corner | `fab89811-3d29-4474-a09c-880c95803e5f` | active | true |
| Cairo Cocoa & Confections | `532990c6-3e99-481a-bc42-eb232c7c01c9` | active | true |
| Delta Dried Flowers | `d2c59c6f-a624-461c-9c47-1a4ddf9fcacd` | pending | true |
| Legacy Engraving Studio | `6d0b15cb-575f-4eec-95b4-78db59ff71ac` | active | true |
| Nile Blossoms | `a59bb38c-729d-4a0e-b3fd-8e7dd46717d6` | active | true |
| Abdelrahman Osama | `4cb33442-529e-4b0a-958b-bfe2810cc131` | pending | true, non-demo; must not be touched |

### 3.5 Four owner-confirmed test orders versus C1

The four owner-confirmed test orders are:

- `a7914d5a-0991-493a-b740-3b67f2387fe8`
- `58e1119a-75ed-4e59-a00a-9ee74deae579`
- `ffe20d36-9864-4282-a771-9b8ca7462907`
- `1d6e5dd1-9bb7-4393-92c1-d8c5e9644901`

Their actual related records:

| Relation | Count / state |
| --- | ---: |
| Parent orders | 4 |
| `order_vendors` | 5 |
| `order_items` | 6 |
| `inventory_movements` | 6 |
| Commissions | 2 earned |
| Settlement lines | 2, both in voided settlement `f4fb0a4d-8ab7-4a8b-b4e0-73e1953b8e42` |
| Released lines | 2 released |
| Current statuses | 2 delivered suborders, 3 placed suborders |
| Participation in the two paid settlements | None |

**Correction to earlier working assumptions:** these four orders do **not** account for the 11 commissions and 11 settlement lines behind the two paid settlements. They are a separate set. This distinction must remain explicit in all cleanup and financial work.

### 3.6 The 11 orders behind the two paid settlements

The two paid settlements contain 11 unique delivered suborders/orders:

- `1502b6c6-6b33-4a1c-af92-4c2f78e79f0f`
- `c9d70a8e-360e-4638-aa73-8fd999635d31`
- `820809db-1aba-41d7-b770-2d7be3490b7f`
- `b2949089-dc8f-428b-8134-d2f0e294b7ac`
- `56f1e4b6-80de-4f83-91d9-8213418877d0`
- `fb6cb318-a301-4b97-a01a-923bdc1ada31`
- `13a60ea7-c84b-480d-ae1b-a84a2572d526`
- `c626eca3-ecd8-4ec7-a1cd-d8fef2caf92f`
- `ea852549-30b0-4add-9b44-e04036d5925e`
- `870273b5-c957-47e2-b2dc-946212db7eea`
- `e46c3e9a-82a7-4fb3-b2d1-9da78c4ef68f`

All 11 suborders are `delivered`, each has one `earned` commission, and each has one unreleased settlement line. The two settlements' line totals equal 305,760 and 479,500 respectively.

### 3.7 Known discrepancies and superseded assumptions

1. **Database is behind the application.** Production at 27 cannot serve the current checkout, refund, review, mail, or proof-backed payout paths.
2. **Stage B's option 3 is now an owner decision, not a suggestion to reject.** Earlier the paid rows' origin was unknown, so reopening them was described as potentially misleading. The owner has now confirmed both are synthetic fixtures. C1 is an honest correction of synthetic finance, not a concealment of a real payment.
3. **The four test orders and C1 were previously conflated.** See sections 3.5 and 3.6.
4. **The four test orders are not proof of production checkout.** They may be seed/fixture records.
5. **Current main cleanup cannot remove demo vendors once finance/orders exist.** It deletes storage and vendors but never orders, commissions, or settlements; vendor deletion is blocked by `ON DELETE RESTRICT`.
6. **Branch cleanup is not safe as written** for this task:
   - It deletes every order attached to a demo vendor, including the four held orders.
   - It deletes all seed occasions and unused seed tags, although the taxonomy may be reusable.
   - It deletes Storage before a durable database snapshot.
   - Its production guard is an allowlist and environment check, not a hard deny of the known production project ref.
   - It has no phase-level owner approval per destructive step.
7. **The production worktree already contains unrelated modified files.** No checkout/stash/reset is authorized.
8. **Storage inventory must not be derived from `product_images` alone.** There are 90 objects but 71 rows; 19 objects have no current row. They may be historical seed images, not automatically garbage.
9. **No external payout evidence was checked.** C1 relies solely on owner confirmation that the settlements are synthetic fixtures.

---

## 4. Phase 0: Immediate Demo Containment

### 4.1 Decision: pause, do not hide

| Option | Effect | Decision |
| --- | --- | --- |
| Set `vendors.status='suspended'` or another non-active status | Removes the vendor from `public_vendors`; `requireVendorRole` no longer authorizes the vendor dashboard; existing order operations become inaccessible to the vendor | Rejected |
| Set `is_accepting_orders=false` | Vendor stays active/pending; storefront remains visible with a paused notice; vendor dashboard and existing orders remain accessible; new checkout is rejected transactionally | **Selected** |
| Delete demo vendors/orders now | Blocked by finance/order foreign keys; destroys evidence; not approved | Rejected |

Why the pause is authoritative:

- Migration 22 added `is_accepting_orders`.
- `_create_order` locks the product rows and then the distinct vendor rows in deterministic order, checks vendor/product active status, and rejects paused vendors.
- All signed-in, guest, idempotent, and price-checked checkout wrappers call `_create_order`.
- Direct API inserts into `orders` are revoked; checkout is RPC-only.
- The storefront independently displays paused/sold-out state, but the database check is the boundary.

The pause is not a permanent security boundary:

- Demo vendor owners may be able to unpause themselves through vendor settings.
- There is no platform-admin UI for this flag; service-role SQL or vendor settings are the available controls.
- For durable isolation, the demo must move to a separate environment.

### 4.2 Exact scope

Update exactly these five IDs and require `is_demo=true`:

```text
fab89811-3d29-4474-a09c-880c95803e5f
532990c6-3e99-481a-bc42-eb232c7c01c9
d2c59c6f-a624-461c-9c47-1a4ddf9fcacd
6d0b15cb-575f-4eec-95b4-78db59ff71ac
a59bb38c-729d-4a0e-b3fd-8e7dd46717d6
```

Do not update by `status` alone. Do not update the non-demo vendor `4cb33442-529e-4b0a-958b-bfe2810cc131`.

### 4.3 Preconditions and containment draft

Run in an explicit transaction with an operator and a second reviewer. This is a review draft, not executed.

```sql
begin;

-- 1. Preconditions: exactly five, all demo; four active and one pending.
select
  count(*) as total,
  count(*) filter (where is_demo) as demo_count,
  count(*) filter (where status = 'active') as active_count,
  count(*) filter (where status = 'pending') as pending_count,
  count(*) filter (where is_accepting_orders) as accepting_count
from public.vendors
where id in (
  'fab89811-3d29-4474-a09c-880c95803e5f',
  '532990c6-3e99-481a-bc42-eb232c7c01c9',
  'd2c59c6f-a624-461c-9c47-1a4ddf9fcacd',
  '6d0b15cb-575f-4eec-95b4-78db59ff71ac',
  'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6'
);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.vendors
  where id in (
    'fab89811-3d29-4474-a09c-880c95803e5f',
    '532990c6-3e99-481a-bc42-eb232c7c01c9',
    'd2c59c6f-a624-461c-9c47-1a4ddf9fcacd',
    '6d0b15cb-575f-4eec-95b4-78db59ff71ac',
    'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6'
  )
    and is_demo = true;

  if v_count <> 5 then
    raise exception 'Containment aborted: expected 5 demo target vendors, found %.', v_count
      using errcode = '23514';
  end if;
end $$;

-- 2. Pause all five. Require is_demo to prevent an accidental non-demo write.
update public.vendors
set is_accepting_orders = false
where id in (
  'fab89811-3d29-4474-a09c-880c95803e5f',
  '532990c6-3e99-481a-bc42-eb232c7c01c9',
  'd2c59c6f-a624-461c-9c47-1a4ddf9fcacd',
  '6d0b15cb-575f-4eec-95b4-78db59ff71ac',
  'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6'
)
  and is_demo = true
returning id, name, status, is_demo, is_accepting_orders, updated_at;

-- 3. Postcondition: all five paused, no non-demo target changed.
select id, name, status, is_demo, is_accepting_orders, updated_at
from public.vendors
where id in (
  'fab89811-3d29-4474-a09c-880c95803e5f',
  '532990c6-3e99-481a-bc42-eb232c7c01c9',
  'd2c59c6f-a624-461c-9c47-1a4ddf9fcacd',
  '6d0b15cb-575f-4eec-95b4-78db59ff71ac',
  'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6'
)
order by name;

commit;
```

If the `UPDATE` does not affect exactly five rows, roll back and stop.

### 4.4 Acceptance evidence

- All five target rows have `is_accepting_orders=false`.
- The four active vendors remain `active`; Delta remains `pending`.
- The non-demo pending vendor is unchanged.
- Storefront shop pages still load and show a paused notice.
- Each demo vendor owner can still open the vendor dashboard and see existing orders.
- A checkout attempt in staging against a paused demo vendor is rejected by `_create_order`; no `orders`, `order_vendors`, `order_items`, or `inventory_movements` rows are created.
- Direct client inserts into `orders` still fail due to revoked privileges.
- Existing orders remain readable in admin/vendor views.
- Record operator, timestamp, SQL revision, pre/post row counts, and the returned `updated_at` values in the ops log.

### 4.5 Residual risk

- Vendor owners can potentially resume ordering. Monitor the five IDs and repeat the pause if needed.
- A platform admin could accidentally re-enable a demo vendor through direct database access.
- Pause does not prevent a service-role caller from inserting financial records outside checkout.
- The durable control is environment separation (Phase 1B), not the pause flag.

### 4.6 Phase 0 stop line

Do not delete data, modify settlements, apply migrations, or deploy in Phase 0. Pause only.

---

## 5. Phase 1: Financial Reconciliation and C1 Settlement Correction

### 5.1 Exact records

| Field | Nile Blossoms | Legacy Engraving Studio |
| --- | --- | --- |
| Settlement ID | `2c589855-3f11-4708-a8c3-7738ffa25e80` | `7cadf821-22a4-409f-9617-6bfae5124b6e` |
| Vendor ID | `a59bb38c-729d-4a0e-b3fd-8e7dd46717d6` | `6d0b15cb-575f-4eec-95b4-78db59ff71ac` |
| Current status | paid | paid |
| Current total | 305,760 piastres | 479,500 piastres |
| Lines | 6 | 5 |
| Released lines | 0 | 0 |
| Line sum | 305,760 | 479,500 |
| `created_at` | 2026-11-09T10:00:00Z | 2026-11-09T10:00:00Z |
| `paid_at` | 2026-11-11T16:00:00Z | 2026-11-11T16:00:00Z |
| `paid_by` | `15a1e4f6-2abf-480e-acea-ec47d01dea86` | same |
| Note | `DEMO-SEED: nile-blossoms payout history` | `DEMO-SEED: legacy-engraving payout history` |
| Proof fields | absent before 36 | absent before 36 |

Related records:

- 11 settlement lines, each linked to one unique `earned` commission.
- 11 commissions, each linked to one delivered `order_vendors` row.
- 11 delivered orders.
- No commission adjustments or refund cases.
- The other two settlements:
  - Cairo `d1e74ebf-7b72-4195-93ae-bb1c08c7c7b4`: open, 269,250, 6 unreleased lines.
  - Alexandria `f4fb0a4d-8ab7-4a8b-b4e0-73e1953b8e42`: voided, 76,200, 7 released lines.

### 5.2 Why C1 is the selected correction

- The owner has confirmed the paid rows are synthetic fixtures, not real external receipts.
- Fabricating a transfer reference would corrupt the meaning of the proof constraint.
- Adding a demo exception to Migration 36 would weaken a financial invariant for all rows.
- Setting the rows to `open` preserves the underlying commissions and lines while accurately stating that no payout is being asserted.
- After Migration 36, the rows can be paid only with real proof for a real transfer.

### 5.3 Preconditions and invariants

C1 must verify all of the following before updating:

1. Both target settlements exist, are `paid`, and have non-null `paid_at`.
2. Their stored totals are 305,760 and 479,500.
3. They have exactly 6 and 5 lines, with the same sums.
4. All 11 lines are unreleased.
5. All 11 commission entries are `earned`.
6. All 11 suborders are `delivered`.
7. There are no commission adjustments or refund cases for these lines.
8. Neither vendor already has another open settlement.
9. The only paid settlements in the database are these two.
10. The database is still pre-36, so the proof columns and constraint do not exist yet.

Constraints that make the update safe:

- `settlements_paid_at_matches` requires `status='paid'` exactly when `paid_at` is non-null. Set both fields in one `UPDATE`.
- `settlements_one_open_per_vendor` allows one open row per vendor. Both vendors have none, so each can receive exactly one open row.
- `paid_by` is nullable.
- No trigger blocks `paid`->`open`; the updated-at trigger will change `updated_at`, which is expected.
- `settlement_lines` has no candidate update in C1.
- Pre-36, there is no proof constraint that would prevent clearing paid state.

### 5.4 Snapshot before mutation

The snapshot must include the target settlements, lines, commissions, suborders, orders (financial fields only), order items, and vendor names. Do not include customer contact fields. Store the output outside the database in an access-controlled ops location.

Illustrative fields:

- Settlement: all columns.
- Settlement line: all columns, including release fields.
- Commission: all columns.
- `order_vendors`: id, order_id, vendor_id, status, subtotal, delivery fee, commission rate, lifecycle timestamps.
- Orders: id, status, payment method, currency, subtotal, delivery fee, total, created_at, updated_at; no recipient/contact/address fields.
- Items: id, order_vendor_id, product_id, product name/slug, unit price, quantity, line total, currency, created_at.
- Vendor names/IDs.
- Counts and sums.
- Actor ID, not actor contact details.

The snapshot should be taken inside the same repeatable-read transaction or immediately after a verified write freeze. A JSON export is acceptable; a database backup is not a substitute for the targeted evidence export.

### 5.5 C1 SQL draft

This draft is for review and staging. Do not execute in production until approved. It assumes migrations 28-35 are applied and 36 is not.

```sql
begin isolation level repeatable read;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

select pg_advisory_xact_lock(hashtext('gifto-c1-paid-settlement-correction-v1'));

create temp table c1_targets (
  settlement_id uuid primary key,
  vendor_id uuid not null,
  expected_total integer not null,
  expected_lines integer not null
) on commit drop;

insert into c1_targets (settlement_id, vendor_id, expected_total, expected_lines)
values
  ('2c589855-3f11-4708-a8c3-7738ffa25e80',
   'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6', 305760, 6),
  ('7cadf821-22a4-409f-9617-6bfae5124b6e',
   '6d0b15cb-575f-4eec-95b4-78db59ff71ac', 479500, 5);

-- Lock the target financial rows in deterministic order.
select 1
from public.settlements
where id in (select settlement_id from c1_targets)
order by id
for update;

select 1
from public.settlement_lines
where settlement_id in (select settlement_id from c1_targets)
order by id
for update;

select 1
from public.commission_entries
where id in (
  select commission_entry_id
  from public.settlement_lines
  where settlement_id in (select settlement_id from c1_targets)
)
order by id
for update;

-- Freeze a queryable snapshot of the target graph.
create temp table c1_settlements on commit drop as
select s.*
from public.settlements s
join c1_targets t on t.settlement_id = s.id;

create temp table c1_lines on commit drop as
select l.*
from public.settlement_lines l
join c1_targets t on t.settlement_id = l.settlement_id;

create temp table c1_commissions on commit drop as
select ce.*
from public.commission_entries ce
join c1_lines l on l.commission_entry_id = ce.id;

create temp table c1_order_vendors on commit drop as
select ov.*
from public.order_vendors ov
join c1_commissions ce on ce.order_vendor_id = ov.id;

create temp table c1_orders on commit drop as
select o.id, o.status, o.payment_method, o.currency,
       o.subtotal_minor, o.delivery_fee_minor, o.total_minor,
       o.created_at, o.updated_at
from public.orders o
join c1_order_vendors ov on ov.order_id = o.id;

create temp table c1_items on commit drop as
select oi.id, oi.order_vendor_id, oi.product_id,
       oi.product_name, oi.product_slug,
       oi.unit_price_minor, oi.quantity, oi.line_total_minor,
       oi.currency, oi.created_at
from public.order_items oi
join c1_order_vendors ov on ov.id = oi.order_vendor_id;

create temp table c1_vendors on commit drop as
select v.id, v.name, v.slug, v.status, v.is_demo
from public.vendors v
join c1_targets t on t.vendor_id = v.id;

-- This SELECT returns the full snapshot. Capture its c1_snapshot value before
-- the UPDATE (for example, export the query result from psql). Do not proceed
-- until the snapshot file is written and readable.
select jsonb_pretty(jsonb_build_object(
  'captured_at', now(),
  'vendors', (select coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]'::jsonb) from c1_vendors v),
  'settlements', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from c1_settlements s),
  'lines', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb) from c1_lines l),
  'commissions', (select coalesce(jsonb_agg(to_jsonb(ce) order by ce.id), '[]'::jsonb) from c1_commissions ce),
  'order_vendors', (select coalesce(jsonb_agg(to_jsonb(ov) order by ov.id), '[]'::jsonb) from c1_order_vendors ov),
  'orders', (select coalesce(jsonb_agg(to_jsonb(o) order by o.id), '[]'::jsonb) from c1_orders o),
  'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb) from c1_items i),
  'line_count', (select count(*) from c1_lines),
  'line_sum', (select coalesce(sum(amount_minor), 0) from c1_lines),
  'commission_count', (select count(*) from c1_commissions),
  'order_count', (select count(*) from c1_orders)
)) as c1_snapshot;

do $$
declare
  v_updated integer;
  v_lines integer;
  v_line_sum bigint;
begin
  if (select count(*) from c1_targets) <> 2 then
    raise exception 'C1 aborted: target set is not exactly two settlements.'
      using errcode = '23514';
  end if;

  if (select count(*) from public.settlements where status = 'paid') <> 2 then
    raise exception 'C1 aborted: expected exactly two paid settlements before correction.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from c1_targets t
    left join public.settlements s on s.id = t.settlement_id
    where s.id is null
       or s.vendor_id <> t.vendor_id
       or s.status <> 'paid'
       or s.paid_at is null
       or s.paid_by is null
       or s.total_minor <> t.expected_total
  ) then
    raise exception 'C1 aborted: a target settlement failed its identity/status/total precondition.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.settlements s
    join c1_targets t on t.vendor_id = s.vendor_id
    where s.status = 'open'
  ) then
    raise exception 'C1 aborted: a target vendor already has an open settlement.'
      using errcode = '23514';
  end if;

  if (select count(*) from c1_lines) <> 11 then
    raise exception 'C1 aborted: expected 11 target settlement lines.'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from c1_lines
    where released_at is not null or release_reason is not null
  ) then
    raise exception 'C1 aborted: a target line is already released.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from c1_targets t
    left join (
      select settlement_id, count(*) as n, sum(amount_minor) as total
      from c1_lines
      group by settlement_id
    ) x on x.settlement_id = t.settlement_id
    where x.n is distinct from t.expected_lines
       or x.total is distinct from t.expected_total
  ) then
    raise exception 'C1 aborted: target line counts or sums do not match.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from c1_lines l
    join c1_commissions ce on ce.id = l.commission_entry_id
    left join (
      select commission_entry_id, sum(amount_minor) as adjustment_total
      from public.commission_adjustments
      group by commission_entry_id
    ) a on a.commission_entry_id = ce.id
    where ce.status <> 'earned'
       or l.amount_minor <> ce.amount_minor + coalesce(a.adjustment_total, 0)
  ) then
    raise exception 'C1 aborted: a target line is not an earned, unadjusted commission.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.commission_adjustments
    where commission_entry_id in (select id from c1_commissions)
  ) then
    raise exception 'C1 aborted: a target commission has an adjustment.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.refund_cases
    where order_vendor_id in (select id from c1_order_vendors)
  ) then
    raise exception 'C1 aborted: a target suborder has a refund case.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from c1_order_vendors
    where status <> 'delivered'
  ) then
    raise exception 'C1 aborted: a target suborder is not delivered.'
      using errcode = '23514';
  end if;

  if (select count(*) from c1_orders) <> 11
     or (select count(*) from c1_order_vendors) <> 11
     or (select count(*) from c1_commissions) <> 11 then
    raise exception 'C1 aborted: target order/commission graph is not one-to-one.'
      using errcode = '23514';
  end if;

  update public.settlements s
  set status = 'open',
      paid_at = null,
      paid_by = null
  from c1_targets t
  where s.id = t.settlement_id
    and s.status = 'paid';

  get diagnostics v_updated = row_count;

  if v_updated <> 2 then
    raise exception 'C1 aborted: expected 2 updated settlements, got %.', v_updated
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from c1_targets t
    join public.settlements s on s.id = t.settlement_id
    where s.status <> 'open'
       or s.paid_at is not null
       or s.paid_by is not null
       or s.total_minor <> t.expected_total
  ) then
    raise exception 'C1 aborted: post-update target state is not open/clean.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.settlements s
    where s.vendor_id in (select vendor_id from c1_targets)
    group by s.vendor_id
    having count(*) filter (where s.status = 'open') <> 1
  ) then
    raise exception 'C1 aborted: a target vendor does not have exactly one open settlement.'
      using errcode = '23514';
  end if;

  select count(*), coalesce(sum(amount_minor), 0)
    into v_lines, v_line_sum
  from public.settlement_lines
  where settlement_id in (select settlement_id from c1_targets);

  if v_lines <> 11 or v_line_sum <> 785260 then
    raise exception 'C1 aborted: settlement lines changed during correction (count %, sum %).',
      v_lines, v_line_sum
      using errcode = '23514';
  end if;

  if (select count(*) from public.settlements where status = 'paid') <> 0 then
    raise exception 'C1 aborted: a paid settlement remains after correction.'
      using errcode = '23514';
  end if;
end $$;

select id, vendor_id, status, total_minor, paid_at, paid_by, updated_at
from public.settlements
where id in (select settlement_id from c1_targets)
order by id;

commit;
```

### 5.6 Postconditions and evidence

- Exactly two target settlements changed from `paid` to `open`.
- Both have `paid_at=null` and `paid_by=null`.
- No proof field is invented.
- Totals remain 305,760 and 479,500.
- 11 lines remain, with sum 785,260 and no release fields changed.
- 11 commissions remain `earned`.
- 11 suborders remain `delivered`.
- Each vendor has exactly one open settlement.
- No paid settlement remains in the database at migration-27 state.
- `updated_at` changed for both rows; `created_at`, notes, totals, IDs, lines, commissions, orders, and vendor associations did not.
- The pre-update snapshot is stored and checksummed.
- The operator, approver, timestamp, database project ref, and SQL revision are logged.

### 5.7 Rollback before Migration 36

C1 is the intended state. Do not roll it back without a new owner decision.

If C1 must be reversed **and the database is still pre-36**, the only possible in-place restore is to set both rows back to `paid` with the original `paid_at` and `paid_by` in the same `UPDATE`:

```sql
begin;

do $$
declare
  v_restored integer;
begin
  update public.settlements
  set status = 'paid',
      paid_at = '2026-11-11T16:00:00Z',
      paid_by = '15a1e4f6-2abf-480e-acea-ec47d01dea86'
  where id in (
    '2c589855-3f11-4708-a8c3-7738ffa25e80',
    '7cadf821-22a4-409f-9617-6bfae5124b6e'
  )
    and status = 'open';

  get diagnostics v_restored = row_count;

  if v_restored <> 2 then
    raise exception 'C1 rollback aborted: expected 2 open settlements, got %.', v_restored
      using errcode = '23514';
  end if;
end $$;

select id, status, total_minor, paid_at, paid_by, updated_at
from public.settlements
where id in (
  '2c589855-3f11-4708-a8c3-7738ffa25e80',
  '7cadf821-22a4-409f-9617-6bfae5124b6e'
)
order by id;

commit;
```

This recreates the unsupported paid state and is not a financial correction. It is only an emergency reversal of an unintended C1 execution. It becomes invalid after Migration 36 because the proof constraint will reject a paid row with null proof.

After Migration 36, rollback requires a verified backup/PITR restore or an approved forward correction. Do not drop the proof constraint to force a rollback.

### 5.8 Future legitimate payout

After 36 and 43, if a real transfer has occurred, an authorized admin can use the 5-argument function with the real amount, method, reference, and optional note:

```sql
select public.mark_settlement_paid(
  '2c589855-3f11-4708-a8c3-7738ffa25e80',
  305760,
  'bank_transfer',
  '<real transfer reference>',
  '<real reconciliation note>'
);
```

The amount must equal the net line total. With no clawbacks, the net is the current total. Do not run this in production without an actual receipt and owner approval.

---

## 6. Phase 1B: Separate Demo Environment

### 6.1 Recommendation

Create a dedicated, disposable demo stack:

- **Database/Auth/Storage:** a separate Supabase project, not `hqusykdyjpruysxezsrn`.
- **Hosting:** a separate Vercel project or a protected Vercel Preview environment scoped to the demo branch, rebuilt with demo environment variables.
- **Data:** deterministic demo seed data only; no production customer records or production auth users. Recreate order shapes with synthetic demo contacts, not copied contact fields or guest tokens.
- **Access:** deployment protection or a password-gated demo URL; no public indexing.
- **Operations:** reseed/reset scripts that hard-deny the production project ref.

Production remains the paused, non-demo system until launch readiness and cleanup are approved.

### 6.2 Environment separation matrix

| Control | Production | Demo |
| --- | --- | --- |
| Supabase project | `hqusykdyjpruysxezsrn` | New project with its own ref/keys |
| Vercel environment | Production project/environment | Separate project or protected Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | Production URL | Demo URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production anon key | Demo anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production server only | Demo server only; never shared |
| `NEXT_PUBLIC_SITE_URL` | Production origin | Stable demo origin or preview origin |
| Auth users | Real users | Demo users only, `@demo.gifto.example` |
| SMTP | Real provider when configured | Empty/disabled or sink; no real customer mail |
| Sentry | Production project/DSN | Separate demo DSN or disabled |
| Storage | Production buckets | Demo buckets; seeded demo objects |
| SEO | Keep `NEXT_PUBLIC_SEO_INDEXING=false` until launch | `false`; noindex, access protection |
| Data reset | Never routine | Idempotent seed/reset allowed |
| Production ref denied in scripts | N/A | Hard-coded deny for `hqusykdyjpruysxezsrn` |

### 6.3 Required demo capabilities

The demo must support the immediate vendor demonstration without production writes:

1. Demo customer sign-in or guest checkout.
2. Demo vendor owner sign-in.
3. Demo admin sign-in.
4. Active vendor storefront, product page, cart, and COD checkout.
5. Vendor dashboard: products, stock, orders, status transitions, settings, pause/resume.
6. Order status lifecycle including delivery, commission earning, and settlement creation. Keep seeded settlements open; do not assert a paid state without an approved real/demo transfer record.
7. Protected multi-vendor scenario.
8. Demo support requests and tag suggestions, if those flows are part of the demonstration.
9. Reset/reseed to a known baseline between demonstrations.

### 6.4 Vercel and build details

- `NEXT_PUBLIC_*` variables are consumed at build time. Changing them in a running deployment is not enough; rebuild and redeploy the demo.
- Add the demo site URL to the demo Supabase Auth redirect allowlist.
- Do not point the production domain at the demo Supabase project.
- Do not use production SMTP credentials or a real customer mailbox.
- Do not enable SEO indexing.
- Use Vercel deployment protection or an equivalent access gate.
- Verify the demo deployment's Supabase ref from the browser network/CSP and from the server environment before demonstrating.

### 6.5 Seed and reset safety

The existing demo work is spread across main and `demo/catalogue-seed`:

- Main `scripts/seed-demo.mjs` seeds catalogue data and demo vendors/products.
- Main `scripts/cleanup-demo.mjs` deletes catalogue/storage/vendors/users but explicitly does not handle orders, commissions, or settlements.
- Branch `demo/catalogue-seed` adds order, support, merchandising, profile, and broader cleanup scripts.
- Branch cleanup is not approved as-is. Adapt it before use:
  1. Add a hard deny for the production project ref, not only an allowlist.
  2. Require dry-run output and a signed approved manifest.
  3. Export all affected finance/order/auth/storage records before deletion.
  4. Do not delete shared tags/occasions without a separate decision.
  5. Preserve the four held test orders in production.
  6. Delete Storage only after the database cleanup succeeds and the archive is verified.
  7. Verify no non-demo vendors/products/orders remain in scope.
- Demo credentials must not be committed. The repository's `.demo-catalog/credentials.json` path must remain local/ignored.
- Seed IDs may be deterministic, but do not copy production auth password hashes, guest tokens, contact fields, or real customer PII.
- 36 of the 44 orders are guest orders. Stage B identified two guest orders with non-demo contact emails. Recreate demo order shapes with synthetic contacts; never copy those identities or tokens into the demo environment.
- Do not assume the 44 orders are safe to copy wholesale. Owner confirmation is required for the 40 not explicitly confirmed, and contact data must be replaced regardless.
- Do not copy the two paid-without-proof settlements into a migration-36-enabled demo. Recreate settlements as open fixtures, or use an explicitly approved demo transfer record; never present a fabricated proof as real.

### 6.6 Demo acceptance

- The demo app reads/writes only the demo Supabase project.
- No production service key, SMTP credential, or production URL is present in the demo deployment.
- A complete order can be placed with a demo customer and fulfilled by a demo vendor.
- The vendor dashboard, pause/resume, product management, and order status flow work.
- Settlement creation works on demo data, and proof validation is demonstrable without asserting a false payout.
- No email leaves the environment unless an explicit sink/test mailbox is configured.
- Reset/reseed returns the environment to a known state and removes prior demo orders/finance.
- Repeated reset does not touch production.

---

## 7. Phase 1C: Demo Data Inventory and Dependency-Aware Cleanup

### 7.1 What belongs in the demo environment

Move or recreate:

- 5 demo vendors.
- 70 demo products and 71 `product_images` rows.
- Product-image, vendor-media, and applicable occasion-image objects.
- 44 demo-vendor orders, 47 suborders, 88 items, 98 inventory movements.
- 26 commissions, 4 settlements (recreate as open fixtures), 24 settlement lines.
- 5 support requests and 3 tag suggestions.
- Demo customer/vendor/admin accounts and their vendor memberships.
- Demo-only occasions, tags, and merchandising links as needed for the demonstration.

Retain or decide separately:

- 8 platform categories: Gift Boxes, Flowers, Chocolates & Sweets, Cakes & Baked Goods, Personalized Gifts, Toys & Kids, Occasions, Corporate Gifts.
- 15 tags and 6 occasions. They have no `is_demo` flag and may be launch taxonomy.
- Tags/occasions are shared; do not delete them merely because products are being removed.
- Product-tag and occasion-product rows will disappear or need explicit removal when demo products are deleted.
- Occasion images and occasion-tag links: retain if the occasions remain; otherwise archive and delete only after owner approval.

### 7.2 What is blocked by demo records

Foreign-key behavior makes a simple `DELETE FROM vendors WHERE is_demo` fail:

- `order_vendors.vendor_id` -> `vendors` is `ON DELETE RESTRICT`.
- `commission_entries.vendor_id` -> `vendors` is `ON DELETE RESTRICT`.
- `settlements.vendor_id` -> `vendors` is `ON DELETE RESTRICT`.
- `settlement_lines.commission_entry_id` -> `commission_entries` is `ON DELETE RESTRICT`, including released lines.
- `settlement_lines.settlement_id` -> `settlements` is `ON DELETE CASCADE`.
- `orders` -> `order_vendors` cascades; `order_vendors` -> `order_items` cascades.
- `inventory_movements.order_id` is `ON DELETE SET NULL`; `inventory_movements.product_id` cascades from products.
- `products.vendor_id` -> `vendors` cascades, taking products, images, product tags, and occasion-product links.
- `support_requests`, `tag_suggestions`, `vendor_members`, and `vendor_status_history` cascade from vendors.
- `profiles` cascade from auth users; orders set `user_id` null.

Consequences:

1. The four held test orders cannot be deleted without first handling their commissions and released settlement lines.
2. Deleting a vendor does not clear finance; finance blocks the vendor delete.
3. Deleting products can remove inventory-movement history. If any product is retained, stock must be explicitly restored for deleted orders.
4. Demo auth users are not a blocker for vendor deletion, but demo-domain vendor memberships must be handled through cascade or explicit deletion.
5. C1 does not unblock vendor deletion; it only removes the proof blocker for Migration 36. The settlements still reference their vendors and must be removed before vendor deletion.

### 7.3 Proposed cleanup order after separate approval

Do not execute now. This is the intended dependency order.

1. **Freeze and snapshot.** Pause checkout, stop admin/vendor writes, verify backup/PITR, export a full demo manifest, storage path list, auth-user list, and finance/order records. Record the target project ref.
2. **Approve the manifest.** Explicitly include or exclude the four held test orders. The owner must confirm the remaining 40 seed-era orders before they are deleted.
3. **Remove settlement lines and settlements.** Delete target lines first, then settlements. This releases the `settlement_lines` restrict path.
4. **Remove commission entries.** Delete target commissions explicitly and verify no lines remain.
5. **Remove orders.** Delete approved orders; this cascades their suborders/items. If later migrations 28+ are applied, handle status-event child rows according to their cascade rules.
6. **Handle inventory.** If the demo products will all be deleted, no stock restoration is required; movement rows cascade with products. If any product is retained, restore the exact stock for each deleted order and write an auditable manual adjustment.
7. **Remove support and tag suggestions.**
8. **Remove demo product relations and products.** Product images, product tags, occasion-product links, and vendor products go through the vendor/product cascade or explicit deletes.
9. **Remove vendor members and status history.** They cascade with vendors, but explicit deletion can make verification easier.
10. **Remove demo vendors.**
11. **Decide shared taxonomy.** Retain categories, tags, occasions, and their shared links unless the owner explicitly approves deletion.
12. **Remove demo auth users** by the demo email allowlist; never delete the platform admin or non-demo accounts.
13. **Delete Storage objects by exact vendor/occasion prefixes** only after the database cleanup and archive verification. Include the 19 unreferenced product-image objects only after confirming they are demo artifacts.
14. **Verify:** zero demo vendors/products/orders/commissions/settlements, zero demo-domain users, no demo Storage prefixes, non-demo vendor and taxonomy preserved.

### 7.4 What not to do

- Do not run main `cleanup:demo` against production: vendor deletion will be blocked and storage deletion may precede a recoverable database state.
- Do not run branch cleanup unchanged: it deletes all orders and shared seed taxonomy and lacks a hard production deny.
- Do not delete `tags` or `occasions` based only on "seed" origin.
- Do not assume `product_images` row count equals Storage object count.
- Do not delete the four test orders while they are on hold.
- Do not delete auth users before archiving memberships/order ownership context.
- Do not delete Storage before the database archive is verified.

### 7.5 Inventory disposition table

| Data | Count | Demo environment | Production disposition |
| --- | ---: | --- | --- |
| Demo vendors | 5 | Recreate/copy | Delete after approval |
| Non-demo pending vendor | 1 | No | Retain |
| Categories | 8 | Reuse | Retain |
| Products | 70 | Copy/recreate | Delete with demo vendors |
| Product images (DB) | 71 | Copy/recreate | Cascade with products |
| Product-image objects | 90 | Copy/recreate | Delete by prefix after archive |
| Unreferenced product images | 19 | Copy if useful | Delete only after owner/visual check |
| Vendor media objects | 8 | Copy | Delete by vendor prefix |
| Occasion image objects | 8 | Copy if occasions used | Retain/delete by owner decision |
| Orders | 44 (36 guest) | Recreate synthetic order shapes only; no copied contacts/tokens | Delete after owner confirms all are demo |
| Order vendors | 47 | Copy/recreate | Cascade with orders |
| Order items | 88 | Copy/recreate | Cascade with orders |
| Inventory movements | 98 | Copy/archive | Cascade or retain based on product decision |
| Commissions | 26 | Copy/recreate | Delete after lines/orders |
| Settlements | 4 | Recreate open; never copy paid-without-proof | Delete after lines |
| Settlement lines | 24 | Copy/recreate | Delete before commissions |
| Support requests | 5 | Recreate synthetic | Delete with demo vendors |
| Tag suggestions | 3 | Copy | Delete with demo vendors |
| Tags | 15 | Reuse | Retain unless explicitly retired |
| Product tags | 322 | Copy relevant | Cascade with products |
| Occasions | 6 | Reuse | Retain unless explicitly retired |
| Occasion products | 60 | Copy relevant | Cascade with products |
| Occasion tags | 15 | Reuse | Retain with taxonomy |
| Demo profiles/auth users | 6 | Recreate | Delete only demo-domain users |
| Platform admin | 1 | Recreate | Retain |

---

## 8. Phase 1D: Migration Chain 28-66 and Deployment Sequence

### 8.1 Current migration state

- Production is at migration 27.
- Migrations 28-66 are absent.
- Migration 36 fails on the two paid settlements until C1 is applied.
- The app appears to expect the complete 28-66 surface. Partial application will break checkout, refunds, reviews, settlements, or status actions.
- Migration 30 is forward-only by owner decision D-10 and has no rollback file.
- Migrations 51 and 57 are destructive RPC removals.

### 8.2 Migration matrix 28-66

The matrix below is the review baseline from the SQL and the Stage B reconciliation. It must still be confirmed against a full staging schema dump.

| # | Migration | Creates/changes | Data / backfill | Dependencies and gates | Rollback |
| ---: | --- | --- | --- | --- | --- |
| 28 | `order_status_audit.sql` | `order_status_events`; audit trigger; 5-arg `set_order_vendor_status`; direct status revokes | Backfills events from order timestamps with `system` actors | Orders/suborders/vendors/profiles; parent of 42/46 | Yes |
| 29 | `delivery_coverage.sql` | `delivery_coverage_allows`; coverage assertion | Existing coverage becomes enforceable | Vendors/orders; 37 normalizes later | Yes |
| 30 | `refunds.sql` | `refund_cases`, `commission_adjustments`, refund/settlement RPCs | None observed | **Forward-only; no rollback**; parent of 35/36/43/44/45/52/53/66 | No |
| 31 | `fix_parent_status_lock_order.sql` | Replaces parent status sync/trigger | None | Repairs lock order | Yes |
| 32 | `guest_order_cancellation.sql` | `cancel_guest_order` | None | Guest-order model | Yes |
| 33 | `guest_token_expiry.sql` | Guest expiry column, recovery tokens, token/expiry/claim RPCs | Backfills 36 guest orders to `created_at + 7 days`; old links expire | 30/32; customer communication | Yes |
| 34 | `price_change_consent.sql` | Price-consent `_create_order`; checkout wrappers | None | Order core; parent of 47/51/57/59/62 | Yes |
| 35 | `returns_completion.sql` | Refund receipt/return/escalation RPCs; refund columns | None | 30; changes return APIs | Yes |
| 36 | `payout_proof.sql` | Four proof columns and `settlements_payout_proof_matches`; 5-arg payout RPC | No backfill; two paid rows fail until C1 | **C1 before 36; hard blocker otherwise** | Yes, destructive |
| 37 | `coverage_normalisation.sql` | Governorate normalizer; coverage rewrite | Rewrites vendor coverage JSON | 29; verify six vendors | Yes |
| 38 | `product_search_trigram.sql` | `pg_trgm`; trigram index; search RPC | None | Products/categories; extension availability | Yes |
| 39 | `auth_rate_limits.sql` | Auth rate-limit table and RPC | None | Independent but **do not cherry-pick** | Yes |
| 40 | `admin_address_correction.sql` | Address correction table/RPC | None | Orders; coverage behavior depends on 29/37 | Yes |
| 41 | `vendor_staff_roster.sql` | Vendor member listing RPC | None | Vendor memberships | Yes |
| 42 | `courier_tracking.sql` | Courier/tracking columns; 7-arg status RPC; guest order update | None | 28/33; drops 5-arg signature | Yes |
| 43 | `paid_return_clawback.sql` | Clawback tables; clawback-aware refund/settlement RPCs | None | 30/35/36; financial | Yes |
| 44 | `pending_commission_adjustments.sql` | Pending adjustments; commission-on-delivery trigger; refund redefinition | None | 30/35; financial | Yes |
| 45 | `cancel_refund_case.sql` | Signed-in/guest refund cancellation RPCs | None | 30/35; 66 adds guest expiry | Yes |
| 46 | `set_order_vendor_status_validation.sql` | 7-arg status RPC with validation | None | 28/42; supersedes prior status path | Yes |
| 47 | `gift_shopper.sql` | Wishlists, saved addresses, gift validation, 15-arg checkout wrappers | None | 34; parent of 48/49 | Yes |
| 48 | `guest_order_gift_fields.sql` | Guest order gift fields | None | 33/47 | Yes |
| 49 | `guest_order_item_product_ids.sql` | Guest order item product IDs | None | 48 | Yes |
| 50 | `void_settlement_restore_clawbacks.sql` | Void settlement restores clawbacks | None | 30/36/43/44; financial | Yes |
| 51 | `retire_legacy_order_rpcs.sql` | Drops legacy order RPCs | None | **Destructive API removal**; requires 34/47 and app verification | Yes |
| 52 | `d09_inspection_condition_courier_payer.sql` | Inspection condition and courier-payer columns; receipt/restock RPCs | None | 35; policy gate | Yes |
| 53 | `settlement_clawback_only.sql` | Clawback-only settlement creation | None | 30/43/50; financial | Yes |
| 54 | `product_reviews.sql` | Product reviews and review RPCs | None | Orders/products | Yes |
| 55 | `r07_direct_repayment_open_settlement_guard.sql` | Direct repayment guard | None | 43/53 | Yes |
| 56 | `vendor_self_review_bar.sql` | Bars vendor self-reviews | None | 54 | Yes |
| 57 | `drop_legacy_create_order_wrapper.sql` | Drops 11-arg legacy `_create_order` | None | **Destructive API removal**; requires 34/47 and app verification | Yes |
| 58 | `correct_inspection_condition.sql` | Correct inspection-condition RPC | None | 35/52 | Yes |
| 59 | `null_expected_prices.sql` | Requires non-null expected prices | None | 34; closes consent bypass | Yes |
| 60 | `governorate_normalisation_replace.sql` | Per-letter governorate normalizer | None | 37 | Yes |
| 61 | `require_explicit_inspection_condition.sql` | Explicit inspection condition | None | 35/52/58 | Yes |
| 62 | `price_consent_audit_trail.sql` | Consent event table; recorder; 15-arg checkout wrappers | None | 34/47/59; changes checkout | Yes |
| 63 | `mail_outbox.sql` | Mail outbox table/indexes | None | Operational mail retry; no SMTP schema dependency | Yes |
| 64 | `price_consent_refusals.sql` | Consent refusal table/recorder | None | 34/62 | Yes |
| 65 | `mail_outbox_requeue_cap.sql` | Requeue cap and error fields | None | 63 | Yes |
| 66 | `cancel_guest_refund_case_expiry.sql` | Token-expiry-aware guest refund cancellation | None | 33/45 | Yes |

Primary chains:

```text
28 -> 42 -> 46
30 -> 35 -> 36
30 -> 35 -> 43 -> 50 -> 53 -> 55
30 -> 35 -> 44
30 -> 35 -> 52 -> 58 -> 61
30 -> 35 -> 45 -> 66
33 -> 42/48/66
34 -> 47 -> 48/49
34 -> 51/57/59/62/64
37 -> 60
54 -> 56
63 -> 65
```

### 8.3 Chosen deployment sequence after approval

1. **Verify deployment identity.** Confirm the Vercel production commit and the Supabase URL used by the server environment. Keep the current compatible app; do not deploy an older pre-47 build after 51/57.
2. **Freeze writes.** Stop checkout, vendor status writes, settlement actions, admin edits, and mail. Drain old browser tabs where possible.
3. **Verify backups.** Confirm a recent backup and PITR window; run a restore drill into a disposable target. Record the backup ID.
4. **Create/rehearse staging.** Restore the production backup into a separate Supabase project and apply the sequence there first.
5. **Apply 28-35 in order.** Record each migration, warnings, and object checks. The schema is now pre-36 but post-refund/return.
6. **Run C1 after 35 and before 36.** Use the snapshot, transaction, precondition checks, and postcondition checks in section 5. If C1 fails, roll back the transaction and stop. Do not apply 36.
7. **Assert the pre-36 state.** Confirm exactly three open settlements (C1 two plus Cairo), one voided, zero paid; all proof columns are still absent.
8. **Apply 36.** Confirm the constraint exists and all existing rows satisfy it. No proof backfill or demo exception is permitted.
9. **Apply 37-66 in order.** Do not cherry-pick 39. Verify 51/57 only after app compatibility is confirmed.
10. **Run preflight and validation.** Apply all 17 RLS suites, application tests, typecheck, lint, build/i18n, preflight, and the end-to-end smoke matrix.
11. **Reopen writes only after all gates pass.** If any gate fails, keep writes frozen and treat it as an incident; do not run every down file casually.

**Superseded step:** Stage B suggested a pre-36 proof DDL/backfill. That is no longer the selected path. C1 is the pre-36 action. No proof columns or fake references are added before 36.

### 8.4 Sequencing warnings

- **Migration 33** expires all 36 existing guest links immediately because it backfills expiry from `created_at + 7 days`. Communication/support is required, or the demo cleanup must be completed first under a separate approved sequence.
- **Migration 36** fails without C1.
- **Migration 30** cannot be rolled back.
- **Migrations 51/57** break older clients that call legacy RPCs.
- **Migrations 47/62** change checkout wrapper signatures to the 15-argument shape used by current HEAD.
- **Migration 39** is needed by preflight but must travel in the full sequence.
- A partial apply leaves the app without checkout, refund, settlement, or review paths.

### 8.5 Rollback reality

- Prefer backup/PITR restore over down migrations.
- Migration 30 has no rollback; use a reviewed forward fix.
- Migration 36's rollback drops proof columns and could destroy evidence.
- Migration 51/57 rollbacks restore insecure legacy RPCs; not a safe casual action.
- If C1 has been applied, restoring the pre-C1 paid rows after 36 is impossible without dropping the proof constraint or restoring a backup.

---

## 9. Testing, Acceptance, and Approval Gates

### 9.1 Phase 0 tests

- Confirm five target vendors paused; four active, one pending.
- Confirm non-demo vendor unchanged.
- Load all demo storefront shop/product pages; verify pause notices and no checkout submission.
- Attempt checkout through the signed-in and guest paths; verify the server rejects before any order/stock write.
- Verify vendor dashboards and existing order views still work.
- Attempt direct client order insert; verify permission denial.
- Verify no new orders appear.
- Repeat the pause check after 24 hours to detect unauthorized resume.

### 9.2 C1 tests

- Run the full snapshot and transaction on a staging clone first.
- Verify exact target rows, totals, line counts, sums, statuses, vendor IDs, release fields, and commission statuses before and after.
- Verify two rows updated, 11 lines and 11 commissions unchanged, 785,260 total unchanged.
- Verify each vendor has one open settlement.
- Verify zero paid settlements at the migration-27 stage.
- Verify `settlements_paid_at_matches` and the one-open index remain valid.
- Do not test a fake proof-backed payout on production. On staging, test the post-36/post-43 5-argument payout with a test reference and then reset the staging row.
- Verify the four test orders and the voided Alex settlement are untouched by C1.

### 9.3 Demo environment tests

- Confirm the demo deployment points only to the demo Supabase project.
- Confirm no production keys, URL, SMTP credentials, or production data are present.
- Place a complete customer order; confirm COD checkout, stock decrement, and order visibility.
- Walk the vendor lifecycle: confirm, ship, deliver; verify commission.
- Test pause/resume, product edit, stock adjustment, support request, and status actions.
- Verify mail is disabled or sink-only.
- Run reset/reseed twice; verify deterministic results and no production writes.
- Confirm the demo URL is protected/noindexed.

### 9.4 Cleanup tests

- Produce a dry-run manifest with exact IDs and counts.
- Verify the project ref is the intended target and not production unless production cleanup is explicitly approved.
- Verify every approved order has its finance dependencies in the manifest.
- Verify the four held orders are excluded unless separately released.
- Verify non-demo vendor, categories, tags, and occasions are excluded.
- Verify Storage prefixes and the 19 unreferenced objects are explained.
- Run cleanup on staging first; verify counts, FK behavior, stock, auth, and Storage.
- Verify a checksum/manifest of deleted rows and objects is retained.

### 9.5 Migration tests

- Full clone from production backup; confirm baseline at 27.
- Apply 28-35, C1, 36, 37-66 in order with `ON_ERROR_STOP`.
- Verify schema objects, RPC signatures, constraints, indexes, policies, triggers, and grants.
- Run all 17 RLS/SQL suites.
- Run `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:i18n`.
- Run `npm run preflight:deploy` after 39/Storage prerequisites exist.
- Run Playwright security/admin/general smoke suites if the environment supports them.
- Verify signed-in and guest checkout, status transitions, refunds, settlement proof, wishlist/address, reviews, and mail outbox.
- Verify 51/57 legacy RPC removal against the deployed app, not an older build.

### 9.6 Approval gates

| Gate | Pass criterion | Approver |
| --- | --- | --- |
| Plan approval | This report reviewed and changes accepted | Owner |
| Phase 0 | Exact five-vendor pause approved and executed; evidence recorded | Owner / ops |
| Demo environment | Separate Supabase + protected deployment; end-to-end vendor demo passes | Owner |
| C1 | Snapshot verified; staging correction exact; production approved | Owner / finance |
| Backup/PITR | Backup ID and restore drill recorded | Owner / ops |
| Staging migration | 28-66 + C1 apply cleanly; full tests pass | DB owner |
| Production migration | Maintenance window, backup, C1, 28-66, smoke pass | Owner / DB owner |
| Cleanup | Explicit manifest; four orders held; non-demo/taxonomy preserved; staging dry run passes | Owner |
| Go-live/real vendor | No demo data, no demo accounts, no demo settlements, app/DB aligned | Owner |

### 9.7 Minimum commands on the validation target

```bash
npm run lint
npm run typecheck
npm run test
npm run check:i18n
npm run build
bash scripts/run-rls-suites.sh
npm run preflight:deploy
```

Do not run destructive cleanup scripts as part of validation unless the target is disposable and the manifest is approved.

---

## 10. Open Decisions, Risks, Assumptions, and Explicit Non-Actions

### 10.1 Open decisions

1. Confirm whether the remaining 40 orders attached to demo vendors are all demo data. Only four are explicitly owner-confirmed.
2. Approve the final disposition of the four test orders after the demonstration.
3. Decide whether to retain the 15 tags and 6 occasions as launch taxonomy, and whether their images/relationships are retained.
4. Choose the demo hosting model: separate Vercel project or protected Preview environment.
5. Choose a stable demo domain and access protection.
6. Provide/verify a production backup and PITR restore drill.
7. Verify the exact Vercel production commit and server Supabase environment.
8. Confirm the demo SMTP policy (disabled or sink).
9. Confirm whether the non-demo pending vendor should remain pending and untouched.
10. Select the maintenance window and second reviewer for C1/migrations.

### 10.2 Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| App/DB drift breaks checkout | Critical | Verify deployment; apply full compatible chain; no partial migration |
| Migration 36 fails on paid rows | Critical | C1 before 36; staging rehearsal; no fake proof |
| C1 leaves unsupported paid state if reversed | High | Snapshot; approve forward fix; do not restore after 36 |
| Demo vendors resume accepting orders | High | Repeated pause checks; separate demo environment |
| Cleanup blocked by finance FKs | High | Dependency order; archive; explicit manifest |
| Cleanup deletes shared taxonomy or held orders | High | Exclude four orders; owner decision on tags/occasions |
| Storage deleted before evidence | High | Snapshot and archive first; delete Storage last |
| Migration 30 irreversible | High | Backup/PITR; staging; owner gate |
| Guest links expire at 33 | High | Communication/support or cleanup-first decision |
| Legacy RPC removal breaks old app | High | Verify commit; maintenance window; no old build |
| No staging/backup access | High | Owner supplies before any production write |
| Production demo credentials leak | Medium | Demo-only accounts; protected demo; no committed credentials |
| 19 unreferenced images misclassified | Medium | Visual/manifest review; do not delete blindly |
| Production test order accidentally placed | High | Pause all demo vendors; no production checkout testing |

### 10.3 Assumptions

- The owner's confirmation that the two settlements are synthetic is authoritative for C1.
- The four specified orders are test/demo data; their exact deletion remains separately gated.
- The 44 orders are all attached to demo vendors and appear seed-era, but only four are explicitly confirmed.
- No real external payout evidence exists for the two paid settlements.
- The production database remains at migration 27 until an approved migration window.
- The current HEAD is the intended application baseline; deployed SHA still needs verification.
- Read-only production probes are sufficient for this plan; a full schema dump is still required for migration approval.
- No production writes occurred during this investigation.

### 10.4 Explicit non-actions

- Did not pause vendors.
- Did not correct settlements.
- Did not apply C1.
- Did not apply migrations.
- Did not delete or alter demo records, users, products, Storage, or taxonomy.
- Did not create the demo environment.
- Did not deploy or change Vercel/Supabase settings.
- Did not commit or push.
- Did not verify a bank transfer.

### 10.5 Source artifacts

- `docs/STAGE_B_MIGRATION_RECONCILIATION.md`
- `docs/MIGRATION_36_FINANCIAL_RECONCILIATION.md`
- `docs/DEPLOYMENT_PREFLIGHT_AND_STAGING_REHEARSAL.md`
- `docs/HOSTED_STATE.md`
- `docs/DEMO_DATA_GUIDE.md`
- `docs/DECISIONS.md`
- `supabase/migrations/00000000000006_commissions.sql`
- `supabase/migrations/00000000000016_settlement_integrity.sql`
- `supabase/migrations/00000000000018_settlement_void_lifecycle.sql`
- `supabase/migrations/00000000000022_vendor_pause_checkout.sql`
- `supabase/migrations/00000000000025_atomic_settlement_payout.sql`
- `supabase/migrations/00000000000030_refunds.sql`
- `supabase/migrations/00000000000036_payout_proof.sql`
- `supabase/migrations/00000000000043_paid_return_clawback.sql`
- `supabase/migrations/00000000000047_gift_shopper.sql`
- `supabase/migrations/00000000000051_retire_legacy_order_rpcs.sql`
- `supabase/migrations/00000000000057_drop_legacy_create_order_wrapper.sql`
- `supabase/migrations/00000000000062_price_consent_audit_trail.sql`
- `src/lib/vendor.ts`
- `src/lib/catalog.ts`
- `src/app/[locale]/(storefront)/checkout/actions.ts`
- `src/app/[locale]/(storefront)/checkout/page.tsx`
- `src/app/vendor/settings/actions.ts`
- `scripts/cleanup-demo.mjs`
- `scripts/seed-demo.mjs`
- `scripts/run-rls-suites.sh`
- `scripts/check-deployment-preflight.mjs`
- `demo/catalogue-seed` branch: `scripts/demo-seed/*`, `scripts/cleanup-demo.mjs`
