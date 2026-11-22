-- Rollback for 00000000000037_coverage_normalisation.sql.
--
-- Restores migration 29's delivery_coverage_allows() exactly (no LIKE
-- escaping, no governorate variant tolerance) and drops the
-- normalize_governorate_name() helper. The stored-data normalisation is
-- one-way and is NOT undone: canonical governorate values are valid
-- under the old function too, and unmappable values were never changed.

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
  v_governorates text[] := array[]::text[];
  v_areas        text[] := array[]::text[];
  v_city         text := lower(btrim(coalesce(p_city, '')));
  v_governorate  text := lower(btrim(coalesce(p_governorate, '')));
  v_address      text := lower(btrim(coalesce(p_address_line, '')));
begin
  if p_coverage is null or jsonb_typeof(p_coverage) <> 'object' then
    return true;
  end if;

  if jsonb_typeof(p_coverage -> 'governorates') = 'array' then
    select coalesce(array_agg(lower(btrim(value))), array[]::text[])
      into v_governorates
      from jsonb_array_elements_text(p_coverage -> 'governorates') as value
     where btrim(value) <> '';
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
     and not (v_governorate = any (v_governorates)) then
    return false;
  end if;

  if cardinality(v_areas) > 0 then
    if not (v_city = any (v_areas)) then
      if not exists (
        select 1
          from unnest(v_areas) as area
         where v_address like '%' || area || '%'
      ) then
        return false;
      end if;
    end if;
  end if;

  return true;
end;
$$;



drop function if exists public.normalize_governorate_name(text);
