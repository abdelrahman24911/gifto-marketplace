-- Gifto Marketplace — atomic occasion matching-rule replacement
--
-- Category and tag rules are edited together in the admin matching editor.
-- Replacing them through two separate RPC calls could leave an occasion with
-- only half of a saved configuration if the second call failed. This function
-- wraps the existing validated replacement routines in one transaction.

create or replace function public.replace_occasion_matching_rules(
  p_occasion_id uuid,
  p_category_ids uuid[],
  p_tag_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can manage occasions.'
      using errcode = '42501';
  end if;

  perform public.replace_occasion_categories(p_occasion_id, p_category_ids);
  perform public.replace_occasion_tags(p_occasion_id, p_tag_ids);
end;
$$;

revoke all on function public.replace_occasion_matching_rules(uuid, uuid[], uuid[])
  from public, anon;
grant execute on function public.replace_occasion_matching_rules(uuid, uuid[], uuid[])
  to authenticated;
