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

function normalizeCancelPayload(reasonOrPayload = 'cancelled_by_organizer') {
  if (typeof reasonOrPayload === 'string') {
    return { reason: reasonOrPayload };
  }
  return {
    reason: reasonOrPayload.reason || 'cancelled_by_organizer',
    teamAScore: reasonOrPayload.teamAScore,
    teamBScore: reasonOrPayload.teamBScore,
    keepScoreDraft: Boolean(reasonOrPayload.keepScoreDraft)
  };
}

function hasScore(value) {
  return value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
}

function isActive(match) {
  return ['preview', 'assigned', 'playing', 'pending_score', 'queued_next'].includes(String(match?.status || '').toLowerCase());
}

function courtKey(match) {
  const source = match?.courtId || match?.court_id || match?.court_number || match?.courtNumber || match?.courtName || match?.court_name || '';
  const number = String(source).match(/\d+/)?.[0];
  return number ? `court-${number}` : String(source).toLowerCase();
}

function matchPlayerIds(match) {
  return [...(match?.teamA || match?.team_a || []), ...(match?.teamB || match?.team_b || [])].map(playerId).filter(Boolean).map(String);
}

function assertAvailable(matches, candidate, exceptId = '') {
  const currentPlayers = new Set(matchPlayerIds(candidate));
  if (currentPlayers.size !== 4) throw new Error('A preview match must contain four different players');
  for (const match of matches) {
    if (!isActive(match) || String(match.id) === String(exceptId)) continue;
    if (courtKey(match) === courtKey(candidate)) throw new Error('Court is already in use');
    if (matchPlayerIds(match).some((id) => currentPlayers.has(id))) throw new Error('A selected player is already assigned to another active match');
  }
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
    matchMode: payload.matchMode || 'auto',
    teamAScore: null,
    teamBScore: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  assertAvailable(matches, match);
  save(payload.eventId, [match, ...matches]);
  return match;
}

export function createLocalMatchNext(payload) {
  if (!payload.eventId) throw new Error('Missing event id');
  const matches = list(payload.eventId);
  const court = courtKey(payload);
  if (!matches.some((match) => courtKey(match) === court && ['playing', 'pending_score'].includes(String(match.status).toLowerCase()))) throw new Error('Court is not playing');
  if (matches.some((match) => courtKey(match) === court && String(match.status).toLowerCase() === 'queued_next')) throw new Error('Court already has a next match');
  const match = {
    id: payload.id || `local-next-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    eventId: payload.eventId,
    courtId: payload.courtId,
    courtName: payload.courtName,
    court_number: payload.courtNumber || null,
    status: 'queued_next',
    teamA: (payload.teamA || []).map(playerId).filter(Boolean),
    teamB: (payload.teamB || []).map(playerId).filter(Boolean),
    fairnessScore: payload.fairnessScore || null,
    matchMode: payload.matchMode || 'auto_next',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const ids = new Set(matchPlayerIds(match));
  if (ids.size !== 4) throw new Error('A next match must contain four different players');
  for (const current of matches) {
    if (!isActive(current)) continue;
    if (matchPlayerIds(current).some((id) => ids.has(id))) throw new Error('A selected player is already assigned to an active match');
  }
  save(payload.eventId, [match, ...matches]);
  return match;
}

export function updateLocalMatchPreview(eventId, matchId, payload) {
  const matches = list(eventId);
  const index = matches.findIndex((match) => String(match.id) === String(matchId));
  if (index < 0) throw new Error('Match not found');
  if (String(matches[index].status).toLowerCase() !== 'preview') throw new Error('Only preview matches can be edited');
  const updated = {
    ...matches[index],
    teamA: (payload.teamA || []).map(playerId).filter(Boolean),
    teamB: (payload.teamB || []).map(playerId).filter(Boolean),
    updatedAt: new Date().toISOString()
  };
  assertAvailable(matches, updated, matchId);
  matches[index] = updated;
  save(eventId, matches);
  return updated;
}

export function updateLocalMatchNext(eventId, matchId, payload) {
  const matches = list(eventId);
  const index = matches.findIndex((match) => String(match.id) === String(matchId));
  if (index < 0) throw new Error('Match not found');
  if (String(matches[index].status).toLowerCase() !== 'queued_next') throw new Error('Only next matches can be edited');
  const updated = { ...matches[index], teamA: (payload.teamA || []).map(playerId).filter(Boolean), teamB: (payload.teamB || []).map(playerId).filter(Boolean), updatedAt: new Date().toISOString() };
  const ids = new Set(matchPlayerIds(updated));
  if (ids.size !== 4) throw new Error('A next match must contain four different players');
  for (const current of matches) {
    if (!isActive(current) || String(current.id) === String(matchId)) continue;
    if (matchPlayerIds(current).some((id) => ids.has(id))) throw new Error('A selected player is already assigned to an active match');
  }
  matches[index] = updated;
  save(eventId, matches);
  return updated;
}

export function startLocalMatch(eventId, matchId) {
  const matches = list(eventId);
  const index = matches.findIndex((match) => match.id === matchId);
  if (index < 0) throw new Error('Match not found');
  if (matches[index].status === 'confirmed') return matches[index];
  if (matches[index].status === 'cancelled') throw new Error('Cancelled match cannot be started');
  assertAvailable(matches, matches[index], matchId);
  matches[index] = {
    ...matches[index],
    status: 'playing',
    startedAt: matches[index].startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  save(eventId, matches);
  return matches[index];
}

export function cancelLocalMatch(eventId, matchId, reasonOrPayload = 'cancelled_by_organizer') {
  const matches = list(eventId);
  const index = matches.findIndex((match) => match.id === matchId);
  if (index < 0) throw new Error('Match not found');
  if (matches[index].status === 'confirmed') throw new Error('Confirmed match cannot be cancelled');

  const payload = normalizeCancelPayload(reasonOrPayload);
  const scoreSnapshot = {
    teamAScore: hasScore(payload.teamAScore) ? Number(payload.teamAScore) : matches[index].teamAScore,
    teamBScore: hasScore(payload.teamBScore) ? Number(payload.teamBScore) : matches[index].teamBScore,
    savedAt: new Date().toISOString(),
    source: 'cancel_match'
  };

  const wasPlaying = ['playing', 'pending_score'].includes(String(matches[index].status).toLowerCase());
  const court = courtKey(matches[index]);
  matches[index] = {
    ...matches[index],
    status: 'cancelled',
    cancelReason: payload.reason,
    cancelledAt: new Date().toISOString(),
    cancelledFromStatus: matches[index].status,
    cancelledScoreDraft: scoreSnapshot,
    teamAScore: scoreSnapshot.teamAScore,
    teamBScore: scoreSnapshot.teamBScore,
    updatedAt: new Date().toISOString()
  };
  if (wasPlaying) {
    const nextIndex = matches.findIndex((match) => courtKey(match) === court && String(match.status).toLowerCase() === 'queued_next');
    if (nextIndex >= 0) matches[nextIndex] = { ...matches[nextIndex], status: 'preview', updatedAt: new Date().toISOString() };
  }
  save(eventId, matches);
  return matches[index];
}

export function confirmLocalScore(eventId, matchId, payload) {
  const matches = list(eventId);
  const index = matches.findIndex((match) => match.id === matchId);
  if (index < 0) throw new Error('Match not found');
  if (matches[index].status === 'cancelled') throw new Error('Cancelled match cannot be confirmed');
  if (matches[index].status === 'confirmed') {
    return { ...matches[index], alreadyConfirmed: true };
  }
  const teamAScore = Number(payload.teamAScore);
  const teamBScore = Number(payload.teamBScore);
  if (!Number.isFinite(teamAScore) || !Number.isFinite(teamBScore)) {
    throw new Error('Score must be a number');
  }
  const court = courtKey(matches[index]);
  matches[index] = {
    ...matches[index],
    status: 'confirmed',
    teamAScore,
    teamBScore,
    winner: teamAScore > teamBScore ? 'A' : 'B',
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const nextIndex = matches.findIndex((match) => courtKey(match) === court && String(match.status).toLowerCase() === 'queued_next');
  if (nextIndex >= 0) matches[nextIndex] = { ...matches[nextIndex], status: 'preview', updatedAt: new Date().toISOString() };
  save(eventId, matches);
  return matches[index];
}

function validFinalScore(payload = {}) {
  const teamAScore = Number(payload.teamAScore);
  const teamBScore = Number(payload.teamBScore);
  if (!Number.isInteger(teamAScore) || !Number.isInteger(teamBScore) || teamAScore < 0 || teamBScore < 0 || teamAScore > 99 || teamBScore > 99 || teamAScore === teamBScore) {
    throw new Error('Scores must be different whole numbers between 0 and 99');
  }
  return { teamAScore, teamBScore };
}

export function updateLocalConfirmedScore(eventId, matchId, payload) {
  const matches = list(eventId);
  const index = matches.findIndex((match) => String(match.id) === String(matchId));
  if (index < 0) throw new Error('Match not found');
  if (String(matches[index].status).toLowerCase() !== 'confirmed') throw new Error('Only confirmed results can be edited from statistics');
  const score = validFinalScore(payload);
  matches[index] = {
    ...matches[index],
    teamAScore: score.teamAScore,
    teamBScore: score.teamBScore,
    winner: score.teamAScore > score.teamBScore ? 'A' : 'B',
    updatedAt: new Date().toISOString()
  };
  save(eventId, matches);
  return matches[index];
}

export function clearLocalEventMatches(eventId) {
  if (!eventId) return;
  localStorage.removeItem(key(eventId));
}
