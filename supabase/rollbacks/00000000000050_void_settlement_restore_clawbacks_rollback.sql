-- Rollback for migration 50 (R-01 void_settlement clawback restore).
--
-- Restores migration 18's void_settlement definition exactly (releases
-- the lines and marks the batch voided; clawbacks consumed by a voided
-- batch are NOT restored — that is the R-01 bug this migration fixed,
-- so rolling back reintroduces it; only roll back if the R-01 fix
-- itself must be removed). The voided batch's totals are unchanged by
-- either version.

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
