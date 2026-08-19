-- P0: server-authoritative live event and match lifecycle.
-- This migration is additive: it never rewrites or deletes historical rows.

create or replace function public.v2_mark_hall_of_fame_event_processed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.status, '')) in ('completed', 'ended', 'closed', 'finished') then
    if tg_op = 'INSERT' or lower(coalesce(old.status, '')) not in ('completed', 'ended', 'closed', 'finished') then
      if exists (
        select 1 from public.v2_matches m
        where m.event_id = new.id
          and lower(coalesce(m.status, '')) in ('preview', 'assigned', 'playing', 'pending_score')
      ) then
        raise exception 'EVENT_HAS_ACTIVE_MATCHES';
      end if;
      if not public.v2_hall_of_fame_event_is_valid(new.id) then
        raise exception 'HALL_OF_FAME_EVENT_INCOMPLETE';
      end if;
      if tg_op = 'INSERT' then
        new.hall_of_fame_processed_at := coalesce(new.hall_of_fame_processed_at, new.completed_at, now());
      else
        new.hall_of_fame_processed_at := coalesce(old.hall_of_fame_processed_at, new.hall_of_fame_processed_at, new.completed_at, now());
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.v2_admin_create_event(
  p_organization_id uuid, p_name text, p_event_date date, p_start_time text, p_end_time text,
  p_venue_name text, p_court_count integer, p_matching_mode text, p_status text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid; clean_status text := lower(trim(coalesce(p_status, 'draft')));
begin
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'EVENT_NAME_REQUIRED'; end if;
  if clean_status not in ('draft', 'live', 'open', 'active') then raise exception 'INVALID_EVENT_STATUS'; end if;
  if coalesce(p_court_count, 0) not between 1 and 10 then raise exception 'INVALID_COURT_COUNT'; end if;
  insert into public.v2_events (organization_id, name, event_date, start_time, end_time, venue_name, court_count, matching_mode, status, checkin_open)
  values (p_organization_id, trim(p_name), p_event_date, nullif(trim(coalesce(p_start_time, '')), ''), nullif(trim(coalesce(p_end_time, '')), ''), nullif(trim(coalesce(p_venue_name, '')), ''), p_court_count, case when p_matching_mode = 'smart_queue' then 'smart_queue' else 'standard' end, clean_status, true)
  returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.v2_admin_set_event_status(
  p_event_id uuid, p_organization_id uuid, p_status text, p_ip_hash text
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_events; clean_status text := lower(trim(coalesce(p_status, '')));
begin
  if clean_status not in ('draft', 'live', 'open', 'active', 'completed', 'ended', 'closed', 'finished') then raise exception 'INVALID_EVENT_STATUS'; end if;
  select * into target from public.v2_events where id = p_event_id and organization_id = p_organization_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if target.hall_of_fame_processed_at is not null and clean_status <> lower(target.status) then raise exception 'EVENT_FINALIZED_CANNOT_REOPEN'; end if;
  update public.v2_events
    set status = clean_status,
        completed_at = case when clean_status in ('completed', 'ended', 'closed', 'finished') then coalesce(completed_at, now()) else completed_at end,
        updated_at = now()
    where id = target.id;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
  values (target.id, 'event_status_updated', p_ip_hash, jsonb_build_object('status', clean_status));
end;
$$;

create or replace function public.v2_admin_create_match_preview(
  p_event_id uuid, p_organization_id uuid, p_court_number integer, p_event_player_ids uuid[], p_idempotency_key text, p_ip_hash text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target_event public.v2_events; match_id uuid;
begin
  if coalesce(array_length(p_event_player_ids, 1), 0) <> 4 or (select count(distinct event_player_id) from unnest(p_event_player_ids) as roster(event_player_id)) <> 4 then raise exception 'MATCH_REQUIRES_FOUR_UNIQUE_PLAYERS'; end if;
  select * into target_event from public.v2_events where id = p_event_id and organization_id = p_organization_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if lower(target_event.status) not in ('live', 'open', 'active') or target_event.hall_of_fame_processed_at is not null then raise exception 'EVENT_NOT_LIVE'; end if;
  if p_court_number not between 1 and target_event.court_count then raise exception 'INVALID_COURT'; end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is not null then
    select id into match_id from public.v2_matches where event_id = p_event_id and idempotency_key = p_idempotency_key limit 1;
    if match_id is not null then return match_id; end if;
  end if;
  if exists (select 1 from public.v2_matches m where m.event_id = p_event_id and m.court_number = p_court_number and lower(m.status) in ('preview','assigned','playing','pending_score')) then raise exception 'COURT_ALREADY_IN_USE'; end if;
  if (select count(*) from public.v2_event_players ep where ep.event_id = p_event_id and ep.organization_id = p_organization_id and ep.id = any(p_event_player_ids) and lower(ep.status) in ('ready','checked_in')) <> 4 then raise exception 'MATCH_PLAYER_UNAVAILABLE'; end if;
  if exists (select 1 from public.v2_match_players mp join public.v2_matches m on m.id = mp.match_id where mp.event_player_id = any(p_event_player_ids) and m.event_id = p_event_id and lower(m.status) in ('preview','assigned','playing','pending_score')) then raise exception 'MATCH_PLAYER_ALREADY_ACTIVE'; end if;
  insert into public.v2_matches(organization_id,event_id,court_number,status,idempotency_key) values(p_organization_id,p_event_id,p_court_number,'preview',nullif(trim(coalesce(p_idempotency_key,'')),'')) returning id into match_id;
  insert into public.v2_match_players(organization_id,event_id,match_id,event_player_id,player_id,team,slot)
  select p_organization_id,p_event_id,match_id,ep.id,ep.player_id,case when r.ord <= 2 then 'A' else 'B' end,case when r.ord <= 2 then r.ord else r.ord - 2 end
  from unnest(p_event_player_ids) with ordinality r(id,ord) join public.v2_event_players ep on ep.id=r.id;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata) values(p_event_id,'match_preview_created',p_ip_hash,jsonb_build_object('match_id',match_id));
  return match_id;
end;
$$;

create or replace function public.v2_admin_update_match_preview(
  p_match_id uuid, p_organization_id uuid, p_event_player_ids uuid[], p_ip_hash text
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_matches; event_row public.v2_events;
begin
  if coalesce(array_length(p_event_player_ids, 1), 0) <> 4 or (select count(distinct event_player_id) from unnest(p_event_player_ids) as roster(event_player_id)) <> 4 then raise exception 'MATCH_REQUIRES_FOUR_UNIQUE_PLAYERS'; end if;
  select * into target from public.v2_matches where id=p_match_id and organization_id=p_organization_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if lower(target.status) <> 'preview' then raise exception 'ONLY_PREVIEW_CAN_BE_EDITED'; end if;
  select * into event_row from public.v2_events where id=target.event_id for update;
  if lower(event_row.status) not in ('live','open','active') or event_row.hall_of_fame_processed_at is not null then raise exception 'EVENT_NOT_LIVE'; end if;
  if (select count(*) from public.v2_event_players ep where ep.event_id=target.event_id and ep.organization_id=p_organization_id and ep.id=any(p_event_player_ids) and lower(ep.status) in ('ready','checked_in')) <> 4 then raise exception 'MATCH_PLAYER_UNAVAILABLE'; end if;
  if exists (select 1 from public.v2_match_players mp join public.v2_matches m on m.id=mp.match_id where mp.event_player_id=any(p_event_player_ids) and m.id<>target.id and m.event_id=target.event_id and lower(m.status) in ('preview','assigned','playing','pending_score')) then raise exception 'MATCH_PLAYER_ALREADY_ACTIVE'; end if;
  delete from public.v2_match_players where match_id=target.id;
  insert into public.v2_match_players(organization_id,event_id,match_id,event_player_id,player_id,team,slot)
  select target.organization_id,target.event_id,target.id,ep.id,ep.player_id,case when r.ord <= 2 then 'A' else 'B' end,case when r.ord <= 2 then r.ord else r.ord - 2 end
  from unnest(p_event_player_ids) with ordinality r(id,ord) join public.v2_event_players ep on ep.id=r.id;
  update public.v2_matches set updated_at=now() where id=target.id;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata) values(target.event_id,'match_preview_updated',p_ip_hash,jsonb_build_object('match_id',target.id));
end;
$$;

create or replace function public.v2_admin_start_match(
  p_match_id uuid, p_organization_id uuid, p_ip_hash text
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_matches; event_row public.v2_events; roster uuid[]; changed integer;
begin
  select * into target from public.v2_matches where id=p_match_id and organization_id=p_organization_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if lower(target.status) <> 'preview' then raise exception 'ONLY_PREVIEW_CAN_BE_STARTED'; end if;
  select * into event_row from public.v2_events where id=target.event_id for update;
  if lower(event_row.status) not in ('live','open','active') or event_row.hall_of_fame_processed_at is not null then raise exception 'EVENT_NOT_LIVE'; end if;
  select array_agg(event_player_id order by team,slot) into roster from public.v2_match_players where match_id=target.id;
  if coalesce(array_length(roster,1),0)<>4 or (select count(distinct event_player_id) from unnest(roster) as roster_rows(event_player_id))<>4 then raise exception 'MATCH_REQUIRES_FOUR_UNIQUE_PLAYERS'; end if;
  if exists (select 1 from public.v2_matches m where m.event_id=target.event_id and m.id<>target.id and m.court_number=target.court_number and lower(m.status) in ('preview','assigned','playing','pending_score')) then raise exception 'COURT_ALREADY_IN_USE'; end if;
  if exists (select 1 from public.v2_match_players mp join public.v2_matches m on m.id=mp.match_id where mp.event_player_id=any(roster) and m.id<>target.id and m.event_id=target.event_id and lower(m.status) in ('preview','assigned','playing','pending_score')) then raise exception 'MATCH_PLAYER_ALREADY_ACTIVE'; end if;
  update public.v2_event_players set status='playing',updated_at=now() where event_id=target.event_id and id=any(roster) and lower(status) in ('ready','checked_in');
  get diagnostics changed = row_count;
  if changed<>4 then raise exception 'MATCH_PLAYER_UNAVAILABLE'; end if;
  update public.v2_matches set status='playing',started_at=coalesce(started_at,now()),updated_at=now() where id=target.id;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata) values(target.event_id,'match_started',p_ip_hash,jsonb_build_object('match_id',target.id));
end;
$$;

create or replace function public.v2_admin_cancel_match(
  p_match_id uuid, p_organization_id uuid, p_ip_hash text
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_matches; roster uuid[];
begin
  select * into target from public.v2_matches where id=p_match_id and organization_id=p_organization_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if lower(target.status) in ('confirmed','completed') then raise exception 'CONFIRMED_MATCH_REQUIRES_ADMIN_RESULTS'; end if;
  if lower(target.status) not in ('preview','assigned','playing','pending_score') then return; end if;
  select array_agg(event_player_id) into roster from public.v2_match_players where match_id=target.id;
  if lower(target.status) in ('playing','pending_score') then
    update public.v2_event_players set status='ready',updated_at=now() where event_id=target.event_id and id=any(roster) and status='playing';
  end if;
  update public.v2_matches set status='cancelled',updated_at=now() where id=target.id;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata) values(target.event_id,'match_cancelled',p_ip_hash,jsonb_build_object('match_id',target.id));
end;
$$;

create or replace function public.v2_admin_confirm_score(
  p_match_id uuid, p_organization_id uuid, p_team_a_score integer, p_team_b_score integer, p_ip_hash text
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_matches; roster uuid[]; changed integer;
begin
  if p_team_a_score is null or p_team_b_score is null or p_team_a_score not between 0 and 99 or p_team_b_score not between 0 and 99 or p_team_a_score=p_team_b_score then raise exception 'INVALID_SCORE'; end if;
  select * into target from public.v2_matches where id=p_match_id and organization_id=p_organization_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if lower(target.status) in ('confirmed','completed') then return; end if;
  if lower(target.status) not in ('playing','pending_score') then raise exception 'ONLY_ACTIVE_MATCH_CAN_BE_CONFIRMED'; end if;
  select array_agg(event_player_id) into roster from public.v2_match_players where match_id=target.id;
  if coalesce(array_length(roster,1),0)<>4 or (select count(distinct event_player_id) from unnest(roster) as roster_rows(event_player_id))<>4 then raise exception 'MATCH_REQUIRES_FOUR_UNIQUE_PLAYERS'; end if;
  update public.v2_matches set status='confirmed',team_a_score=p_team_a_score,team_b_score=p_team_b_score,winner=case when p_team_a_score>p_team_b_score then 'A' else 'B' end,completed_at=now(),updated_at=now() where id=target.id;
  update public.v2_event_players set status='ready',updated_at=now() where event_id=target.event_id and id=any(roster) and status='playing';
  get diagnostics changed = row_count;
  if changed<>4 then raise exception 'MATCH_PLAYER_STATUS_CONFLICT'; end if;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata) values(target.event_id,'match_confirmed',p_ip_hash,jsonb_build_object('match_id',target.id));
end;
$$;

revoke all on function public.v2_admin_create_event(uuid,text,date,text,text,text,integer,text,text) from public,anon,authenticated;
revoke all on function public.v2_admin_set_event_status(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.v2_admin_create_match_preview(uuid,uuid,integer,uuid[],text,text) from public,anon,authenticated;
revoke all on function public.v2_admin_update_match_preview(uuid,uuid,uuid[],text) from public,anon,authenticated;
revoke all on function public.v2_admin_start_match(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.v2_admin_cancel_match(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.v2_admin_confirm_score(uuid,uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.v2_admin_create_event(uuid,text,date,text,text,text,integer,text,text) to service_role;
grant execute on function public.v2_admin_set_event_status(uuid,uuid,text,text) to service_role;
grant execute on function public.v2_admin_create_match_preview(uuid,uuid,integer,uuid[],text,text) to service_role;
grant execute on function public.v2_admin_update_match_preview(uuid,uuid,uuid[],text) to service_role;
grant execute on function public.v2_admin_start_match(uuid,uuid,text) to service_role;
grant execute on function public.v2_admin_cancel_match(uuid,uuid,text) to service_role;
grant execute on function public.v2_admin_confirm_score(uuid,uuid,integer,integer,text) to service_role;

drop policy if exists v2_events_public_insert on public.v2_events;
drop policy if exists v2_events_public_update on public.v2_events;
drop policy if exists v2_matches_public_insert on public.v2_matches;
drop policy if exists v2_matches_public_update on public.v2_matches;
drop policy if exists v2_match_players_public_insert on public.v2_match_players;
drop policy if exists v2_match_players_public_delete on public.v2_match_players;
