-- Gifto Marketplace - P1-06 (H-06, N-04): coverage completion.
--
-- Migration 29's trigger enforcement is NOT touched: the trigger, its
-- 23514 message and the fail-open shape (both lists empty = allow) are
-- unchanged. This migration redefines delivery_coverage_allows() only,
-- folding in N-04's matching fixes once (N-04 has not shipped
-- separately), and normalises stored coverage governorates in place.
--
-- Two defects fixed in the function (re-audit N-04):
--   1. LIKE wildcards: a vendor-supplied area containing % or _ acted
--      as a wildcard and could wrongly ALLOW out-of-area orders.
--      Areas are now escaped (\, %, _) and matched with an explicit
--      ESCAPE clause, so they match literally. The city equality
--      branch is unchanged (exact match, no LIKE).
--   2. Governorate variant tolerance (transitional bridge until the
--      P1-06 dropdown removes free text entirely): both sides are
--      normalised before comparing — trim, collapse internal
--      whitespace, case-fold, strip a trailing "Governorate" suffix
--      or a leading "محافظة" prefix, and normalise Arabic
--      orthography (أ/إ/آ -> ا, ة -> ه, ى -> ي). Applied identically
--      to the stored coverage value and the order's governorate.
--      No fuzzy matching beyond these stated rules: no substring
--      governorate matching, no edit distance — a genuinely different
--      governorate still fails. A value that cannot be normalised
--      falls back to the plain case-insensitive trimmed comparison.
--
-- The same rules live in src/lib/governorates.ts
-- (governorateMatchKey / normalizeGovernorate); keep the two in sync.
--
-- Stored data (P1-06 step 4): every stored governorate value that
-- maps to a canonical name is rewritten to that canonical English
-- name in place. Values that cannot be mapped are left untouched and
-- listed by the NOTICE at the end of this migration — never silently
-- dropped, never guessed into a different governorate. Areas are
-- free-text per vendor and are not normalised.

-- ---------------------------------------------------------------------------
-- normalize_governorate_name — the shared normalisation rules, in SQL
-- ---------------------------------------------------------------------------

create or replace function public.normalize_governorate_name(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case v
    when 'cairo' then 'Cairo'
    when 'القاهره' then 'Cairo'
    when 'alexandria' then 'Alexandria'
    when 'الاسكندريه' then 'Alexandria'
    when 'giza' then 'Giza'
    when 'الجيزه' then 'Giza'
    when 'qalyubia' then 'Qalyubia'
    when 'القليوبيه' then 'Qalyubia'
    when 'dakahlia' then 'Dakahlia'
    when 'الدقهليه' then 'Dakahlia'
    when 'sharqia' then 'Sharqia'
    when 'الشرقيه' then 'Sharqia'
    when 'gharbia' then 'Gharbia'
    when 'الغربيه' then 'Gharbia'
    when 'monufia' then 'Monufia'
    when 'المنوفيه' then 'Monufia'
    when 'beheira' then 'Beheira'
    when 'البحيره' then 'Beheira'
    when 'kafr el sheikh' then 'Kafr El Sheikh'
    when 'كفر الشيخ' then 'Kafr El Sheikh'
    when 'damietta' then 'Damietta'
    when 'دمياط' then 'Damietta'
    when 'port said' then 'Port Said'
    when 'بورسعيد' then 'Port Said'
    when 'ismailia' then 'Ismailia'
    when 'الاسماعيليه' then 'Ismailia'
    when 'suez' then 'Suez'
    when 'السويس' then 'Suez'
    when 'faiyum' then 'Faiyum'
    when 'الفيوم' then 'Faiyum'
    when 'beni suef' then 'Beni Suef'
    when 'بني سويف' then 'Beni Suef'
    when 'minya' then 'Minya'
    when 'المنيا' then 'Minya'
    when 'asyut' then 'Asyut'
    when 'اسيوط' then 'Asyut'
    when 'sohag' then 'Sohag'
    when 'سوهاج' then 'Sohag'
    when 'qena' then 'Qena'
    when 'قنا' then 'Qena'
    when 'luxor' then 'Luxor'
    when 'الاقصر' then 'Luxor'
    when 'aswan' then 'Aswan'
    when 'اسوان' then 'Aswan'
    when 'red sea' then 'Red Sea'
    when 'البحر الاحمر' then 'Red Sea'
    when 'new valley' then 'New Valley'
    when 'الوادي الجديد' then 'New Valley'
    when 'matrouh' then 'Matrouh'
    when 'مطروح' then 'Matrouh'
    when 'north sinai' then 'North Sinai'
    when 'شمال سيناء' then 'North Sinai'
    when 'south sinai' then 'South Sinai'
    when 'جنوب سيناء' then 'South Sinai'
    else null
  end
  from (
    select translate(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(regexp_replace(btrim(coalesce(p_value, '')), '\s+', ' ', 'g')),
            ' governorate$', ''),
          ' محافظة$', ''),
        '^محافظة ', ''),
      'أإآةى', 'اااهي') as v
  ) s;
$$;

revoke all on function public.normalize_governorate_name(text)
  from public, anon, authenticated;

comment on function public.normalize_governorate_name(text) is
  'P1-06/N-04: maps a governorate value to its canonical English name (or null when unmappable). Trim, collapse whitespace, case-fold, strip a trailing "Governorate" suffix or a leading "محافظة" prefix, normalise Arabic orthography. Same rules as src/lib/governorates.ts.';

-- ---------------------------------------------------------------------------
-- delivery_coverage_allows — migration 29 body + escaping + tolerance
-- ---------------------------------------------------------------------------

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

    -- Normalised forms of the same values, for the variant-tolerant
    -- comparison. Unmappable values contribute nothing here; they are
    -- still compared by the raw form below.
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
         -- N-04: escape \, % and _ so vendor-supplied areas match
         -- literally; the explicit ESCAPE clause makes '\' the escape.
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

-- ---------------------------------------------------------------------------
-- Normalise stored coverage governorates in place + report unmappable
-- ---------------------------------------------------------------------------

do $$
declare
  v_updated    int;
  v_unmappable text;
begin
  update public.vendors v
     set delivery_coverage = jsonb_set(
           v.delivery_coverage,
           '{governorates}',
           (select coalesce(jsonb_agg(
              case when public.normalize_governorate_name(t.value) is not null
                   then to_jsonb(public.normalize_governorate_name(t.value))
                   else to_jsonb(t.value)
              end
              order by t.ord), '[]'::jsonb)
              from jsonb_array_elements_text(v.delivery_coverage -> 'governorates')
                   with ordinality as t(value, ord))
         )
   where jsonb_typeof(v.delivery_coverage -> 'governorates') = 'array'
     and exists (
       select 1
         from jsonb_array_elements_text(v.delivery_coverage -> 'governorates') as value
        where public.normalize_governorate_name(value) is not null
          and public.normalize_governorate_name(value) <> btrim(value)
     );

  get diagnostics v_updated = row_count;
  raise notice 'P1-06: normalised stored governorate values for % vendor(s).', v_updated;

  select string_agg(distinct value, ', ' order by value)
    into v_unmappable
    from public.vendors v,
         jsonb_array_elements_text(v.delivery_coverage -> 'governorates') as value
   where btrim(value) <> ''
     and public.normalize_governorate_name(value) is null;

  if v_unmappable is not null then
    raise notice 'P1-06: unmappable stored governorate values left unchanged (owner decision needed): %', v_unmappable;
  else
    raise notice 'P1-06: all stored governorate values are canonical (or no coverage is stored).';
  end if;
end $$;
