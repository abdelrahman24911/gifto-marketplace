-- C1 rehearsal fixtures — deterministic mimic of the production shape
-- described in docs/DEMO_CONTAINMENT_AND_FINANCIAL_RECONCILIATION_PLAN.md
-- §5.1. Runs ONLY against a disposable database (see scripts/rehearse-c1.sh).
--
-- Seeds exactly the graph C1 expects:
--   * Nile Blossoms  (a59bb38c-...) — paid settlement 2c589855-..., 305,760,
--     6 delivered suborders, 6 earned commissions, 6 unreleased lines.
--   * Legacy Engraving (6d0b15cb-...) — paid settlement 7cadf821-..., 479,500,
--     5 delivered suborders, 5 earned commissions, 5 unreleased lines.
--   * Cairo Cocoa (c1000000-...) — open settlement d1e74ebf-..., 269,250,
--     6 delivered suborders, 6 earned commissions, 6 unreleased lines
--     (the plan's third settlement; exercises the "only two paid" and
--     "target vendors have no other open settlement" preconditions).
-- The Alexandria voided settlement from the plan is NOT seeded: voiding
-- exercises nothing C1-specific.
--
-- All contact fields are synthetic rehearsal values, never real customer
-- data. UUIDs are deterministic (fixed prefixes + sequence) so the
-- rehearsal is repeatable.

\set ON_ERROR_STOP on

do $$
declare
  v_paid_by uuid := '15a1e4f6-2abf-480e-acea-ec47d01dea86';
begin
  -- settlements.paid_by references profiles (migration 16 FK): the admin
  -- who "paid" the fixtures must exist as a profile first. The profile
  -- is created by the auth.users insert trigger, as in the RLS suites.
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_paid_by, 'admin@rehearsal.gifto.test', '{"full_name":"Rehearsal Admin"}'::jsonb);

  insert into public.vendors (id, name, slug, status, commission_rate, is_demo, city, governorate)
  values
    ('a59bb38c-729d-4a0e-b3fd-8e7dd46717d6', 'Nile Blossoms', 'nile-blossoms', 'active', 0.1000, true, 'Alexandria', 'Alexandria'),
    ('6d0b15cb-575f-4eec-95b4-78db59ff71ac', 'Legacy Engraving Studio', 'legacy-engraving', 'active', 0.1000, true, 'Alexandria', 'Alexandria'),
    ('c1000000-0000-0000-0000-0000000000c1', 'Cairo Cocoa', 'cairo-cocoa', 'active', 0.1000, true, 'Cairo', 'Cairo');

  insert into public.products (id, vendor_id, name, slug, price_minor, stock, status)
  values
    ('51000000-0000-0000-0000-000000000001', 'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6', 'Rehearsal Bouquet', 'rehearsal-bouquet', 509600, 100, 'active'),
    ('51000000-0000-0000-0000-000000000002', '6d0b15cb-575f-4eec-95b4-78db59ff71ac', 'Rehearsal Engraving', 'rehearsal-engraving', 959000, 100, 'active'),
    ('51000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-0000000000c1', 'Rehearsal Cocoa', 'rehearsal-cocoa', 448750, 100, 'active');

  insert into public.settlements (id, vendor_id, status, total_minor, note, created_at, paid_at, paid_by)
  values
    ('2c589855-3f11-4708-a8c3-7738ffa25e80', 'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6', 'paid', 305760, 'DEMO-SEED: nile-blossoms payout history', '2026-11-09T10:00:00Z', '2026-11-11T16:00:00Z', v_paid_by),
    ('7cadf821-22a4-409f-9617-6bfae5124b6e', '6d0b15cb-575f-4eec-95b4-78db59ff71ac', 'paid', 479500, 'DEMO-SEED: legacy-engraving payout history', '2026-11-09T10:00:00Z', '2026-11-11T16:00:00Z', v_paid_by),
    ('d1e74ebf-7b72-4195-93ae-bb1c08c7c7b4', 'c1000000-0000-0000-0000-0000000000c1', 'open', 269250, 'DEMO-SEED: cairo-cocoa payout history', '2026-11-09T10:00:00Z', null, null);
end $$;

-- One delivered order + suborder + item + earned commission per line, then
-- one unreleased settlement line per commission. Sequence 1–6 = Nile,
-- 7–11 = Legacy, 12–17 = Cairo.
do $$
declare
  r record;
  v_order_id uuid;
  v_suborder_id uuid;
  v_commission_id uuid;
begin
  for r in
    select seq, vendor_id::uuid, product_id::uuid, product_name,
           base_minor, amount_minor, settlement_id::uuid
    from (values
      (1,  'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6', '51000000-0000-0000-0000-000000000001', 'Rehearsal Bouquet',   509600, 50960,  '2c589855-3f11-4708-a8c3-7738ffa25e80'),
      (2,  'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6', '51000000-0000-0000-0000-000000000001', 'Rehearsal Bouquet',   509600, 50960,  '2c589855-3f11-4708-a8c3-7738ffa25e80'),
      (3,  'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6', '51000000-0000-0000-0000-000000000001', 'Rehearsal Bouquet',   509600, 50960,  '2c589855-3f11-4708-a8c3-7738ffa25e80'),
      (4,  'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6', '51000000-0000-0000-0000-000000000001', 'Rehearsal Bouquet',   509600, 50960,  '2c589855-3f11-4708-a8c3-7738ffa25e80'),
      (5,  'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6', '51000000-0000-0000-0000-000000000001', 'Rehearsal Bouquet',   509600, 50960,  '2c589855-3f11-4708-a8c3-7738ffa25e80'),
      (6,  'a59bb38c-729d-4a0e-b3fd-8e7dd46717d6', '51000000-0000-0000-0000-000000000001', 'Rehearsal Bouquet',   509600, 50960,  '2c589855-3f11-4708-a8c3-7738ffa25e80'),
      (7,  '6d0b15cb-575f-4eec-95b4-78db59ff71ac', '51000000-0000-0000-0000-000000000002', 'Rehearsal Engraving', 959000, 95900,  '7cadf821-22a4-409f-9617-6bfae5124b6e'),
      (8,  '6d0b15cb-575f-4eec-95b4-78db59ff71ac', '51000000-0000-0000-0000-000000000002', 'Rehearsal Engraving', 959000, 95900,  '7cadf821-22a4-409f-9617-6bfae5124b6e'),
      (9,  '6d0b15cb-575f-4eec-95b4-78db59ff71ac', '51000000-0000-0000-0000-000000000002', 'Rehearsal Engraving', 959000, 95900,  '7cadf821-22a4-409f-9617-6bfae5124b6e'),
      (10, '6d0b15cb-575f-4eec-95b4-78db59ff71ac', '51000000-0000-0000-0000-000000000002', 'Rehearsal Engraving', 959000, 95900,  '7cadf821-22a4-409f-9617-6bfae5124b6e'),
      (11, '6d0b15cb-575f-4eec-95b4-78db59ff71ac', '51000000-0000-0000-0000-000000000002', 'Rehearsal Engraving', 959000, 95900,  '7cadf821-22a4-409f-9617-6bfae5124b6e'),
      (12, 'c1000000-0000-0000-0000-0000000000c1', '51000000-0000-0000-0000-000000000003', 'Rehearsal Cocoa',     448750, 44875,  'd1e74ebf-7b72-4195-93ae-bb1c08c7c7b4'),
      (13, 'c1000000-0000-0000-0000-0000000000c1', '51000000-0000-0000-0000-000000000003', 'Rehearsal Cocoa',     448750, 44875,  'd1e74ebf-7b72-4195-93ae-bb1c08c7c7b4'),
      (14, 'c1000000-0000-0000-0000-0000000000c1', '51000000-0000-0000-0000-000000000003', 'Rehearsal Cocoa',     448750, 44875,  'd1e74ebf-7b72-4195-93ae-bb1c08c7c7b4'),
      (15, 'c1000000-0000-0000-0000-0000000000c1', '51000000-0000-0000-0000-000000000003', 'Rehearsal Cocoa',     448750, 44875,  'd1e74ebf-7b72-4195-93ae-bb1c08c7c7b4'),
      (16, 'c1000000-0000-0000-0000-0000000000c1', '51000000-0000-0000-0000-000000000003', 'Rehearsal Cocoa',     448750, 44875,  'd1e74ebf-7b72-4195-93ae-bb1c08c7c7b4'),
      (17, 'c1000000-0000-0000-0000-0000000000c1', '51000000-0000-0000-0000-000000000003', 'Rehearsal Cocoa',     448750, 44875,  'd1e74ebf-7b72-4195-93ae-bb1c08c7c7b4')
    ) as t(seq, vendor_id, product_id, product_name, base_minor, amount_minor, settlement_id)
  loop
    v_order_id := ('11111111-0000-0000-0000-' || lpad(r.seq::text, 12, '0'))::uuid;
    v_suborder_id := ('22222222-0000-0000-0000-' || lpad(r.seq::text, 12, '0'))::uuid;
    v_commission_id := ('44444444-0000-0000-0000-' || lpad(r.seq::text, 12, '0'))::uuid;

    insert into public.orders (id, status, payment_method, currency, subtotal_minor, delivery_fee_minor, total_minor,
      recipient_name, contact_phone, address_line, city, governorate, created_at)
    values (v_order_id, 'delivered', 'cod', 'EGP', r.base_minor, 0, r.base_minor,
      'Rehearsal Recipient', '01000000000', '1 Rehearsal Road', 'Alexandria', 'Alexandria', '2026-11-09T10:00:00Z');

    insert into public.order_vendors (id, order_id, vendor_id, status, subtotal_minor, delivery_fee_minor,
      commission_rate, delivered_at, created_at)
    values (v_suborder_id, v_order_id, r.vendor_id, 'delivered', r.base_minor, 0,
      0.1000, '2026-11-10T10:00:00Z', '2026-11-09T10:00:00Z');

    insert into public.order_items (id, order_vendor_id, product_id, product_name, product_slug,
      unit_price_minor, quantity, line_total_minor, created_at)
    values (('33333333-0000-0000-0000-' || lpad(r.seq::text, 12, '0'))::uuid,
      v_suborder_id, r.product_id, r.product_name, 'rehearsal-product',
      r.base_minor, 1, r.base_minor, '2026-11-09T10:00:00Z');

    insert into public.commission_entries (id, order_vendor_id, vendor_id, status, rate, base_minor, amount_minor, earned_at)
    values (v_commission_id, v_suborder_id, r.vendor_id, 'earned', 0.1000, r.base_minor, r.amount_minor, '2026-11-10T10:00:00Z');

    insert into public.settlement_lines (id, settlement_id, commission_entry_id, amount_minor, created_at)
    values (('55555555-0000-0000-0000-' || lpad(r.seq::text, 12, '0'))::uuid,
      r.settlement_id, v_commission_id, r.amount_minor, '2026-11-09T10:00:00Z');
  end loop;
end $$;

select 'rehearsal seed: '
  || (select count(*) from public.settlements) || ' settlements, '
  || (select count(*) from public.settlement_lines) || ' lines, '
  || (select count(*) from public.commission_entries) || ' commissions, '
  || (select count(*) from public.order_vendors) || ' suborders, '
  || (select count(*) from public.orders) || ' orders'
  as rehearsal_seed_summary;
