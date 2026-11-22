-- Rollback for migration 45 (N-03 cancel_refund_case).
--
-- Drops both cancel RPCs and restores migration 30's resolution-state
-- CHECK (which requires resolved_by NOT NULL for every cancelled row).
-- Any case cancelled by a GUEST after migration 45 has resolved_by NULL
-- and would violate the restored CHECK: re-check those rows by hand
-- (cancelled guest cases must be re-resolved or left alone) before this
-- rollback is run on a database that has live guest cancellations.

drop function if exists public.cancel_guest_refund_case(uuid, text, uuid);
drop function if exists public.cancel_refund_case(uuid);

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
    or (status in ('rejected', 'cancelled')
       and resolved_at is not null
       and resolved_by is not null
       and refund_amount_minor = 0)
  );
