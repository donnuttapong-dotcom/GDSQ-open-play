-- Player self-selected levels are profile defaults for future joins, while
-- Organizer changes remain scoped to v2_event_players for the active event.
-- Match rows, match players, scores, ratings, ranking, and history are untouched.

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
  clean_name text := regexp_replace(btrim(coalesce(p_display_name, '')), '\\s+', ' ', 'g');
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
  if p_resolution_source is not null and p_resolution_source not in ('capability', 'player_code') then
    raise exception 'IDENTITY_RESOLUTION_INVALID';
  end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 50 then
    raise exception 'DISPLAY_NAME_INVALID';
  end if;
  if clean_email is not null and (char_length(clean_email) > 254 or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$') then
    raise exception 'EMAIL_INVALID';
  end if;
  name_key := lower(clean_name);

  select * into target_event from public.v2_events
  where id = p_event_id and organization_id = p_organization_id for share;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if lower(target_event.status) not in ('live', 'open', 'active') or not target_event.checkin_open then
    raise exception 'EVENT_NOT_OPEN';
  end if;

  if p_resolved_player_id is not null then
    select * into profile from public.v2_players
    where id = p_resolved_player_id and organization_id = p_organization_id and status = 'active' for update;
    if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  elsif clean_email is not null then
    select * into profile from public.v2_players
    where organization_id = p_organization_id and lower(btrim(email)) = clean_email for update;
    if found and lower(regexp_replace(btrim(profile.display_name), '\\s+', ' ', 'g')) <> name_key then
      raise exception 'EMAIL_PROFILE_MISMATCH';
    end if;
  end if;

  if profile.id is null and clean_email is not null then
    if exists (select 1 from public.v2_players where organization_id = p_organization_id and lower(regexp_replace(btrim(display_name), '\\s+', ' ', 'g')) = name_key) then
      raise exception 'DISPLAY_NAME_TAKEN';
    end if;
    select * into instant_profile from public.v2_instant_player_profiles
    where organization_id = p_organization_id and lower(btrim(email)) = clean_email for update;
    if found and lower(regexp_replace(btrim(instant_profile.display_name), '\\s+', ' ', 'g')) <> name_key then
      raise exception 'EMAIL_PROFILE_MISMATCH';
    end if;
    insert into public.v2_players (organization_id, user_id, display_name, email, default_level, status)
    values (p_organization_id, null, clean_name, clean_email, clean_level, 'active')
    returning * into profile;
    profile_created := true;
    if instant_profile.id is not null then
      insert into public.v2_player_identity_links (organization_id, source_type, source_id, canonical_player_id, link_reason, created_by, metadata)
      values (p_organization_id, 'instant_profile', instant_profile.id, profile.id, 'instant_profile_promoted', 'identity_join', '{}'::jsonb)
      on conflict (source_type, source_id) do nothing;
    end if;
  end if;

  if profile.id is not null then
    select * into participation from public.v2_event_players
    where event_id = p_event_id and player_id = profile.id and status <> 'removed'
    order by created_at limit 1 for update;
    if found then
      select count(*) into legacy_count from public.v2_event_players historical
      where historical.organization_id = p_organization_id and historical.event_id <> p_event_id
        and historical.player_id is null and historical.status <> 'removed'
        and lower(regexp_replace(btrim(historical.display_name), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim(profile.display_name), '\\s+', ' ', 'g'));
      return jsonb_build_object('eventPlayerId', participation.id, 'profileId', profile.id, 'alreadyJoined', true, 'identityState', 'already_joined', 'legacyCandidatesCount', legacy_count, 'profileCreated', false);
    end if;
  end if;

  select count(*), count(*) filter (where player_id is null), count(*) filter (where player_id is not null and (profile.id is null or player_id <> profile.id))
  into same_name_count, unlinked_count, linked_other_count
  from public.v2_event_players
  where event_id = p_event_id and status <> 'removed'
    and lower(regexp_replace(btrim(display_name), '\\s+', ' ', 'g')) = name_key;
  if profile.id is not null and unlinked_count > 1 then raise exception 'AMBIGUOUS_PLAYER_IDENTITY'; end if;
  if linked_other_count > 0 then raise exception 'DISPLAY_NAME_ALREADY_IN_EVENT'; end if;

  if profile.id is not null and unlinked_count = 1 and same_name_count = 1 then
    select * into candidate from public.v2_event_players
    where event_id = p_event_id and player_id is null and status <> 'removed'
      and lower(regexp_replace(btrim(display_name), '\\s+', ' ', 'g')) = name_key for update;
    update public.v2_event_players set player_id = profile.id, updated_at = now()
    where id = candidate.id and player_id is null returning * into participation;
    if participation.id is null then raise exception 'LEGACY_PLAYER_LINK_CONFLICT'; end if;
    identity_state := 'guest_promoted';
  elsif profile.id is null and same_name_count > 0 then
    if unlinked_count > 1 then raise exception 'AMBIGUOUS_PLAYER_IDENTITY'; end if;
    raise exception 'DISPLAY_NAME_ALREADY_IN_EVENT';
  else
    select count(*) into active_count from public.v2_event_players where event_id = p_event_id and status <> 'removed';
    if target_event.max_players is not null and target_event.max_players > 0 and active_count >= target_event.max_players then
      raise exception 'EVENT_FULL';
    end if;
    if profile.id is not null and not profile_created then
      update public.v2_players set default_level = clean_level, updated_at = now()
      where id = profile.id
      returning * into profile;
    end if;
    insert into public.v2_event_players (organization_id, event_id, player_id, display_name, estimated_level, avatar_url, status, queue_joined_at)
    values (p_organization_id, p_event_id, profile.id, coalesce(profile.display_name, clean_name), clean_level,
      profile.avatar_url, 'ready', now())
    returning * into participation;
    identity_state := case when profile.id is null then 'guest_unlinked' when profile_created then 'canonical_created' else 'canonical_existing' end;
  end if;

  if profile.id is not null then
    select count(*) into legacy_count from public.v2_event_players historical
    where historical.organization_id = p_organization_id and historical.event_id <> p_event_id
      and historical.player_id is null and historical.status <> 'removed'
      and lower(regexp_replace(btrim(historical.display_name), '\\s+', ' ', 'g')) = lower(regexp_replace(btrim(profile.display_name), '\\s+', ' ', 'g'));
  end if;
  return jsonb_build_object('eventPlayerId', participation.id, 'profileId', profile.id, 'alreadyJoined', false, 'identityState', identity_state, 'legacyCandidatesCount', legacy_count, 'profileCreated', profile_created);
end;
$$;

revoke all on function public.v2_join_player_identity_phase1(uuid,uuid,text,text,numeric,uuid,text) from public, anon, authenticated;
grant execute on function public.v2_join_player_identity_phase1(uuid,uuid,text,text,numeric,uuid,text) to service_role;

comment on function public.v2_join_player_identity_phase1(uuid,uuid,text,text,numeric,uuid,text) is
  'Atomic player recognition and join. Submitted self-selected level updates a canonical profile only for a new event join; Organizer event-level adjustments remain event-scoped.';
