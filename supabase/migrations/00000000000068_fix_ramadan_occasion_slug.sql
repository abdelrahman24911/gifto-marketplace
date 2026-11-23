-- Migration 68 — fix the misspelled "ramdan-night" occasion slug
-- (dashboard QA, 2026-11-23).
--
-- The occasions row in hosted data carries the typo; the code already
-- accepted both spellings as an alias (gift-finder, occasion-display).
-- This renames the stored slug so the public URL, the admin list and the
-- gift finder all use "ramadan-night". Idempotent: it only renames when
-- the old slug is present and the new one is not, so re-running it (or
-- running it against a database where an admin already fixed the slug)
-- is a no-op. The rename fires migration 26's
-- capture_occasion_slug_redirect trigger, which records the old slug in
-- occasion_slug_redirects — loadOccasion resolves it and the storefront
-- permanently redirects old links to the new slug, so bookmarks keep
-- working. No app code change is needed for the redirect itself.
--
-- Rollback (disposable database only):
-- supabase/rollbacks/00000000000068_fix_ramadan_occasion_slug_rollback.sql
-- renames the slug back. Never apply rollbacks outside a disposable
-- database.

update public.occasions
set slug = 'ramadan-night'
where slug = 'ramdan-night'
  and not exists (
    select 1 from public.occasions o where o.slug = 'ramadan-night'
  );
