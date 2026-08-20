-- Device-bound organizer capability for destructive event lifecycle actions.
-- The plain token is returned once at event creation and stays on that device.
create table if not exists public.v2_event_organizer_keys (
  event_id uuid primary key references public.v2_events(id) on delete cascade,
  organization_id uuid not null,
  token_hash text not null check (length(token_hash) = 64),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  unique(event_id, organization_id)
);

alter table public.v2_event_organizer_keys enable row level security;
revoke all on table public.v2_event_organizer_keys from public, anon, authenticated;
grant select, insert, update, delete on table public.v2_event_organizer_keys to service_role;

comment on table public.v2_event_organizer_keys is
  'Hashed per-event organizer capability. Plain tokens are never stored server-side.';
