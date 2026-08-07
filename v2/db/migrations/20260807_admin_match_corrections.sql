alter table public.v2_admin_result_audit add column if not exists action text not null default 'score_updated';
alter table public.v2_admin_result_audit add column if not exists metadata jsonb not null default '{}'::jsonb;

create or replace function public.v2_admin_update_match_players(p_match_id uuid, p_event_player_ids uuid[], p_ip_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare target public.v2_matches; valid_players int;
begin
  if coalesce(array_length(p_event_player_ids, 1), 0) <> 4 then raise exception 'Choose four players'; end if;
  if (select count(distinct player_id) from unnest(p_event_player_ids) as player_id) <> 4 then raise exception 'Players must be different'; end if;
  select * into target from public.v2_matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if target.status <> 'confirmed' then raise exception 'Only confirmed matches can be corrected'; end if;
  select count(*) into valid_players from public.v2_event_players where event_id = target.event_id and id = any(p_event_player_ids);
  if valid_players <> 4 then raise exception 'A selected player is not in this event'; end if;
  delete from public.v2_match_players where match_id = target.id;
  insert into public.v2_match_players (organization_id,event_id,match_id,event_player_id,player_id,team,slot)
  select target.organization_id,target.event_id,target.id,event_player.id,event_player.player_id,
    case when source.position <= 2 then 'A' else 'B' end,
    case when source.position in (1,3) then 1 else 2 end
  from unnest(p_event_player_ids) with ordinality as source(event_player_id, position)
  join public.v2_event_players as event_player on event_player.id = source.event_player_id;
  insert into public.v2_admin_result_audit (match_id,team_a_score,team_b_score,ip_hash,action,metadata)
  values (target.id,target.team_a_score,target.team_b_score,p_ip_hash,'players_updated',jsonb_build_object('event_player_ids',p_event_player_ids));
end;
$$;

create or replace function public.v2_admin_soft_delete_match(p_match_id uuid, p_ip_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare target public.v2_matches;
begin
  select * into target from public.v2_matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if target.status = 'deleted' then raise exception 'Match was already deleted'; end if;
  update public.v2_matches set status = 'deleted', updated_at = now() where id = target.id;
  insert into public.v2_admin_result_audit (match_id,team_a_score,team_b_score,ip_hash,action,metadata)
  values (target.id,coalesce(target.team_a_score,0),coalesce(target.team_b_score,0),p_ip_hash,'match_soft_deleted',jsonb_build_object('previous_status',target.status));
end;
$$;

create or replace function public.v2_admin_verify_passcode(p_passcode text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare stored_hash text;
begin
  if length(coalesce(p_passcode,'')) < 5 or length(p_passcode) > 128 then return false; end if;
  select settings.passcode_hash into stored_hash from public.v2_admin_passcode_settings as settings where settings.organization_id = '00000000-0000-4000-8000-000000000001';
  return stored_hash is not null and extensions.crypt(p_passcode, stored_hash) = stored_hash;
end;
$$;

revoke all on function public.v2_admin_update_match_players(uuid,uuid[],text) from public, anon, authenticated;
revoke all on function public.v2_admin_soft_delete_match(uuid,text) from public, anon, authenticated;
revoke all on function public.v2_admin_verify_passcode(text) from public, anon, authenticated;
grant execute on function public.v2_admin_update_match_players(uuid,uuid[],text) to service_role;
grant execute on function public.v2_admin_soft_delete_match(uuid,text) to service_role;
grant execute on function public.v2_admin_verify_passcode(text) to service_role;
