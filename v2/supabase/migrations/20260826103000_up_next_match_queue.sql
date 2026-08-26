-- Additive Up Next queue. Existing preview/start/cancel/score RPCs are not
-- replaced: new functions and small state triggers layer on top of them.

create unique index if not exists v2_matches_one_queued_next_per_court
  on public.v2_matches (event_id, court_number)
  where lower(coalesce(status, '')) = 'queued_next';

create or replace function public.v2_admin_create_match_next(
  p_event_id uuid, p_organization_id uuid, p_court_number integer,
  p_event_player_ids uuid[], p_ip_hash text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target_event public.v2_events; match_id uuid;
begin
  if coalesce(array_length(p_event_player_ids, 1), 0) <> 4
    or (select count(distinct event_player_id) from unnest(p_event_player_ids) as roster(event_player_id)) <> 4 then
    raise exception 'MATCH_REQUIRES_FOUR_UNIQUE_PLAYERS';
  end if;
  select * into target_event from public.v2_events
    where id = p_event_id and organization_id = p_organization_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if lower(coalesce(target_event.status, '')) not in ('live', 'open', 'active') or target_event.hall_of_fame_processed_at is not null then raise exception 'EVENT_NOT_LIVE'; end if;
  if p_court_number not between 1 and target_event.court_count then raise exception 'INVALID_COURT'; end if;
  if not exists (select 1 from public.v2_matches m where m.event_id = p_event_id and m.court_number = p_court_number
    and lower(coalesce(m.status, '')) in ('playing', 'pending_score')) then raise exception 'COURT_IS_NOT_PLAYING'; end if;
  if exists (select 1 from public.v2_matches m where m.event_id = p_event_id and m.court_number = p_court_number
    and lower(coalesce(m.status, '')) = 'queued_next') then raise exception 'COURT_ALREADY_HAS_NEXT'; end if;
  perform 1 from public.v2_event_players ep where ep.event_id = p_event_id and ep.organization_id = p_organization_id
    and ep.id = any(p_event_player_ids) order by ep.id for update;
  if (select count(*) from public.v2_event_players ep where ep.event_id = p_event_id and ep.organization_id = p_organization_id
    and ep.id = any(p_event_player_ids) and lower(coalesce(ep.status, '')) in ('ready', 'checked_in')) <> 4 then raise exception 'MATCH_PLAYER_UNAVAILABLE'; end if;
  if exists (select 1 from public.v2_match_players mp join public.v2_matches m on m.id = mp.match_id
    where mp.event_player_id = any(p_event_player_ids) and m.event_id = p_event_id
      and lower(coalesce(m.status, '')) in ('preview', 'assigned', 'playing', 'pending_score', 'queued_next')) then raise exception 'MATCH_PLAYER_ALREADY_ACTIVE'; end if;
  insert into public.v2_matches(organization_id, event_id, court_number, status)
    values(p_organization_id, p_event_id, p_court_number, 'queued_next') returning id into match_id;
  insert into public.v2_match_players(organization_id, event_id, match_id, event_player_id, player_id, team, slot)
    select p_organization_id, p_event_id, match_id, ep.id, ep.player_id, case when r.ord <= 2 then 'A' else 'B' end,
      case when r.ord <= 2 then r.ord else r.ord - 2 end
    from unnest(p_event_player_ids) with ordinality r(id, ord) join public.v2_event_players ep on ep.id = r.id;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
    values(p_event_id, 'match_next_created', p_ip_hash, jsonb_build_object('match_id', match_id, 'court', p_court_number));
  return match_id;
end;
$$;

create or replace function public.v2_admin_update_match_next(
  p_match_id uuid, p_organization_id uuid, p_event_player_ids uuid[], p_ip_hash text
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_matches; event_row public.v2_events;
begin
  if coalesce(array_length(p_event_player_ids, 1), 0) <> 4
    or (select count(distinct event_player_id) from unnest(p_event_player_ids) as roster(event_player_id)) <> 4 then raise exception 'MATCH_REQUIRES_FOUR_UNIQUE_PLAYERS'; end if;
  select * into target from public.v2_matches where id = p_match_id and organization_id = p_organization_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if lower(coalesce(target.status, '')) <> 'queued_next' then raise exception 'ONLY_NEXT_CAN_BE_EDITED'; end if;
  select * into event_row from public.v2_events where id = target.event_id for update;
  if lower(coalesce(event_row.status, '')) not in ('live', 'open', 'active') or event_row.hall_of_fame_processed_at is not null then raise exception 'EVENT_NOT_LIVE'; end if;
  perform 1 from public.v2_event_players ep where ep.event_id = target.event_id and ep.organization_id = p_organization_id
    and ep.id = any(p_event_player_ids) order by ep.id for update;
  if (select count(*) from public.v2_event_players ep where ep.event_id = target.event_id and ep.organization_id = p_organization_id
    and ep.id = any(p_event_player_ids) and lower(coalesce(ep.status, '')) in ('ready', 'checked_in')) <> 4 then raise exception 'MATCH_PLAYER_UNAVAILABLE'; end if;
  if exists (select 1 from public.v2_match_players mp join public.v2_matches m on m.id = mp.match_id
    where mp.event_player_id = any(p_event_player_ids) and m.id <> target.id and m.event_id = target.event_id
      and lower(coalesce(m.status, '')) in ('preview', 'assigned', 'playing', 'pending_score', 'queued_next')) then raise exception 'MATCH_PLAYER_ALREADY_ACTIVE'; end if;
  delete from public.v2_match_players where match_id = target.id;
  insert into public.v2_match_players(organization_id, event_id, match_id, event_player_id, player_id, team, slot)
    select target.organization_id, target.event_id, target.id, ep.id, ep.player_id, case when r.ord <= 2 then 'A' else 'B' end,
      case when r.ord <= 2 then r.ord else r.ord - 2 end
    from unnest(p_event_player_ids) with ordinality r(id, ord) join public.v2_event_players ep on ep.id = r.id;
  update public.v2_matches set updated_at = now() where id = target.id;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
    values(target.event_id, 'match_next_updated', p_ip_hash, jsonb_build_object('match_id', target.id));
end;
$$;

create or replace function public.v2_admin_cancel_match_next(
  p_match_id uuid, p_organization_id uuid, p_ip_hash text
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_matches;
begin
  select * into target from public.v2_matches where id = p_match_id and organization_id = p_organization_id for update;
  if not found then raise exception 'MATCH_NOT_FOUND'; end if;
  if lower(coalesce(target.status, '')) <> 'queued_next' then raise exception 'ONLY_NEXT_CAN_BE_CANCELLED'; end if;
  update public.v2_matches set status = 'cancelled', updated_at = now() where id = target.id;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
    values(target.event_id, 'match_next_cancelled', p_ip_hash, jsonb_build_object('match_id', target.id));
end;
$$;

create or replace function public.v2_promote_queued_next_after_match()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(old.status, '')) in ('playing', 'pending_score')
    and lower(coalesce(new.status, '')) in ('confirmed', 'completed', 'cancelled') then
    update public.v2_matches set status = 'preview', updated_at = now()
      where event_id = new.event_id and court_number = new.court_number and lower(coalesce(status, '')) = 'queued_next';
  end if;
  return new;
end;
$$;

drop trigger if exists v2_promote_queued_next_after_match on public.v2_matches;
create trigger v2_promote_queued_next_after_match
after update of status on public.v2_matches
for each row execute function public.v2_promote_queued_next_after_match();

create or replace function public.v2_cancel_queued_next_for_unavailable_player()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.status, '')) in ('rest', 'resting', 'left', 'removed') then
    update public.v2_matches m set status = 'cancelled', updated_at = now()
      where m.event_id = new.event_id and lower(coalesce(m.status, '')) = 'queued_next'
        and exists (select 1 from public.v2_match_players mp where mp.match_id = m.id and mp.event_player_id = new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists v2_cancel_queued_next_for_unavailable_player on public.v2_event_players;
create trigger v2_cancel_queued_next_for_unavailable_player
after update of status on public.v2_event_players
for each row execute function public.v2_cancel_queued_next_for_unavailable_player();

create or replace function public.v2_block_event_completion_with_queued_next()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.status, '')) in ('completed', 'ended', 'closed', 'finished')
    and lower(coalesce(old.status, '')) not in ('completed', 'ended', 'closed', 'finished')
    and exists (select 1 from public.v2_matches m where m.event_id = new.id and lower(coalesce(m.status, '')) = 'queued_next') then
    raise exception 'EVENT_HAS_QUEUED_NEXT_MATCHES';
  end if;
  return new;
end;
$$;

drop trigger if exists v2_block_event_completion_with_queued_next on public.v2_events;
create trigger v2_block_event_completion_with_queued_next
before update of status on public.v2_events
for each row execute function public.v2_block_event_completion_with_queued_next();

revoke all on function public.v2_admin_create_match_next(uuid,uuid,integer,uuid[],text) from public, anon, authenticated;
revoke all on function public.v2_admin_update_match_next(uuid,uuid,uuid[],text) from public, anon, authenticated;
revoke all on function public.v2_admin_cancel_match_next(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.v2_admin_create_match_next(uuid,uuid,integer,uuid[],text) to service_role;
grant execute on function public.v2_admin_update_match_next(uuid,uuid,uuid[],text) to service_role;
grant execute on function public.v2_admin_cancel_match_next(uuid,uuid,text) to service_role;
