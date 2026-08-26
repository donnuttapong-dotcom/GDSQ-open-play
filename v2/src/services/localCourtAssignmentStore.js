const STORAGE_KEY = 'gdsq_v2_court_assignment';
const COURT_TYPES = ['social', 'balanced', 'challenge', 'open', 'custom'];
const THEME_COLORS = ['green', 'blue', 'orange', 'purple', 'gray'];
const ACTIVE_MATCH_STATUSES = new Set(['preview', 'assigned', 'playing', 'pending_score', 'queued_next']);

const PRESET_TEMPLATES = {
  all_open: [
    { displayName: 'ALL OPEN', courtType: 'open', minLevel: 2, maxLevel: 5, themeColor: 'purple' }
  ],
  beginner_heavy: [
    { displayName: 'BEGINNER FLEX', courtType: 'custom', minLevel: 2, maxLevel: 2.5, themeColor: 'green' },
    { displayName: 'MIXED LOW', courtType: 'balanced', minLevel: 2.25, maxLevel: 2.75, themeColor: 'blue' },
    { displayName: 'MIXED', courtType: 'balanced', minLevel: 2.5, maxLevel: 3, themeColor: 'blue' },
    { displayName: 'CHALLENGE', courtType: 'challenge', minLevel: 2.75, maxLevel: 5, themeColor: 'orange' }
  ],
  balanced: [
    { displayName: 'SOCIAL LOW', courtType: 'social', minLevel: 2, maxLevel: 2.75, themeColor: 'green' },
    { displayName: 'BALANCED LOW', courtType: 'balanced', minLevel: 2.25, maxLevel: 3, themeColor: 'blue' },
    { displayName: 'BALANCED HIGH', courtType: 'balanced', minLevel: 2.5, maxLevel: 3.5, themeColor: 'blue' },
    { displayName: 'OPEN CHALLENGE', courtType: 'challenge', minLevel: 2.75, maxLevel: 5, themeColor: 'orange' }
  ],
  challenge_heavy: [
    { displayName: 'OPEN MIX', courtType: 'open', minLevel: 2, maxLevel: 5, themeColor: 'purple' },
    { displayName: 'MIXED HIGH', courtType: 'balanced', minLevel: 2.5, maxLevel: 3.25, themeColor: 'blue' },
    { displayName: 'CHALLENGE', courtType: 'challenge', minLevel: 2.75, maxLevel: 5, themeColor: 'orange' },
    { displayName: 'CHALLENGE PLUS', courtType: 'challenge', minLevel: 3, maxLevel: 5, themeColor: 'orange' }
  ]
};

function readAll() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function writeAll(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function numberInRange(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(6, Math.max(1, number)) : fallback;
}

export function defaultCourt(courtNumber) {
  return {
    courtNumber,
    displayName: `Court ${courtNumber}`,
    courtType: 'open',
    minLevel: 2,
    maxLevel: 5,
    active: true,
    themeColor: 'purple',
    note: ''
  };
}

function normalizeCourt(input, courtNumber) {
  const fallback = defaultCourt(courtNumber);
  return {
    courtNumber,
    displayName: String(input?.displayName || fallback.displayName).trim().slice(0, 60) || fallback.displayName,
    courtType: COURT_TYPES.includes(input?.courtType) ? input.courtType : fallback.courtType,
    minLevel: numberInRange(input?.minLevel, fallback.minLevel),
    maxLevel: numberInRange(input?.maxLevel, fallback.maxLevel),
    active: input?.active !== false,
    themeColor: THEME_COLORS.includes(input?.themeColor) ? input.themeColor : fallback.themeColor,
    note: String(input?.note || '').slice(0, 240)
  };
}

function courtCount(value) {
  return Math.max(1, Math.min(10, Number(value) || 1));
}

export function getCourtAssignment(eventId, count) {
  const stored = readAll()[eventId] || { eventId, courts: [], playerAssignments: {} };
  const courts = Array.from({ length: courtCount(count) }, (_, index) => {
    const courtNumber = index + 1;
    return normalizeCourt((stored.courts || []).find((court) => Number(court.courtNumber) === courtNumber), courtNumber);
  });
  return {
    eventId,
    courts,
    playerAssignments: { ...(stored.playerAssignments || {}) }
  };
}

export function saveCourtSetup(eventId, count, courts) {
  const all = readAll();
  const current = getCourtAssignment(eventId, count);
  all[eventId] = {
    ...current,
    courts: Array.from({ length: courtCount(count) }, (_, index) => normalizeCourt(courts?.[index], index + 1)),
    updatedAt: new Date().toISOString()
  };
  writeAll(all);
  return all[eventId];
}

export function resetCourt(eventId, count, courtNumber) {
  const current = getCourtAssignment(eventId, count);
  const courts = current.courts.map((court) => Number(court.courtNumber) === Number(courtNumber) ? defaultCourt(courtNumber) : court);
  return saveCourtSetup(eventId, count, courts);
}

export function duplicateCourt(eventId, count, sourceCourtNumber, targetCourtNumber) {
  const current = getCourtAssignment(eventId, count);
  const source = current.courts.find((court) => Number(court.courtNumber) === Number(sourceCourtNumber));
  const target = current.courts.find((court) => Number(court.courtNumber) === Number(targetCourtNumber));
  if (!source || !target) return current;
  const courts = current.courts.map((court) => Number(court.courtNumber) === Number(targetCourtNumber)
    ? { ...source, courtNumber: target.courtNumber, displayName: target.displayName }
    : court);
  return saveCourtSetup(eventId, count, courts);
}

export function savePlayerAssignments(eventId, count, assignments) {
  const all = readAll();
  const current = getCourtAssignment(eventId, count);
  all[eventId] = {
    ...current,
    playerAssignments: { ...(assignments || {}) },
    updatedAt: new Date().toISOString()
  };
  writeAll(all);
  return all[eventId];
}

export function prunePlayerAssignments(eventId, count, playerIds) {
  const current = getCourtAssignment(eventId, count);
  const allowed = new Set((playerIds || []).map(String));
  const assignments = Object.fromEntries(Object.entries(current.playerAssignments).filter(([playerId]) => allowed.has(String(playerId))));
  if (Object.keys(assignments).length !== Object.keys(current.playerAssignments).length) savePlayerAssignments(eventId, count, assignments);
  return { ...current, playerAssignments: assignments };
}

export function buildAutoAssignmentProposal(courts, players) {
  const activeCourts = (courts || []).filter((court) => court.active);
  const counts = new Map(activeCourts.map((court) => [Number(court.courtNumber), 0]));
  const assignments = {};
  [...(players || [])]
    .sort((a, b) => playerLevel(a) - playerLevel(b) || playerName(a).localeCompare(playerName(b)))
    .forEach((player) => {
      const level = playerLevel(player);
      const eligible = activeCourts
        .filter((court) => level >= Number(court.minLevel) && level <= Number(court.maxLevel))
        .sort((a, b) => (counts.get(a.courtNumber) - counts.get(b.courtNumber)) || Number(a.courtNumber) - Number(b.courtNumber));
      if (!eligible.length) return;
      const court = eligible[0];
      assignments[String(player.id)] = { courtNumber: Number(court.courtNumber) };
      counts.set(Number(court.courtNumber), counts.get(Number(court.courtNumber)) + 1);
    });
  return assignments;
}

export function buildCourtPreset(presetId, count, currentCourts = []) {
  const templates = PRESET_TEMPLATES[presetId];
  if (!templates) return [];
  return Array.from({ length: courtCount(count) }, (_, index) => {
    const courtNumber = index + 1;
    const current = currentCourts.find((court) => Number(court.courtNumber) === courtNumber) || defaultCourt(courtNumber);
    const template = presetId === 'all_open'
      ? templates[0]
      : templates[index] || { displayName: `OPEN COURT ${courtNumber}`, courtType: 'open', minLevel: 2, maxLevel: 5, themeColor: 'purple' };
    return normalizeCourt({ ...current, ...template, active: true }, courtNumber);
  });
}

export function buildCourtAvailability(courts, players, matches = []) {
  const reservedIds = new Set();
  (matches || []).filter((match) => ACTIVE_MATCH_STATUSES.has(String(match?.status || '').toLowerCase())).forEach((match) => {
    [...(match?.teamA || match?.team_a || []), ...(match?.teamB || match?.team_b || [])].forEach((player) => {
      const id = typeof player === 'string' || typeof player === 'number' ? player : player?.id || player?.eventPlayerId || player?.event_player_id;
      if (id != null) reservedIds.add(String(id));
    });
  });
  const availablePlayers = (players || []).filter((player) => String(player?.status || '').toLowerCase() !== 'removed');
  return Object.fromEntries((courts || []).map((court) => {
    const eligible = availablePlayers.filter((player) => playerLevel(player) >= Number(court.minLevel) && playerLevel(player) <= Number(court.maxLevel));
    const ready = eligible.filter((player) => ['ready', 'checked_in'].includes(String(player?.status || 'ready').toLowerCase()) && !reservedIds.has(String(player.id)));
    return [Number(court.courtNumber), { eligible: eligible.length, ready: ready.length }];
  }));
}

export function buildPlayerMix(players, targetPerBand = 6) {
  const activePlayers = (players || []).filter((player) => String(player?.status || '').toLowerCase() !== 'removed');
  const bands = [
    { id: '2.00-2.25', label: '2.00–2.25', count: 0, target: targetPerBand },
    { id: '2.50', label: '2.50', count: 0, target: targetPerBand },
    { id: '2.75', label: '2.75', count: 0, target: targetPerBand },
    { id: '3.00+', label: '3.00+', count: 0, target: targetPerBand }
  ];
  activePlayers.forEach((player) => {
    const level = playerLevel(player);
    if (level >= 2 && level <= 2.25) bands[0].count += 1;
    else if (level === 2.5) bands[1].count += 1;
    else if (level === 2.75) bands[2].count += 1;
    else if (level >= 3) bands[3].count += 1;
  });
  return { counted: bands.reduce((sum, band) => sum + band.count, 0), total: activePlayers.length, bands };
}

function playerLevel(player) {
  const value = Number(player?.estimatedLevel ?? player?.estimated_level ?? player?.level ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function playerName(player) {
  return String(player?.displayName || player?.nickname || player?.name || '');
}
