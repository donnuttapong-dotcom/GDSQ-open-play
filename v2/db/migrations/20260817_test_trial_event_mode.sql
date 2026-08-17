-- Fully isolated Test / Trial storage. No LIVE table, RLS policy, trigger,
-- Hall of Fame, member, or GDSQ Rating object is changed by this migration.

create table if not exists public.v2_test_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  venue_name text,
  event_date date,
  start_time text,
  end_time text,
  status text not null default 'live',
  court_count integer not null default 4 check (court_count between 1 and 10),
  matching_mode text not null default 'standard' check (matching_mode in ('standard', 'smart_queue')),
  environment text not null default 'test' check (environment = 'test'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_test_event_players (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null references public.v2_test_events(id) on delete cascade,
  display_name text not null,
  estimated_level numeric not null default 3,
  status text not null default 'ready',
  queue_joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_test_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null references public.v2_test_events(id) on delete cascade,
  court_number integer not null check (court_number between 1 and 10),
  status text not null default 'preview',
  team_a_score integer,
  team_b_score integer,
  winner text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_test_match_players (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null references public.v2_test_events(id) on delete cascade,
  match_id uuid not null references public.v2_test_matches(id) on delete cascade,
  event_player_id uuid not null references public.v2_test_event_players(id) on delete cascade,
  team text not null check (team in ('A', 'B')),
  slot integer not null check (slot between 1 and 2),
  unique (match_id, event_player_id),
  unique (match_id, team, slot)
);

create table if not exists public.v2_test_smart_queue_preferences (
  event_player_id uuid primary key references public.v2_test_event_players(id) on delete cascade,
  event_id uuid not null references public.v2_test_events(id) on delete cascade,
  organization_id uuid not null,
  modes text[] not null default '{}',
  preferred_mode text,
  queue_status text not null default 'ready',
  ready_since timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_test_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.v2_test_events(id) on delete cascade,
  organization_id uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists v2_test_events_org_idx on public.v2_test_events (organization_id, created_at desc);
create index if not exists v2_test_players_event_idx on public.v2_test_event_players (event_id, queue_joined_at);
create index if not exists v2_test_matches_event_idx on public.v2_test_matches (event_id, created_at desc);
create index if not exists v2_test_sessions_active_idx on public.v2_test_admin_sessions (event_id, expires_at) where revoked_at is null;

alter table public.v2_test_events enable row level security;
alter table public.v2_test_event_players enable row level security;
alter table public.v2_test_matches enable row level security;
alter table public.v2_test_match_players enable row level security;
alter table public.v2_test_smart_queue_preferences enable row level security;
alter table public.v2_test_admin_sessions enable row level security;

revoke all on public.v2_test_events, public.v2_test_event_players, public.v2_test_matches,
  public.v2_test_match_players, public.v2_test_smart_queue_preferences, public.v2_test_admin_sessions
  from public, anon, authenticated;
grant all on public.v2_test_events, public.v2_test_event_players, public.v2_test_matches,
  public.v2_test_match_players, public.v2_test_smart_queue_preferences, public.v2_test_admin_sessions
  to service_role;
