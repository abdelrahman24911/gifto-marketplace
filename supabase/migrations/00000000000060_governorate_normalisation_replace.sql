-- Migration 60 — TEST 4 (re-audit v5): fix Arabic governorate
-- normalisation in normalize_governorate_name.
--
-- Exact cause, reproduced on the disposable Postgres: TEST 4's Arabic
-- assertion ("محافظة القاهرة" vs "Cairo" coverage) failed, and
-- normalize_governorate_name('محافظة القاهرة') returned NULL.
-- Static analysis said the transforms were correct — and they are,
-- in UTF8. The disposable database is SQL_ASCII, where length() of
-- an Arabic string equals its byte count: Postgres treats each UTF-8
-- byte as a separate character, so translate() maps BYTES, not
-- characters, and ة (D8 A9) is corrupted to ؇ instead of ه.
-- regexp_replace() and replace() match whole byte sequences, so they
-- were already correct; only translate() was broken.
--
-- Fix: replace the single translate('أإآةى','اااهي') call with nested
-- replace() calls, one per letter (أ→ا, إ→ا, آ→ا, ة→ه, ى→ي).
-- Byte-sequence substitution is correct in SQL_ASCII and identical
-- in UTF8, so the function no longer depends on the database
-- encoding. The hosted database is UTF8 (Supabase), where the old
-- code also worked — this is a robustness fix, not a behaviour
-- change in production. Verified in the SQL_ASCII disposable DB:
-- replace() returns 'القاهره' where translate() returned 'القاهر؇'.
-- The TS mirror (src/lib/governorates.ts) already uses per-letter
-- replace() and needs no change. No other translate() with Arabic
-- exists in the repo (only this one).
--
-- Rollback (run manually on the disposable database only):
-- re-apply supabase/rollbacks/00000000000060_governorate_translate_rollback.sql,
-- which restores migration 37's translate()-based definition exactly.

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
    select replace(replace(replace(replace(replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            lower(regexp_replace(btrim(coalesce(p_value, '')), '\s+', ' ', 'g')),
            ' governorate$', ''),
          ' محافظة$', ''),
        '^محافظة ', ''),
      'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ة', 'ه'), 'ى', 'ي') as v
  ) s;
$$;

comment on function public.normalize_governorate_name(text) is
  'P1-06/N-04: maps a governorate value to its canonical English name (or null when unmappable). Trim, collapse whitespace, case-fold, strip a trailing "Governorate" suffix or a leading "محافظة" prefix, normalise Arabic orthography (per-letter replace, encoding-robust — see migration 60). Same rules as src/lib/governorates.ts.';
