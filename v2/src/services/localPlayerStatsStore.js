const PLAYER_STATS_KEY_PREFIX = 'gdsq_v2_player_stats:';

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function key(eventId) {
  return `${PLAYER_STATS_KEY_PREFIX}${eventId}`;
}

function getBaseStats() {
  return {
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0
  };
}

function playerId(player) {
  return typeof player === 'string' ? player : player?.id || player?.playerId || player?.eventPlayerId;
}

function normalizeLevel(level) {
  if (typeof level === 'number') return level;
  const value = String(level || '').match(/[0-9]+(\.[0-9]+)?/);
  return value ? Number(value[0]) : 2.5;
}

function readStats(eventId) {
  if (!eventId) return {};
  return safeJsonParse(localStorage.getItem(key(eventId)) || '{}', {});
}

function writeStats(eventId, stats) {
  localStorage.setItem(key(eventId), JSON.stringify(stats));
  return stats;
}

function ensurePlayer(stats, id) {
  if (!stats[id]) {
    stats[id] = {
      delta: getBaseStats(),
      status: null,
      queueJoinedAt: null,
      level: null,
      appliedMatchIds: []
    };
  }
  return stats[id];
}

export function mergeLocalPlayerStats(eventId, players = []) {
  const stats = readStats(eventId);
  return players.map((player) => {
    const id = playerId(player);
    const override = stats[id];
    if (!override) return player;
    const delta = override.delta || getBaseStats();
    const level = override.level ?? player.level ?? player.estimatedLevel ?? player.estimated_level;
    return {
      ...player,
      level,
      estimatedLevel: level,
      estimated_level: level,
      status: override.status || player.status,
      queueJoinedAt: override.queueJoinedAt || player.queueJoinedAt || player.queue_joined_at,
      matchesPlayed: Number(player.matchesPlayed ?? player.matches_played ?? 0) + Number(delta.matchesPlayed || 0),
      wins: Number(player.wins || 0) + Number(delta.wins || 0),
      losses: Number(player.losses || 0) + Number(delta.losses || 0),
      pointsFor: Number(player.pointsFor ?? player.points_for ?? 0) + Number(delta.pointsFor || 0),
      pointsAgainst: Number(player.pointsAgainst ?? player.points_against ?? 0) + Number(delta.pointsAgainst || 0)
    };
  });
}

export function setLocalPlayerStatus(eventId, playerIds = [], status) {
  const stats = readStats(eventId);
  const queueJoinedAt = status === 'ready' ? new Date().toISOString() : null;
  for (const id of playerIds.map(String).filter(Boolean)) {
    const record = ensurePlayer(stats, id);
    record.status = status;
    if (queueJoinedAt) record.queueJoinedAt = queueJoinedAt;
  }
  writeStats(eventId, stats);
  return stats;
}

export function setLocalPlayerLevel(eventId, playerId, level) {
  if (!eventId || !playerId) return null;
  const stats = readStats(eventId);
  const record = ensurePlayer(stats, String(playerId));
  record.level = normalizeLevel(level);
  writeStats(eventId, stats);
  return record;
}

export function forceAllLocalPlayersReady(eventId, players = []) {
  const stats = readStats(eventId);
  const now = new Date().toISOString();
  for (const player of players) {
    const id = playerId(player);
    if (!id) continue;
    const record = ensurePlayer(stats, String(id));
    record.status = 'ready';
    record.queueJoinedAt = now;
  }
  writeStats(eventId, stats);
  return stats;
}

export function applyLocalMatchResult(eventId, match) {
  const stats = readStats(eventId);
  const teamA = (match.teamA || match.team_a || []).map(playerId).filter(Boolean).map(String);
  const teamB = (match.teamB || match.team_b || []).map(playerId).filter(Boolean).map(String);
  const teamAScore = Number(match.teamAScore ?? match.team_a_score ?? 0);
  const teamBScore = Number(match.teamBScore ?? match.team_b_score ?? 0);
  const matchId = String(match.id || '');
  const teamAWon = teamAScore > teamBScore;
  const now = new Date().toISOString();

  function apply(id, isTeamA) {
    const record = ensurePlayer(stats, id);
    if (record.appliedMatchIds?.includes(matchId)) return;
    record.delta.matchesPlayed += 1;
    record.delta.wins += isTeamA === teamAWon ? 1 : 0;
    record.delta.losses += isTeamA === teamAWon ? 0 : 1;
    record.delta.pointsFor += isTeamA ? teamAScore : teamBScore;
    record.delta.pointsAgainst += isTeamA ? teamBScore : teamAScore;
    record.status = 'ready';
    record.queueJoinedAt = now;
    record.appliedMatchIds = [...(record.appliedMatchIds || []), matchId];
  }

  teamA.forEach((id) => apply(id, true));
  teamB.forEach((id) => apply(id, false));
  writeStats(eventId, stats);
  return stats;
}

export function clearLocalPlayerStats(eventId) {
  if (!eventId) return;
  localStorage.removeItem(key(eventId));
}
