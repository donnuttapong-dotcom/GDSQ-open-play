-- Experimental GDSQ Smart Queue V1.
-- Additive only: Match History remains in v2_matches/v2_match_players.

create table if not exists public.v2_smart_queue_settings (
  event_id uuid primary key references public.v2_events(id) on delete cascade,
  organization_id uuid not null,
  enabled boolean not null default false,
  updated_by text not null default 'admin' check (updated_by in ('player', 'admin', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_smart_queue_preferences (
  event_player_id uuid primary key references public.v2_event_players(id) on delete cascade,
  event_id uuid not null references public.v2_events(id) on delete cascade,
  organization_id uuid not null,
  modes text[] not null default '{}'::text[],
  preferred_mode text,
  queue_status text not null default 'rest' check (queue_status in ('ready', 'match_ready', 'playing', 'rest')),
  ready_since timestamptz,
  updated_by text not null default 'player' check (updated_by in ('player', 'admin', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_smart_queue_modes_valid check (
    modes <@ array['social', 'balanced', 'challenge']::text[]
    and cardinality(modes) <= 3
  ),
  constraint v2_smart_queue_preferred_mode_valid check (
    preferred_mode is null
    or (preferred_mode = any(modes) and preferred_mode in ('social', 'balanced', 'challenge'))
  )
);

create table if not exists public.v2_smart_queue_matches (
  match_id uuid primary key references public.v2_matches(id) on delete cascade,
  event_id uuid not null references public.v2_events(id) on delete cascade,
  organization_id uuid not null,
  court_number integer not null check (court_number between 1 and 10),
  play_mode text not null check (play_mode in ('social', 'balanced', 'challenge')),
  queue_state text not null default 'match_ready' check (queue_state in ('match_ready', 'playing', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists v2_smart_queue_preferences_event_status_idx
  on public.v2_smart_queue_preferences (event_id, queue_status, ready_since);
create index if not exists v2_smart_queue_matches_event_state_idx
  on public.v2_smart_queue_matches (event_id, queue_state, created_at desc);

alter table public.v2_smart_queue_settings enable row level security;
alter table public.v2_smart_queue_preferences enable row level security;
alter table public.v2_smart_queue_matches enable row level security;

revoke all on public.v2_smart_queue_settings from public, anon, authenticated;
revoke all on public.v2_smart_queue_preferences from public, anon, authenticated;
revoke all on public.v2_smart_queue_matches from public, anon, authenticated;
grant select on public.v2_smart_queue_settings to anon, authenticated;
grant select on public.v2_smart_queue_preferences to anon, authenticated;
grant insert, update on public.v2_smart_queue_preferences to authenticated;
grant select on public.v2_smart_queue_matches to anon, authenticated;

drop policy if exists v2_smart_queue_settings_read on public.v2_smart_queue_settings;
create policy v2_smart_queue_settings_read
  on public.v2_smart_queue_settings for select to anon, authenticated
  using (true);

drop policy if exists v2_smart_queue_settings_write on public.v2_smart_queue_settings;
drop policy if exists v2_smart_queue_settings_update on public.v2_smart_queue_settings;

drop policy if exists v2_smart_queue_preferences_read on public.v2_smart_queue_preferences;
create policy v2_smart_queue_preferences_read
  on public.v2_smart_queue_preferences for select to anon, authenticated
  using (true);

drop policy if exists v2_smart_queue_preferences_write on public.v2_smart_queue_preferences;
create policy v2_smart_queue_preferences_write
  on public.v2_smart_queue_preferences for insert to authenticated
  with check (exists (
    select 1 from public.v2_event_players event_player
    join public.v2_players profile on profile.id = event_player.player_id
    where profile.user_id = (select auth.uid())
      and event_player.id = v2_smart_queue_preferences.event_player_id
      and event_player.event_id = v2_smart_queue_preferences.event_id
      and event_player.organization_id = v2_smart_queue_preferences.organization_id
      and event_player.status not in ('removed', 'deleted')
  ));

drop policy if exists v2_smart_queue_preferences_update on public.v2_smart_queue_preferences;
create policy v2_smart_queue_preferences_update
  on public.v2_smart_queue_preferences for update to authenticated
  using (exists (
    select 1 from public.v2_event_players event_player
    join public.v2_players profile on profile.id = event_player.player_id
    where profile.user_id = (select auth.uid())
      and event_player.id = v2_smart_queue_preferences.event_player_id
      and event_player.event_id = v2_smart_queue_preferences.event_id
      and event_player.organization_id = v2_smart_queue_preferences.organization_id
      and event_player.status not in ('removed', 'deleted')
  ))
  with check (exists (
    select 1 from public.v2_event_players event_player
    join public.v2_players profile on profile.id = event_player.player_id
    where profile.user_id = (select auth.uid())
      and event_player.id = v2_smart_queue_preferences.event_player_id
      and event_player.event_id = v2_smart_queue_preferences.event_id
      and event_player.organization_id = v2_smart_queue_preferences.organization_id
      and event_player.status not in ('removed', 'deleted')
  ));

drop policy if exists v2_smart_queue_matches_read on public.v2_smart_queue_matches;
create policy v2_smart_queue_matches_read
  on public.v2_smart_queue_matches for select to anon, authenticated
  using (true);

drop policy if exists v2_smart_queue_matches_write on public.v2_smart_queue_matches;
drop policy if exists v2_smart_queue_matches_update on public.v2_smart_queue_matches;
