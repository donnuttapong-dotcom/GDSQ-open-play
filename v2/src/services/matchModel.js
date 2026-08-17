// Shared match boundary. Adapters may receive roster rows or player objects,
// but every UI consumer gets the same four-player match shape.

export function playerId(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return String(value?.id || value?.playerId || value?.player_id || value?.eventPlayerId || value?.event_player_id || '');
}

function roster(match = {}) {
  return Array.isArray(match.players) ? match.players : Array.isArray(match.roster) ? match.roster : [];
}

function teamFromRoster(match, team) {
  return roster(match)
    .filter((row) => String(row?.team || '').toUpperCase() === team)
    .sort((a, b) => Number(a?.slot || 0) - Number(b?.slot || 0))
    .map(playerId)
    .filter(Boolean);
}

function team(match, key, side) {
  const direct = match?.[key] || match?.[key === 'teamA' ? 'team_a' : 'team_b'];
  if (Array.isArray(direct) && direct.length) return direct.map(playerId).filter(Boolean);
  return teamFromRoster(match, side);
}

function courtNumber(match) {
  const direct = Number(match?.courtNumber || match?.court_number);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const source = String(match?.courtId || match?.court_id || match?.courtName || match?.court_name || '');
  const found = source.match(/(\d+)/);
  return found ? Number(found[1]) : null;
}

export function normalizeMatch(match = {}) {
  const number = courtNumber(match);
  const label = match?.courtName || match?.court_name || (number ? `Court ${number}` : 'Court -');
  const matchMode = match?.matchMode || match?.match_mode || match?.match_type || match?.matchmaking_mode || 'fair';
  return {
    ...match,
    id: match?.id,
    eventId: match?.eventId || match?.event_id,
    event_id: match?.eventId || match?.event_id,
    organizationId: match?.organizationId || match?.organization_id,
    organization_id: match?.organizationId || match?.organization_id,
    courtNumber: number,
    court_number: number,
    courtName: label,
    court_name: label,
    status: match?.status || 'preview',
    teamA: team(match, 'teamA', 'A'),
    teamB: team(match, 'teamB', 'B'),
    teamAScore: match?.teamAScore ?? match?.team_a_score ?? null,
    teamBScore: match?.teamBScore ?? match?.team_b_score ?? null,
    startedAt: match?.startedAt || match?.started_at || null,
    completedAt: match?.completedAt || match?.completed_at || null,
    matchMode,
    match_type: matchMode
  };
}

export function matchPlayerIds(match) {
  const normalized = normalizeMatch(match);
  return [...normalized.teamA, ...normalized.teamB];
}
