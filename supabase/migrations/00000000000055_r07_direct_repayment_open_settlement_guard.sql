-- Migration 55 — R-07 (re-audit v4, MEDIUM, financial): a direct
-- repayment must not double-recover a clawback that is already being
-- recovered through an open settlement.
--
-- The hole: record_clawback_direct_repayment (migration 43) checked
-- only `status <> 'outstanding'`. A clawback partially netted into an
-- OPEN settlement stays 'outstanding' with a positive remainder, so it
-- still appears in the admin direct-repayment list — and recording a
-- direct repayment resolved the WHOLE clawback while the open batch
-- still held its application and its total was already reduced by it.
-- The applied part would be recovered twice: once by the netting when
-- the batch is paid, once by the direct repayment.
--
-- The guard (this migration, redefining only that one function):
--   * After locking the clawback row, lock every settlement referenced
--     by its clawback_applications (ordered by id). mark_settlement_paid
--     and void_settlement both lock the settlement row first, so this
--     serialises against a batch flipping open -> paid/voided between
--     the check and the update — the check below always sees the
--     settlement's final state for this transaction.
--   * If any application belongs to a settlement with status 'open',
--     raise 23514 and record nothing. The admin waits until that batch
--     is paid or voided, then records a direct repayment for whatever
--     is still owed (the remainder after the batch's netting).
--   * Applications in PAID settlements do NOT block: the applied part
--     is already realised by the netting, and the outstanding remainder
--     is exactly what a direct repayment is for. Applications in
--     VOIDED settlements cannot exist — void_settlement (migration 50)
--     deletes them and restores the clawback first.
--
-- No new signature, no UI amount: the RPC still takes only the
-- clawback id and the repayment reference. A partial direct repayment
-- (repaying only part of the remainder while a batch is still open)
-- would need an amount parameter, a new status and a UI amount field;
-- blocking until the batch resolves is the smaller, safer fix, and it
-- matches D-08 — direct repayment is the fallback when there is no
-- next settlement, not a parallel recovery path.

drop function if exists public.record_clawback_direct_repayment(uuid, text);

create or replace function public.record_clawback_direct_repayment(
  p_clawback_id uuid,
  p_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can record a direct clawback repayment.'
      using errcode = '42501';
  end if;

  if p_reference is null
     or length(trim(p_reference)) not between 3 and 200 then
    raise exception 'Enter the direct repayment reference (3–200 characters).'
      using errcode = '23514';
  end if;

  select status into v_status
    from public.commission_clawbacks
   where id = p_clawback_id
   for update;

  if v_status is null then
    raise exception 'Clawback not found.' using errcode = '22023';
  end if;

  if v_status <> 'outstanding' then
    raise exception 'This clawback is already resolved.' using errcode = '23514';
  end if;

  -- R-07: serialise against the batches holding this clawback's
  -- applications. mark_settlement_paid and void_settlement both lock
  -- the settlement row, so locking the referenced rows here means no
  -- batch can flip open -> paid/voided between this check and the
  -- update below.
  perform 1
    from public.settlements s
    join public.clawback_applications ca on ca.settlement_id = s.id
   where ca.clawback_id = p_clawback_id
   order by s.id
   for update of s;

  if exists (
    select 1
      from public.clawback_applications ca
      join public.settlements s on s.id = ca.settlement_id
     where ca.clawback_id = p_clawback_id
       and s.status = 'open'
  ) then
    raise exception 'This clawback is already being recovered through an open settlement. Wait until that settlement is paid or voided, then record a direct repayment for whatever is still owed.'
      using errcode = '23514';
  end if;

  update public.commission_clawbacks
     set status = 'direct_repayment',
         consumed_at = now(),
         direct_repayment_reference = trim(p_reference)
   where id = p_clawback_id;
end;
$$;

revoke all on function public.record_clawback_direct_repayment(uuid, text)
  from public, anon;
grant execute on function public.record_clawback_direct_repayment(uuid, text)
  to authenticated;

comment on function public.record_clawback_direct_repayment(uuid, text) is
  'D-08 fallback (N-01, R-07): records that a vendor repaid a paid-return clawback directly because there is no next settlement to carry it into. Refuses while any application of the clawback sits in an OPEN settlement (that part is already being recovered by the batch netting); applications in paid settlements do not block, the outstanding remainder is what the repayment covers. The clawback keeps its original amount; the reference is the repayment proof.';
