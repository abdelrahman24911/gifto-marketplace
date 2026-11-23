-- Rollback for migration 68 (disposable database only).
-- Never apply rollbacks outside a disposable database.

update public.occasions
set slug = 'ramdan-night'
where slug = 'ramadan-night'
  and not exists (
    select 1 from public.occasions o where o.slug = 'ramdan-night'
  );
