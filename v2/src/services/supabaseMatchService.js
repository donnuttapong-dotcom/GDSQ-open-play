// Supabase match service for v2 shared mode.
// Confirm score is idempotent and safe from double click.

function playerId(player) {
  return typeof player === 'string' ? player : player?.id || player?.eventPlayerId || player?.event_player_id;
}

function courtNumberFromValue(value) {
  const match = String(value || '').match(/(\d+)/);
  const number = match ? Number(match[1]) : null;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function courtNumberFromPayload(payload) {
  return (
    Number(payload.courtNumber || payload.court_number) ||
    courtNumberFromValue(payload.courtId || payload.court_id) ||
    courtNumberFromValue(payload.courtName || payload.court_name)
  );
}

function courtLabel(number) {
  return number ? `Court ${number}` : 'Court -';
}

function normalizeMatch(row) {
  const players = row?.players || [];
  const teamA = players.filter((p) => p.team === 'A').sort((a, b) => a.slot - b.slot).map((p) => p.event_player_id);
  const teamB = players.filter((p) => p.team === 'B').sort((a, b) => a.slot - b.slot).map((p) => p.event_player_id);
  const courtNumber = Number(row?.court_number) || null;
  return {
    ...row,
    eventId: row?.event_id,
    organizationId: row?.organization_id,
    courtNumber,
    court_number: courtNumber,
    courtName: row?.court_name || courtLabel(courtNumber),
    court_name: row?.court_name || courtLabel(courtNumber),
    teamA,
    teamB,
    teamAScore: row?.team_a_score,
    teamBScore: row?.team_b_score,
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
    startedAt: row?.started_at,
    completedAt: row?.completed_at
  };
}

async function fetchMatch(supabase, matchId) {
  const { data, error } = await supabase.from('v2_matches').select('*, players:v2_match_players(*)').eq('id', matchId).single();
  if (error) throw error;
  return normalizeMatch(data);
}

function activeStatus(match) {
  return ['preview', 'assigned', 'playing', 'pending_score'].includes(String(match?.status || '').toLowerCase());
}

function matchPlayerIds(match) {
  return [...(match?.teamA || []), ...(match?.teamB || [])].map(playerId).filter(Boolean).map(String);
}

async function assertMatchAvailable(supabase, candidate, exceptMatchId = '') {
  const activeMatches = await listEventMatches(supabase, candidate.eventId);
  const candidatePlayers = new Set(matchPlayerIds(candidate));
  if (candidatePlayers.size !== 4) throw new Error('A preview match must contain four different players');
  for (const match of activeMatches) {
    if (!activeStatus(match) || String(match.id) === String(exceptMatchId)) continue;
    if (Number(match.courtNumber) === Number(candidate.courtNumber)) throw new Error('Court is already in use');
    if (matchPlayerIds(match).some((id) => candidatePlayers.has(id))) throw new Error('A selected player is already assigned to another active match');
  }
}

function matchPlayerRows(payload, matchId) {
  const explicit = Array.isArray(payload.players) ? payload.players : [];
  const source = explicit.length ? explicit : [
    ...(payload.teamA || []).map((p, i) => ({ ...p, eventPlayerId: playerId(p), team: 'A', slot: i + 1 })),
    ...(payload.teamB || []).map((p, i) => ({ ...p, eventPlayerId: playerId(p), team: 'B', slot: i + 1 }))
  ];
  return source.map((player, index) => ({
    organization_id: payload.organizationId,
    event_id: payload.eventId,
    match_id: matchId,
    event_player_id: player.eventPlayerId || player.event_player_id || playerId(player),
    player_id: player.playerId || player.player_id || null,
    team: player.team,
    slot: player.slot || index + 1
  })).filter((row) => row.event_player_id && row.team);
}

export async function listEventMatches(supabase, eventId) {
  const { data, error } = await supabase.from('v2_matches').select('*, players:v2_match_players(*)').eq('event_id', eventId).neq('status', 'deleted').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(normalizeMatch);
}

export async function createMatchPreview(supabase, payload) {
  const courtNumber = courtNumberFromPayload(payload);
  await assertMatchAvailable(supabase, {
    eventId: payload.eventId,
    courtNumber,
    teamA: payload.teamA,
    teamB: payload.teamB
  });
  const { data: match, error } = await supabase.from('v2_matches').insert({
    organization_id: payload.organizationId,
    event_id: payload.eventId,
    court_number: courtNumber,
    status: 'preview',
    idempotency_key: payload.idempotencyKey || null
  }).select('*').single();
  if (error) throw error;

  const rows = matchPlayerRows(payload, match.id);
  if (rows.length) {
    const { error: playerError } = await supabase.from('v2_match_players').insert(rows);
    if (playerError) {
      await supabase.from('v2_matches').delete().eq('id', match.id);
      throw playerError;
    }
  }
  return fetchMatch(supabase, match.id);
}

export async function updateMatchPreview(supabase, matchId, payload) {
  const existing = await fetchMatch(supabase, matchId);
  if (String(existing.status).toLowerCase() !== 'preview') throw new Error('Only preview matches can be edited');
  const candidate = { ...existing, teamA: payload.teamA, teamB: payload.teamB };
  await assertMatchAvailable(supabase, candidate, matchId);
  const previousRows = existing.players || [];
  const { error: deleteError } = await supabase.from('v2_match_players').delete().eq('match_id', matchId);
  if (deleteError) throw deleteError;
  const rows = matchPlayerRows({
    ...payload,
    eventId: existing.eventId,
    organizationId: existing.organizationId
  }, matchId);
  const { error: insertError } = await supabase.from('v2_match_players').insert(rows);
  if (insertError) {
    await supabase.from('v2_match_players').insert(previousRows.map(({ id, created_at, ...row }) => row));
    throw insertError;
  }
  return fetchMatch(supabase, matchId);
}

export async function startMatch(supabase, matchId) {
  const existing = await fetchMatch(supabase, matchId);
  await assertMatchAvailable(supabase, existing, matchId);
  const { error: rpcError } = await supabase.rpc('v2_start_match_safely', { p_match_id: matchId });
  if (!rpcError) return fetchMatch(supabase, matchId);
  const rpcUnavailable = rpcError.code === 'PGRST202' || /v2_start_match_safely/i.test(String(rpcError.message || ''));
  if (rpcUnavailable) {
    // Compatibility path for the existing production database. Availability was
    // checked above; the RPC remains the preferred protection for multi-device starts.
    const { data, error } = await supabase
      .from('v2_matches')
      .update({ status: 'playing', started_at: existing.startedAt || new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', matchId)
      .eq('status', 'preview')
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Match was already started or changed. Refresh and try again.');
    return fetchMatch(supabase, matchId);
  }
  throw rpcError;
}

export async function cancelMatch(supabase, matchId, payload = {}) {
  const patch = { status: 'cancelled', updated_at: new Date().toISOString() };
  if (payload.teamAScore !== undefined) patch.team_a_score = Number(payload.teamAScore);
  if (payload.teamBScore !== undefined) patch.team_b_score = Number(payload.teamBScore);
  const { error } = await supabase.from('v2_matches').update(patch).eq('id', matchId).neq('status', 'confirmed');
  if (error) throw error;
  return fetchMatch(supabase, matchId);
}

export async function confirmScore(supabase, matchId, payload) {
  const { data: existing, error: readError } = await supabase.from('v2_matches').select('id,status').eq('id', matchId).single();
  if (readError) throw readError;
  if (existing.status === 'confirmed') return fetchMatch(supabase, matchId);
  if (!Number.isFinite(Number(payload.teamAScore)) || !Number.isFinite(Number(payload.teamBScore)) || Number(payload.teamAScore) === Number(payload.teamBScore)) {
    throw new Error('Scores must be different valid numbers');
  }
  const { error: rpcError } = await supabase.rpc('v2_confirm_score_safely', {
    p_match_id: matchId,
    p_team_a_score: Number(payload.teamAScore),
    p_team_b_score: Number(payload.teamBScore)
  });
  if (!rpcError) return fetchMatch(supabase, matchId);
  const rpcUnavailable = rpcError.code === 'PGRST202' || /v2_confirm_score_safely/i.test(String(rpcError.message || ''));
  if (!rpcUnavailable) throw rpcError;

  const { data, error } = await supabase.from('v2_matches').update({
    status: 'confirmed',
    team_a_score: payload.teamAScore,
    team_b_score: payload.teamBScore,
    winner: payload.teamAScore > payload.teamBScore ? 'A' : 'B',
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    confirmed_by: payload.confirmedBy || null
  }).eq('id', matchId).neq('status', 'confirmed').select('id');
  if (error) throw error;
  if (!data?.length) {
    const latest = await fetchMatch(supabase, matchId);
    if (latest.status !== 'confirmed') throw new Error('ไม่สามารถบันทึกผลการแข่งขันได้ กรุณารีเฟรชแล้วลองใหม่');
  }
  return fetchMatch(supabase, matchId);
}
