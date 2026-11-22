-- Rollback for 00000000000036_payout_proof.sql.
--
-- Drops the 5-argument mark_settlement_paid, restores the migration-30
-- 1-argument version (status/paid_at/paid_by only, no proof, no amount
-- check), and drops the payout-proof columns. Settlements paid while
-- P1-05 was live keep their status but lose the proof record; the
-- attestation reverts to the pre-P1-05 shape. No commission data is
-- altered.

drop function if exists public.mark_settlement_paid(uuid, int, text, text, text);

create or replace function public.mark_settlement_paid(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status        public.settlement_status;
  v_voided_at     timestamptz;
  v_vendor_id     uuid;
  v_line_count    int;
  v_valid_count   int := 0;
  v_line          record;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can mark a settlement paid.'
      using errcode = '42501';
  end if;

  select status, voided_at, vendor_id
    into v_status, v_voided_at, v_vendor_id
    from public.settlements
   where id = p_settlement_id
   for update;

  if v_status is null then
    raise exception 'Settlement not found.' using errcode = '22023';
  end if;

  if v_status = 'voided' or v_voided_at is not null then
    raise exception 'This settlement was voided and cannot be marked paid.'
      using errcode = '23514';
  end if;

  if v_status = 'paid' then
    raise exception 'This settlement is already paid.' using errcode = '23514';
  end if;

  select count(*)
    into v_line_count
    from public.settlement_lines
   where settlement_id = p_settlement_id;

  if v_line_count = 0 then
    raise exception 'A settlement with no lines cannot be marked paid.'
      using errcode = '23514';
  end if;

  for v_line in
    select l.id,
           l.commission_entry_id,
           l.amount_minor,
           l.currency,
           l.released_at,
           l.release_reason,
           ce.vendor_id as entry_vendor_id,
           ce.status as entry_status,
           ce.currency as entry_currency,
           ce.amount_minor as entry_amount_minor,
           coalesce((
             select sum(ca.amount_minor)
               from public.commission_adjustments ca
              where ca.commission_entry_id = ce.id
           ), 0) as adjustment_minor
      from public.settlement_lines l
      join public.commission_entries ce
        on ce.id = l.commission_entry_id
     where l.settlement_id = p_settlement_id
     order by l.commission_entry_id
     for update of l, ce
  loop
    if v_line.entry_vendor_id <> v_vendor_id
       or v_line.currency <> v_line.entry_currency
       or v_line.entry_status <> 'earned'
       or v_line.released_at is not null
       or v_line.release_reason is not null
       or v_line.amount_minor
          <> v_line.entry_amount_minor + v_line.adjustment_minor then
      raise exception 'Settlement commission data is inconsistent and cannot be marked paid.'
        using errcode = '23514';
    end if;

    v_valid_count := v_valid_count + 1;
  end loop;

  if v_valid_count <> v_line_count then
    raise exception 'Settlement commission data is incomplete and cannot be marked paid.'
      using errcode = '23514';
  end if;

  update public.settlements
     set status = 'paid',
         paid_at = now(),
         paid_by = auth.uid()
   where id = p_settlement_id;
end;
$$;

revoke all on function public.mark_settlement_paid(uuid) from public, anon;

grant execute on function public.mark_settlement_paid(uuid) to authenticated;

alter table public.settlements
  drop constraint if exists settlements_payout_proof_matches,
  drop column if exists proof_note,
  drop column if exists transfer_reference,
  drop column if exists transfer_method,
  drop column if exists paid_amount_minor;
