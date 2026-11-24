-- Rollback for 00000000000073_delivery_coverage_gate.sql.
--
-- Restores migration 37's delivery_coverage_allows() exactly, which
-- re-enables per-vendor coverage enforcement through the existing
-- order_vendors_assert_delivery_coverage trigger. Migration 73 did not change
-- any coverage data or settings, so there is no data to restore.
-- Never apply rollbacks outside a disposable database.

create or replace function public.delivery_coverage_allows(
  p_coverage jsonb,
  p_city text,
  p_governorate text,
  p_address_line text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_governorates      text[] := array[]::text[];
  v_governorates_norm text[] := array[]::text[];
  v_areas             text[] := array[]::text[];
  v_city              text := lower(btrim(coalesce(p_city, '')));
  v_governorate       text := lower(btrim(coalesce(p_governorate, '')));
  v_governorate_norm  text := public.normalize_governorate_name(p_governorate);
  v_address           text := lower(btrim(coalesce(p_address_line, '')));
begin
  if p_coverage is null or jsonb_typeof(p_coverage) <> 'object' then
    return true;
  end if;

  if jsonb_typeof(p_coverage -> 'governorates') = 'array' then
    select coalesce(array_agg(lower(btrim(value))), array[]::text[])
      into v_governorates
      from jsonb_array_elements_text(p_coverage -> 'governorates') as value
     where btrim(value) <> '';

    select coalesce(array_agg(public.normalize_governorate_name(value)), array[]::text[])
      into v_governorates_norm
      from jsonb_array_elements_text(p_coverage -> 'governorates') as value
     where btrim(value) <> ''
       and public.normalize_governorate_name(value) is not null;
  end if;

  if jsonb_typeof(p_coverage -> 'areas') = 'array' then
    select coalesce(array_agg(lower(btrim(value))), array[]::text[])
      into v_areas
      from jsonb_array_elements_text(p_coverage -> 'areas') as value
     where btrim(value) <> '';
  end if;

  if cardinality(v_governorates) = 0 and cardinality(v_areas) = 0 then
    return true;
  end if;

  if cardinality(v_governorates) > 0
     and not (v_governorate = any (v_governorates))
     and not (v_governorate_norm is not null
              and v_governorate_norm = any (v_governorates_norm)) then
    return false;
  end if;

  if cardinality(v_areas) > 0 then
    if not (v_city = any (v_areas)) then
      if not exists (
        select 1
          from unnest(v_areas) as area
         where v_address like '%' ||
               replace(replace(replace(area, E'\\', E'\\\\'), E'%', E'\\%'), E'_', E'\\_')
               || '%' escape E'\\'
      ) then
        return false;
      end if;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.delivery_coverage_allows(jsonb, text, text, text)
  from public, anon, authenticated;
