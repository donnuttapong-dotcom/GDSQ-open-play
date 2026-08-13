-- Optional GDSQ Rating for Open Play V2.
-- Additive only: existing match, ranking, MVP, queue and court data are unchanged.

create schema if not exists gdsq_history_backup;
revoke all on schema gdsq_history_backup from public, anon, authenticated;

create table if not exists gdsq_history_backup.v2_events_checkpoint_20260814 as table public.v2_events;
create table if not exists gdsq_history_backup.v2_players_checkpoint_20260814 as table public.v2_players;
create table if not exists gdsq_history_backup.v2_event_players_checkpoint_20260814 as table public.v2_event_players;
create table if not exists gdsq_history_backup.v2_matches_checkpoint_20260814 as table public.v2_matches;
create table if not exists gdsq_history_backup.v2_match_players_checkpoint_20260814 as table public.v2_match_players;
revoke all on all tables in schema gdsq_history_backup from public, anon, authenticated;

create table if not exists public.v2_gdsq_rating_settings (
  event_id uuid primary key references public.v2_events(id) on delete cascade,
  organization_id uuid not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.v2_gdsq_rated_matches (
  match_id uuid primary key references public.v2_matches(id) on delete cascade,
  event_id uuid not null references public.v2_events(id) on delete cascade,
  organization_id uuid not null,
  recorded_at timestamptz not null default now()
);

create table if not exists public.v2_gdsq_player_ratings (
  subject_key text primary key,
  organization_id uuid not null,
  player_id uuid references public.v2_players(id) on delete cascade,
  event_player_id uuid references public.v2_event_players(id) on delete set null,
  initial_rating numeric(6,3) not null,
  current_rating numeric(6,3) not null,
  updated_at timestamptz not null default now(),
  check (initial_rating between 1 and 8),
  check (current_rating between 1 and 8)
);

create unique index if not exists v2_gdsq_player_ratings_player_idx
  on public.v2_gdsq_player_ratings(player_id)
  where player_id is not null;
create index if not exists v2_gdsq_player_ratings_org_idx
  on public.v2_gdsq_player_ratings(organization_id, current_rating desc);

create table if not exists public.v2_gdsq_rating_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null references public.v2_events(id) on delete cascade,
  player_id uuid references public.v2_players(id) on delete cascade,
  event_player_id uuid not null references public.v2_event_players(id) on delete cascade,
  match_id uuid not null references public.v2_matches(id) on delete cascade,
  rating_before numeric(6,3) not null,
  delta numeric(6,3) not null,
  rating_after numeric(6,3) not null,
  created_at timestamptz not null,
  unique(match_id, event_player_id)
);

create index if not exists v2_gdsq_rating_history_player_idx
  on public.v2_gdsq_rating_history(player_id, created_at desc)
  where player_id is not null;
create index if not exists v2_gdsq_rating_history_event_idx
  on public.v2_gdsq_rating_history(event_id, created_at desc);

alter table public.v2_gdsq_rating_settings enable row level security;
alter table public.v2_gdsq_rated_matches enable row level security;
alter table public.v2_gdsq_player_ratings enable row level security;
alter table public.v2_gdsq_rating_history enable row level security;

drop policy if exists v2_gdsq_rating_settings_public_read on public.v2_gdsq_rating_settings;
create policy v2_gdsq_rating_settings_public_read
  on public.v2_gdsq_rating_settings for select to anon, authenticated using (true);
drop policy if exists v2_gdsq_player_ratings_public_read on public.v2_gdsq_player_ratings;
create policy v2_gdsq_player_ratings_public_read
  on public.v2_gdsq_player_ratings for select to anon, authenticated using (true);
drop policy if exists v2_gdsq_rating_history_public_read on public.v2_gdsq_rating_history;
create policy v2_gdsq_rating_history_public_read
  on public.v2_gdsq_rating_history for select to anon, authenticated using (true);

revoke all on public.v2_gdsq_rating_settings, public.v2_gdsq_rated_matches,
  public.v2_gdsq_player_ratings, public.v2_gdsq_rating_history from public;
grant select on public.v2_gdsq_rating_settings to anon, authenticated;
grant select on public.v2_gdsq_player_ratings, public.v2_gdsq_rating_history to anon, authenticated;
grant all on public.v2_gdsq_rating_settings, public.v2_gdsq_rated_matches,
  public.v2_gdsq_player_ratings, public.v2_gdsq_rating_history to service_role;

create or replace function public.v2_recalculate_gdsq_ratings(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rated_match record;
  participant record;
  team_a_average numeric;
  team_b_average numeric;
  expected_a numeric;
  actual_a numeric;
  margin_multiplier numeric;
  team_a_delta numeric;
  team_b_delta numeric;
  before_value numeric;
  after_value numeric;
  participant_key text;
begin
  perform pg_advisory_xact_lock(hashtext('v2_gdsq_rating:' || p_organization_id::text));

  insert into public.v2_gdsq_player_ratings(
    subject_key, organization_id, player_id, event_player_id, initial_rating, current_rating
  )
  select distinct on (coalesce('player:' || mp.player_id::text, 'event-player:' || mp.event_player_id::text))
    coalesce('player:' || mp.player_id::text, 'event-player:' || mp.event_player_id::text),
    mp.organization_id,
    mp.player_id,
    mp.event_player_id,
    greatest(1, least(8, coalesce(ep.estimated_level, profile.default_level, 2.5))),
    greatest(1, least(8, coalesce(ep.estimated_level, profile.default_level, 2.5)))
  from public.v2_gdsq_rated_matches ledger
  join public.v2_matches m on m.id = ledger.match_id
  join public.v2_match_players mp on mp.match_id = m.id
  join public.v2_event_players ep on ep.id = mp.event_player_id
  left join public.v2_players profile on profile.id = mp.player_id
  where ledger.organization_id = p_organization_id
  order by coalesce('player:' || mp.player_id::text, 'event-player:' || mp.event_player_id::text),
    coalesce(m.completed_at, m.created_at), m.id
  on conflict (subject_key) do nothing;

  delete from public.v2_gdsq_rating_history where organization_id = p_organization_id;
  update public.v2_gdsq_player_ratings
    set current_rating = initial_rating, updated_at = now()
    where organization_id = p_organization_id;

  for rated_match in
    select m.*
    from public.v2_gdsq_rated_matches ledger
    join public.v2_matches m on m.id = ledger.match_id
    where ledger.organization_id = p_organization_id
      and lower(m.status) in ('confirmed', 'completed')
      and m.team_a_score is not null
      and m.team_b_score is not null
      and m.team_a_score <> m.team_b_score
    order by coalesce(m.completed_at, m.created_at), m.created_at, m.id
  loop
    select avg(r.current_rating) filter (where mp.team = 'A'),
           avg(r.current_rating) filter (where mp.team = 'B')
      into team_a_average, team_b_average
    from public.v2_match_players mp
    join public.v2_gdsq_player_ratings r
      on r.subject_key = coalesce('player:' || mp.player_id::text, 'event-player:' || mp.event_player_id::text)
    where mp.match_id = rated_match.id;

    if team_a_average is null or team_b_average is null then continue; end if;
    expected_a := 1 / (1 + power(10::numeric, (team_b_average - team_a_average) / 0.5));
    actual_a := case when rated_match.team_a_score > rated_match.team_b_score then 1 else 0 end;
    margin_multiplier := 1 + least(abs(rated_match.team_a_score - rated_match.team_b_score), 10)::numeric / 20;
    team_a_delta := round(0.10 * margin_multiplier * (actual_a - expected_a), 3);
    team_b_delta := -team_a_delta;

    for participant in
      select mp.*
      from public.v2_match_players mp
      where mp.match_id = rated_match.id
      order by mp.team, mp.slot, mp.id
    loop
      participant_key := coalesce('player:' || participant.player_id::text, 'event-player:' || participant.event_player_id::text);
      select current_rating into before_value
      from public.v2_gdsq_player_ratings where subject_key = participant_key for update;
      if before_value is null then continue; end if;
      after_value := greatest(1, least(8, before_value + case when participant.team = 'A' then team_a_delta else team_b_delta end));

      insert into public.v2_gdsq_rating_history(
        organization_id, event_id, player_id, event_player_id, match_id,
        rating_before, delta, rating_after, created_at
      ) values (
        rated_match.organization_id, rated_match.event_id, participant.player_id,
        participant.event_player_id, rated_match.id, before_value,
        case when participant.team = 'A' then team_a_delta else team_b_delta end,
        after_value, coalesce(rated_match.completed_at, rated_match.created_at)
      );

      update public.v2_gdsq_player_ratings
        set current_rating = after_value, updated_at = now(),
            event_player_id = participant.event_player_id
        where subject_key = participant_key;
    end loop;
  end loop;
end;
$$;

create or replace function public.v2_capture_gdsq_rated_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare rating_enabled boolean;
begin
  if lower(new.status) in ('confirmed', 'completed') then
    select coalesce(setting.enabled, false) into rating_enabled
    from public.v2_gdsq_rating_settings setting where setting.event_id = new.event_id;
    if rating_enabled then
      insert into public.v2_gdsq_rated_matches(match_id, event_id, organization_id)
      values(new.id, new.event_id, new.organization_id)
      on conflict (match_id) do nothing;
    end if;
  end if;

  if exists (select 1 from public.v2_gdsq_rated_matches ledger where ledger.match_id = new.id) then
    perform public.v2_recalculate_gdsq_ratings(new.organization_id);
  end if;
  return new;
end;
$$;

drop trigger if exists v2_capture_gdsq_rated_match_trigger on public.v2_matches;
create trigger v2_capture_gdsq_rated_match_trigger
after insert or update of status, team_a_score, team_b_score, completed_at
on public.v2_matches for each row execute function public.v2_capture_gdsq_rated_match();

create or replace function public.v2_recalculate_gdsq_after_roster_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare affected_match_id uuid; affected_organization_id uuid;
begin
  affected_match_id := coalesce(new.match_id, old.match_id);
  select organization_id into affected_organization_id
  from public.v2_gdsq_rated_matches where match_id = affected_match_id;
  if affected_organization_id is not null then
    perform public.v2_recalculate_gdsq_ratings(affected_organization_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists v2_recalculate_gdsq_after_roster_trigger on public.v2_match_players;
create trigger v2_recalculate_gdsq_after_roster_trigger
after insert or update or delete on public.v2_match_players
for each row execute function public.v2_recalculate_gdsq_after_roster_change();

revoke all on function public.v2_recalculate_gdsq_ratings(uuid) from public, anon, authenticated;
revoke all on function public.v2_capture_gdsq_rated_match() from public, anon, authenticated;
revoke all on function public.v2_recalculate_gdsq_after_roster_change() from public, anon, authenticated;
grant execute on function public.v2_recalculate_gdsq_ratings(uuid) to service_role;
