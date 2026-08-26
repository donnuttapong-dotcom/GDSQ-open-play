-- Trigger helpers run through their table triggers and must not be callable
-- directly through PostgREST by browser roles.
revoke all on function public.v2_promote_queued_next_after_match()
  from public, anon, authenticated;
revoke all on function public.v2_cancel_queued_next_for_unavailable_player()
  from public, anon, authenticated;
revoke all on function public.v2_block_event_completion_with_queued_next()
  from public, anon, authenticated;
