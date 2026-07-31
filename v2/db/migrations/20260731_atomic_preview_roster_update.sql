create or replace function public.v2_update_match_preview_safely(
  p_match_id uuid,
  p_event_player_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.v2_matches%rowtype;
begin
  if coalesce(array_length(p_event_player_ids, 1), 0) <> 4 then
    raise exception 'A preview match must contain four players';
  end if;

  if (select count(distinct player_id) from unnest(p_event_player_ids) as player_ids(player_id)) <> 4 then
    raise exception 'A preview match must contain four different players';
  end if;

  select * into target
  from public.v2_matches
  where id = p_match_id
  for update;

  if not found then raise exception 'Match not found'; end if;
  if target.status <> 'preview' then raise exception 'Only preview matches can be edited'; end if;

  if (
    select count(*)
    from public.v2_event_players event_player
    where event_player.event_id = target.event_id
      and event_player.id = any(p_event_player_ids)
      and lower(coalesce(event_player.status, 'ready')) not in ('left', 'removed', 'deleted')
  ) <> 4 then
    raise exception 'A selected player is unavailable for this event';
  end if;

  if exists (
    select 1
    from public.v2_match_players other_player
    join public.v2_matches other_match on other_match.id = other_player.match_id
    where other_player.event_player_id = any(p_event_player_ids)
      and other_match.id <> target.id
      and other_match.event_id = target.event_id
      and other_match.status in ('preview', 'assigned', 'playing', 'pending_score')
  ) then
    raise exception 'A selected player is already assigned to another active match';
  end if;

  delete from public.v2_match_players
  where match_id = target.id;

  insert into public.v2_match_players (
    organization_id,
    event_id,
    match_id,
    event_player_id,
    player_id,
    team,
    slot
  )
  select
    target.organization_id,
    target.event_id,
    target.id,
    event_player.id,
    event_player.player_id,
    case when roster.position <= 2 then 'A' else 'B' end,
    case when roster.position <= 2 then roster.position else roster.position - 2 end
  from unnest(p_event_player_ids) with ordinality as roster(event_player_id, position)
  join public.v2_event_players event_player on event_player.id = roster.event_player_id;

  update public.v2_matches
  set updated_at = now()
  where id = target.id;
end;
$$;

revoke all on function public.v2_update_match_preview_safely(uuid, uuid[]) from public;
grant execute on function public.v2_update_match_preview_safely(uuid, uuid[]) to anon, authenticated;
