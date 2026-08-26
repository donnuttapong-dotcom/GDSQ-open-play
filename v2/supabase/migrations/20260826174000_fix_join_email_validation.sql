-- The previous definition used two backslashes before the domain dot. With
-- standard_conforming_strings enabled, that regex rejects normal addresses.
-- Patch only that token in the current function body and fail closed if the
-- deployed definition is not the expected version.

do $$
declare
  function_definition text;
  invalid_dot_token text := chr(92) || chr(92) || '.';
begin
  select pg_get_functiondef(
    'public.v2_join_player_identity_phase1(uuid,uuid,text,text,numeric,uuid,text)'::regprocedure
  ) into function_definition;

  if function_definition is null or strpos(function_definition, invalid_dot_token) = 0 then
    raise exception 'EXPECTED_JOIN_EMAIL_REGEX_NOT_FOUND';
  end if;
  if strpos(
    substr(function_definition, strpos(function_definition, invalid_dot_token) + length(invalid_dot_token)),
    invalid_dot_token
  ) > 0 then
    raise exception 'JOIN_EMAIL_REGEX_TOKEN_NOT_UNIQUE';
  end if;

  execute replace(function_definition, invalid_dot_token, '[.]');
end;
$$;

revoke all on function public.v2_join_player_identity_phase1(uuid,uuid,text,text,numeric,uuid,text)
  from public, anon, authenticated;
grant execute on function public.v2_join_player_identity_phase1(uuid,uuid,text,text,numeric,uuid,text)
  to service_role;

comment on function public.v2_join_player_identity_phase1(uuid,uuid,text,text,numeric,uuid,text) is
  'Atomic player recognition and join. Email syntax accepts standard addresses; submitted level and identity behavior are unchanged.';
