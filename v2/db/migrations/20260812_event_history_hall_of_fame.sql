-- Additive event-history checkpoint and archive metadata.
-- No production event, player, match, or score row is deleted by this migration.
create schema if not exists gdsq_history_backup;
revoke all on schema gdsq_history_backup from public, anon, authenticated;

create table if not exists gdsq_history_backup.v2_events_checkpoint_20260812 as table public.v2_events;
create table if not exists gdsq_history_backup.v2_event_players_checkpoint_20260812 as table public.v2_event_players;
create table if not exists gdsq_history_backup.v2_matches_checkpoint_20260812 as table public.v2_matches;
create table if not exists gdsq_history_backup.v2_match_players_checkpoint_20260812 as table public.v2_match_players;
create table if not exists gdsq_history_backup.v2_players_checkpoint_20260812 as table public.v2_players;
revoke all on all tables in schema gdsq_history_backup from public, anon, authenticated;

alter table public.v2_events add column if not exists archived_at timestamptz;
alter table public.v2_events add column if not exists archived_from_status text;

update public.v2_events
set archived_at = coalesce(archived_at, updated_at, completed_at, created_at),
    archived_from_status = coalesce(archived_from_status, case when completed_at is not null then 'completed' else 'draft' end)
where status in ('deleted', 'archived')
  and (archived_at is null or archived_from_status is null);

create table if not exists public.v2_admin_event_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid,
  event_player_id uuid,
  action text not null,
  ip_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.v2_admin_event_audit enable row level security;
revoke all on table public.v2_admin_event_audit from public, anon, authenticated;
grant select, insert on table public.v2_admin_event_audit to service_role;

create or replace function public.v2_admin_archive_event(p_event_id uuid, p_ip_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_events;
begin
  select * into target from public.v2_events where id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if target.status in ('deleted', 'archived') then raise exception 'Event is already archived'; end if;
  update public.v2_events set status = 'deleted', archived_at = now(), archived_from_status = target.status, updated_at = now() where id = target.id;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
  values(target.id, 'event_archived', p_ip_hash, jsonb_build_object('previous_status', target.status));
end;
$$;

create or replace function public.v2_admin_restore_event(p_event_id uuid, p_ip_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_events; restored_status text;
begin
  select * into target from public.v2_events where id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if target.status not in ('deleted', 'archived') then raise exception 'Only an archived event can be restored'; end if;
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

create or replace function public.v2_admin_permanently_delete_event(p_event_id uuid, p_confirmation text, p_ip_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_events;
begin
  select * into target from public.v2_events where id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if target.status not in ('deleted', 'archived') then raise exception 'Only an archived event can be permanently deleted'; end if;
  if p_confirmation <> 'DELETE ' || p_event_id::text then raise exception 'Permanent delete confirmation does not match'; end if;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
  values(target.id, 'event_permanently_deleted', p_ip_hash, jsonb_build_object('name', target.name, 'event_date', target.event_date));
  delete from public.v2_events where id = target.id;
end;
$$;

create or replace function public.v2_admin_link_event_player_profile(p_event_player_id uuid, p_email text, p_ip_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare participant public.v2_event_players; profile public.v2_players;
begin
  select * into participant from public.v2_event_players where id = p_event_player_id for update;
  if not found then raise exception 'Event player not found'; end if;
  select * into profile from public.v2_players
    where organization_id = participant.organization_id and lower(email) = lower(trim(p_email))
    order by created_at asc limit 1;
  if not found then raise exception 'Registered player profile was not found for this email'; end if;
  update public.v2_event_players set player_id = profile.id, updated_at = now() where id = participant.id;
  update public.v2_match_players set player_id = profile.id where event_player_id = participant.id;
  insert into public.v2_admin_event_audit(event_id, event_player_id, action, ip_hash, metadata)
  values(participant.event_id, participant.id, 'event_player_linked', p_ip_hash, jsonb_build_object('profile_id', profile.id));
  return profile.id;
end;
$$;

revoke all on function public.v2_admin_archive_event(uuid,text) from public, anon, authenticated;
revoke all on function public.v2_admin_restore_event(uuid,text) from public, anon, authenticated;
revoke all on function public.v2_admin_permanently_delete_event(uuid,text,text) from public, anon, authenticated;
revoke all on function public.v2_admin_link_event_player_profile(uuid,text,text) from public, anon, authenticated;
grant execute on function public.v2_admin_archive_event(uuid,text) to service_role;
grant execute on function public.v2_admin_restore_event(uuid,text) to service_role;
grant execute on function public.v2_admin_permanently_delete_event(uuid,text,text) to service_role;
grant execute on function public.v2_admin_link_event_player_profile(uuid,text,text) to service_role;
