-- P0: confirmed score corrections must go through the authorized Admin flow.
-- Live score confirmation remains available through v2_confirm_score_safely.
revoke all on function public.v2_update_confirmed_match_score(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.v2_update_confirmed_match_score(uuid, integer, integer)
  to service_role;
