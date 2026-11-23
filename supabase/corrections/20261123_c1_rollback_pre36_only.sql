-- ============================================================================
-- C1 ROLLBACK — emergency reversal only, pre-36 only
-- ============================================================================
--
-- Reverses 20261123_c1_synthetic_settlement_correction.sql by setting both
-- target settlements back to `paid` with their ORIGINAL paid_at / paid_by
-- (2026-11-11T16:00:00Z, admin 15a1e4f6-2abf-480e-acea-ec47d01dea86).
--
-- THIS RECREATES THE UNSUPPORTED PAID STATE. It is not a financial
-- correction — it is only an emergency reversal of an unintended C1
-- execution. Do not run it without a NEW owner decision.
--
-- INVALID after migration 36: the payout-proof constraint rejects a paid
-- row with null proof, so this script aborts if 36 is applied. After 36,
-- rollback requires a verified backup/PITR restore or an approved forward
-- correction. Never drop the proof constraint to force a rollback.
--
-- Idempotency: targets absent → NOTICE, no-op. Both already paid with the
-- original values → NOTICE, no-op. Any other mix → ABORT.
-- ============================================================================

begin;

do $$
declare
  v_restored integer;
  v_found integer;
  v_already_paid integer;
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'settlements_payout_proof_matches'
  ) or exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'settlements'
      and column_name = 'transfer_reference'
  ) then
    raise exception 'C1 rollback aborted: migration 36 is already applied. Use a backup/PITR restore or an approved forward correction.'
      using errcode = '23514';
  end if;

  select count(*) into v_found
  from public.settlements
  where id in (
    '2c589855-3f11-4708-a8c3-7738ffa25e80',
    '7cadf821-22a4-409f-9617-6bfae5124b6e'
  );

  if v_found = 0 then
    raise notice 'C1 rollback skipped: neither target settlement exists. No changes made.';
    return;
  end if;

  select count(*) into v_already_paid
  from public.settlements
  where id in (
    '2c589855-3f11-4708-a8c3-7738ffa25e80',
    '7cadf821-22a4-409f-9617-6bfae5124b6e'
  )
    and status = 'paid'
    and paid_at = '2026-11-11T16:00:00Z'
    and paid_by = '15a1e4f6-2abf-480e-acea-ec47d01dea86';

  if v_found = 2 and v_already_paid = 2 then
    raise notice 'C1 rollback already applied: both targets are paid with the original values. No changes made.';
    return;
  end if;

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

  raise notice 'C1 rollback applied: both targets are paid again with the original paid_at/paid_by. This recreates the unsupported paid state — it is an emergency reversal only.';
end $$;

select id, status, total_minor, paid_at, paid_by, updated_at
from public.settlements
where id in (
  '2c589855-3f11-4708-a8c3-7738ffa25e80',
  '7cadf821-22a4-409f-9617-6bfae5124b6e'
)
order by id;

commit;
