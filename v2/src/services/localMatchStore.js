const LOCAL_MATCHES_KEY_PREFIX = 'gdsq_v2_matches:';

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function key(eventId) {
  return `${LOCAL_MATCHES_KEY_PREFIX}${eventId}`;
}

function playerId(player) {
  return typeof player === 'string' ? player : player?.id || player?.playerId || player?.eventPlayerId;
}

function list(eventId) {
  if (!eventId) return [];
  return safeJsonParse(localStorage.getItem(key(eventId)) || '[]', []);
}

function save(eventId, matches) {
  localStorage.setItem(key(eventId), JSON.stringify(matches));
  return matches;
}

export function listLocalEventMatches(eventId) {
  return list(eventId).sort((a, b) => new Date(b.createdAt || b.startedAt || 0) - new Date(a.createdAt || a.startedAt || 0));
}

export function createLocalMatchPreview(payload) {
  if (!payload.eventId) throw new Error('Missing event id');
  const matches = list(payload.eventId);
  const match = {
    id: payload.id || `local-match-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    eventId: payload.eventId,
    courtId: payload.courtId,
    courtName: payload.courtName,
    court_number: payload.courtNumber || null,
    status: 'preview',
    teamA: (payload.teamA || []).map(playerId).filter(Boolean),
    teamB: (payload.teamB || []).map(playerId).filter(Boolean),
    fairnessScore: payload.fairnessScore || null,
    teamAScore: null,
    teamBScore: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  save(payload.eventId, [match, ...matches]);
  return match;
}

export function startLocalMatch(eventId, matchId) {
  const matches = list(eventId);
  const index = matches.findIndex((match) => match.id === matchId);
  if (index < 0) throw new Error('Match not found');
  if (matches[index].status === 'confirmed') return matches[index];
  matches[index] = {
    ...matches[index],
    status: 'playing',
    startedAt: matches[index].startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  save(eventId, matches);
  return matches[index];
}

export function confirmLocalScore(eventId, matchId, payload) {
  const matches = list(eventId);
  const index = matches.findIndex((match) => match.id === matchId);
  if (index < 0) throw new Error('Match not found');
  if (matches[index].status === 'confirmed') {
    return { ...matches[index], alreadyConfirmed: true };
  }
  const teamAScore = Number(payload.teamAScore);
  const teamBScore = Number(payload.teamBScore);
  if (!Number.isFinite(teamAScore) || !Number.isFinite(teamBScore)) {
    throw new Error('Score must be a number');
  }
  matches[index] = {
    ...matches[index],
    status: 'confirmed',
    teamAScore,
    teamBScore,
    winner: teamAScore > teamBScore ? 'A' : 'B',
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  save(eventId, matches);
  return matches[index];
}

export function clearLocalEventMatches(eventId) {
  if (!eventId) return;
  localStorage.removeItem(key(eventId));
}
