-- Rollback for 00000000000017_settlement_void_state.sql.
--
-- PostgreSQL cannot remove an enum value in place. If the void lifecycle has
-- ever been used, this rollback refuses rather than leaving a partial or
-- misleading state. When it succeeds, the enum label `voided` remains as a
-- harmless unused label; rollback 18 must be run first to restore the RPCs that
-- do not reference the release columns.

do $$
begin
  if to_regprocedure('public.void_settlement(uuid,text)') is not null then
    raise exception 'Refusing to roll back 17: roll back 18 first.';
  end if;

  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.settlements'::regclass
       and conname in ('settlements_void_state_matches', 'settlements_void_reason_required')
  ) then
    raise exception 'Refusing to roll back 17: roll back 18 first.';
  end if;

  if exists (
    select 1 from public.settlements
     where status = 'voided'
        or voided_at is not null
        or void_reason is not null
  ) then
    raise exception 'Refusing to roll back 17: voided settlement history exists. Preserve/export it first.';
  end if;

  if exists (
    select 1 from public.settlement_lines
     where released_at is not null
        or release_reason is not null
  ) then
    raise exception 'Refusing to roll back 17: released settlement-line history exists. Preserve/export it first.';
  end if;
end $$;

alter table public.settlement_lines
  drop constraint if exists settlement_lines_release_audit_matches,
  drop column if exists release_reason,
  drop column if exists released_by,
  drop column if exists released_at;

alter table public.settlements
  drop column if exists void_reason;

-- The `voided` enum label remains because PostgreSQL has no safe in-place
-- `ALTER TYPE ... DROP VALUE`. It is unreachable once rollback 18 restores the
-- one-argument void RPC and the pre-18 status checks.
