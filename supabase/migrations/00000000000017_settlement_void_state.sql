-- Phase 2B.1.1 — settlement void lifecycle, part 1 of 2.
--
-- A void must become an explicit, permanent state instead of an "open" row
-- distinguished only by `voided_at`. The settlement keeps its original lines and
-- amount; each line records when it was released, by whom and why.
--
-- PostgreSQL cannot use a newly added enum value in the same transaction that
-- adds it, so this migration only extends the enum and stores the new metadata.
-- The next migration backfills legacy rows and installs the RPCs/constraints.

alter type public.settlement_status add value if not exists 'voided';

alter table public.settlements
  add column if not exists void_reason text;

alter table public.settlement_lines
  add column if not exists released_at timestamptz,
  add column if not exists released_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists release_reason text;
