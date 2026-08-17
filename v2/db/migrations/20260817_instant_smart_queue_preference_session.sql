-- Instant QR players remain unauthenticated, so give each joined device a
-- short-lived capability restricted to its one event-player preference.

create table if not exists public.v2_smart_queue_instant_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null references public.v2_events(id) on delete cascade,
  event_player_id uuid not null references public.v2_event_players(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists v2_smart_queue_instant_sessions_active_idx
  on public.v2_smart_queue_instant_sessions (event_id, event_player_id, expires_at)
  where revoked_at is null;

alter table public.v2_smart_queue_instant_sessions enable row level security;
revoke all on public.v2_smart_queue_instant_sessions from public, anon, authenticated;
grant all on public.v2_smart_queue_instant_sessions to service_role;

create or replace function public.v2_join_instant_player_event_with_smart_queue_session(
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
  joined jsonb;
  target_event public.v2_events%rowtype;
  event_player uuid;
  raw_token text;
begin
  joined := public.v2_join_instant_player_event(p_event_id, p_display_name, p_email, p_level);
  event_player := (joined ->> 'event_player_id')::uuid;
  select * into target_event from public.v2_events where id = p_event_id;
  if not found or event_player is null then return joined; end if;

  -- Only issue this narrow capability for currently operable Smart Queue events.
  if lower(coalesce(target_event.matching_mode, 'standard')) <> 'smart_queue'
    or lower(coalesce(target_event.status, '')) not in ('live', 'open', 'active') then
    return joined;
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.v2_smart_queue_instant_sessions
  set revoked_at = now()
  where event_id = target_event.id
    and event_player_id = event_player
    and revoked_at is null;

  insert into public.v2_smart_queue_instant_sessions (
    organization_id, event_id, event_player_id, token_hash, expires_at
  ) values (
    target_event.organization_id, target_event.id, event_player,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'), now() + interval '12 hours'
  );

  return joined || jsonb_build_object('smart_queue_preference_capability', raw_token);
end;
$$;

revoke all on function public.v2_join_instant_player_event_with_smart_queue_session(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.v2_join_instant_player_event_with_smart_queue_session(uuid, text, text, numeric) to anon, authenticated;
