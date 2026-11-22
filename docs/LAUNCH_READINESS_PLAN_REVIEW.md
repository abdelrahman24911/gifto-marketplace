> **HISTORICAL — 2026-11-20 (P0-08).** Dated snapshot of a past verification (see the date in the file). Its numbers and hosted-state claims were true when written and are not current. Current state: `README.md`, `docs/HOSTED_STATE.md` (single hosted-state table), `docs/DECISIONS.md`. Kept as a record; its findings were not edited.

# Gifto Marketplace — Launch Readiness Plan Review

> **Historical note (2026-10-26):** this review predates Phase 9A/9B. Deployment items A1-A6 are now largely complete (migrations 1-13 applied); see `docs/STATUS_REPORT.md` for current status.

**Date:** 2026-10-19
**Reviewed plan:** `docs/NEXT_PHASE_PLAN.md` (working title "Launch Readiness"), with `docs/OWNER_DECISIONS_BRIEF.md` and `docs/POST_MERGE_READINESS.md` as supporting evidence.
**Code basis:** `main` @ `357891e`. All claims below were verified against the actual migrations, tests and app code — not against the audit's summary of them.
**Scope:** read-only review. No code, migrations, databases or existing documents were modified; this file is the only artifact created.

---

## Verdict

The plan is directionally sound: the workstreams (A deploy → B decisions → C features → D debt) are correctly scoped, nothing completed is repeated, and C1 (admin settlements UI) is correctly identified as the last operational blocker. **However, three items in the plan are wrong or unsafe as written and must be corrected before execution:**

1. **A5's admin-bootstrap recipe disables a production security guard and writes directly to `auth.users`.** A guard-free procedure exists (§5 of this review) and must replace it.
2. **C2's "manual runbook only" fallback is not viable.** A suborder in `shipped` has exactly one legal exit (`delivered`); there is no way to cancel it, so a manual `adjust_product_stock` runbook leaves the suborder and parent order stuck forever. C2 must include the small transition migration; the runbook can only be interim guidance.
3. **Settlements lack audit columns and a concurrency backstop** (`created_by`/`paid_by`, one-open-per-vendor unique index). Both must land in a small migration *before* C1's UI, or the UI ships an unauditable, race-tolerant payout flow.

Additionally: A2's bucket check tests existence but not settings (migration 9 uses `on conflict do nothing`, so a wrong pre-existing bucket is silently preserved), and A4 depends on hosted vendor fixtures that only A5's admin can create — so A5 must run before A4.

Everything else — A1, A3, A6, B1–B2, C3, D1–D6 — is correct as written.

---

## Review 1 — Deployment safety (A1–A6)

### Findings

| # | Severity | Finding | Evidence |
|---|---|---|---|
| 1.1 | **Critical** | **A5 disables a live security guard.** The plan's recipe ("insert via `auth.users` with the self-elevation guard temporarily disabled — see `supabase/tests/rls_foundation_test.sql`") is the *test* recipe (tests run in a disposable container). On the hosted project it would (a) `alter table public.profiles disable trigger profiles_protect_platform_admin` on production and (b) write to `auth.users` directly, which Supabase explicitly routes through `auth.admin.createUser` / the dashboard. Replacement procedure in §5 — it uses the INSERT guard's own documented trusted-path carve-out (`auth.uid() is null`) and never disables anything. | Plan line 26; `supabase/tests/rls_foundation_test.sql:31-34`; guard: `supabase/migrations/00000000000008_security_hardening.sql:27-47` |
| 1.2 | **High** | **A2's bucket check is existence-only; migration 9 would silently preserve a wrong bucket.** `00000000000009_product_image_upload.sql` inserts the `product-images` bucket with `on conflict do nothing`. If the hosted project already has a bucket with that id but wrong settings (private, wrong size limit, wrong MIME list), the migration skips the insert and the upload path is broken in a non-obvious way. A2 must check `id, public, file_size_limit, allowed_mime_types` from `storage.buckets`, not just existence. | `supabase/migrations/00000000000009_product_image_upload.sql` (bucket insert); plan line 23 |
| 1.3 | **High** | **A4 is sequenced before A5 but needs hosted fixtures only A5's admin can approve.** A4's smoke test requires a vendor-manager session on an approved shop. Approving a shop is a platform-admin action (`setVendorStatus` in `src/app/admin/actions.ts:29`, requires `requirePlatformAdmin`). Correct order: A3 → A5 → A4. | Plan lines 25–26; `src/app/admin/actions.ts` |
| 1.4 | Medium | **Migration 8 is not re-runnable; a partial A3 failure needs a reconciliation step.** `create trigger profiles_protect_platform_admin_insert` / `vendor_members_guard_last_owner` have no `drop trigger if exists` (unlike migration 9). If `db push` fails mid-file, the re-push hits `42710 already exists`. A3's acceptance criteria should add: on any push error, run the A2 trigger-existence query before retrying and drop orphaned new triggers manually. | `00000000000008_security_hardening.sql:45-47, 98-100` |
| 1.5 | Low | **A3's post-push check should also verify the bucket settings** (mirror of 1.2): `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'product-images'`. | Plan line 24 |
| 1.6 | Low | The plan says record A1's output "in the PR/commit message of A3" — fine, but also note that `supabase migration list` must be run *against the linked project*; confirm the link first (`supabase projects list` shows the ref, or check `supabase/.temp/project-ref`) so nobody pushes to FL Tase3 or another project by habit. | Plan line 22 |

### Corrections to A1–A6

- **A1** — unchanged, plus: confirm the CLI is linked to `hqusykdyjpruysxezsrn` before trusting the list (1.6).
- **A2** — replace the bucket query with a settings-aware one (1.2). Keep the trigger queries; they are correct.
- **A3** — unchanged, plus bucket-settings verification (1.5) and the partial-failure reconciliation note (1.4). Read-only vs mutating separation for all of Workstream A is in §4.
- **A4** — move **after** A5 (1.3). Content unchanged.
- **A5** — replace entirely with the guard-free procedure in §5. Acceptance criteria unchanged (real admin signs in, opens `/admin`), plus one new criterion: *no security guard was disabled at any point* — verified by re-running `select tgname from pg_trigger where tgname in ('profiles_protect_platform_admin', 'profiles_protect_platform_admin_insert')` returning both rows after the procedure.
- **A6** — unchanged; correct as written.

---

## Review 2 — Settlement correctness (migration 6)

Migration 6 (`supabase/migrations/00000000000006_commissions.sql`) is well built: amounts are integer piastres computed only in the database, `commission_amount_matches` enforces `amount = round(base × rate)` (lines 52–54), every column is EGP-check-constrained, both RPCs re-check `is_platform_admin()` inside their SECURITY DEFINER bodies (`create_settlement:226`, `mark_settlement_paid:294`), `authenticated` holds read-only grants (lines 360–362), earning is idempotent via `on conflict (order_vendor_id) do nothing` (line 140), and `mark_settlement_paid` re-reads status under `for update` so double-pay is impossible (lines 299–310). The RLS suites cover the happy paths and the settled-return block (13 assertions). The gaps are operational, not cryptographic:

### Findings

| # | Severity | Finding | Evidence |
|---|---|---|---|
| 2.1 | **High** | **No audit trail of who created or paid a settlement.** `settlements` records `paid_at` (line 78) but neither RPC records an actor — there are no `created_by` / `paid_by` columns. "Who marked it paid and when" is currently unanswerable from the data. C1's UI will make this a one-click admin action, so the columns must exist before the UI, not after. | `00000000000006_commissions.sql:69-82, 248-250, 312-314` |
| 2.2 | **High** | **One-open-settlement-per-vendor is application-checked, not database-enforced.** The check at lines 241–246 is a read-then-insert with no lock and no partial unique index. Two concurrent `create_settlement` calls both pass the check and insert two settlement rows. Financial loss is impossible — `settlement_lines.commission_entry_id unique` (line 100) makes the loser roll back — but the failure surfaces as a raw unique-violation instead of the friendly "already has an open settlement", and the invariant rests on a side effect. Fix: partial unique index `unique (vendor_id) where status = 'open'` in the same hardening migration as 2.1. | `00000000000006_commissions.sql:241-260` |
| 2.3 | **High** | **A paid settlement permanently blocks returns — a business deadlock the plan does not mention.** `reverse_commission_on_return` raises `23514` for any entry already in a settlement (lines 188–191), and that exception aborts the *entire* `delivered → returned` status update. So once a payout is recorded, the suborder physically cannot be marked returned — even if the customer genuinely returns the goods. The C1 UI must (a) warn admins that returning an order after settling is blocked, and (b) the ops runbook must fix the ordering: *returns before payouts*. The plan's C3/C1 text does not mention this hazard. | `00000000000006_commissions.sql:161-198`; plan lines 48–50 |
| 2.4 | Medium | **No way to void a mistaken settlement.** The only statuses are `open` / `paid` (line 27). An admin who opens a settlement by mistake has exactly one path forward — pay it — and until then the vendor is locked out of future settlements by the one-open-per-vendor rule (2.2). C1 must surface this, and the hardening migration should add a `void` status (or `mark_settlement_void` RPC) so the flow is recoverable without raw SQL. | `00000000000006_commissions.sql:27, 241-246` |
| 2.5 | Low | `mark_settlement_paid`'s not-found message reuses errcode `42501` (line 305), which reads as "permission denied" in client error handling. Prefer `22023` (invalid parameter) for consistency with the other input errors in this file. Cosmetic; fix opportunistically in the same migration. | `00000000000006_commissions.sql:304-306` |

### What is *not* blocked (verified correct)

- **Duplicate line in two settlements** — impossible (`settlement_lines.commission_entry_id unique`, plus the `not exists` filter at 257–260); covered by suite assertions.
- **Double-pay** — impossible (`for update` + status re-read at 299–310).
- **Non-admin RPC calls** — rejected in-function (226–229, 294–297); tested.
- **Client-written ledger rows** — impossible (no INSERT/UPDATE/DELETE grants; RLS read-only; 360–362).
- **Rounding drift** — impossible (CHECK at 52–54; integer piastres everywhere; totals recomputed from lines at 262–265).
- **Vendor visibility** — vendors read their own settlements/entries/lines only; other vendors' rows invisible via RLS; tested.

### Settlement blockers before the first real payout

1. Migration 10 (recommended first implementation task, §9): `created_by` / `paid_by` on `settlements`, partial unique index from 2.2, `void` status from 2.4, errcode fix from 2.5, RPC updates to stamp `auth.uid()`.
2. C1 UI that shows the return-after-settle hazard (2.3) and the void action (2.4).
3. Ops runbook rule: *mark returns before running the payout batch* (2.3).

---

## Review 3 — COD-failure and inventory handling (D-05 open case)

### The gap, precisely

The suborder state machine (`assert_order_vendor_transition`, `00000000000005_orders.sql:138-174`) allows exactly one exit from `shipped`: `delivered` (line 153). The customer can only cancel while the parent is `placed` (`cancel_order`, lines 514–517). So when a COD customer refuses or is absent after the shop has shipped:

- The shop's only legal move is **mark it delivered** — which records cash that never arrived *and* creates an `earned` commission entry (trigger `order_vendors_record_commission`), or
- leave the suborder stuck in `shipped` forever: parent order stuck, customer sees "On the way" indefinitely, stock never returns.

`VENDOR_NEXT_STATUSES` in `src/lib/orders.ts:38-50` mirrors this exactly (`shipped: [{ delivered }]`), so the UI offers no escape either. This confirms D-05's "still open" note is not merely missing automation — **there is currently no correct action at all.**

### Findings

| # | Severity | Finding | Evidence |
|---|---|---|---|
| 3.1 | **Critical (plan)** | **C2's manual-runbook-only fallback is non-viable.** The plan offers "a documented manual `adjust_product_stock` runbook if the owner prefers no code" as an acceptable alternative to the transition. It is not: `adjust_product_stock` (`00000000000007_inventory_adjustment.sql`) fixes the *stock number* but the suborder stays in `shipped` and the parent stays unresolved. The runbook can only ever be interim guidance while the transition migration lands. C2 must be scoped as code-first. | Plan line 49; `00000000000005_orders.sql:150-160` |
| 3.2 | **High** | **Smallest safe transition: `shipped → cancelled`, reusing the existing restock trigger.** The restock trigger `restock_cancelled_suborder` (`00000000000005_orders.sql:186-220`) fires on *any* transition **into** `cancelled`, regardless of source state — so extending the transition table by one row automatically delivers every property we need: stock restored + `inventory_movements` row logged (reason `order_cancelled`), **no commission entry ever created** (the earn trigger fires only on `delivered`), parent-order sync counts it as cancelled (`sync_parent_order_status`, lines 226–279). No enum change, no new trigger, no UI redesign — one condition row in the transition function, one row in `VENDOR_NEXT_STATUSES`, one migration, suite extensions. | `00000000000005_orders.sql:150-153, 186-220, 226-279`; `src/lib/orders.ts:38-50` |
| 3.3 | **High** | **`returned` does not restock — an asymmetry the plan does not flag.** `delivered → returned` reverses the commission ledger (migration 6) but *does not* restore stock: the restock trigger fires only on `cancelled`. Physically the goods come back to the vendor, so inventory is short by the item count after any return. This is a separate decision from the COD-failure path (returns are admin-only, post-delivery) and should be put to the owner alongside C2 — either add restock-on-returned or record "vendor adjusts manually" as the official policy. | `00000000000005_orders.sql:186-196` (cancelled only); `00000000000006_commissions.sql:161-206` |
| 3.4 | Medium | **C2's dependency on B1 is overstated.** The transition extension amends D-04 and D-05, both of which are already `DECIDED`; it does not touch D-06, D-07 or D-08. Owner *sign-off* on the amendment is reasonable and cheap; framing it as blocked on the whole B1 stream needlessly serialises it behind unrelated monetisation answers. | Plan line 49; `docs/DECISIONS.md` D-04, D-05 |

### Smallest safe COD-failure path (recommended shape for C2)

1. Migration 10b (or bundled into migration 10): add `shipped → cancelled` to `assert_order_vendor_transition` for the existing vendor-transition roles (same authorization as every other vendor transition — the function already runs under the RLS `order_vendors: vendor status update` policy). Consider whether platform admin should also have it explicitly (the policy already allows admin updates).
2. Extend `VENDOR_NEXT_STATUSES.shipped` with `{ value: "cancelled", label: "Delivery failed — cancel & restock" }` (`src/lib/orders.ts:49`).
3. Extend `rls_orders_test.sql`: (a) vendor cancels a shipped suborder → status cancelled, stock restored, `inventory_movements` row present, **no** `commission_entries` row; (b) parent order syncs; (c) invalid jump `cancelled → anything` still rejected.
4. Update D-04/D-05 in `docs/DECISIONS.md` with the amendment and date.
5. Until it ships: interim runbook note — *do not mark refused COD orders delivered*; leave shipped and process via the migration as soon as it lands. (Marking delivered is worse: it books commission on cash that never arrived.)

---

## Review 4 — Roadmap quality

| Plan item | Verdict | Correction |
|---|---|---|
| A1–A3 | Correct | Add link-confirmation (1.6), bucket-settings check (1.2), partial-failure note (1.4), post-push settings verification (1.5). |
| A4 | Correct content, wrong position | Move after A5 (1.3). |
| A5 | **Unsafe as written** | Replace with §5 procedure; add "no guard disabled" acceptance criterion (1.1). |
| A6 | Correct | None. |
| B1–B2 | Correct | None. B2's "separate phase, do not start until B1" is right. |
| C1 | Correct scope, missing prerequisites | Add prerequisite row: *migration 10* (settlement audit columns, one-open unique index, void status — §2 blockers) must land before the UI. Add acceptance criterion: UI surfaces the return-after-settle block (2.3) and the void action (2.4). |
| C2 | **Fallback option wrong; dependency overstated** | Make the transition migration mandatory; runbook is interim only (3.1). Dependency should be "owner sign-off on D-04/D-05 amendment", not the full B1 stream (3.4). Add the returned-vs-restock asymmetry decision (3.3) to the same owner conversation. |
| C3 | Correct | None; correctly dependent on B1 + C1. |
| D1–D6 | Correct | None. D2 (E2E before launch marketing) is the right call. |
| Unresolved questions | Good | Add: (5) backup/PITR posture for production (hosted free tier has no PITR — decide whether launch-day data justifies a paid plan); (6) confirm the returned-restock asymmetry (3.3). |

**Missing from the plan entirely:** migration 10 (the settlement hardening above) — it is the only new code the plan needs *before* C1; everything else in this review is sequencing, checks or owner questions.

---

## 4. Safe check separation (read-only vs mutating)

**Read-only (safe any time, no side effects, no secrets beyond the project password):**

```
supabase projects list                                    # confirm link target (1.6)
supabase migration list                                   # A1
select tgname from pg_trigger
  where tgname in ('profiles_protect_platform_admin_insert',
                   'vendor_members_guard_last_owner')
    and tgrelid::regclass::text not like 'pg_%';          # A2 (expect 0 rows)
select proname from pg_proc
  where proname = 'is_vendor_staff';                      # A2 (expect 0 rows)
select id, public, file_size_limit, allowed_mime_types
  from storage.buckets where id = 'product-images';       # A2 (expect 0 rows pre-push)
select schemaname, tablename, policyname from pg_policies
  where schemaname = 'storage'
    and policyname like 'product images%';                # A2 (expect 0 rows)
select tgname from pg_trigger
  where tgname in ('profiles_protect_platform_admin',
                   'profiles_protect_platform_admin_insert');  # post-A5 guard check
```

**Mutating (one-way doors; run only in order, only after the matching read-only check is green):** `supabase db push` (A3), Storage API upload/delete (A4), the §5 admin bootstrap (A5). Everything else in this review is docs.

---

## 5. Guard-free first-admin bootstrap (replaces A5)

The guards involved:

- **UPDATE guard** `profiles_protect_platform_admin` (`00000000000001_gifto_foundations.sql:101-123`): blocks any `is_platform_admin` change unless the *caller's* profile is already an admin. With no JWT (`auth.uid()` null, i.e. the SQL editor / migration role), the `not exists` check finds nothing → **direct `update` is blocked even for postgres**. This is why the test suite disables the trigger — and why we must not copy that recipe.
- **INSERT guard** `profiles_protect_platform_admin_insert` (`00000000000008_security_hardening.sql:27-47`): blocks admin-flag inserts only when `auth.uid() is not null` and the caller is not an admin. The comment at lines 20–22 documents the intentional carve-out: *"no user JWT (auth.uid() is null) — service_role, migrations, seed scripts."* With no JWT the condition short-circuits → **insert of an admin-flagged profile is allowed.**
- `handle_new_user` auto-creates the profile with `is_platform_admin = false` on signup (`00000000000002_account_provisioning_and_vendor_onboarding.sql:30-46`), so a plain signup can never be an admin.

**Procedure (no trigger is disabled, no direct `auth.users` write):**

1. Create the auth user via the supported path: Supabase Dashboard → Authentication → Create user (email + password, auto-confirm), or `auth.admin.createUser({ email, password, email_confirm: true })` with the service-role key. `handle_new_user` fires and creates the profile with the flag `false`.
2. In the Dashboard SQL editor (runs as `postgres`, no JWT) — **delete the auto-created profile and re-insert it flagged**, which uses the INSERT guard's documented trusted path instead of fighting the UPDATE guard:

   ```sql
   begin;
   delete from public.profiles where id = '<auth-user-uuid>';
   insert into public.profiles (id, email, is_platform_admin)
     values ('<auth-user-uuid>', '<email>', true);
   commit;
   ```

   (`postgres` owns `public.profiles` and RLS is enabled but not forced, so both statements execute; the INSERT guard passes because `auth.uid()` is null.)
3. Run immediately after user creation, before the user applies as a vendor — `vendor_members.profile_id` references `profiles`, so a membership row would block the delete.
4. Sign in as the user and open `/admin`.
5. Verify no guard was touched:
   `select tgname from pg_trigger where tgname in ('profiles_protect_platform_admin','profiles_protect_platform_admin_insert');` → both rows present.

Why this shape: the delete+insert is idempotent, transactional, leaves a clean audit trail in the SQL editor history, and exercises exactly the path migration 8's author intended for seed/bootstrap — rather than suspending the defence it was written to install.

---

## 6. Safe execution order

```
Operational (Workstream A, corrected):
  A1 (list, read-only) → A2 (conflict checks, read-only) → A3 (db push + verify)
  → A5 (guard-free admin bootstrap, §5) → A4 (hosted upload smoke test) → A6 (docs sync)

Implementation (new; interleaves after A3):
  Migration 10 — settlement hardening (2.1, 2.2, 2.4, 2.5)  ← first implementation task
  Migration 10b — shipped → cancelled transition (3.2)       ← may share the migration
  C1 — admin settlements UI (after migration 10 + A3)
  C2 — transition UI + tests + D-04/D-05 amendment (after migration 10b)

Parallel:
  B1 — owner answers (D-06 remainder, D-07, D-08 remainder)
       + the two new owner questions: returned-restock (3.3), migration-10 void policy (2.4)
  D1–D6 — as capacity allows; D2 (E2E) before any public launch marketing
```

Never: `db push` to anything but the Gifto project; A4 before A5; C1 before migration 10; the old A5 trigger-disable recipe.

---

## 7. Acceptance criteria

**Deployment (A-stream):**

1. `supabase migration list` against `hqusykdyjpruysxezsrn` shows migrations 1–9 applied, none pending.
2. Both hardening triggers exist; `is_vendor_staff` is gone (queries in §4 return the expected rows).
3. `product-images` bucket exists with `public = true`, `file_size_limit = 5242880`, and the MIME list from migration 9 — settings verified, not just existence.
4. Vendor-manager upload succeeds through the real Storage API; public/anonymous read of the object URL succeeds; a second vendor's manager is rejected inside the first vendor's folder prefix.
5. The bootstrap admin signs in and opens `/admin`; the guard-verification query (§5 step 5) returns both triggers — proving no guard was disabled.
6. Local regression stays green: 107/107 DB assertions across the 7 suites + 31/31 Vitest (re-run after migration 10/10b regardless of A-stream timing).

**Settlement (before the first real payout):**

1. `create_settlement` twice for the same vendor → second call fails with the friendly `23514` message; under a concurrent double-click the partial unique index guarantees exactly one open settlement.
2. `mark_settlement_paid` twice → second call fails; `paid_at` set once.
3. Every settlement row answers *who* created it and *who* paid it (`created_by` / `paid_by` non-null after RPC calls).
4. A mistaken open settlement can be voided without raw SQL; a voided settlement releases the vendor for the next batch.
5. Non-admin RPC calls are rejected (`42501`); vendors can read only their own settlements; cross-vendor reads are empty (existing suite assertions, re-run).
6. Ops runbook exists with the ordering rule: *returns before payouts*; the C1 UI displays the equivalent warning at the point of marking an order returned.
7. COD-failure path live: a vendor cancels a shipped suborder → stock restored, movement logged, **no** commission entry, parent order syncs; customer-facing label explains the state.

---

## 8. Unresolved owner decisions

**Already in the brief (`OWNER_DECISIONS_BRIEF.md`) — unchanged:**

- D-06 remainder: future delivery-fee model (free at launch already decided; recommend flat fee per shop later).
- D-07: subscriptions (recommend Option A — none at launch).
- D-08 remainder: settlement cadence (recommend fixed weekly, admin-triggered, matching C1).

**New questions surfaced by this review — put to the owner with C2/migration 10:**

1. **Returned goods restock?** (3.3) Today `returned` does not restore stock while `cancelled` does. Decide: add restock-on-returned in a migration, or declare "vendors adjust returned stock manually via `adjust_product_stock`" the official policy and document it in D-05.
2. **Void policy for settlements** (2.4): confirm admins may void an unpaid settlement (recommended) so the one-open-per-vendor lock is recoverable.
3. **Who is the first admin?** (operational, not strategic) — named account for A5 and for the `created_by`/`paid_by` audit trail.

None of these three blocks migration 10's schema work; item 2 only decides whether `void` ships in migration 10 or immediately after.

---

## 9. Recommended first implementation task

**Migration 10 — settlement hardening** (unblocks C1, touches no blocked decision):

1. `alter table public.settlements add column created_by uuid references public.profiles(id) on delete set null, add column paid_by uuid references public.profiles(id) on delete set null;`
2. `create unique index settlements_one_open_per_vendor on public.settlements (vendor_id) where status = 'open';` (backed by a check that no hosted data violates it — pre-launch data should be empty; verify during A2 anyway.)
3. Add `void` to `settlement_status`; add `voided_at` + matching CHECK; add `mark_settlement_void(uuid)` RPC mirroring `mark_settlement_paid` (admin-gated, `for update`, rejects voiding a paid settlement, rejects double-void).
4. Update `create_settlement` / `mark_settlement_paid` to stamp `created_by` / `paid_by = auth.uid()`.
5. Fix `mark_settlement_paid`'s not-found errcode to `22023`.
6. Extend `rls_commissions_test.sql`: audit columns non-null after RPCs; concurrent-style double `create_settlement` leaves one row (the unique index); void flow incl. vendor-lock release; existing 13 assertions still green.

Bundle or immediately follow with **migration 10b** (§3's `shipped → cancelled`) if the owner sign-off on the D-04/D-05 amendment is in hand; otherwise ship migration 10 alone and land 10b when signed off. Then build C1 against both.

First *operational* task, independent of all of the above: **A1** — one read-only command once the project password is to hand.
