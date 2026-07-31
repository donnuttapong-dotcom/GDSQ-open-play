-- Additive production hardening for GDSQ Open Play v2.
-- Existing events, players, matches, and public organizer flows remain intact.

create table if not exists public.v2_players (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  avatar_url text,
  default_level numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.v2_players add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.v2_players add column if not exists email text;
alter table public.v2_players add column if not exists avatar_url text;

create unique index if not exists v2_players_org_user_unique
  on public.v2_players (organization_id, user_id)
  where user_id is not null;

alter table public.v2_players enable row level security;
revoke all on public.v2_players from anon;
grant select, insert, update on public.v2_players to authenticated;

drop policy if exists v2_players_owner_read on public.v2_players;
create policy v2_players_owner_read
  on public.v2_players for select to authenticated
  using (user_id = auth.uid());

drop policy if exists v2_players_owner_insert on public.v2_players;
create policy v2_players_owner_insert
  on public.v2_players for insert to authenticated
  with check (
    user_id = auth.uid()
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists v2_players_owner_update on public.v2_players;
create policy v2_players_owner_update
  on public.v2_players for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

alter table public.v2_event_players add column if not exists avatar_url text;
alter table public.v2_event_players add column if not exists matches_played int not null default 0;
alter table public.v2_event_players add column if not exists wins int not null default 0;
alter table public.v2_event_players add column if not exists losses int not null default 0;
alter table public.v2_event_players add column if not exists points_for int not null default 0;
alter table public.v2_event_players add column if not exists points_against int not null default 0;

create unique index if not exists v2_event_players_event_player_unique
  on public.v2_event_players (event_id, player_id)
  where player_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'v2-player-avatars',
  'v2-player-avatars',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists v2_player_avatar_insert on storage.objects;
create policy v2_player_avatar_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'v2-player-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.v2_start_match_safely(p_match_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  target public.v2_matches;
begin
  select * into target
  from public.v2_matches
  where id = p_match_id
  for update;

  if not found then raise exception 'Match not found'; end if;
  if target.status <> 'preview' then raise exception 'Only preview matches can be started'; end if;

  if exists (
    select 1
    from public.v2_matches other
    where other.event_id = target.event_id
      and other.id <> target.id
      and other.court_number = target.court_number
      and other.status in ('preview', 'assigned', 'playing', 'pending_score')
  ) then
    raise exception 'Court is already in use';
  end if;

  if exists (
    select 1
    from public.v2_match_players target_player
    join public.v2_match_players other_player
      on other_player.event_player_id = target_player.event_player_id
    join public.v2_matches other on other.id = other_player.match_id
    where target_player.match_id = target.id
      and other.id <> target.id
      and other.status in ('preview', 'assigned', 'playing', 'pending_score')
  ) then
    raise exception 'A selected player is already assigned to another active match';
  end if;

  update public.v2_matches
  set status = 'playing',
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = target.id;
end;
$$;

create or replace function public.v2_confirm_score_safely(
  p_match_id uuid,
  p_team_a_score int,
  p_team_b_score int
)
returns void
language plpgsql
set search_path = public
as $$
declare
  target public.v2_matches;
begin
  if p_team_a_score < 0 or p_team_b_score < 0 or p_team_a_score = p_team_b_score then
    raise exception 'Scores must be non-negative and different';
  end if;

  select * into target
  from public.v2_matches
  where id = p_match_id
  for update;

  if not found then raise exception 'Match not found'; end if;
  if target.status = 'confirmed' then return; end if;
  if target.status not in ('playing', 'pending_score') then
    raise exception 'Only an active match can be confirmed';
  end if;

  update public.v2_matches
  set status = 'confirmed',
      team_a_score = p_team_a_score,
      team_b_score = p_team_b_score,
      winner = case when p_team_a_score > p_team_b_score then 'A' else 'B' end,
      completed_at = now(),
      updated_at = now()
  where id = target.id;
end;
$$;

grant execute on function public.v2_start_match_safely(uuid) to anon, authenticated;
grant execute on function public.v2_confirm_score_safely(uuid, int, int) to anon, authenticated;
