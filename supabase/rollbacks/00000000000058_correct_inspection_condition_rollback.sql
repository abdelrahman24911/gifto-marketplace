-- Rollback for migration 58 (R-05): drop the inspection-correction
-- RPC and its audit columns. Corrections made before the rollback
-- keep their corrected condition and courier payer on the row; only
-- the correction audit trail (previous value, corrector, time) is
-- lost.

drop function if exists public.correct_refund_inspection_condition(uuid, text);

alter table public.refund_cases
  drop column if exists inspection_condition_previous,
  drop column if exists inspection_corrected_at,
  drop column if exists inspection_corrected_by;
