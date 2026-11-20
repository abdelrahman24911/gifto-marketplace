-- R-02 (D-08, N-01): a clawback-only vendor.
--
-- A vendor whose only balance is an outstanding paid-return clawback has
-- no new commission to net it against, so create_settlement used to fail
-- with the generic "There is nothing to settle for this shop." and the
-- admin had no next step: the clawback was stranded with no caller for
-- the direct-repayment fallback (record_clawback_direct_repayment,
-- migration 43).
--
-- This migration deliberately does NOT create an empty batch for that
-- vendor. An empty batch would either burn the clawback (marking it
-- consumed while Gifto received nothing — the R-01 failure shape) or sit
-- forever unpayable, because mark_settlement_paid requires a transfer
-- reference for any non-zero-net batch and the zero-net proof exception
-- only applies when clawbacks were actually applied to the batch. A
-- settlement must always represent commission Gifto is owed.
--
-- Instead create_settlement now distinguishes the two empty cases:
--   * outstanding clawbacks, no new commission — a distinct 23514 error
--     naming the amount still owed (net of any partial applications) and
--     directing the admin to record a direct repayment;
--   * nothing at all — the original generic message, unchanged.
-- The admin settlements page surfaces the same outstanding clawbacks
-- with a direct-repayment form, so the error message points at a real
-- action on the same page.
--
-- Only the empty-batch branch changes; the rest of the body is the
-- migration 43 definition verbatim.

create or replace function public.create_settlement(
  p_vendor_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement_id uuid;
  v_total         int;
  v_count         int;
  v_clawback_total int := 0;
  v_clawback_owed int := 0;
  v_claw        record;
  v_outstanding int;
  v_apply       int;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can create settlements.'
      using errcode = '42501';
  end if;

  if p_vendor_id is null or not exists (select 1 from public.vendors where id = p_vendor_id) then
    raise exception 'Choose a shop that exists.' using errcode = '22023';
  end if;

  if p_note is not null and length(p_note) > 500 then
    raise exception 'A settlement note must be 500 characters or fewer.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.settlements
     where vendor_id = p_vendor_id
       and status = 'open'
  ) then
    raise exception 'This shop already has an open settlement.' using errcode = '23514';
  end if;

  begin
    insert into public.settlements (vendor_id, note, created_by)
    values (p_vendor_id, nullif(trim(p_note), ''), auth.uid())
    returning id into v_settlement_id;
  exception when unique_violation then
    raise exception 'This shop already has an open settlement.' using errcode = '23514';
  end;

  perform 1
    from public.commission_entries ce
   where ce.vendor_id = p_vendor_id
     and ce.status = 'earned'
     and not exists (
       select 1
         from public.settlement_lines l
        where l.commission_entry_id = ce.id
          and l.released_at is null
     )
   order by ce.id
   for update;

  insert into public.settlement_lines (settlement_id, commission_entry_id, amount_minor)
  select v_settlement_id,
         ce.id,
         ce.amount_minor + coalesce(adj.total_minor, 0)
    from public.commission_entries ce
    left join (
      select commission_entry_id, sum(amount_minor) as total_minor
        from public.commission_adjustments
       group by commission_entry_id
    ) adj on adj.commission_entry_id = ce.id
   where ce.vendor_id = p_vendor_id
     and ce.status = 'earned'
     and not exists (
       select 1
         from public.settlement_lines l
        where l.commission_entry_id = ce.id
          and l.released_at is null
     )
     and ce.amount_minor + coalesce(adj.total_minor, 0) > 0
   order by ce.id;

  select coalesce(sum(amount_minor), 0), count(*)
    into v_total, v_count
    from public.settlement_lines
   where settlement_id = v_settlement_id;

  if v_count = 0 then
    -- R-02: no new commission. If the vendor still owes paid-return
    -- clawbacks, say so with the amount and the D-08 fallback instead
    -- of the generic message — and create nothing, so the clawback is
    -- never burned by an empty batch. The raise rolls the inserted
    -- settlement row back with the rest of the call.
    select coalesce(sum(
             abs(cb.amount_minor)
             - coalesce(app.applied_minor, 0)
           ), 0)
      into v_clawback_owed
      from public.commission_clawbacks cb
      left join (
        select clawback_id, sum(amount_minor) as applied_minor
          from public.clawback_applications
         group by clawback_id
      ) app on app.clawback_id = cb.id
     where cb.vendor_id = p_vendor_id
       and cb.status = 'outstanding';

    if v_clawback_owed > 0 then
      raise exception 'This shop has no new commission to settle, but still owes EGP %.2f in paid-return clawbacks. Record a direct repayment instead — a clawback cannot be netted against a settlement with no commission in it.', v_clawback_owed / 100.0
        using errcode = '23514';
    end if;

    raise exception 'There is nothing to settle for this shop.' using errcode = '23514';
  end if;

  -- N-01 carry (D-08): net outstanding clawbacks against this batch,
  -- oldest first. Each application is recorded exactly once; a clawback
  -- that does not fit in full stays outstanding for the next settlement,
  -- and a batch whose net would go negative is created with total 0.
  for v_claw in
    select cb.id, cb.amount_minor
      from public.commission_clawbacks cb
     where cb.vendor_id = p_vendor_id
       and cb.status = 'outstanding'
     order by cb.created_at, cb.id
     for update of cb
  loop
    exit when v_total - v_clawback_total <= 0;

    select abs(v_claw.amount_minor)
           - coalesce(sum(amount_minor), 0)
      into v_outstanding
      from public.clawback_applications
     where clawback_id = v_claw.id;

    v_apply := least(v_outstanding, v_total - v_clawback_total);

    if v_apply > 0 then
      insert into public.clawback_applications
        (clawback_id, settlement_id, amount_minor)
      values (v_claw.id, v_settlement_id, v_apply);

      v_clawback_total := v_clawback_total + v_apply;

      if v_apply = v_outstanding then
        update public.commission_clawbacks
           set status = 'consumed', consumed_at = now()
         where id = v_claw.id;
      end if;
    end if;
  end loop;

  update public.settlements
     set total_minor = v_total - v_clawback_total,
         clawback_minor = v_clawback_total
   where id = v_settlement_id;

  return v_settlement_id;
end;
$$;

revoke all on function public.create_settlement(uuid, text) from public, anon;
grant execute on function public.create_settlement(uuid, text) to authenticated;

comment on function public.create_settlement(uuid, text) is
  'Admin settlement batch (N-01, R-02): the net snapshot nets ordinary refund adjustments per line (migration 30) and outstanding paid-return clawbacks against the batch total, oldest first; a batch whose net would go negative is created with total 0 and the remainder carried forward. A vendor with outstanding clawbacks but no new commission gets a distinct error naming the amount owed and directing the admin to record a direct repayment — no empty batch is created, so the clawback is never burned.';
