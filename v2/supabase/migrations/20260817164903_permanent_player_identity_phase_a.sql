-- Phase A: additive canonical player identity primitives.
-- Historical events, matches, rosters, scores, and rating rows are not modified here.

alter table public.v2_players
  alter column user_id drop not null,
  alter column email drop not null,
  add column if not exists player_code text;

create sequence if not exists public.v2_player_code_seq;

create or replace function public.v2_next_player_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'GDSQ-' || lpad(nextval('public.v2_player_code_seq')::text, 4, '0');
$$;

create or replace function public.v2_assign_player_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.player_code is null or btrim(new.player_code) = '' then
    new.player_code := public.v2_next_player_code();
  else
    new.player_code := upper(btrim(new.player_code));
  end if;
  return new;
end;
$$;

drop trigger if exists v2_assign_player_code_before_insert on public.v2_players;
create trigger v2_assign_player_code_before_insert
before insert on public.v2_players
for each row execute function public.v2_assign_player_code();

create or replace function public.v2_guard_player_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.player_code is not null and new.player_code is distinct from old.player_code then
    raise exception 'PLAYER_CODE_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists v2_guard_player_code_before_update on public.v2_players;
create trigger v2_guard_player_code_before_update
before update on public.v2_players
for each row execute function public.v2_guard_player_code();

-- Existing player UUIDs are preserved; this only assigns a new public code.
update public.v2_players
set player_code = public.v2_next_player_code()
where player_code is null or btrim(player_code) = '';

create unique index if not exists v2_players_player_code_unique
  on public.v2_players (player_code)
  where player_code is not null;

create unique index if not exists v2_players_org_email_normalized_unique
  on public.v2_players (organization_id, lower(btrim(email)))
  where email is not null and btrim(email) <> '';

create table if not exists public.v2_player_identity_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_type text not null check (source_type in ('instant_profile', 'legacy_event_player')),
  source_id uuid not null,
  canonical_player_id uuid not null references public.v2_players(id) on delete restrict,
  link_reason text not null default 'explicit',
  created_at timestamptz not null default now(),
  created_by text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  unique (source_type, source_id)
);

create index if not exists v2_player_identity_links_canonical_idx
  on public.v2_player_identity_links (canonical_player_id, organization_id);

alter table public.v2_player_identity_links enable row level security;

create table if not exists public.v2_player_device_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.v2_players(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  device_label text,
  check (expires_at > created_at)
);

create index if not exists v2_player_device_sessions_active_idx
  on public.v2_player_device_sessions (player_id, expires_at desc)
  where revoked_at is null;

alter table public.v2_player_device_sessions enable row level security;

comment on table public.v2_player_identity_links is
  'Additive bridge from legacy identity sources to canonical v2_players; does not rewrite historical match data.';
comment on table public.v2_player_device_sessions is
  'Hashed per-device profile capability tokens. Raw tokens are never stored in Postgres.';
