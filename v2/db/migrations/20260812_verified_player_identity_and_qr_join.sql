-- Final additive identity hardening for verified QR registration.
-- Existing events, participations, matches, rankings, and historical rows are preserved.

create schema if not exists gdsq_history_backup;
revoke all on schema gdsq_history_backup from public, anon, authenticated;

create table if not exists gdsq_history_backup.v2_players_identity_checkpoint_20260812 as table public.v2_players;
create table if not exists gdsq_history_backup.v2_event_players_identity_checkpoint_20260812 as table public.v2_event_players;
create table if not exists gdsq_history_backup.v2_match_players_identity_checkpoint_20260812 as table public.v2_match_players;
revoke all on all tables in schema gdsq_history_backup from public, anon, authenticated;

alter table public.v2_players add column if not exists email_verified_at timestamptz;

update public.v2_players profile
set email = lower(btrim(profile.email)),
    display_name = regexp_replace(btrim(profile.display_name), '\s+', ' ', 'g'),
    email_verified_at = coalesce(profile.email_verified_at, account.email_confirmed_at)
from auth.users account
where account.id = profile.user_id;

create unique index if not exists v2_players_org_email_normalized_unique
  on public.v2_players (organization_id, lower(btrim(email)));

create unique index if not exists v2_players_org_display_name_normalized_unique
  on public.v2_players (organization_id, lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g')));

create or replace function public.v2_normalize_player_profile_row()
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

drop trigger if exists v2_normalize_player_profile_before_write on public.v2_players;
create trigger v2_normalize_player_profile_before_write
before insert or update of email, display_name on public.v2_players
for each row execute function public.v2_normalize_player_profile_row();

create table if not exists public.v2_player_profile_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null references public.v2_events(id) on delete cascade,
  event_player_id uuid not null references public.v2_event_players(id) on delete cascade,
  player_id uuid not null references public.v2_players(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists v2_player_profile_claims_pending_unique
  on public.v2_player_profile_claims (event_player_id)
  where status = 'pending';
create index if not exists v2_player_profile_claims_event_idx
  on public.v2_player_profile_claims (event_id);
create index if not exists v2_player_profile_claims_player_idx
  on public.v2_player_profile_claims (player_id);
create index if not exists v2_player_profile_claims_user_created_idx
  on public.v2_player_profile_claims (user_id, created_at desc);

alter table public.v2_player_profile_claims enable row level security;
revoke all on public.v2_player_profile_claims from public, anon;
grant select on public.v2_player_profile_claims to authenticated;
grant select, insert, update on public.v2_player_profile_claims to service_role;

drop policy if exists v2_player_profile_claims_owner_read on public.v2_player_profile_claims;
create policy v2_player_profile_claims_owner_read
on public.v2_player_profile_claims for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.v2_join_verified_player_event(
  p_event_id uuid,
  p_display_name text,
  p_level numeric,
  p_avatar_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  account auth.users%rowtype;
  target_event public.v2_events%rowtype;
  profile public.v2_players%rowtype;
  participation public.v2_event_players%rowtype;
  active_participants integer;
  clean_name text := regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g');
  clean_email text;
  clean_level numeric := greatest(1, least(6, coalesce(p_level, 3)));
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into account from auth.users where id = actor;
  if not found then raise exception 'AUTH_REQUIRED'; end if;
  if account.email_confirmed_at is null then raise exception 'EMAIL_NOT_VERIFIED'; end if;
  clean_email := lower(btrim(coalesce(account.email, '')));
  if clean_email = '' then raise exception 'EMAIL_REQUIRED'; end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 50 then raise exception 'DISPLAY_NAME_INVALID'; end if;

  select * into target_event from public.v2_events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if lower(coalesce(target_event.status, '')) not in ('live', 'open', 'active') or not coalesce(target_event.checkin_open, false) then
    raise exception 'EVENT_NOT_OPEN';
  end if;

  select * into profile
  from public.v2_players
  where organization_id = target_event.organization_id and user_id = actor
  for update;

  if not found then
    if exists (
      select 1 from public.v2_players
      where organization_id = target_event.organization_id
        and lower(btrim(email)) = clean_email
    ) then raise exception 'EMAIL_ALREADY_REGISTERED'; end if;
    if exists (
      select 1 from public.v2_players
      where organization_id = target_event.organization_id
        and lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g')) = lower(clean_name)
    ) then raise exception 'DISPLAY_NAME_TAKEN'; end if;

    insert into public.v2_players (
      organization_id, user_id, display_name, email, email_verified_at,
      avatar_url, default_level, status
    ) values (
      target_event.organization_id, actor, clean_name, clean_email, account.email_confirmed_at,
      nullif(btrim(coalesce(p_avatar_url, '')), ''), clean_level, 'active'
    ) returning * into profile;
  else
    update public.v2_players
    set email = clean_email,
        email_verified_at = account.email_confirmed_at,
        default_level = clean_level,
        updated_at = now()
    where id = profile.id
    returning * into profile;
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
      'avatar_url', profile.avatar_url,
      'already_joined', true,
      'email_verified', true
    );
  end if;

  if target_event.max_players is not null and target_event.max_players > 0 then
    select count(*) into active_participants
    from public.v2_event_players
    where event_id = target_event.id and status <> 'removed';
    if active_participants >= target_event.max_players then raise exception 'EVENT_FULL'; end if;
  end if;

  insert into public.v2_event_players (
    organization_id, event_id, player_id, display_name, estimated_level,
    status, avatar_url, queue_joined_at
  ) values (
    target_event.organization_id, target_event.id, profile.id, profile.display_name,
    coalesce(profile.default_level, clean_level), 'ready', profile.avatar_url, now()
  ) returning * into participation;

  return jsonb_build_object(
    'event_player_id', participation.id,
    'player_profile_id', profile.id,
    'display_name', profile.display_name,
    'avatar_url', profile.avatar_url,
    'already_joined', false,
    'email_verified', true
  );
end;
$$;

create or replace function public.v2_update_my_player_profile(
  p_display_name text,
  p_avatar_url text default null,
  p_default_level numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  account auth.users%rowtype;
  profile public.v2_players%rowtype;
  clean_name text := regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g');
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into account from auth.users where id = actor;
  if not found or account.email_confirmed_at is null then raise exception 'EMAIL_NOT_VERIFIED'; end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 50 then raise exception 'DISPLAY_NAME_INVALID'; end if;

  select * into profile from public.v2_players where user_id = actor for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if exists (
    select 1 from public.v2_players
    where organization_id = profile.organization_id
      and id <> profile.id
      and lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g')) = lower(clean_name)
  ) then raise exception 'DISPLAY_NAME_TAKEN'; end if;

  update public.v2_players
  set display_name = clean_name,
      avatar_url = coalesce(nullif(btrim(coalesce(p_avatar_url, '')), ''), avatar_url),
      default_level = coalesce(p_default_level, default_level),
      email = lower(btrim(account.email)),
      email_verified_at = account.email_confirmed_at,
      updated_at = now()
  where id = profile.id
  returning * into profile;

  update public.v2_event_players
  set display_name = profile.display_name,
      avatar_url = profile.avatar_url,
      updated_at = now()
  where player_id = profile.id;

  return jsonb_build_object(
    'id', profile.id,
    'display_name', profile.display_name,
    'avatar_url', profile.avatar_url,
    'default_level', profile.default_level,
    'email_verified', true,
    'updated_at', profile.updated_at
  );
end;
$$;

create or replace function public.v2_request_player_profile_claim(p_event_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  account auth.users%rowtype;
  profile public.v2_players%rowtype;
  participant public.v2_event_players%rowtype;
  existing_claim uuid;
  claim_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into account from auth.users where id = actor;
  if not found or account.email_confirmed_at is null then raise exception 'EMAIL_NOT_VERIFIED'; end if;
  select * into profile from public.v2_players where user_id = actor;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select * into participant from public.v2_event_players where id = p_event_player_id for update;
  if not found then raise exception 'HISTORY_NOT_FOUND'; end if;
  if participant.organization_id <> profile.organization_id then raise exception 'HISTORY_NOT_FOUND'; end if;
  if participant.player_id is not null then raise exception 'HISTORY_ALREADY_CLAIMED'; end if;
  if exists (
    select 1 from public.v2_event_players
    where event_id = participant.event_id and player_id = profile.id and id <> participant.id
  ) then raise exception 'PROFILE_ALREADY_PARTICIPATED_IN_EVENT'; end if;

  select id into existing_claim
  from public.v2_player_profile_claims
  where event_player_id = participant.id and status = 'pending'
  order by created_at desc limit 1;
  if existing_claim is not null then return existing_claim; end if;

  insert into public.v2_player_profile_claims (
    organization_id, event_id, event_player_id, player_id, user_id
  ) values (
    participant.organization_id, participant.event_id, participant.id, profile.id, actor
  ) returning id into claim_id;
  return claim_id;
end;
$$;

create or replace function public.v2_admin_review_player_profile_claim(
  p_claim_id uuid,
  p_approve boolean,
  p_admin_note text,
  p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claim public.v2_player_profile_claims%rowtype;
  profile public.v2_players%rowtype;
begin
  select * into claim from public.v2_player_profile_claims where id = p_claim_id for update;
  if not found then raise exception 'Claim not found'; end if;
  if claim.status <> 'pending' then raise exception 'Claim was already reviewed'; end if;
  select * into profile from public.v2_players where id = claim.player_id;
  if not found then raise exception 'Player profile not found'; end if;

  if p_approve then
    if exists (
      select 1 from public.v2_event_players
      where id = claim.event_player_id and player_id is not null and player_id <> claim.player_id
    ) then raise exception 'Historical player is already linked to another profile'; end if;
    update public.v2_event_players
    set player_id = profile.id, display_name = profile.display_name,
        avatar_url = coalesce(profile.avatar_url, avatar_url), updated_at = now()
    where id = claim.event_player_id;
    update public.v2_match_players set player_id = profile.id where event_player_id = claim.event_player_id;
  end if;

  update public.v2_player_profile_claims
  set status = case when p_approve then 'approved' else 'rejected' end,
      admin_note = nullif(btrim(coalesce(p_admin_note, '')), ''),
      reviewed_at = now(), updated_at = now()
  where id = claim.id;

  insert into public.v2_admin_event_audit(event_id, event_player_id, action, ip_hash, metadata)
  values(
    claim.event_id, claim.event_player_id,
    case when p_approve then 'profile_claim_approved' else 'profile_claim_rejected' end,
    p_ip_hash, jsonb_build_object('claim_id', claim.id, 'profile_id', claim.player_id)
  );
end;
$$;

create or replace function public.v2_admin_update_player_display_name(
  p_player_id uuid,
  p_display_name text,
  p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.v2_players%rowtype;
  clean_name text := regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g');
begin
  if char_length(clean_name) < 2 or char_length(clean_name) > 50 then raise exception 'DISPLAY_NAME_INVALID'; end if;
  select * into profile from public.v2_players where id = p_player_id for update;
  if not found then raise exception 'Player profile not found'; end if;
  if exists (
    select 1 from public.v2_players
    where organization_id = profile.organization_id and id <> profile.id
      and lower(regexp_replace(btrim(display_name), '\s+', ' ', 'g')) = lower(clean_name)
  ) then raise exception 'DISPLAY_NAME_TAKEN'; end if;

  update public.v2_players set display_name = clean_name, updated_at = now() where id = profile.id;
  update public.v2_event_players set display_name = clean_name, updated_at = now() where player_id = profile.id;
  insert into public.v2_admin_event_audit(action, ip_hash, metadata)
  values('player_display_name_updated', p_ip_hash, jsonb_build_object('profile_id', profile.id, 'old_name', profile.display_name, 'new_name', clean_name));
end;
$$;

revoke all on function public.v2_join_verified_player_event(uuid,text,numeric,text) from public, anon;
revoke all on function public.v2_update_my_player_profile(text,text,numeric) from public, anon;
revoke all on function public.v2_request_player_profile_claim(uuid) from public, anon;
revoke all on function public.v2_admin_review_player_profile_claim(uuid,boolean,text,text) from public, anon, authenticated;
revoke all on function public.v2_admin_update_player_display_name(uuid,text,text) from public, anon, authenticated;

grant execute on function public.v2_join_verified_player_event(uuid,text,numeric,text) to authenticated;
grant execute on function public.v2_update_my_player_profile(text,text,numeric) to authenticated;
grant execute on function public.v2_request_player_profile_claim(uuid) to authenticated;
grant execute on function public.v2_admin_review_player_profile_claim(uuid,boolean,text,text) to service_role;
grant execute on function public.v2_admin_update_player_display_name(uuid,text,text) to service_role;
