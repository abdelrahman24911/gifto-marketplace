-- Gifto Marketplace — Phase 2b: public vendor directory (column privacy)
--
-- Phase 1 granted `anon` SELECT on the whole `vendors` table. Row Level
-- Security only restricts ROWS, not columns, so anonymous clients could also
-- read internal columns: commission_rate, contact_email, contact_phone and
-- delivery_coverage — contradicting the Phase 1 intent that those fields are
-- "never exposed to anon".
--
-- Fix: stop granting anon table access and expose a purpose-built, owner-rights
-- view instead. The view both:
--   * projects only the public columns, and
--   * hard-filters `status = 'active'`, so it does not depend on the caller's
--     RLS (it runs with the view owner's rights and replicates the public rule).
-- Anon can read only this view; authenticated/admin keep their base-table grants.

create or replace view public.public_vendors as
  select
    v.id,
    v.name,
    v.slug,
    v.description,
    v.logo_path,
    v.city,
    v.governorate,
    v.created_at
  from public.vendors v
  where v.status = 'active';

comment on view public.public_vendors is
  'Public storefront projection of vendors: safe columns only, active status only. Used by anonymous storefront reads.';

grant select on public.public_vendors to anon, authenticated;

-- Anon must no longer read the base table (which would expose private columns).
revoke select on table public.vendors from anon;
