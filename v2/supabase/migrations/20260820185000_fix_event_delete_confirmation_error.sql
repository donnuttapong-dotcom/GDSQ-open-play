-- Keep the stateful event-delete error contract aligned with the client.
create or replace function public.v2_admin_delete_event_stateful(
  p_event_id uuid,
  p_organization_id uuid,
  p_confirmation text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.v2_events;
  active_count integer := 0;
  confirmed_count integer := 0;
  player_count integer := 0;
  finalized boolean := false;
begin
  select * into target
  from public.v2_events
  where id = p_event_id and organization_id = p_organization_id
  for update;

  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  finalized := target.hall_of_fame_processed_at is not null;
  if finalized and p_confirmation <> 'DELETE_FINALIZED_EVENT' then
    raise exception 'FINALIZED_DELETE_CONFIRMATION_REQUIRED';
  end if;
  if not finalized and p_confirmation <> 'DELETE_EVENT' then
    raise exception 'DELETE_CONFIRMATION_REQUIRED';
  end if;

  select
    count(*) filter (where lower(coalesce(m.status, '')) in ('preview', 'assigned', 'playing', 'pending_score')),
    count(*) filter (where lower(coalesce(m.status, '')) in ('confirmed', 'completed', 'done', 'finished'))
  into active_count, confirmed_count
  from public.v2_matches m
  where m.event_id = target.id;

  if active_count > 0 then
    raise exception 'EVENT_HAS_ACTIVE_MATCHES:%', active_count;
  end if;

  select count(*) into player_count
  from public.v2_event_players ep
  where ep.event_id = target.id;

  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
  values (
    target.id,
    'event_deleted_statefully',
    p_ip_hash,
    jsonb_build_object(
      'name', target.name,
      'event_date', target.event_date,
      'previous_status', target.status,
      'hall_processed', finalized,
      'players', player_count,
      'confirmed_matches', confirmed_count,
      'recalculation_source', 'remaining_confirmed_match_history'
    )
  );

  delete from public.v2_events where id = target.id;

  return jsonb_build_object(
    'eventId', target.id,
    'deleted', true,
    'wasFinalized', finalized,
    'playersRemoved', player_count,
    'confirmedMatchesRemoved', confirmed_count
  );
end;
$$;

revoke all on function public.v2_admin_delete_event_stateful(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.v2_admin_delete_event_stateful(uuid, uuid, text, text)
  to service_role;
