// Supabase match service skeleton for v2.
// This file is intentionally not wired to the UI yet.
// Confirm score must be idempotent and safe from double click.

export async function listEventMatches(supabase, eventId) {
  const { data, error } = await supabase
    .from('v2_matches')
    .select('*, players:v2_match_players(*)')
    .eq('event_id', eventId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createMatchPreview(supabase, payload) {
  const { data: match, error } = await supabase
    .from('v2_matches')
    .insert({
      organization_id: payload.organizationId,
      event_id: payload.eventId,
      court_number: payload.courtNumber,
      status: 'preview',
      idempotency_key: payload.idempotencyKey || null
    })
    .select('*')
    .single();

  if (error) throw error;

  const rows = payload.players.map((player) => ({
    organization_id: payload.organizationId,
    event_id: payload.eventId,
    match_id: match.id,
    event_player_id: player.eventPlayerId,
    player_id: player.playerId || null,
    team: player.team,
    slot: player.slot
  }));

  const { error: playerError } = await supabase.from('v2_match_players').insert(rows);
  if (playerError) throw playerError;

  return match;
}

export async function startMatch(supabase, matchId) {
  const { data, error } = await supabase
    .from('v2_matches')
    .update({
      status: 'playing',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', matchId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function confirmScore(supabase, matchId, payload) {
  // Safety check: only confirm matches that are not already confirmed.
  const { data: existing, error: readError } = await supabase
    .from('v2_matches')
    .select('id,status')
    .eq('id', matchId)
    .single();

  if (readError) throw readError;
  if (existing.status === 'confirmed') {
    return { alreadyConfirmed: true, matchId };
  }

  const { data, error } = await supabase
    .from('v2_matches')
    .update({
      status: 'confirmed',
      team_a_score: payload.teamAScore,
      team_b_score: payload.teamBScore,
      winner: payload.teamAScore > payload.teamBScore ? 'A' : 'B',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      confirmed_by: payload.confirmedBy || null
    })
    .eq('id', matchId)
    .neq('status', 'confirmed')
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
