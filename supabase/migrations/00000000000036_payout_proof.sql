-- Gifto Marketplace - P1-05 (H-09, CR-03): payout proof + COD reconciliation.
--
-- D-08 (DECIDED 2026-11-20) is the money direction: the vendor holds the
-- COD cash; weekly, every Sunday, for the prior week's delivered orders,
-- the vendor remits Gifto's commission to Gifto. mark_settlement_paid
-- attests that the commission was received by Gifto and requires a bank
-- transfer reference. This migration makes that attestation checkable:
--
--   * settlements gains paid_amount_minor, transfer_method,
--     transfer_reference and proof_note. The proof columns exist exactly
--     on paid settlements (CHECK below); a paid settlement's record is
--     never edited afterwards — there is no UPDATE path for it, and a
--     second mark_settlement_paid raises "already paid".
--   * mark_settlement_paid is redefined (new 5-argument signature; the
--     old 1-argument version is dropped) to require the proof and to
--     reject a paid amount that does not equal the derived D-08 amount:
--     the net commission snapshot migration 30 creates (sum of the
--     settlement lines). It also verifies the stored total equals the
--     sum of its lines, so a tampered total cannot be paid either.
--     Migration 30's net-snapshot semantics and per-line validation
--     are preserved verbatim below; the N-01 settlement raise in
--     resolve_refund_case is untouched.
--
-- What is NOT stored: no bank account numbers, no credentials of any
-- kind. The transfer reference is the vendor's bank transfer reference
-- (e.g. a receipt number), shown in full to the two parties to the
-- transfer (platform admin and the vendor who made it); there is
-- nothing to mask because no account details are recorded.
--
-- NOT closed here (separate prompt): N-01 post-payout refunds.

-- ---------------------------------------------------------------------------
-- settlements: payout proof columns
-- ---------------------------------------------------------------------------

alter table public.settlements
  add column if not exists paid_amount_minor int
    check (paid_amount_minor is null or paid_amount_minor >= 0),
  add column if not exists transfer_method text
    check (transfer_method is null
           or transfer_method in ('bank_transfer', 'cash', 'other')),
  add column if not exists transfer_reference text
    check (transfer_reference is null
           or length(transfer_reference) between 3 and 200),
  add column if not exists proof_note text
    check (proof_note is null or length(proof_note) <= 500);

-- Proof exists exactly on paid settlements. (Paid settlements cannot be
-- voided — void_settlement refuses them — so a paid row never has to shed
-- its proof.)
alter table public.settlements
  add constraint settlements_payout_proof_matches check (
    (status <> 'paid'
     and paid_amount_minor is null
     and transfer_method is null
     and transfer_reference is null
     and proof_note is null)
    or (status = 'paid'
        and paid_amount_minor is not null
        and transfer_method is not null
        and transfer_reference is not null)
  );

-- ---------------------------------------------------------------------------
-- mark_settlement_paid — redefined with payout proof (migration 30 body +
-- proof validation and total checks). Signature changed, so drop first.
-- ---------------------------------------------------------------------------

drop function if exists public.mark_settlement_paid(uuid);

create or replace function public.mark_settlement_paid(
  p_settlement_id uuid,
  p_paid_amount_minor int,
  p_transfer_method text,
  p_transfer_reference text,
  p_proof_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status        public.settlement_status;
  v_voided_at     timestamptz;
  v_vendor_id     uuid;
  v_stored_total  int;
  v_lines_total   int;
  v_line_count    int;
  v_valid_count   int := 0;
  v_line          record;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can mark a settlement paid.'
      using errcode = '42501';
  end if;

  -- Payout proof (P1-05, D-08): the amount, method and reference are part
  -- of the attestation, not optional metadata.
  if p_paid_amount_minor is null or p_paid_amount_minor < 0 then
    raise exception 'Enter the amount received, in piastres, of zero or more.'
      using errcode = '23514';
  end if;

  if p_transfer_method is null
     or p_transfer_method not in ('bank_transfer', 'cash', 'other') then
    raise exception 'Choose how the commission was transferred.'
      using errcode = '23514';
  end if;

  if p_transfer_reference is null
     or length(trim(p_transfer_reference)) not between 3 and 200 then
    raise exception 'Enter the transfer reference (3–200 characters).'
      using errcode = '23514';
  end if;

  if p_proof_note is not null and length(p_proof_note) > 500 then
    raise exception 'A proof note must be 500 characters or fewer.'
      using errcode = '23514';
  end if;

  select status, voided_at, vendor_id, total_minor
    into v_status, v_voided_at, v_vendor_id, v_stored_total
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

  -- The derived D-08 amount is the net commission snapshot (sum of the
  -- lines). The stored total must equal it, and the amount received must
  -- equal it too — a wrong amount or a tampered total cannot be paid.
  select coalesce(sum(amount_minor), 0)
    into v_lines_total
    from public.settlement_lines
   where settlement_id = p_settlement_id;

  if v_stored_total <> v_lines_total then
    raise exception 'The stored settlement total (%) does not match its lines (%), so it cannot be marked paid.'
      , v_stored_total, v_lines_total
      using errcode = '23514';
  end if;

  if p_paid_amount_minor <> v_lines_total then
    raise exception 'The amount received (%) does not match the commission due (%), so it cannot be marked paid.'
      , p_paid_amount_minor, v_lines_total
      using errcode = '23514';
  end if;

  update public.settlements
     set status = 'paid',
         paid_at = now(),
         paid_by = auth.uid(),
         paid_amount_minor = p_paid_amount_minor,
         transfer_method = p_transfer_method,
         transfer_reference = trim(p_transfer_reference),
         proof_note = nullif(trim(p_proof_note), '')
   where id = p_settlement_id;
end;
$$;

revoke all on function public.mark_settlement_paid(uuid, int, text, text, text)
  from public, anon;
grant execute on function public.mark_settlement_paid(uuid, int, text, text, text)
  to authenticated;

comment on function public.mark_settlement_paid(uuid, int, text, text, text) is
  'D-08 payout attestation (P1-05): records that Gifto received the net commission (sum of lines) with transfer method, reference and optional proof note. Rejects a wrong amount or a stored total that does not match its lines.';
