-- Rebuild remaining ratings after a rated match is removed by cascade.
create or replace function public.v2_recalculate_gdsq_after_ledger_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.v2_recalculate_gdsq_ratings(old.organization_id);
  return old;
end;
$$;

drop trigger if exists v2_recalculate_gdsq_after_ledger_delete_trigger
  on public.v2_gdsq_rated_matches;
create trigger v2_recalculate_gdsq_after_ledger_delete_trigger
after delete on public.v2_gdsq_rated_matches
for each row execute function public.v2_recalculate_gdsq_after_ledger_delete();

revoke all on function public.v2_recalculate_gdsq_after_ledger_delete()
  from public, anon, authenticated;
