-- Additive result editor for signed-in users. It never deletes matches and does
-- not change the existing create, preview, start, or score-confirmation flows.

create or replace function public.v2_update_confirmed_match_score(
  p_match_id uuid,
  p_team_a_score int,
  p_team_b_score int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.v2_matches;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required';
  end if;
  if p_team_a_score < 0 or p_team_b_score < 0 or p_team_a_score > 99 or p_team_b_score > 99 or p_team_a_score = p_team_b_score then
    raise exception 'Scores must be different whole numbers between 0 and 99';
  end if;

  select * into target from public.v2_matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if target.status <> 'confirmed' then raise exception 'Only confirmed results can be edited'; end if;

  update public.v2_matches
  set team_a_score = p_team_a_score,
      team_b_score = p_team_b_score,
      winner = case when p_team_a_score > p_team_b_score then 'A' else 'B' end,
      confirmed_by = auth.uid(),
      updated_at = now()
  where id = target.id;

  insert into public.v2_audit_logs (organization_id, event_id, actor_id, action, entity_type, entity_id, metadata)
  values (target.organization_id, target.event_id, auth.uid(), 'confirmed_match_score_updated', 'v2_matches', target.id,
    jsonb_build_object('team_a_score', p_team_a_score, 'team_b_score', p_team_b_score));
end;
$$;

revoke all on function public.v2_update_confirmed_match_score(uuid, int, int) from public;
revoke execute on function public.v2_update_confirmed_match_score(uuid, int, int) from anon;
grant execute on function public.v2_update_confirmed_match_score(uuid, int, int) to authenticated;
