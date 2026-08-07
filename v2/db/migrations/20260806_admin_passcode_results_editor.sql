-- Password-gated Admin results editor. No match rows are deleted.
-- The initial passcode is provisioned separately and is never committed here.
create table if not exists public.v2_admin_passcode_settings (
  organization_id uuid primary key,
  passcode_hash text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.v2_admin_passcode_settings enable row level security;
revoke all on public.v2_admin_passcode_settings from anon, authenticated;

create table if not exists public.v2_admin_access_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  action text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
alter table public.v2_admin_access_attempts enable row level security;
revoke all on public.v2_admin_access_attempts from anon, authenticated;
create index if not exists v2_admin_access_attempts_rate_limit_idx on public.v2_admin_access_attempts (ip_hash, success, created_at desc);

create table if not exists public.v2_admin_result_audit (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.v2_matches(id) on delete cascade,
  team_a_score int not null,
  team_b_score int not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.v2_admin_result_audit enable row level security;
revoke all on public.v2_admin_result_audit from anon, authenticated;

create or replace function public.v2_admin_verify_passcode(p_passcode text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare stored_hash text;
begin
  if length(coalesce(p_passcode,'')) < 6 or length(p_passcode) > 128 then return false; end if;
  select settings.passcode_hash into stored_hash from public.v2_admin_passcode_settings as settings where settings.organization_id = '00000000-0000-4000-8000-000000000001';
  return stored_hash is not null and extensions.crypt(p_passcode, stored_hash) = stored_hash;
end;
$$;

create or replace function public.v2_admin_update_confirmed_match_score(p_match_id uuid, p_team_a_score int, p_team_b_score int, p_ip_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare target public.v2_matches;
begin
  if p_team_a_score < 0 or p_team_b_score < 0 or p_team_a_score > 99 or p_team_b_score > 99 or p_team_a_score = p_team_b_score then raise exception 'Scores must be different whole numbers between 0 and 99'; end if;
  select * into target from public.v2_matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if target.status <> 'confirmed' then raise exception 'Only confirmed results can be edited'; end if;
  update public.v2_matches set team_a_score=p_team_a_score, team_b_score=p_team_b_score, winner=case when p_team_a_score>p_team_b_score then 'A' else 'B' end, updated_at=now() where id=target.id;
  insert into public.v2_admin_result_audit (match_id,team_a_score,team_b_score,ip_hash) values (target.id,p_team_a_score,p_team_b_score,p_ip_hash);
end;
$$;

revoke all on function public.v2_admin_verify_passcode(text) from public, anon, authenticated;
revoke all on function public.v2_admin_update_confirmed_match_score(uuid,int,int,text) from public, anon, authenticated;
grant execute on function public.v2_admin_verify_passcode(text) to service_role;
grant execute on function public.v2_admin_update_confirmed_match_score(uuid,int,int,text) to service_role;
