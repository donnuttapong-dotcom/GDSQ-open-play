-- Prevent an approved historical claim from colliding with an existing
-- participation for the same permanent player in the same event.
create or replace function public.v2_request_player_profile_claim(p_event_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  account auth.users%rowtype;
  profile public.v2_players%rowtype;
  participant public.v2_event_players%rowtype;
  existing_claim uuid;
  claim_id uuid;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into account from auth.users where id = actor;
  if not found or account.email_confirmed_at is null then raise exception 'EMAIL_NOT_VERIFIED'; end if;
  select * into profile from public.v2_players where user_id = actor;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select * into participant from public.v2_event_players where id = p_event_player_id for update;
  if not found then raise exception 'HISTORY_NOT_FOUND'; end if;
  if participant.organization_id <> profile.organization_id then raise exception 'HISTORY_NOT_FOUND'; end if;
  if participant.player_id is not null then raise exception 'HISTORY_ALREADY_CLAIMED'; end if;
  if exists (
    select 1 from public.v2_event_players
    where event_id = participant.event_id and player_id = profile.id and id <> participant.id
  ) then raise exception 'PROFILE_ALREADY_PARTICIPATED_IN_EVENT'; end if;

  select id into existing_claim
  from public.v2_player_profile_claims
  where event_player_id = participant.id and status = 'pending'
  order by created_at desc limit 1;
  if existing_claim is not null then return existing_claim; end if;

  insert into public.v2_player_profile_claims (
    organization_id, event_id, event_player_id, player_id, user_id
  ) values (
    participant.organization_id, participant.event_id, participant.id, profile.id, actor
  ) returning id into claim_id;
  return claim_id;
end;
$$;

revoke all on function public.v2_request_player_profile_claim(uuid) from public, anon;
grant execute on function public.v2_request_player_profile_claim(uuid) to authenticated;
