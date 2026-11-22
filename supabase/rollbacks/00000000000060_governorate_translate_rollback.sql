-- Rollback for migration 60 (TEST 4): restore migration 37's
-- translate()-based normalize_governorate_name definition exactly.
-- Run manually on the disposable database only.

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
