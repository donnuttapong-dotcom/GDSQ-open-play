-- Smart Queue UX v2: event mode is the single feature switch.
-- Existing events remain Standard unless they explicitly enabled the V1 experiment.

alter table public.v2_events
  add column if not exists matching_mode text not null default 'standard';

alter table public.v2_events
  drop constraint if exists v2_events_matching_mode_valid;

alter table public.v2_events
  add constraint v2_events_matching_mode_valid
  check (matching_mode in ('standard', 'smart_queue'));

update public.v2_events as event
set matching_mode = 'smart_queue'
from public.v2_smart_queue_settings as settings
where settings.event_id = event.id
  and settings.enabled = true
  and event.matching_mode = 'standard';

create index if not exists v2_events_matching_mode_idx
  on public.v2_events (organization_id, matching_mode, created_at desc);
