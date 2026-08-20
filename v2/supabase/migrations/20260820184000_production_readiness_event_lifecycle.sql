-- Production readiness: explicit event finalization, state-aware deletion, and
-- active-player mutation protection. Matchmaking, score, ranking, and MVP
-- formulas are intentionally unchanged.

create schema if not exists gdsq_history_backup;
revoke all on schema gdsq_history_backup from public, anon, authenticated;

create table if not exists gdsq_history_backup.v2_events_checkpoint_20260820_prod99
as table public.v2_events;
create table if not exists gdsq_history_backup.v2_event_players_checkpoint_20260820_prod99
as table public.v2_event_players;
create table if not exists gdsq_history_backup.v2_matches_checkpoint_20260820_prod99
as table public.v2_matches;
create table if not exists gdsq_history_backup.v2_match_players_checkpoint_20260820_prod99
as table public.v2_match_players;
create table if not exists gdsq_history_backup.v2_players_checkpoint_20260820_prod99
as table public.v2_players;

revoke all on all tables in schema gdsq_history_backup from public, anon, authenticated;

create or replace function public.v2_admin_end_event_and_save_results(
  p_event_id uuid,
  p_organization_id uuid,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.v2_events;
  player_count integer := 0;
  confirmed_count integer := 0;
  active_count integer := 0;
  invalid_count integer := 0;
  processed_at timestamptz;
begin
  select * into target
  from public.v2_events
  where id = p_event_id and organization_id = p_organization_id
  for update;

  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if lower(coalesce(target.status, '')) in ('deleted', 'archived') then
    raise exception 'EVENT_ARCHIVED';
  end if;

  select count(*) into player_count
  from public.v2_event_players ep
  where ep.event_id = target.id and lower(coalesce(ep.status, '')) <> 'removed';

  select
    count(*) filter (where lower(coalesce(m.status, '')) in ('confirmed', 'completed', 'done', 'finished')),
    count(*) filter (where lower(coalesce(m.status, '')) in ('preview', 'assigned', 'playing', 'pending_score'))
  into confirmed_count, active_count
  from public.v2_matches m
  where m.event_id = target.id;

  if target.hall_of_fame_processed_at is not null then
    return jsonb_build_object(
      'eventId', target.id,
      'status', target.status,
      'players', player_count,
      'confirmedMatches', confirmed_count,
      'activeMatches', active_count,
      'processedAt', target.hall_of_fame_processed_at,
      'alreadyProcessed', true
    );
  end if;

  if lower(coalesce(target.status, '')) not in (
    'live', 'open', 'active', 'completed', 'ended', 'closed', 'finished'
  ) then
    raise exception 'EVENT_NOT_LIVE';
  end if;
  if active_count > 0 then
    raise exception 'EVENT_HAS_ACTIVE_MATCHES:%', active_count;
  end if;

  select count(*) into invalid_count
  from public.v2_matches m
  where m.event_id = target.id
    and lower(coalesce(m.status, '')) in ('confirmed', 'completed', 'done', 'finished')
    and (
      m.team_a_score is null
      or m.team_b_score is null
      or m.team_a_score < 0
      or m.team_b_score < 0
      or m.team_a_score > 99
      or m.team_b_score > 99
      or m.team_a_score = m.team_b_score
      or upper(coalesce(m.winner, '')) not in ('A', 'B')
      or upper(m.winner) <> case when m.team_a_score > m.team_b_score then 'A' else 'B' end
      or (select count(*) from public.v2_match_players mp where mp.match_id = m.id) <> 4
      or (select count(distinct mp.event_player_id) from public.v2_match_players mp where mp.match_id = m.id) <> 4
      or (select count(*) from public.v2_match_players mp where mp.match_id = m.id and upper(mp.team) = 'A') <> 2
      or (select count(*) from public.v2_match_players mp where mp.match_id = m.id and upper(mp.team) = 'B') <> 2
      or exists (
        select 1
        from public.v2_match_players mp
        left join public.v2_event_players ep on ep.id = mp.event_player_id
        where mp.match_id = m.id
          and (ep.id is null or ep.event_id <> target.id)
      )
    );

  if invalid_count > 0 then
    raise exception 'EVENT_INVALID_CONFIRMED_MATCHES:%', invalid_count;
  end if;

  processed_at := coalesce(target.completed_at, now());
  update public.v2_events
  set status = 'completed',
      completed_at = processed_at,
      hall_of_fame_processed_at = processed_at,
      checkin_open = false,
      updated_at = now()
  where id = target.id;

  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
  values (
    target.id,
    'event_completed_results_saved',
    p_ip_hash,
    jsonb_build_object(
      'players', player_count,
      'confirmed_matches', confirmed_count,
      'source_of_truth', 'confirmed_match_history'
    )
  );

  return jsonb_build_object(
    'eventId', target.id,
    'status', 'completed',
    'players', player_count,
    'confirmedMatches', confirmed_count,
    'activeMatches', 0,
    'processedAt', processed_at,
    'alreadyProcessed', false
  );
end;
$$;

create or replace function public.v2_admin_delete_event_stateful(
  p_event_id uuid,
  p_organization_id uuid,
  p_confirmation text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.v2_events;
  active_count integer := 0;
  confirmed_count integer := 0;
  player_count integer := 0;
  finalized boolean := false;
begin
  select * into target
  from public.v2_events
  where id = p_event_id and organization_id = p_organization_id
  for update;

  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  finalized := target.hall_of_fame_processed_at is not null;
  if finalized and p_confirmation <> 'DELETE_FINALIZED_EVENT' then
    raise exception 'FINALIZED_DELETE_CONFIRMATION_REQUIRED';
  end if;
  if not finalized and p_confirmation <> 'DELETE_EVENT' then
    raise exception 'DELETE_CONFIRMATION_REQUIRED';
  end if;

  select
    count(*) filter (where lower(coalesce(m.status, '')) in ('preview', 'assigned', 'playing', 'pending_score')),
    count(*) filter (where lower(coalesce(m.status, '')) in ('confirmed', 'completed', 'done', 'finished'))
  into active_count, confirmed_count
  from public.v2_matches m
  where m.event_id = target.id;

  if active_count > 0 then
    raise exception 'EVENT_HAS_ACTIVE_MATCHES:%', active_count;
  end if;

  select count(*) into player_count
  from public.v2_event_players ep
  where ep.event_id = target.id;

  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
  values (
    target.id,
    'event_deleted_statefully',
    p_ip_hash,
    jsonb_build_object(
      'name', target.name,
      'event_date', target.event_date,
      'previous_status', target.status,
      'hall_processed', finalized,
      'players', player_count,
      'confirmed_matches', confirmed_count,
      'recalculation_source', 'remaining_confirmed_match_history'
    )
  );

  delete from public.v2_events where id = target.id;

  return jsonb_build_object(
    'eventId', target.id,
    'deleted', true,
    'wasFinalized', finalized,
    'playersRemoved', player_count,
    'confirmedMatchesRemoved', confirmed_count
  );
end;
$$;

create or replace function public.v2_admin_update_event_player_status(
  p_event_id uuid,
  p_event_player_id uuid,
  p_status text,
  p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  participant public.v2_event_players;
  clean_status text := lower(trim(coalesce(p_status, '')));
begin
  if clean_status not in ('ready', 'checked_in', 'rest', 'resting', 'left') then
    raise exception 'INVALID_PLAYER_STATUS';
  end if;

  select * into participant
  from public.v2_event_players
  where id = p_event_player_id and event_id = p_event_id
  for update;

  if not found then raise exception 'EVENT_PLAYER_NOT_FOUND'; end if;
  if participant.status = 'removed' then raise exception 'EVENT_PLAYER_REMOVED'; end if;
  if exists (
    select 1
    from public.v2_match_players mp
    join public.v2_matches m on m.id = mp.match_id
    where mp.event_player_id = participant.id
      and m.event_id = participant.event_id
      and lower(coalesce(m.status, '')) in ('preview', 'assigned', 'playing', 'pending_score')
  ) then
    raise exception 'PLAYER_ACTIVE_IN_MATCH';
  end if;

  update public.v2_event_players
  set status = clean_status, updated_at = now()
  where id = participant.id;

  insert into public.v2_admin_event_audit(event_id, event_player_id, action, ip_hash, metadata)
  values (
    participant.event_id,
    participant.id,
    'event_player_status_updated',
    p_ip_hash,
    jsonb_build_object('status', clean_status)
  );
end;
$$;

revoke all on function public.v2_admin_end_event_and_save_results(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.v2_admin_delete_event_stateful(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.v2_admin_update_event_player_status(uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.v2_admin_end_event_and_save_results(uuid, uuid, text)
  to service_role;
grant execute on function public.v2_admin_delete_event_stateful(uuid, uuid, text, text)
  to service_role;
grant execute on function public.v2_admin_update_event_player_status(uuid, uuid, text, text)
  to service_role;

comment on function public.v2_admin_end_event_and_save_results(uuid, uuid, text) is
  'Atomically validates a live/completed event and marks its confirmed history as finalized for Hall/Career.';
comment on function public.v2_admin_delete_event_stateful(uuid, uuid, text, text) is
  'Deletes one event only after active-match and finalized-result confirmation guards pass; event-scoped rows cascade.';
