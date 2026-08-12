-- Public Hall of Fame may read only the aggregate count. No profile row,
-- email address, user id, or other private field is exposed.
create or replace function public.v2_public_registered_player_count(p_organization_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.v2_players
  where organization_id = p_organization_id and status = 'active';
$$;

revoke all on function public.v2_public_registered_player_count(uuid) from public;
grant execute on function public.v2_public_registered_player_count(uuid) to anon, authenticated;
