-- Finalize Hall of Fame participation only after an event is ended.
-- This is additive: existing event, match, ranking, and player tables remain intact.

alter table public.v2_events
  add column if not exists hall_of_fame_processed_at timestamptz;

create index if not exists v2_events_hall_of_fame_processed_idx
  on public.v2_events (organization_id, hall_of_fame_processed_at)
  where hall_of_fame_processed_at is not null;

create or replace function public.v2_hall_of_fame_event_is_valid(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select not exists (
    select 1
    from public.v2_matches m
    where m.event_id = p_event_id
      and lower(coalesce(m.status, '')) in ('confirmed', 'completed', 'done', 'finished')
      and (
        m.team_a_score is null
        or m.team_b_score is null
        or m.team_a_score = m.team_b_score
        or (select count(*) from public.v2_match_players mp where mp.match_id = m.id) <> 4
        or (select count(distinct mp.event_player_id) from public.v2_match_players mp where mp.match_id = m.id) <> 4
        or exists (
          select 1
          from public.v2_match_players mp
          left join public.v2_event_players ep on ep.id = mp.event_player_id
          where mp.match_id = m.id
            and (ep.id is null or ep.event_id <> p_event_id)
        )
      )
  );
$function$;

revoke all on function public.v2_hall_of_fame_event_is_valid(uuid) from public, anon, authenticated;
grant execute on function public.v2_hall_of_fame_event_is_valid(uuid) to service_role;

create or replace function public.v2_mark_hall_of_fame_event_processed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if lower(coalesce(new.status, '')) in ('completed', 'ended', 'closed', 'finished') then
    if tg_op = 'INSERT' then
      if not public.v2_hall_of_fame_event_is_valid(new.id) then
        raise exception 'HALL_OF_FAME_EVENT_INCOMPLETE';
      end if;
      new.hall_of_fame_processed_at := coalesce(new.hall_of_fame_processed_at, new.completed_at, now());
    elsif lower(coalesce(old.status, '')) not in ('completed', 'ended', 'closed', 'finished') then
    if not public.v2_hall_of_fame_event_is_valid(new.id) then
      raise exception 'HALL_OF_FAME_EVENT_INCOMPLETE';
    end if;

    -- Preserve the first finalization timestamp across reopen/end cycles.
      new.hall_of_fame_processed_at := coalesce(
        old.hall_of_fame_processed_at,
        new.hall_of_fame_processed_at,
        new.completed_at,
        now()
      );
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.v2_mark_hall_of_fame_event_processed() from public, anon, authenticated;
grant execute on function public.v2_mark_hall_of_fame_event_processed() to service_role;

drop trigger if exists v2_events_hall_of_fame_finalize on public.v2_events;
create trigger v2_events_hall_of_fame_finalize
before insert or update of status, completed_at on public.v2_events
for each row
execute function public.v2_mark_hall_of_fame_event_processed();

-- Preserve existing ended-event history. This does not alter matches or scores.
update public.v2_events
set hall_of_fame_processed_at = coalesce(completed_at, now())
where hall_of_fame_processed_at is null
  and completed_at is not null
  and lower(coalesce(status, '')) in ('completed', 'ended', 'closed', 'finished', 'deleted');
