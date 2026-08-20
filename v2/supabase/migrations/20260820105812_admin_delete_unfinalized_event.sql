create or replace function public.v2_admin_permanently_delete_unfinalized_event(
  p_event_id uuid,
  p_confirmation text,
  p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.v2_events;
begin
  select * into target
  from public.v2_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if target.hall_of_fame_processed_at is not null then
    raise exception 'EVENT_ALREADY_FINALIZED';
  end if;
  if lower(coalesce(target.status, '')) in ('deleted', 'archived') then
    raise exception 'EVENT_ALREADY_ARCHIVED';
  end if;
  if p_confirmation <> 'ADMIN_CONFIRMED' then
    raise exception 'PERMANENT_DELETE_CONFIRMATION_MISMATCH';
  end if;

  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
  values (
    target.id,
    'unfinalized_event_permanently_deleted',
    p_ip_hash,
    jsonb_build_object(
      'name', target.name,
      'event_date', target.event_date,
      'previous_status', target.status,
      'hall_of_fame_processed_at', target.hall_of_fame_processed_at
    )
  );

  delete from public.v2_events where id = target.id;
end;
$$;

revoke all on function public.v2_admin_permanently_delete_unfinalized_event(uuid, text, text) from public, anon, authenticated;
grant execute on function public.v2_admin_permanently_delete_unfinalized_event(uuid, text, text) to service_role;
