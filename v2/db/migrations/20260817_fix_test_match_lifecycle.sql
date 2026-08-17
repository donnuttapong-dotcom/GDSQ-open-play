-- Keep Test Mode isolated while making its match lifecycle atomic and compatible
-- with the regular V2 Match payload.

alter table public.v2_test_matches
  add column if not exists court_name text,
  add column if not exists match_mode text not null default 'fair',
  add column if not exists fairness_score numeric,
  add column if not exists idempotency_key text;

alter table public.v2_test_smart_queue_preferences
  add column if not exists updated_by text not null default 'player';

create unique index if not exists v2_test_matches_event_idempotency_unique
  on public.v2_test_matches (event_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists v2_test_matches_event_status_court_idx
  on public.v2_test_matches (event_id, status, court_number);
create index if not exists v2_test_match_players_event_player_idx
  on public.v2_test_match_players (event_id, event_player_id);

create or replace function public.v2_test_save_match_preview(
  p_event_id uuid,
  p_organization_id uuid,
  p_court_number integer,
  p_court_name text,
  p_team_a uuid[],
  p_team_b uuid[],
  p_match_mode text default 'fair',
  p_fairness_score numeric default null,
  p_idempotency_key text default null,
  p_match_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.v2_test_events%rowtype;
  existing_match public.v2_test_matches%rowtype;
  all_player_ids uuid[] := array_cat(coalesce(p_team_a, '{}'::uuid[]), coalesce(p_team_b, '{}'::uuid[]));
  saved_match_id uuid;
  valid_players integer;
begin
  if array_length(p_team_a, 1) <> 2 or array_length(p_team_b, 1) <> 2
    or array_length(all_player_ids, 1) <> 4
    or (select count(distinct item) from unnest(all_player_ids) as item) <> 4 then
    raise exception 'Choose four different test players';
  end if;
  if p_court_number is null or p_court_number < 1 or p_court_number > 10 then
    raise exception 'Invalid test court';
  end if;

  select * into target_event
  from public.v2_test_events
  where id = p_event_id
    and organization_id = p_organization_id
    and environment = 'test'
  for update;
  if not found then raise exception 'Test event not found'; end if;
  if lower(coalesce(target_event.status, '')) not in ('live', 'open', 'active', 'draft') then
    raise exception 'Test event is not open for matches';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('v2-test-match:' || p_event_id::text, 0));

  if p_idempotency_key is not null and p_match_id is null then
    select id into saved_match_id
    from public.v2_test_matches
    where event_id = p_event_id and idempotency_key = p_idempotency_key;
    if found then return saved_match_id; end if;
  end if;

  if p_match_id is not null then
    select * into existing_match
    from public.v2_test_matches
    where id = p_match_id and event_id = p_event_id
    for update;
    if not found or existing_match.status <> 'preview' then
      raise exception 'Preview not found';
    end if;
  end if;

  select count(*) into valid_players
  from public.v2_test_event_players
  where event_id = p_event_id
    and id = any(all_player_ids)
    and status <> 'removed';
  if valid_players <> 4 then raise exception 'Invalid test players'; end if;

  if p_match_mode like 'smart_queue_%' then
    select count(*) into valid_players
    from public.v2_test_event_players player
    join public.v2_test_smart_queue_preferences preference
      on preference.event_player_id = player.id
      and preference.event_id = p_event_id
    where player.event_id = p_event_id
      and player.id = any(all_player_ids)
      and player.status in ('ready', 'checked_in')
      and preference.queue_status = 'ready'
      and substring(p_match_mode from 'smart_queue_(.*)$') = any(preference.modes);
    if valid_players <> 4 then raise exception 'Smart Queue players must be waiting and accept this play mode'; end if;
  end if;

  if exists (
    select 1
    from public.v2_test_matches active_match
    left join public.v2_test_match_players active_player on active_player.match_id = active_match.id
    where active_match.event_id = p_event_id
      and active_match.status in ('preview', 'assigned', 'playing', 'pending_score')
      and active_match.id is distinct from p_match_id
      and (active_match.court_number = p_court_number or active_player.event_player_id = any(all_player_ids))
  ) then
    raise exception 'Court or player is already in an active test match';
  end if;

  if p_match_id is null then
    insert into public.v2_test_matches (
      organization_id, event_id, court_number, court_name, status,
      match_mode, fairness_score, idempotency_key, updated_at
    ) values (
      p_organization_id, p_event_id, p_court_number, nullif(btrim(p_court_name), ''), 'preview',
      coalesce(nullif(btrim(p_match_mode), ''), 'fair'), p_fairness_score, p_idempotency_key, now()
    ) returning id into saved_match_id;
  else
    saved_match_id := p_match_id;
    update public.v2_test_matches
    set court_number = p_court_number,
        court_name = nullif(btrim(p_court_name), ''),
        match_mode = coalesce(nullif(btrim(p_match_mode), ''), 'fair'),
        fairness_score = p_fairness_score,
        updated_at = now()
    where id = saved_match_id;
    delete from public.v2_test_match_players where match_id = saved_match_id;
  end if;

  insert into public.v2_test_match_players (
    organization_id, event_id, match_id, event_player_id, team, slot
  )
  select p_organization_id, p_event_id, saved_match_id, item, 'A', ordinality
  from unnest(p_team_a) with ordinality as input(item, ordinality)
  union all
  select p_organization_id, p_event_id, saved_match_id, item, 'B', ordinality
  from unnest(p_team_b) with ordinality as input(item, ordinality);

  return saved_match_id;
end;
$$;

revoke all on function public.v2_test_save_match_preview(uuid, uuid, integer, text, uuid[], uuid[], text, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.v2_test_save_match_preview(uuid, uuid, integer, text, uuid[], uuid[], text, numeric, text, uuid) to service_role;
