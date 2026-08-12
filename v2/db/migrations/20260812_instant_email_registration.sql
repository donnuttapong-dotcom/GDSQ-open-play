-- Additive instant registration for on-site Open Play events.
-- Instant identities are isolated from existing Auth-linked v2_players records.

create schema if not exists gdsq_history_backup;
revoke all on schema gdsq_history_backup from public, anon, authenticated;

create table if not exists gdsq_history_backup.v2_event_players_instant_registration_checkpoint_20260812
as table public.v2_event_players;
revoke all on all tables in schema gdsq_history_backup from public, anon, authenticated;

create table if not exists public.v2_instant_player_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  display_name text not null,
  email text not null,
  default_level numeric not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists v2_instant_players_org_email_normalized_unique
  on public.v2_instant_player_profiles (organization_id, lower(btrim(email)));
create unique index if not exists v2_instant_players_org_display_name_normalized_unique
  on public.v2_instant_player_profiles (organization_id, lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g')));

alter table public.v2_instant_player_profiles enable row level security;
revoke all on public.v2_instant_player_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.v2_instant_player_profiles to service_role;

create or replace function public.v2_normalize_instant_player_profile_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(btrim(new.email));
  new.display_name := regexp_replace(btrim(new.display_name), '\s+', ' ', 'g');
  return new;
end;
$$;

drop trigger if exists v2_normalize_instant_player_profile_before_write on public.v2_instant_player_profiles;
create trigger v2_normalize_instant_player_profile_before_write
before insert or update of email, display_name on public.v2_instant_player_profiles
for each row execute function public.v2_normalize_instant_player_profile_row();

create or replace function public.v2_join_instant_player_event(
  p_event_id uuid,
  p_display_name text,
  p_email text,
  p_level numeric default 3
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.v2_events%rowtype;
  profile public.v2_instant_player_profiles%rowtype;
  participation public.v2_event_players%rowtype;
  name_conflict public.v2_event_players%rowtype;
  active_participants integer;
  clean_name text := regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g');
  clean_email text := lower(btrim(coalesce(p_email, '')));
  clean_level numeric := greatest(1, least(6, coalesce(p_level, 3)));
begin
  if char_length(clean_name) < 2 or char_length(clean_name) > 50 then
    raise exception 'DISPLAY_NAME_INVALID';
  end if;
  if char_length(clean_email) > 254
    or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'EMAIL_INVALID';
  end if;

  select * into target_event from public.v2_events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if lower(coalesce(target_event.status, '')) not in ('live', 'open', 'active')
    or not coalesce(target_event.checkin_open, false) then
    raise exception 'EVENT_NOT_OPEN';
  end if;

  -- Existing verified profiles remain protected by their current Auth-only flow.
  if exists (
    select 1 from public.v2_players existing
    where existing.organization_id = target_event.organization_id
      and lower(btrim(existing.email)) = clean_email
  ) then
    raise exception 'SECURE_PROFILE_EXISTS';
  end if;
  if exists (
    select 1 from public.v2_players existing
    where existing.organization_id = target_event.organization_id
      and lower(regexp_replace(btrim(existing.display_name), '\s+', ' ', 'g')) = lower(clean_name)
  ) then
    raise exception 'DISPLAY_NAME_TAKEN';
  end if;

  -- Serialize simultaneous QR submissions for the same email or display name.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_event.organization_id::text || ':instant-email:' || clean_email, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_event.organization_id::text || ':instant-name:' || lower(clean_name), 0)
  );

  select * into profile
  from public.v2_instant_player_profiles
  where organization_id = target_event.organization_id
    and lower(btrim(email)) = clean_email
  for update;

  if found then
    if lower(regexp_replace(btrim(profile.display_name), '\s+', ' ', 'g')) <> lower(clean_name) then
      raise exception 'EMAIL_PROFILE_MISMATCH';
    end if;
    update public.v2_instant_player_profiles
    set default_level = clean_level,
        updated_at = now()
    where id = profile.id
    returning * into profile;
  else
    if exists (
      select 1
      from public.v2_instant_player_profiles existing
      where existing.organization_id = target_event.organization_id
        and lower(regexp_replace(btrim(existing.display_name), '\s+', ' ', 'g')) = lower(clean_name)
    ) then
      raise exception 'DISPLAY_NAME_TAKEN';
    end if;

    insert into public.v2_instant_player_profiles (
      organization_id, display_name, email, default_level
    ) values (
      target_event.organization_id, clean_name, clean_email, clean_level
    ) returning * into profile;
  end if;

  select * into participation
  from public.v2_event_players
  where event_id = target_event.id and player_id = profile.id
  order by created_at asc
  limit 1;

  if found then
    return jsonb_build_object(
      'event_player_id', participation.id,
      'player_profile_id', profile.id,
      'display_name', profile.display_name,
      'avatar_url', participation.avatar_url,
      'already_joined', true,
      'email_verified', false
    );
  end if;

  -- Do not merge a new profile into historical/unlinked event data automatically.
  select * into name_conflict
  from public.v2_event_players existing
  where existing.event_id = target_event.id
    and existing.status <> 'removed'
    and lower(regexp_replace(btrim(existing.display_name), '\s+', ' ', 'g')) = lower(clean_name)
  order by existing.created_at asc
  limit 1
  for update;
  if found then raise exception 'DISPLAY_NAME_ALREADY_IN_EVENT'; end if;

  if target_event.max_players is not null and target_event.max_players > 0 then
    select count(*) into active_participants
    from public.v2_event_players
    where event_id = target_event.id and status <> 'removed';
    if active_participants >= target_event.max_players then raise exception 'EVENT_FULL'; end if;
  end if;

  insert into public.v2_event_players (
    organization_id, event_id, player_id, display_name, estimated_level,
    status, queue_joined_at
  ) values (
    target_event.organization_id, target_event.id, profile.id, profile.display_name,
    profile.default_level, 'ready', now()
  ) returning * into participation;

  return jsonb_build_object(
    'event_player_id', participation.id,
    'player_profile_id', profile.id,
    'display_name', profile.display_name,
    'avatar_url', null,
    'already_joined', false,
    'email_verified', false
  );
end;
$$;

revoke all on function public.v2_join_instant_player_event(uuid,text,text,numeric) from public, anon, authenticated;
grant execute on function public.v2_join_instant_player_event(uuid,text,text,numeric) to anon, authenticated;
