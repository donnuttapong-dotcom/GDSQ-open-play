-- GDSQ OpenPlay Platform v2 schema draft
-- Safe draft only. Review before running in Supabase.
-- This schema uses v2_ prefixes to avoid touching v1 tables.

create extension if not exists "pgcrypto";

create table if not exists v2_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  plan text not null default 'free',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists v2_venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references v2_organizations(id) on delete cascade,
  name text not null,
  location_text text,
  court_count int not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists v2_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references v2_organizations(id) on delete cascade,
  venue_id uuid not null references v2_venues(id) on delete cascade,
  name text not null,
  event_date date,
  start_time time,
  end_time time,
  status text not null default 'draft',
  max_players int,
  court_count int not null default 1,
  checkin_open boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists v2_players (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references v2_organizations(id) on delete cascade,
  display_name text not null,
  phone text,
  email text,
  default_level numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists v2_event_players (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references v2_organizations(id) on delete cascade,
  event_id uuid not null references v2_events(id) on delete cascade,
  player_id uuid references v2_players(id) on delete set null,
  display_name text not null,
  estimated_level numeric,
  status text not null default 'checked_in',
  queue_joined_at timestamptz not null default now(),
  matches_played int not null default 0,
  wins int not null default 0,
  losses int not null default 0,
  points_for int not null default 0,
  points_against int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists v2_event_players_event_id_idx on v2_event_players(event_id);
create index if not exists v2_event_players_org_id_idx on v2_event_players(organization_id);

create table if not exists v2_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references v2_organizations(id) on delete cascade,
  event_id uuid not null references v2_events(id) on delete cascade,
  court_number int,
  status text not null default 'preview',
  team_a_score int,
  team_b_score int,
  winner text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  confirmed_by uuid,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(idempotency_key)
);

create index if not exists v2_matches_event_id_idx on v2_matches(event_id);
create index if not exists v2_matches_org_id_idx on v2_matches(organization_id);

create table if not exists v2_match_players (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references v2_organizations(id) on delete cascade,
  event_id uuid not null references v2_events(id) on delete cascade,
  match_id uuid not null references v2_matches(id) on delete cascade,
  event_player_id uuid not null references v2_event_players(id) on delete cascade,
  player_id uuid references v2_players(id) on delete set null,
  team text not null check (team in ('A','B')),
  slot int,
  created_at timestamptz not null default now()
);

create index if not exists v2_match_players_match_id_idx on v2_match_players(match_id);
create index if not exists v2_match_players_event_id_idx on v2_match_players(event_id);

create table if not exists v2_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references v2_organizations(id) on delete cascade,
  event_id uuid references v2_events(id) on delete set null,
  actor_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists v2_audit_logs_event_id_idx on v2_audit_logs(event_id);
create index if not exists v2_audit_logs_org_id_idx on v2_audit_logs(organization_id);

-- Recommended status values:
-- v2_events.status: draft, open, live, completed, archived, deleted
-- v2_event_players.status: registered, checked_in, ready, playing, resting, left, removed
-- v2_matches.status: preview, assigned, playing, pending_score, confirmed, cancelled, deleted

-- RLS should be enabled before production.
-- Policies will depend on authentication model and organization membership.
