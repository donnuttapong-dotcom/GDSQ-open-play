-- GDSQ OpenPlay Platform v2 seed data
-- Safe demo seed only. Review before running.
-- Requires v2/db/schema.sql to be applied first.

insert into v2_organizations (id, name, slug, plan, status)
values ('00000000-0000-4000-8000-000000000001', 'GDSQ Demo Organization', 'gdsq-demo', 'pilot', 'active')
on conflict (id) do nothing;

insert into v2_venues (id, organization_id, name, location_text, court_count, status)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Club46', 'Bangkok', 4, 'active'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Garden Square', 'Bangkok', 2, 'active'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Sukspace', 'Bangkok', 3, 'active')
on conflict (id) do nothing;

insert into v2_events (id, organization_id, venue_id, name, event_date, start_time, end_time, status, max_players, court_count, checkin_open)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'GDSQ Open Play — Saturday', '2026-06-22', '16:00', '18:00', 'live', 32, 4, true),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'GDSQ Social Play', '2026-06-21', '17:00', '19:00', 'completed', 20, 2, false),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'Beginner Open Court', '2026-06-25', '18:00', '20:00', 'draft', 24, 3, false)
on conflict (id) do nothing;

insert into v2_players (id, organization_id, display_name, default_level, status)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', 'Ann', 3.00, 'active'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', 'Pat', 2.50, 'active'),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000001', 'Tom', 3.25, 'active'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000001', 'Bank', 2.75, 'active'),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000001', 'May', 3.00, 'active'),
  ('00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000001', 'Gun', 2.50, 'active'),
  ('00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-000000000001', 'Beam', 2.75, 'active'),
  ('00000000-0000-4000-8000-000000000308', '00000000-0000-4000-8000-000000000001', 'Art', 3.50, 'active')
on conflict (id) do nothing;

insert into v2_event_players (organization_id, event_id, player_id, display_name, estimated_level, status, matches_played, wins, losses, points_for, points_against)
select
  p.organization_id,
  '00000000-0000-4000-8000-000000000201',
  p.id,
  p.display_name,
  p.default_level,
  'ready',
  0,
  0,
  0,
  0,
  0
from v2_players p
where p.organization_id = '00000000-0000-4000-8000-000000000001'
and not exists (
  select 1 from v2_event_players ep
  where ep.event_id = '00000000-0000-4000-8000-000000000201'
  and ep.player_id = p.id
);
