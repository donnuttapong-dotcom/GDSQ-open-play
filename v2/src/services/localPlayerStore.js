const EVENT_PLAYERS_KEY_PREFIX = 'gdsq_v2_event_players:';

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function key(eventId) {
  return `${EVENT_PLAYERS_KEY_PREFIX}${eventId}`;
}

function normalizeLevel(level) {
  if (typeof level === 'number') return level;
  const value = String(level || '').match(/[0-9]+(\.[0-9]+)?/);
  return value ? Number(value[0]) : 2.5;
}

export function listLocalEventPlayers(eventId) {
  if (!eventId) return [];
  return safeJsonParse(localStorage.getItem(key(eventId)) || '[]', []);
}

export function checkInLocalPlayer(payload) {
  if (!payload.eventId) throw new Error('Missing event id');
  const name = String(payload.displayName || payload.name || '').trim();
  if (!name) throw new Error('Player name is required');

  const players = listLocalEventPlayers(payload.eventId);
  const normalizedName = name.toLowerCase();
  const existing = players.find((player) => String(player.displayName).trim().toLowerCase() === normalizedName);

  if (existing) {
    return {
      ...existing,
      duplicate: true
    };
  }

  const player = {
    id: `local-player-${Date.now()}`,
    eventId: payload.eventId,
    displayName: name,
    name,
    estimatedLevel: normalizeLevel(payload.estimatedLevel || payload.level),
    level: normalizeLevel(payload.estimatedLevel || payload.level),
    status: 'ready',
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    queueJoinedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  const next = [...players, player];
  localStorage.setItem(key(payload.eventId), JSON.stringify(next));
  return player;
}

export function updateLocalEventPlayerLevel(eventId, playerId, level) {
  if (!eventId || !playerId) return null;
  const normalizedLevel = normalizeLevel(level);
  const players = listLocalEventPlayers(eventId);
  let updated = null;
  const next = players.map((player) => {
    if (String(player.id) !== String(playerId)) return player;
    updated = {
      ...player,
      estimatedLevel: normalizedLevel,
      estimated_level: normalizedLevel,
      level: normalizedLevel,
      updatedAt: new Date().toISOString()
    };
    return updated;
  });
  localStorage.setItem(key(eventId), JSON.stringify(next));
  return updated;
}

export function clearLocalEventPlayers(eventId) {
  if (!eventId) return;
  localStorage.removeItem(key(eventId));
}
