-- Additive Admin member directory and indexes for paginated career history.
-- Normal registration and owner profile edits remain immediate; Admin review is
-- reserved for explicitly claimed, unlinked historical records.

create extension if not exists pg_trgm with schema extensions;

create index if not exists v2_players_org_created_idx
  on public.v2_players (organization_id, created_at desc, id);
create index if not exists v2_players_display_name_trgm_idx
  on public.v2_players using gin (lower(display_name) extensions.gin_trgm_ops);
create index if not exists v2_players_email_trgm_idx
  on public.v2_players using gin (lower(email) extensions.gin_trgm_ops);
create index if not exists v2_event_players_player_event_idx
  on public.v2_event_players (player_id, event_id)
  where player_id is not null and status <> 'removed';
create index if not exists v2_match_players_player_match_idx
  on public.v2_match_players (player_id, match_id)
  where player_id is not null;

create or replace function public.v2_admin_list_members(
  p_organization_id uuid,
  p_search text default '',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  display_name text,
  email text,
  email_verified_at timestamptz,
  default_level numeric,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  events_joined bigint,
  total_games bigint,
  wins bigint,
  losses bigint,
  points_for bigint,
  points_against bigint,
  point_diff bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select player.*
    from public.v2_players player
    where player.organization_id = p_organization_id
      and (
        btrim(coalesce(p_search, '')) = ''
        or lower(player.display_name) like '%' || lower(btrim(p_search)) || '%'
        or lower(player.email) like '%' || lower(btrim(p_search)) || '%'
      )
  ), paged as (
    select player.*, count(*) over () as filtered_count
    from filtered player
    order by player.created_at desc, player.id
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    player.id,
    player.display_name,
    player.email,
    player.email_verified_at,
    player.default_level,
    player.status,
    player.created_at,
    player.updated_at,
    coalesce(participation.events_joined, 0),
    coalesce(career.total_games, 0),
    coalesce(career.wins, 0),
    coalesce(career.losses, 0),
    coalesce(career.points_for, 0),
    coalesce(career.points_against, 0),
    coalesce(career.points_for, 0) - coalesce(career.points_against, 0),
    player.filtered_count
  from paged player
  left join lateral (
    select count(distinct participant.event_id)::bigint as events_joined
    from public.v2_event_players participant
    where participant.player_id = player.id and participant.status <> 'removed'
  ) participation on true
  left join lateral (
    select
      count(*)::bigint as total_games,
      count(*) filter (where
        (match_player.team = 'A' and match.team_a_score > match.team_b_score)
        or (match_player.team = 'B' and match.team_b_score > match.team_a_score)
      )::bigint as wins,
      count(*) filter (where
        (match_player.team = 'A' and match.team_a_score < match.team_b_score)
        or (match_player.team = 'B' and match.team_b_score < match.team_a_score)
      )::bigint as losses,
      coalesce(sum(case when match_player.team = 'A' then match.team_a_score else match.team_b_score end), 0)::bigint as points_for,
      coalesce(sum(case when match_player.team = 'A' then match.team_b_score else match.team_a_score end), 0)::bigint as points_against
    from public.v2_match_players match_player
    join public.v2_matches match on match.id = match_player.match_id
    where match_player.player_id = player.id
      and lower(match.status) in ('confirmed', 'completed')
      and match.team_a_score is not null
      and match.team_b_score is not null
      and match.team_a_score <> match.team_b_score
  ) career on true;
$$;

create or replace function public.v2_admin_get_member_detail(
  p_player_id uuid,
  p_match_limit integer default 30,
  p_match_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  profile public.v2_players%rowtype;
  event_rows jsonb;
  match_rows jsonb;
  career jsonb;
begin
  select * into profile from public.v2_players where id = p_player_id;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;

  select jsonb_build_object(
      'eventsJoined', (select count(distinct event_id) from public.v2_event_players
        where player_id = profile.id and status <> 'removed'),
      'totalGames', count(*),
      'wins', count(*) filter (where
        (mp.team = 'A' and m.team_a_score > m.team_b_score)
        or (mp.team = 'B' and m.team_b_score > m.team_a_score)),
      'losses', count(*) filter (where
        (mp.team = 'A' and m.team_a_score < m.team_b_score)
        or (mp.team = 'B' and m.team_b_score < m.team_a_score)),
      'pointsFor', coalesce(sum(case when mp.team = 'A' then m.team_a_score else m.team_b_score end), 0),
      'pointsAgainst', coalesce(sum(case when mp.team = 'A' then m.team_b_score else m.team_a_score end), 0)
    ) into career
    from public.v2_match_players mp
    join public.v2_matches m on m.id = mp.match_id
    where mp.player_id = profile.id and lower(m.status) in ('confirmed', 'completed')
      and m.team_a_score is not null and m.team_b_score is not null
      and m.team_a_score <> m.team_b_score;

  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', event.id,
    'name', event.name,
    'eventDate', event.event_date,
    'status', event.status,
    'joinedAt', participant.created_at,
    'eventPlayerId', participant.id,
    'eventPlayerStatus', participant.status
  ) order by coalesce(event.event_date, participant.created_at::date) desc, participant.created_at desc), '[]'::jsonb)
  into event_rows
  from public.v2_event_players participant
  join public.v2_events event on event.id = participant.event_id
  where participant.player_id = profile.id and participant.status <> 'removed';

  with personal_matches as (
    select match_player.match_id, match_player.team, match_player.slot, match.*
    from public.v2_match_players match_player
    join public.v2_matches match on match.id = match_player.match_id
    where match_player.player_id = profile.id
      and lower(match.status) in ('confirmed', 'completed')
    order by coalesce(match.completed_at, match.created_at) desc, match.id
    limit greatest(1, least(coalesce(p_match_limit, 30), 100))
    offset greatest(coalesce(p_match_offset, 0), 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'matchId', personal.match_id,
    'eventId', personal.event_id,
    'eventName', event.name,
    'courtNumber', personal.court_number,
    'team', personal.team,
    'teamAScore', personal.team_a_score,
    'teamBScore', personal.team_b_score,
    'playedAt', coalesce(personal.completed_at, personal.created_at),
    'teamA', (select coalesce(jsonb_agg(ep.display_name order by mp.slot), '[]'::jsonb)
      from public.v2_match_players mp join public.v2_event_players ep on ep.id = mp.event_player_id
      where mp.match_id = personal.match_id and mp.team = 'A'),
    'teamB', (select coalesce(jsonb_agg(ep.display_name order by mp.slot), '[]'::jsonb)
      from public.v2_match_players mp join public.v2_event_players ep on ep.id = mp.event_player_id
      where mp.match_id = personal.match_id and mp.team = 'B')
  ) order by personal.completed_at desc nulls last, personal.created_at desc), '[]'::jsonb)
  into match_rows
  from personal_matches personal
  left join public.v2_events event on event.id = personal.event_id;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', profile.id,
      'displayName', profile.display_name,
      'email', profile.email,
      'emailVerifiedAt', profile.email_verified_at,
      'defaultLevel', profile.default_level,
      'status', profile.status,
      'avatarUrl', profile.avatar_url,
      'createdAt', profile.created_at,
      'updatedAt', profile.updated_at
    ),
    'career', career || jsonb_build_object(
      'pointDiff', coalesce((career->>'pointsFor')::bigint, 0) - coalesce((career->>'pointsAgainst')::bigint, 0)
    ),
    'events', event_rows,
    'matches', match_rows
  );
end;
$$;

revoke all on function public.v2_admin_list_members(uuid,text,integer,integer) from public, anon, authenticated;
revoke all on function public.v2_admin_get_member_detail(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.v2_admin_list_members(uuid,text,integer,integer) to service_role;
grant execute on function public.v2_admin_get_member_detail(uuid,integer,integer) to service_role;
