-- Phase 1: canonical identity integrity.
-- Additive only: no match, score, winner, team, ranking, rating, or event facts
-- are rewritten by this migration.

create index if not exists v2_event_players_unlinked_name_candidate_idx
  on public.v2_event_players (
    organization_id,
    lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g')),
    event_id
  )
  where player_id is null and status <> 'removed';

create or replace function public.v2_join_player_identity_phase1(
  p_organization_id uuid,
  p_event_id uuid,
  p_display_name text,
  p_email text default null,
  p_level numeric default 3,
  p_resolved_player_id uuid default null,
  p_resolution_source text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_event public.v2_events%rowtype;
  profile public.v2_players%rowtype;
  instant_profile public.v2_instant_player_profiles%rowtype;
  participation public.v2_event_players%rowtype;
  candidate public.v2_event_players%rowtype;
  clean_name text := regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g');
  name_key text;
  clean_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  clean_level numeric := greatest(1, least(6, coalesce(p_level, 3)));
  same_name_count integer := 0;
  unlinked_count integer := 0;
  linked_other_count integer := 0;
  active_count integer := 0;
  legacy_count integer := 0;
  profile_created boolean := false;
  identity_state text;
begin
  if p_resolution_source is not null
     and p_resolution_source not in ('capability', 'player_code') then
    raise exception 'IDENTITY_RESOLUTION_INVALID';
  end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 50 then
    raise exception 'DISPLAY_NAME_INVALID';
  end if;
  if clean_email is not null and (
    char_length(clean_email) > 254
    or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'EMAIL_INVALID';
  end if;
  name_key := lower(clean_name);

  select * into target_event
  from public.v2_events
  where id = p_event_id and organization_id = p_organization_id
  for share;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if lower(target_event.status) not in ('live', 'open', 'active')
     or not target_event.checkin_open then
    raise exception 'EVENT_NOT_OPEN';
  end if;

  if p_resolved_player_id is not null then
    select * into profile
    from public.v2_players
    where id = p_resolved_player_id
      and organization_id = p_organization_id
      and status = 'active'
    for update;
    if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  elsif clean_email is not null then
    select * into profile
    from public.v2_players
    where organization_id = p_organization_id
      and lower(btrim(email)) = clean_email
    for update;
    if found and lower(regexp_replace(btrim(profile.display_name), '\s+', ' ', 'g')) <> name_key then
      raise exception 'EMAIL_PROFILE_MISMATCH';
    end if;
  end if;

  if profile.id is null and clean_email is not null then
    if exists (
      select 1 from public.v2_players
      where organization_id = p_organization_id
        and lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g')) = name_key
    ) then
      raise exception 'DISPLAY_NAME_TAKEN';
    end if;

    select * into instant_profile
    from public.v2_instant_player_profiles
    where organization_id = p_organization_id
      and lower(btrim(email)) = clean_email
    for update;
    if found and lower(regexp_replace(btrim(instant_profile.display_name), '\s+', ' ', 'g')) <> name_key then
      raise exception 'EMAIL_PROFILE_MISMATCH';
    end if;

    insert into public.v2_players (
      organization_id, user_id, display_name, email, default_level, status
    ) values (
      p_organization_id, null, clean_name, clean_email, clean_level, 'active'
    )
    returning * into profile;
    profile_created := true;

    if instant_profile.id is not null then
      insert into public.v2_player_identity_links (
        organization_id, source_type, source_id, canonical_player_id,
        link_reason, created_by, metadata
      ) values (
        p_organization_id, 'instant_profile', instant_profile.id, profile.id,
        'instant_profile_promoted', 'identity_join', '{}'::jsonb
      )
      on conflict (source_type, source_id) do nothing;
    end if;
  end if;

  if profile.id is not null then
    select * into participation
    from public.v2_event_players
    where event_id = p_event_id
      and player_id = profile.id
      and status <> 'removed'
    order by created_at
    limit 1
    for update;
    if found then
      select count(*) into legacy_count
      from public.v2_event_players historical
      where historical.organization_id = p_organization_id
        and historical.event_id <> p_event_id
        and historical.player_id is null
        and historical.status <> 'removed'
        and lower(regexp_replace(btrim(historical.display_name), '\s+', ' ', 'g')) =
            lower(regexp_replace(btrim(profile.display_name), '\s+', ' ', 'g'));
      return jsonb_build_object(
        'eventPlayerId', participation.id,
        'profileId', profile.id,
        'alreadyJoined', true,
        'identityState', 'already_joined',
        'legacyCandidatesCount', legacy_count,
        'profileCreated', false
      );
    end if;
  end if;

  select
    count(*),
    count(*) filter (where player_id is null),
    count(*) filter (where player_id is not null and (profile.id is null or player_id <> profile.id))
  into same_name_count, unlinked_count, linked_other_count
  from public.v2_event_players
  where event_id = p_event_id
    and status <> 'removed'
    and lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g')) = name_key;

  if profile.id is not null and unlinked_count > 1 then
    raise exception 'AMBIGUOUS_PLAYER_IDENTITY';
  end if;
  if linked_other_count > 0 then
    raise exception 'DISPLAY_NAME_ALREADY_IN_EVENT';
  end if;

  if profile.id is not null and unlinked_count = 1 and same_name_count = 1 then
    select * into candidate
    from public.v2_event_players
    where event_id = p_event_id
      and player_id is null
      and status <> 'removed'
      and lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g')) = name_key
    for update;

    update public.v2_event_players
    set player_id = profile.id,
        updated_at = now()
    where id = candidate.id and player_id is null
    returning * into participation;
    if participation.id is null then raise exception 'LEGACY_PLAYER_LINK_CONFLICT'; end if;
    identity_state := 'guest_promoted';
  elsif profile.id is null and same_name_count > 0 then
    if unlinked_count > 1 then raise exception 'AMBIGUOUS_PLAYER_IDENTITY'; end if;
    raise exception 'DISPLAY_NAME_ALREADY_IN_EVENT';
  else
    select count(*) into active_count
    from public.v2_event_players
    where event_id = p_event_id and status <> 'removed';
    if target_event.max_players is not null
       and target_event.max_players > 0
       and active_count >= target_event.max_players then
      raise exception 'EVENT_FULL';
    end if;

    insert into public.v2_event_players (
      organization_id, event_id, player_id, display_name, estimated_level,
      avatar_url, status, queue_joined_at
    ) values (
      p_organization_id, p_event_id, profile.id,
      coalesce(profile.display_name, clean_name),
      coalesce(profile.default_level, clean_level),
      profile.avatar_url, 'ready', now()
    )
    returning * into participation;
    identity_state := case
      when profile.id is null then 'guest_unlinked'
      when profile_created then 'canonical_created'
      else 'canonical_existing'
    end;
  end if;

  if profile.id is not null then
    select count(*) into legacy_count
    from public.v2_event_players historical
    where historical.organization_id = p_organization_id
      and historical.event_id <> p_event_id
      and historical.player_id is null
      and historical.status <> 'removed'
      and lower(regexp_replace(btrim(historical.display_name), '\s+', ' ', 'g')) =
          lower(regexp_replace(btrim(profile.display_name), '\s+', ' ', 'g'));
  end if;

  return jsonb_build_object(
    'eventPlayerId', participation.id,
    'profileId', profile.id,
    'alreadyJoined', false,
    'identityState', identity_state,
    'legacyCandidatesCount', legacy_count,
    'profileCreated', profile_created
  );
end;
$$;

revoke all on function public.v2_join_player_identity_phase1(uuid,uuid,text,text,numeric,uuid,text)
  from public, anon, authenticated;
grant execute on function public.v2_join_player_identity_phase1(uuid,uuid,text,text,numeric,uuid,text)
  to service_role;

create or replace function public.v2_admin_list_legacy_player_candidates(
  p_canonical_player_id uuid
)
returns table (
  event_player_id uuid,
  event_id uuid,
  event_name text,
  event_date date,
  display_name text,
  confirmed_games bigint,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    participant.id,
    participant.event_id,
    event.name,
    event.event_date,
    participant.display_name,
    count(distinct match.id) filter (
      where lower(match.status) in ('confirmed', 'completed')
        and match.team_a_score is not null
        and match.team_b_score is not null
        and match.team_a_score <> match.team_b_score
    )::bigint,
    participant.created_at
  from public.v2_players profile
  join public.v2_event_players participant
    on participant.organization_id = profile.organization_id
   and participant.player_id is null
   and participant.status <> 'removed'
   and lower(regexp_replace(btrim(participant.display_name), '\s+', ' ', 'g')) =
       lower(regexp_replace(btrim(profile.display_name), '\s+', ' ', 'g'))
  join public.v2_events event on event.id = participant.event_id
  left join public.v2_match_players match_player on match_player.event_player_id = participant.id
  left join public.v2_matches match on match.id = match_player.match_id
  where profile.id = p_canonical_player_id
  group by participant.id, participant.event_id, event.name, event.event_date,
           participant.display_name, participant.created_at
  order by coalesce(event.event_date, participant.created_at::date) desc,
           participant.created_at desc;
$$;

revoke all on function public.v2_admin_list_legacy_player_candidates(uuid)
  from public, anon, authenticated;
grant execute on function public.v2_admin_list_legacy_player_candidates(uuid)
  to service_role;

create or replace function public.v2_admin_link_legacy_player_history(
  p_canonical_player_id uuid,
  p_event_player_ids uuid[],
  p_ip_hash text,
  p_source text default 'admin_member_directory'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile public.v2_players%rowtype;
  participant public.v2_event_players%rowtype;
  existing_link public.v2_player_identity_links%rowtype;
  requested_count integer;
  found_count integer := 0;
  linked_count integer := 0;
  unchanged_count integer := 0;
begin
  requested_count := coalesce(cardinality(p_event_player_ids), 0);
  if requested_count < 1 or requested_count > 100
     or requested_count <> (select count(distinct item) from unnest(p_event_player_ids) item)
     or exists (select 1 from unnest(p_event_player_ids) item where item is null) then
    raise exception 'LEGACY_PLAYER_LINK_INVALID';
  end if;

  select * into profile
  from public.v2_players
  where id = p_canonical_player_id and status = 'active'
  for update;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;

  for participant in
    select * from public.v2_event_players
    where id = any(p_event_player_ids)
    order by id
    for update
  loop
    found_count := found_count + 1;
    if participant.organization_id <> profile.organization_id then
      raise exception 'LEGACY_PLAYER_LINK_CONFLICT';
    end if;
    if participant.player_id is not null and participant.player_id <> profile.id then
      raise exception 'LEGACY_PLAYER_ALREADY_LINKED';
    end if;

    select * into existing_link
    from public.v2_player_identity_links
    where source_type = 'legacy_event_player' and source_id = participant.id
    for update;
    if found and existing_link.canonical_player_id <> profile.id then
      raise exception 'LEGACY_PLAYER_LINK_CONFLICT';
    end if;

    if participant.player_id is null then
      update public.v2_event_players
      set player_id = profile.id, updated_at = now()
      where id = participant.id and player_id is null;

      insert into public.v2_player_identity_links (
        organization_id, source_type, source_id, canonical_player_id,
        link_reason, created_by, metadata
      ) values (
        profile.organization_id, 'legacy_event_player', participant.id, profile.id,
        'explicit_admin_legacy_link', left(coalesce(p_source, 'admin'), 80),
        jsonb_build_object(
          'event_id', participant.event_id,
          'previous_player_id', null,
          'resulting_player_id', profile.id
        )
      )
      on conflict (source_type, source_id) do nothing;

      insert into public.v2_admin_event_audit (
        event_id, event_player_id, action, ip_hash, metadata
      ) values (
        participant.event_id,
        participant.id,
        'legacy_history_linked',
        coalesce(nullif(p_ip_hash, ''), 'unknown'),
        jsonb_build_object(
          'canonical_player_id', profile.id,
          'previous_player_id', null,
          'resulting_player_id', profile.id,
          'source', left(coalesce(p_source, 'admin'), 80)
        )
      );
      linked_count := linked_count + 1;
    else
      insert into public.v2_player_identity_links (
        organization_id, source_type, source_id, canonical_player_id,
        link_reason, created_by, metadata
      ) values (
        profile.organization_id, 'legacy_event_player', participant.id, profile.id,
        'explicit_admin_legacy_link', left(coalesce(p_source, 'admin'), 80),
        jsonb_build_object('event_id', participant.event_id, 'idempotent', true)
      )
      on conflict (source_type, source_id) do nothing;
      unchanged_count := unchanged_count + 1;
    end if;
  end loop;

  if found_count <> requested_count then raise exception 'LEGACY_PLAYER_NOT_FOUND'; end if;
  return jsonb_build_object(
    'canonicalPlayerId', profile.id,
    'linkedCount', linked_count,
    'unchangedCount', unchanged_count
  );
end;
$$;

revoke all on function public.v2_admin_link_legacy_player_history(uuid,uuid[],text,text)
  from public, anon, authenticated;
grant execute on function public.v2_admin_link_legacy_player_history(uuid,uuid[],text,text)
  to service_role;

-- Identity-aware Admin member reads derive canonical ownership through the
-- immutable event_player_id stored on Match History. Historical match rows stay
-- untouched when an event participant is linked later.
create or replace function public.v2_admin_list_members_identity(
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
        or lower(coalesce(player.email, '')) like '%' || lower(btrim(p_search)) || '%'
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
    join public.v2_event_players event_player on event_player.id = match_player.event_player_id
    join public.v2_matches match on match.id = match_player.match_id
    where event_player.player_id = player.id
      and lower(match.status) in ('confirmed', 'completed')
      and match.team_a_score is not null
      and match.team_b_score is not null
      and match.team_a_score <> match.team_b_score
  ) career on true;
$$;

revoke all on function public.v2_admin_list_members_identity(uuid,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.v2_admin_list_members_identity(uuid,text,integer,integer)
  to service_role;

create or replace function public.v2_admin_get_member_detail_identity(
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
    join public.v2_event_players ep on ep.id = mp.event_player_id
    join public.v2_matches m on m.id = mp.match_id
    where ep.player_id = profile.id
      and lower(m.status) in ('confirmed', 'completed')
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
    join public.v2_event_players event_player on event_player.id = match_player.event_player_id
    join public.v2_matches match on match.id = match_player.match_id
    where event_player.player_id = profile.id
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
      'playerCode', profile.player_code,
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

revoke all on function public.v2_admin_get_member_detail_identity(uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.v2_admin_get_member_detail_identity(uuid,integer,integer)
  to service_role;

comment on function public.v2_join_player_identity_phase1(uuid,uuid,text,text,numeric,uuid,text) is
  'Atomic player recognition and event join. Match History is never mutated.';
comment on function public.v2_admin_link_legacy_player_history(uuid,uuid[],text,text) is
  'Explicit idempotent Admin link from legacy event participants to canonical players; Match History is never rewritten.';
