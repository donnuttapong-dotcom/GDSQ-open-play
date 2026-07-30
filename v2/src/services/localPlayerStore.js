const EVENT_PLAYERS_KEY_PREFIX = 'gdsq_v2_event_players:';
const PLAYER_PROFILES_KEY = 'gdsq_v2_player_profiles';

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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function localId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function listLocalPlayerProfiles() {
  return safeJsonParse(localStorage.getItem(PLAYER_PROFILES_KEY) || '[]', []);
}

function saveLocalPlayerProfiles(profiles) {
  localStorage.setItem(PLAYER_PROFILES_KEY, JSON.stringify(profiles));
}

function upsertLocalPlayerProfile(payload, name, level) {
  const email = normalizeEmail(payload.email);
  if (!email) return null;
  const profiles = listLocalPlayerProfiles();
  const existing = profiles.find((profile) => profile.email === email);
  const now = new Date().toISOString();
  const profile = {
    id: existing?.id || localId('local-profile'),
    email,
    displayName: name || existing?.displayName || email.split('@')[0],
    defaultLevel: level || existing?.defaultLevel || 2.5,
    avatarUrl: payload.avatarUrl || existing?.avatarUrl || '',
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  saveLocalPlayerProfiles(existing ? profiles.map((item) => item.id === existing.id ? profile : item) : [...profiles, profile]);
  localStorage.setItem('gdsq_v2_last_player_email', email);
  return profile;
}

export function findLocalPlayerProfileByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return listLocalPlayerProfiles().find((profile) => profile.email === normalized) || null;
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

  const level = normalizeLevel(payload.estimatedLevel || payload.level);
  const profile = upsertLocalPlayerProfile(payload, name, level);
  const players = listLocalEventPlayers(payload.eventId);
  const normalizedName = name.toLowerCase();
  const existing = players.find((player) => profile ? String(player.playerId) === String(profile.id) : String(player.displayName).trim().toLowerCase() === normalizedName);

  if (existing) {
    const updated = {
      ...existing,
      playerId: profile?.id || existing.playerId,
      email: profile?.email || existing.email || '',
      displayName: profile?.displayName || existing.displayName,
      name: profile?.displayName || existing.name,
      estimatedLevel: profile?.defaultLevel || existing.estimatedLevel,
      level: profile?.defaultLevel || existing.level,
      avatarUrl: profile?.avatarUrl || payload.avatarUrl || existing.avatarUrl || '',
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(key(payload.eventId), JSON.stringify(players.map((player) => player.id === existing.id ? updated : player)));
    return { ...updated, duplicate: true };
  }

  const player = {
    id: localId('local-player'),
    eventId: payload.eventId,
    playerId: profile?.id || payload.playerId || null,
    email: profile?.email || '',
    displayName: name,
    name,
    estimatedLevel: level,
    level,
    status: 'ready',
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    avatarUrl: profile?.avatarUrl || payload.avatarUrl || '',
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
