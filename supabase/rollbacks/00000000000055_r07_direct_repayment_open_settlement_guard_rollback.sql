-- Rollback for migration 55 (R-07): restore the migration 43
-- record_clawback_direct_repayment definition — status check only,
-- no open-settlement guard.

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
  'D-08 fallback (N-01): records that a vendor repaid a paid-return clawback directly because there is no next settlement to carry it into. The clawback keeps its original amount; the reference is the repayment proof.';
