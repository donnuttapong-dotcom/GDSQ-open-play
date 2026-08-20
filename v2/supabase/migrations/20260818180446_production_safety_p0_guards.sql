-- GDSQ Open Play V2 P0 production safety guards.
-- Additive only: no event, player, match, score, rating, or Hall row is deleted or rewritten.

create or replace function public.v2_admin_archive_event(p_event_id uuid, p_ip_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_events;
begin
  select * into target from public.v2_events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if lower(coalesce(target.status, '')) in ('deleted', 'archived') then raise exception 'EVENT_ALREADY_ARCHIVED'; end if;
  if lower(coalesce(target.status, '')) not in ('completed', 'ended', 'closed', 'finished')
     or target.hall_of_fame_processed_at is null then
    raise exception 'ARCHIVE_BLOCKED_EVENT_NOT_FINALIZED';
  end if;
  update public.v2_events
    set status = 'deleted', archived_at = coalesce(archived_at, now()),
        archived_from_status = coalesce(archived_from_status, target.status), updated_at = now()
    where id = target.id;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
    values(target.id, 'event_archived', p_ip_hash, jsonb_build_object('previous_status', target.status));
end;
$$;

create or replace function public.v2_admin_restore_event(p_event_id uuid, p_ip_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_events; restored_status text;
begin
  select * into target from public.v2_events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if target.status not in ('deleted', 'archived') then raise exception 'EVENT_NOT_ARCHIVED'; end if;
  if target.hall_of_fame_processed_at is not null then raise exception 'EVENT_FINALIZED_CANNOT_REOPEN'; end if;
  restored_status := case
    when target.archived_from_status in ('draft', 'live', 'open', 'active', 'completed', 'ended', 'closed') then target.archived_from_status
    when target.completed_at is not null then 'completed'
    else 'draft'
  end;
  update public.v2_events set status = restored_status, archived_at = null, archived_from_status = null, updated_at = now() where id = target.id;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
    values(target.id, 'event_restored', p_ip_hash, jsonb_build_object('restored_status', restored_status));
end;
$$;

create or replace function public.v2_events_enforce_finalization_safety()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.hall_of_fame_processed_at is not null
     and lower(coalesce(new.status, '')) in ('live', 'open', 'active') then
    raise exception 'EVENT_FINALIZED_CANNOT_REOPEN';
  end if;
  if tg_op = 'UPDATE' and lower(coalesce(new.status, '')) in ('deleted', 'archived')
     and lower(coalesce(old.status, '')) not in ('deleted', 'archived')
     and (lower(coalesce(old.status, '')) not in ('completed', 'ended', 'closed', 'finished')
          or old.hall_of_fame_processed_at is null) then
    raise exception 'ARCHIVE_BLOCKED_EVENT_NOT_FINALIZED';
  end if;
  if tg_op = 'UPDATE' and old.hall_of_fame_processed_at is not null
     and lower(coalesce(old.status, '')) in ('deleted', 'archived')
     and lower(coalesce(new.status, '')) not in ('deleted', 'archived') then
    raise exception 'EVENT_FINALIZED_CANNOT_REOPEN';
  end if;
  return new;
end;
$$;

revoke all on function public.v2_events_enforce_finalization_safety() from public, anon, authenticated;
grant execute on function public.v2_events_enforce_finalization_safety() to service_role;
drop trigger if exists v2_events_enforce_finalization_safety on public.v2_events;
create trigger v2_events_enforce_finalization_safety
before update of status on public.v2_events
for each row execute function public.v2_events_enforce_finalization_safety();

create or replace function public.v2_admin_update_event_player_status(
  p_event_id uuid, p_event_player_id uuid, p_status text, p_ip_hash text
) returns void language plpgsql security definer set search_path = '' as $$
declare participant public.v2_event_players; clean_status text := lower(trim(coalesce(p_status, '')));
begin
  if clean_status not in ('ready', 'checked_in', 'rest', 'resting', 'left') then raise exception 'INVALID_PLAYER_STATUS'; end if;
  select * into participant from public.v2_event_players where id = p_event_player_id and event_id = p_event_id for update;
  if not found then raise exception 'EVENT_PLAYER_NOT_FOUND'; end if;
  if participant.status = 'removed' then raise exception 'EVENT_PLAYER_REMOVED'; end if;
  update public.v2_event_players set status = clean_status, updated_at = now() where id = participant.id;
  insert into public.v2_admin_event_audit(event_id, event_player_id, action, ip_hash, metadata)
    values(participant.event_id, participant.id, 'event_player_status_updated', p_ip_hash, jsonb_build_object('status', clean_status));
end;
$$;

create or replace function public.v2_admin_update_event_player_level(
  p_event_id uuid, p_event_player_id uuid, p_level numeric, p_ip_hash text
) returns void language plpgsql security definer set search_path = '' as $$
declare participant public.v2_event_players; clean_level numeric := greatest(1, least(6, p_level));
begin
  if p_level is null or p_level < 1 or p_level > 6 then raise exception 'INVALID_PLAYER_LEVEL'; end if;
  select * into participant from public.v2_event_players where id = p_event_player_id and event_id = p_event_id for update;
  if not found then raise exception 'EVENT_PLAYER_NOT_FOUND'; end if;
  if participant.status = 'removed' then raise exception 'EVENT_PLAYER_REMOVED'; end if;
  update public.v2_event_players set estimated_level = clean_level, updated_at = now() where id = participant.id;
  insert into public.v2_admin_event_audit(event_id, event_player_id, action, ip_hash, metadata)
    values(participant.event_id, participant.id, 'event_player_level_updated', p_ip_hash, jsonb_build_object('level', clean_level));
end;
$$;

create or replace function public.v2_admin_remove_event_player(
  p_event_id uuid, p_event_player_id uuid, p_ip_hash text
) returns void language plpgsql security definer set search_path = '' as $$
declare participant public.v2_event_players;
begin
  select * into participant from public.v2_event_players where id = p_event_player_id and event_id = p_event_id for update;
  if not found then raise exception 'EVENT_PLAYER_NOT_FOUND'; end if;
  if exists (
    select 1 from public.v2_match_players mp join public.v2_matches m on m.id = mp.match_id
    where mp.event_player_id = participant.id and m.event_id = p_event_id
      and lower(coalesce(m.status, '')) in ('preview', 'assigned', 'playing', 'pending_score')
  ) then raise exception 'PLAYER_ACTIVE_IN_MATCH'; end if;
  update public.v2_event_players set status = 'removed', updated_at = now() where id = participant.id;
  insert into public.v2_admin_event_audit(event_id, event_player_id, action, ip_hash, metadata)
    values(participant.event_id, participant.id, 'event_player_removed', p_ip_hash, '{}'::jsonb);
end;
$$;

revoke all on function public.v2_admin_update_event_player_status(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.v2_admin_update_event_player_level(uuid,uuid,numeric,text) from public, anon, authenticated;
revoke all on function public.v2_admin_remove_event_player(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.v2_admin_update_event_player_status(uuid,uuid,text,text) to service_role;
grant execute on function public.v2_admin_update_event_player_level(uuid,uuid,numeric,text) to service_role;
grant execute on function public.v2_admin_remove_event_player(uuid,uuid,text) to service_role;

-- Public UPDATE is removed only after the protected mutation functions exist.
drop policy if exists v2_event_players_public_update on public.v2_event_players;
