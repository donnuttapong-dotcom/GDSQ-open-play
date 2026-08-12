-- Cover the new claim foreign keys and owner-history query.
create index if not exists v2_player_profile_claims_event_idx
  on public.v2_player_profile_claims (event_id);
create index if not exists v2_player_profile_claims_player_idx
  on public.v2_player_profile_claims (player_id);
create index if not exists v2_player_profile_claims_user_created_idx
  on public.v2_player_profile_claims (user_id, created_at desc);
