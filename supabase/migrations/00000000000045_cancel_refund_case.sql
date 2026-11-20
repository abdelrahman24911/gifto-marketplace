-- Gifto Marketplace — N-03: cancel_refund_case RPC + UI (re-audit N-03,
-- Medium)
--
-- DEPENDENCY: D-09 (docs/DECISIONS.md) already decides that "customer can
-- cancel their own open refund case", so the cancel path is policy-approved
-- and this prompt ships.
--
-- THE GAP: migration 30's status enum and resolution-state CHECK include
-- 'cancelled', but no RPC or UI ever set it — the status was dead code. A
-- customer who opened a case by mistake could not withdraw it; the case
-- sat open, blocked settlement hygiene under the P0-07 hold rule, and
-- waited for an admin to reject something nobody wanted.
--
-- THE CHECK (migration 30, redefined here — migration 30 itself is never
-- edited in place): the original CHECK required resolved_by NOT NULL for
-- every cancelled row. That fits a signed-in canceller, who has a
-- profile — but a GUEST has no profile, so a guest-cancelled row cannot
-- carry a resolved_by at all. This migration therefore redefines the
-- CHECK with one narrow, guest-only carve-out: a cancelled row must
-- still have resolved_at NOT NULL and refund_amount_minor = 0, and
-- resolved_by is NOT NULL for non-guest cancellations and IS NULL for
-- guest cancellations. Nothing else is loosened: open/approved/rejected
-- branches are unchanged, and a cancelled row can never carry a refund
-- amount. The opener CHECK ((source = 'guest') = (opened_by is null))
-- already pins which rows are guest rows.
--
-- RACE SAFETY: both cancel RPCs lock the case row FOR UPDATE — the same
-- lock resolve_refund_case takes — so a concurrent resolve and cancel
-- serialise: whichever commits first wins, the other reads a non-open
-- status and gets the same generic "no longer open" error. Cancelling
-- has NO commission, stock, or settlement effect (nothing was approved
-- yet); a cancelled case frees the suborder's one-open-case slot (the
-- unique partial index), so a fresh case can be opened afterwards.
--
-- No admin-cancel or vendor-cancel path: admin decisions stay
-- approve/reject so the record stays honest.

-- ---------------------------------------------------------------------------
-- Resolution-state CHECK: guest-cancelled rows carry no resolved_by
-- ---------------------------------------------------------------------------

alter table public.refund_cases
  drop constraint refund_cases_resolution_matches;

alter table public.refund_cases
  add constraint refund_cases_resolution_matches check (
    (status = 'open'
       and resolved_at is null
       and resolved_by is null
       and refund_amount_minor is null)
    or (status = 'approved'
       and resolved_at is not null
       and resolved_by is not null
       and refund_amount_minor is not null
       and refund_amount_minor > 0)
    or (status = 'rejected'
       and resolved_at is not null
       and resolved_by is not null
       and refund_amount_minor = 0)
    or (status = 'cancelled'
       and resolved_at is not null
       and refund_amount_minor = 0
       and ((source <> 'guest' and resolved_by is not null)
            or (source = 'guest' and resolved_by is null)))
  );

-- ---------------------------------------------------------------------------
-- cancel_refund_case — signed-in customer cancels their own open case
-- ---------------------------------------------------------------------------

create or replace function public.cancel_refund_case(
  p_case_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case record;
begin
  if auth.uid() is null then
    raise exception 'Sign in to cancel a refund request.' using errcode = '42501';
  end if;

  -- The same FOR UPDATE lock resolve_refund_case takes: a concurrent
  -- resolve and cancel serialise, and exactly one outcome wins.
  select rc.*
    into v_case
    from public.refund_cases rc
   where rc.id = p_case_id
   for update;

  if v_case.id is null then
    raise exception 'Refund case not found.' using errcode = '22023';
  end if;

  -- Guests have opened_by NULL and must use cancel_guest_refund_case;
  -- any other customer can only cancel a case they opened themselves.
  if v_case.opened_by is null or v_case.opened_by <> auth.uid() then
    raise exception 'Only the customer who opened this refund can cancel it.'
      using errcode = '42501';
  end if;

  if v_case.status <> 'open' then
    raise exception 'This refund case is no longer open.' using errcode = '23514';
  end if;

  update public.refund_cases
     set status = 'cancelled',
         refund_amount_minor = 0,
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = p_case_id;
end;
$$;

revoke all on function public.cancel_refund_case(uuid)
  from public, anon;
grant execute on function public.cancel_refund_case(uuid)
  to authenticated;

comment on function public.cancel_refund_case(uuid) is
  'Customer cancels their own open refund case (N-03, D-09). Opener-only, status must be open, same FOR UPDATE lock as resolve_refund_case. No money, stock, or settlement effect.';

-- ---------------------------------------------------------------------------
-- cancel_guest_refund_case — guest cancels their own open case
-- (mirrors open_guest_refund_case: service-role only, token-hash verified)
-- ---------------------------------------------------------------------------

create or replace function public.cancel_guest_refund_case(
  p_order_id uuid,
  p_token_hash text,
  p_case_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case record;
begin
  if p_token_hash is null or not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.guest_token_hash is not null
       and o.guest_token_hash = p_token_hash
  ) then
    raise exception 'This order link is not valid.' using errcode = '42501';
  end if;

  select rc.*
    into v_case
    from public.refund_cases rc
   where rc.id = p_case_id
     and rc.order_id = p_order_id
   for update;

  if v_case.id is null then
    raise exception 'Refund case not found.' using errcode = '22023';
  end if;

  if v_case.source <> 'guest' or v_case.opened_by is not null then
    raise exception 'This refund case was not opened as a guest.'
      using errcode = '42501';
  end if;

  if v_case.status <> 'open' then
    raise exception 'This refund case is no longer open.' using errcode = '23514';
  end if;

  -- A guest has no profile, so resolved_by stays null (the CHECK's
  -- guest-cancelled branch requires exactly that).
  update public.refund_cases
     set status = 'cancelled',
         refund_amount_minor = 0,
         resolved_by = null,
         resolved_at = now()
   where id = p_case_id;
end;
$$;

revoke all on function public.cancel_guest_refund_case(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_guest_refund_case(uuid, text, uuid)
  to service_role;

comment on function public.cancel_guest_refund_case(uuid, text, uuid) is
  'Guest cancels their own open refund case (N-03, D-09). Service-role only, token-hash verified, opened_by IS NULL + source guest. No money, stock, or settlement effect.';
