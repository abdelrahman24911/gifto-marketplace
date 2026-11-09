-- Rollback for 00000000000023_vendor_support_requests.sql.
--
-- Removes the manual support queue. Refuses while request history exists so a
-- rollback cannot silently destroy vendor submissions; export the table first.
-- Remove/redirect the vendor and admin support routes before running this.

do $$
begin
  if to_regclass('public.support_requests') is not null then
    if exists (select 1 from public.support_requests) then
      raise exception 'Refusing to roll back 23: support request history exists. Export it first.';
    end if;
  end if;
end $$;

drop table if exists public.support_requests;
drop function if exists public.enforce_support_request_rate_limit();
drop type if exists public.support_request_status;
