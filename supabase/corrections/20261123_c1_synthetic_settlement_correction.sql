-- ============================================================================
-- C1 — Correction of the two synthetic paid settlements (owner-confirmed)
-- ============================================================================
--
-- WHAT: sets the two synthetic demo-fixture settlements back to `open`
-- and clears `paid_at` / `paid_by`. Preserves IDs, totals, notes, lines,
-- commissions, vendor associations and `created_at`. Fabricates NO payout
-- proof. After this, the rows can only be paid again with real proof for
-- a real transfer (migration 36 + 43, mark_settlement_paid 5-arg).
--
-- TARGETS (plan §5.1, owner-confirmed synthetic fixtures from
-- demo/catalogue-seed commit 473fa27 — no money moved):
--   2c589855-3f11-4708-a8c3-7738ffa25e80  Nile Blossoms,        305,760 piastres, 6 lines
--   7cadf821-22a4-409f-9617-6bfae5124b6e  Legacy Engraving,     479,500 piastres, 5 lines
--
-- WHEN: run manually, ONCE, BEFORE migration 36 is applied (36 fails on
-- paid-without-proof rows). This is NOT a numbered migration and must
-- never be added to supabase/migrations/: it cannot sit in the 28–66
-- chain because it has to run before 36. Run order for a fresh deploy:
--   1. apply migrations 1–35 (or 1–27 — see the guards below)
--   2. run this script (rehearse first: scripts/rehearse-c1.sh)
--   3. apply migrations 36–67
--   4. `db push` / deploy
--
-- IDEMPOTENCY:
--   - Targets absent (already cleaned up / never seeded): NOTICE, no-op.
--   - Both targets already open with paid fields cleared: NOTICE, no-op.
--   - Any other mix (one paid, one open; totals changed; lines released):
--     ABORT, nothing changes. Re-running after a successful C1 is a no-op.
--
-- GUARDS: commission_adjustments / refund_cases exist only from
-- migration 30, so the checks that read them are guarded with
-- to_regclass() and dynamic SQL — the script works at migration-27
-- state as well as migration-35 state. A pre-36 guard aborts if the
-- migration-36 proof columns/constraint already exist (C1 is
-- meaningless after 36; use a forward correction instead).
--
-- SAFETY: single transaction, repeatable read, advisory lock (so two
-- operators cannot run it concurrently), deterministic row locks,
-- lock/statement timeouts. The snapshot SELECT below MUST be captured
-- to a file before the UPDATE runs — do not proceed until the snapshot
-- file is written and readable. Store it in an access-controlled ops
-- location, checksummed, with operator / approver / timestamp /
-- database project ref / SQL revision logged. A database backup is not
-- a substitute for this targeted snapshot.
--
-- DO NOT RUN against production without the owner decision D-11
-- (no-transfer premise + approval to run the correction) and a
-- verified backup/PITR restore path. Rollback, if ever needed and
-- still pre-36, is 20261123_c1_rollback_pre36_only.sql — emergency
-- reversal only, never a financial correction.
-- ============================================================================

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

-- This SELECT returns the full snapshot. Capture its c1_snapshot value
-- before the UPDATE (for example, export the query result from psql).
-- Do not proceed until the snapshot file is written and readable.
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
  v_targets_found integer;
  v_targets_paid integer;
  v_targets_open_clean integer;
  v_has_adjustments boolean;
  v_has_refund_cases boolean;
  v_bad boolean;
begin
  -- Pre-36 guard: the proof columns/constraint must not exist yet.
  if exists (
    select 1 from pg_constraint
    where conname = 'settlements_payout_proof_matches'
  ) or exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'settlements'
      and column_name = 'transfer_reference'
  ) then
    raise exception 'C1 aborted: migration 36 is already applied (payout proof exists). C1 runs only pre-36; use a forward correction instead.'
      using errcode = '23514';
  end if;

  select count(*) into v_targets_found
  from public.settlements
  where id in (select settlement_id from c1_targets);

  -- Idempotency: targets absent — nothing to correct.
  if v_targets_found = 0 then
    raise notice 'C1 skipped: neither target settlement exists in this database. No changes made.';
    return;
  end if;

  select count(*) into v_targets_paid
  from public.settlements
  where id in (select settlement_id from c1_targets)
    and status = 'paid';

  select count(*) into v_targets_open_clean
  from public.settlements
  where id in (select settlement_id from c1_targets)
    and status = 'open'
    and paid_at is null
    and paid_by is null;

  -- Idempotency: both already corrected — no-op.
  if v_targets_found = 2 and v_targets_open_clean = 2 then
    raise notice 'C1 already applied: both target settlements are open with paid fields cleared. No changes made.';
    return;
  end if;

  -- Any other mix is inconsistent — abort, change nothing.
  if v_targets_found <> 2 or v_targets_paid <> 2 then
    raise exception 'C1 aborted: expected exactly two paid target settlements (found %, paid %).'
      , v_targets_found, v_targets_paid
      using errcode = '23514';
  end if;

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

  -- commission_adjustments / refund_cases exist only from migration 30.
  -- At migration-27 state they are absent: the checks below are skipped
  -- (dynamic SQL, so an absent table is never planned against).
  v_has_adjustments := to_regclass('public.commission_adjustments') is not null;
  v_has_refund_cases := to_regclass('public.refund_cases') is not null;

  if v_has_adjustments then
    execute $q$
      select exists (
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
      )
    $q$ into v_bad;
    if v_bad then
      raise exception 'C1 aborted: a target line is not an earned, unadjusted commission.'
        using errcode = '23514';
    end if;

    execute $q$
      select exists (
        select 1
        from public.commission_adjustments
        where commission_entry_id in (select id from c1_commissions)
      )
    $q$ into v_bad;
    if v_bad then
      raise exception 'C1 aborted: a target commission has an adjustment.'
        using errcode = '23514';
    end if;
  else
    if exists (
      select 1
      from c1_lines l
      join c1_commissions ce on ce.id = l.commission_entry_id
      where ce.status <> 'earned'
         or l.amount_minor <> ce.amount_minor
    ) then
      raise exception 'C1 aborted: a target line is not an earned commission.'
        using errcode = '23514';
    end if;
  end if;

  if v_has_refund_cases then
    execute $q$
      select exists (
        select 1
        from public.refund_cases
        where order_vendor_id in (select id from c1_order_vendors)
      )
    $q$ into v_bad;
    if v_bad then
      raise exception 'C1 aborted: a target suborder has a refund case.'
        using errcode = '23514';
    end if;
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

  raise notice 'C1 applied: both target settlements are now open (paid_at/paid_by cleared). Totals, lines, commissions and orders unchanged.';
end $$;

select id, vendor_id, status, total_minor, paid_at, paid_by, updated_at
from public.settlements
where id in (select settlement_id from c1_targets)
order by id;

commit;
