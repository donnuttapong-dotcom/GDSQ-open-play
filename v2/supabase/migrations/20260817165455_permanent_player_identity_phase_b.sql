-- Permanent player identity Phase B: prevent duplicate canonical display names.
-- Phase A verified that no existing canonical names collide under this normalization.
create unique index if not exists v2_players_organization_display_name_normalized_unique
  on public.v2_players (
    organization_id,
    lower(regexp_replace(btrim(display_name), '\\s+', ' ', 'g'))
  );

comment on index public.v2_players_organization_display_name_normalized_unique is
  'Canonical display names are unique per organization. Historical event snapshots are intentionally not constrained.';
