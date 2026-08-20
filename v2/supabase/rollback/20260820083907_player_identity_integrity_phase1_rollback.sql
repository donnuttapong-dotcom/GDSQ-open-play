-- Code rollback for Phase 1 identity integrity.
-- Linked event-player identities are intentionally preserved because this
-- rollback must never rewrite Match History or discard verified Admin work.

drop function if exists public.v2_admin_get_member_detail_identity(uuid, integer, integer);
drop function if exists public.v2_admin_list_members_identity(uuid, text, integer, integer);
drop function if exists public.v2_admin_link_legacy_player_history(uuid, uuid[], text, text);
drop function if exists public.v2_admin_list_legacy_player_candidates(uuid);
drop function if exists public.v2_join_player_identity_phase1(uuid, uuid, text, text, numeric, uuid, text);
drop index if exists public.v2_event_players_unlinked_name_candidate_idx;
