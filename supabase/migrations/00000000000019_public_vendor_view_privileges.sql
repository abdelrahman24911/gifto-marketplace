-- Keep the public storefront view read-only.
--
-- Supabase's default privileges grant ALL on newly created relations to
-- anon/authenticated. public_vendors is intentionally a SECURITY DEFINER view
-- (safe active-vendor columns without base-table access), so those default
-- write grants must not remain on an auto-updatable view.

revoke all on table public.public_vendors from public, anon, authenticated;
grant select on table public.public_vendors to anon, authenticated;
