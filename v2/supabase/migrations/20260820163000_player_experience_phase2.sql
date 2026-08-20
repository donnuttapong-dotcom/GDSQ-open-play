-- Phase 2: public player history and fast-return event discovery.
-- Match History remains read-only and authoritative. This migration adds only
-- bounded read operations and an index for canonical-player history lookup.

create index if not exists v2_match_players_event_player_match_idx
  on public.v2_match_players (event_player_id, match_id);

create or replace function public.v2_public_player_experience_phase2(
  p_organization_id uuid,
  p_player_code text,
  p_recent_limit integer default 20,
  p_event_limit integer default 20
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  profile public.v2_players%rowtype;
  recent_limit integer := greatest(1, least(coalesce(p_recent_limit, 20), 20));
  event_limit integer := greatest(1, least(coalesce(p_event_limit, 20), 20));
  career jsonb;
  recent_matches jsonb;
  recent_events jsonb;
  hall_rank bigint;
  current_rating numeric;
begin
  select * into profile
  from public.v2_players
  where organization_id = p_organization_id
    and upper(player_code) = upper(btrim(coalesce(p_player_code, '')))
    and status = 'active';

  if not found then
    raise exception 'PLAYER_NOT_FOUND';
  end if;

  with player_facts as (
    select
      ep.event_id,
      m.id as match_id,
      mp.team,
      m.team_a_score,
      m.team_b_score
    from public.v2_event_players ep
    join public.v2_events e
      on e.id = ep.event_id
     and e.organization_id = p_organization_id
     and e.hall_of_fame_processed_at is not null
    join public.v2_match_players mp on mp.event_player_id = ep.id
    join public.v2_matches m
      on m.id = mp.match_id
     and m.event_id = ep.event_id
     and lower(m.status) in ('confirmed', 'completed', 'done', 'finished')
     and m.team_a_score is not null
     and m.team_b_score is not null
     and m.team_a_score <> m.team_b_score
    where ep.player_id = profile.id
      and ep.status <> 'removed'
  ), participation as (
    select count(distinct ep.event_id)::integer as events_joined
    from public.v2_event_players ep
    join public.v2_events e
      on e.id = ep.event_id
     and e.organization_id = p_organization_id
     and e.hall_of_fame_processed_at is not null
    where ep.player_id = profile.id and ep.status <> 'removed'
  )
  select jsonb_build_object(
    'eventsJoined', participation.events_joined,
    'matchesPlayed', count(player_facts.match_id)::integer,
    'wins', count(player_facts.match_id) filter (where
      (player_facts.team = 'A' and player_facts.team_a_score > player_facts.team_b_score) or
      (player_facts.team = 'B' and player_facts.team_b_score > player_facts.team_a_score)
    )::integer,
    'losses', count(player_facts.match_id) filter (where
      (player_facts.team = 'A' and player_facts.team_a_score < player_facts.team_b_score) or
      (player_facts.team = 'B' and player_facts.team_b_score < player_facts.team_a_score)
    )::integer,
    'pointsFor', coalesce(sum(case when player_facts.team = 'A' then player_facts.team_a_score else player_facts.team_b_score end), 0)::integer,
    'pointsAgainst', coalesce(sum(case when player_facts.team = 'A' then player_facts.team_b_score else player_facts.team_a_score end), 0)::integer,
    'diff', coalesce(sum(case when player_facts.team = 'A' then player_facts.team_a_score - player_facts.team_b_score else player_facts.team_b_score - player_facts.team_a_score end), 0)::integer
  ) into career
  from participation left join player_facts on true
  group by participation.events_joined;

  with all_facts as (
    select
      ep.player_id,
      p.display_name,
      count(m.id)::integer as games,
      count(m.id) filter (where
        (mp.team = 'A' and m.team_a_score > m.team_b_score) or
        (mp.team = 'B' and m.team_b_score > m.team_a_score)
      )::integer as wins,
      sum(case when mp.team = 'A' then m.team_a_score - m.team_b_score else m.team_b_score - m.team_a_score end)::integer as diff
    from public.v2_event_players ep
    join public.v2_players p on p.id = ep.player_id and p.status = 'active'
    join public.v2_events e on e.id = ep.event_id and e.hall_of_fame_processed_at is not null
    join public.v2_match_players mp on mp.event_player_id = ep.id
    join public.v2_matches m on m.id = mp.match_id
      and lower(m.status) in ('confirmed', 'completed', 'done', 'finished')
      and m.team_a_score is not null and m.team_b_score is not null
      and m.team_a_score <> m.team_b_score
    where ep.organization_id = p_organization_id and ep.status <> 'removed'
    group by ep.player_id, p.display_name
  ), ranked as (
    select player_id, row_number() over (
      order by (wins * 10 + games * 2 + diff) desc, wins desc,
        (wins::numeric / nullif(games, 0)) desc, diff desc, display_name
    ) as rank
    from all_facts where games > 0
  )
  select rank into hall_rank from ranked where player_id = profile.id;

  select rating.current_rating into current_rating
  from public.v2_gdsq_player_ratings rating
  where rating.organization_id = p_organization_id and rating.player_id = profile.id
  order by rating.updated_at desc limit 1;

  with player_matches as (
    select m.*, mp.team, e.name as event_name, e.event_date
    from public.v2_event_players ep
    join public.v2_events e on e.id = ep.event_id and e.hall_of_fame_processed_at is not null
    join public.v2_match_players mp on mp.event_player_id = ep.id
    join public.v2_matches m on m.id = mp.match_id
      and lower(m.status) in ('confirmed', 'completed', 'done', 'finished')
      and m.team_a_score is not null and m.team_b_score is not null
      and m.team_a_score <> m.team_b_score
    where ep.player_id = profile.id and ep.status <> 'removed'
    order by coalesce(m.completed_at, m.created_at) desc
    limit recent_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'matchId', pm.id,
    'eventName', pm.event_name,
    'eventDate', pm.event_date,
    'completedAt', coalesce(pm.completed_at, pm.created_at),
    'courtNumber', pm.court_number,
    'teamAScore', pm.team_a_score,
    'teamBScore', pm.team_b_score,
    'won', (pm.team = 'A' and pm.team_a_score > pm.team_b_score) or (pm.team = 'B' and pm.team_b_score > pm.team_a_score),
    'teamA', coalesce((select jsonb_agg(ep2.display_name order by mp2.slot) from public.v2_match_players mp2 join public.v2_event_players ep2 on ep2.id = mp2.event_player_id where mp2.match_id = pm.id and mp2.team = 'A'), '[]'::jsonb),
    'teamB', coalesce((select jsonb_agg(ep2.display_name order by mp2.slot) from public.v2_match_players mp2 join public.v2_event_players ep2 on ep2.id = mp2.event_player_id where mp2.match_id = pm.id and mp2.team = 'B'), '[]'::jsonb)
  ) order by coalesce(pm.completed_at, pm.created_at) desc), '[]'::jsonb)
  into recent_matches from player_matches pm;

  with event_rows as (
    select
      e.id, e.name, e.event_date,
      count(m.id)::integer as matches,
      count(m.id) filter (where
        (mp.team = 'A' and m.team_a_score > m.team_b_score) or
        (mp.team = 'B' and m.team_b_score > m.team_a_score)
      )::integer as wins,
      count(m.id) filter (where
        (mp.team = 'A' and m.team_a_score < m.team_b_score) or
        (mp.team = 'B' and m.team_b_score < m.team_a_score)
      )::integer as losses,
      coalesce(sum(case when mp.team = 'A' then m.team_a_score - m.team_b_score else m.team_b_score - m.team_a_score end), 0)::integer as diff
    from public.v2_event_players ep
    join public.v2_events e on e.id = ep.event_id and e.hall_of_fame_processed_at is not null
    join public.v2_match_players mp on mp.event_player_id = ep.id
    join public.v2_matches m on m.id = mp.match_id
      and lower(m.status) in ('confirmed', 'completed', 'done', 'finished')
      and m.team_a_score is not null and m.team_b_score is not null
      and m.team_a_score <> m.team_b_score
    where ep.player_id = profile.id and ep.status <> 'removed'
    group by e.id, e.name, e.event_date
    order by e.event_date desc, e.id desc
    limit event_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', id, 'name', name, 'date', event_date, 'matches', matches,
    'wins', wins, 'losses', losses, 'diff', diff
  ) order by event_date desc, id desc), '[]'::jsonb)
  into recent_events from event_rows;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'playerCode', profile.player_code,
      'displayName', profile.display_name,
      'avatarUrl', coalesce(profile.avatar_url, ''),
      'defaultLevel', profile.default_level,
      'memberSince', profile.created_at
    ),
    'career', career || jsonb_build_object(
      'winRate', case when (career->>'matchesPlayed')::integer > 0
        then round((career->>'wins')::numeric * 100 / (career->>'matchesPlayed')::numeric, 1)
        else 0 end,
      'hallPosition', hall_rank,
      'gdsqRating', current_rating
    ),
    'recentMatches', recent_matches,
    'recentEvents', recent_events
  );
end;
$$;

create or replace function public.v2_list_open_events_phase2(
  p_organization_id uuid,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId', id,
    'name', name,
    'eventDate', event_date,
    'startTime', start_time,
    'endTime', end_time,
    'venueName', venue_name,
    'matchingMode', matching_mode
  ) order by event_date, start_time, created_at), '[]'::jsonb)
  from (
    select id, name, event_date, start_time, end_time, venue_name, matching_mode, created_at
    from public.v2_events
    where organization_id = p_organization_id
      and lower(status) in ('live', 'open', 'active')
      and checkin_open = true
      and completed_at is null
      and archived_at is null
      and hall_of_fame_processed_at is null
    order by event_date, start_time, created_at
    limit greatest(1, least(coalesce(p_limit, 20), 20))
  ) open_events;
$$;

revoke all on function public.v2_public_player_experience_phase2(uuid,text,integer,integer)
  from public, anon, authenticated;
revoke all on function public.v2_list_open_events_phase2(uuid,integer)
  from public, anon, authenticated;
grant execute on function public.v2_public_player_experience_phase2(uuid,text,integer,integer)
  to service_role;
grant execute on function public.v2_list_open_events_phase2(uuid,integer)
  to service_role;
