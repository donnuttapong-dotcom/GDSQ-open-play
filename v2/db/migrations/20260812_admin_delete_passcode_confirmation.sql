-- Permanent deletion remains limited to the authenticated Admin Edge Function.
-- The function receives a fixed internal confirmation only after the Edge Function
-- has re-validated the Admin passcode entered in the confirmation dialog.
create or replace function public.v2_admin_permanently_delete_event(p_event_id uuid, p_confirmation text, p_ip_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.v2_events;
begin
  select * into target from public.v2_events where id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if target.status not in ('deleted', 'archived') then raise exception 'Only an archived event can be permanently deleted'; end if;
  if p_confirmation <> 'ADMIN_CONFIRMED' then raise exception 'Permanent delete confirmation does not match'; end if;
  insert into public.v2_admin_event_audit(event_id, action, ip_hash, metadata)
  values(target.id, 'event_permanently_deleted', p_ip_hash, jsonb_build_object('name', target.name, 'event_date', target.event_date));
  delete from public.v2_events where id = target.id;
end;
$$;

revoke all on function public.v2_admin_permanently_delete_event(uuid,text,text) from public, anon, authenticated;
grant execute on function public.v2_admin_permanently_delete_event(uuid,text,text) to service_role;
