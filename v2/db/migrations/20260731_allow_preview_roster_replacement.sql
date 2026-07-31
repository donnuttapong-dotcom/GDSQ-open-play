drop policy if exists v2_match_players_public_delete on public.v2_match_players;

create policy v2_match_players_public_delete
on public.v2_match_players
for delete
to public
using (true);

