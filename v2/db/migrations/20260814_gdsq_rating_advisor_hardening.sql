-- Keep the internal rated-match ledger private while making that intent explicit.
create policy "Rated match ledger is not client accessible"
on public.v2_gdsq_rated_matches
for all
to authenticated
using (false)
with check (false);

create index if not exists v2_gdsq_rated_matches_event_idx
  on public.v2_gdsq_rated_matches (event_id);

create index if not exists v2_gdsq_rating_history_event_player_idx
  on public.v2_gdsq_rating_history (event_player_id);
