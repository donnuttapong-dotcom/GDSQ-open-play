create or replace function public.v2_admin_verify_passcode(p_passcode text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare stored_hash text;
begin
  if length(coalesce(p_passcode,'')) < 6 or length(p_passcode) > 128 then return false; end if;
  select settings.passcode_hash into stored_hash from public.v2_admin_passcode_settings as settings where settings.organization_id = '00000000-0000-4000-8000-000000000001';
  return stored_hash is not null and extensions.crypt(p_passcode, stored_hash) = stored_hash;
end;
$$;

revoke all on function public.v2_admin_verify_passcode(text) from public, anon, authenticated;
grant execute on function public.v2_admin_verify_passcode(text) to service_role;
