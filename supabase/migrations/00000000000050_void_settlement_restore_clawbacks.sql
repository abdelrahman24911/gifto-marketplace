-- Migration 50 — R-01 (re-audit v3, HIGH): voiding a settlement must
-- restore the paid-return clawbacks it consumed.
--
-- create_settlement (migration 43) flips a clawback to 'consumed' at
-- creation and records the netting in clawback_applications. The old
-- void_settlement (migration 18) released the settlement lines and
-- marked the batch voided but never touched clawback_applications or
-- commission_clawbacks, so a voided open batch silently burned the
-- clawback: it stayed 'consumed', was never re-netted, and no longer
-- counted as outstanding.
--
-- This migration redefines void_settlement (uuid, text) only: before the
-- batch is marked voided, every clawback_application for this settlement
-- is deleted and any clawback it had flipped to 'consumed' is restored
-- to 'outstanding' with consumed_at cleared. A partially applied
-- clawback stays 'outstanding' (it already was); deleting its
-- application restores the un-applied portion automatically, because
-- the outstanding amount is abs(amount_minor) minus the remaining
-- applications. A 'direct_repayment' clawback is never restored — it
-- is closed by a direct repayment, not by a settlement, and
-- create_settlement only nets 'outstanding' clawbacks, so it can have
-- no application to this batch; the restore is explicitly limited to
-- status = 'consumed'.
--
-- The voided settlement's own totals are NOT changed: its total_minor
-- and clawback_minor remain the historical snapshot of the voided
-- batch (rls_commissions TEST 14 asserts void never changes the
-- original total). The next create_settlement for the vendor re-batches
-- the released lines and re-nets the restored clawback from scratch.
-- Paid and already-voided settlements are still refused, as before.
-- Only the void path changes; create_settlement, mark_settlement_paid,
-- resolve_refund_case and the clawback scope trigger are untouched.

drop function if exists public.void_settlement(uuid, text);

create or replace function public.void_settlement(
  p_settlement_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status    public.settlement_status;
  v_voided_at timestamptz;
  v_reason    text;
  v_now       timestamptz := now();
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can void a settlement.'
      using errcode = '42501';
  end if;

  v_reason := nullif(btrim(p_reason), '');

  if v_reason is null then
    raise exception 'A reason is required to void a settlement.'
      using errcode = '22023';
  end if;

  if length(v_reason) > 500 then
    raise exception 'A void reason must be 500 characters or fewer.'
      using errcode = '22023';
  end if;

  select status, voided_at into v_status, v_voided_at
    from public.settlements
   where id = p_settlement_id
     for update;

  if v_status is null then
    raise exception 'Settlement not found.' using errcode = '22023';
  end if;

  if v_status = 'paid' then
    raise exception 'A paid settlement cannot be voided.' using errcode = '23514';
  end if;

  if v_status = 'voided' or v_voided_at is not null then
    raise exception 'This settlement is already voided.' using errcode = '23514';
  end if;

  update public.settlement_lines
     set released_at = v_now,
         released_by = auth.uid(),
         release_reason = v_reason
   where settlement_id = p_settlement_id
     and released_at is null;

  -- R-01: restore clawbacks this batch had consumed. The settlement row
  -- is locked above, and a second open settlement for the same vendor
  -- cannot exist while this one is open, so no other batch can consume
  -- these clawbacks concurrently. Restore first (using the applications
  -- still present), then delete the applications.
  update public.commission_clawbacks cb
     set status = 'outstanding',
         consumed_at = null
   where cb.status = 'consumed'
     and cb.id in (
       select clawback_id
         from public.clawback_applications
        where settlement_id = p_settlement_id
     );

  delete from public.clawback_applications
   where settlement_id = p_settlement_id;

  update public.settlements
     set status = 'voided',
         voided_at = v_now,
         voided_by = auth.uid(),
         void_reason = v_reason
   where id = p_settlement_id;
end;
$$;

revoke all on function public.void_settlement(uuid, text) from public, anon;
grant execute on function public.void_settlement(uuid, text) to authenticated;

comment on function public.void_settlement(uuid, text) is
  'Admin void of an open settlement batch (R-01): releases the lines, restores any paid-return clawbacks this batch had consumed to outstanding (deleting their applications), and preserves the voided batch totals as history.';
