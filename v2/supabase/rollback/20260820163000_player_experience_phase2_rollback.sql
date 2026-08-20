-- Roll back Phase 2 server additions. No player, event, or match rows are changed.
drop function if exists public.v2_public_player_experience_phase2(uuid,text,integer,integer);
drop function if exists public.v2_list_open_events_phase2(uuid,integer);
drop index if exists public.v2_match_players_event_player_match_idx;
