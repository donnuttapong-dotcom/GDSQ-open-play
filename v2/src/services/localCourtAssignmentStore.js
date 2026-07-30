const STORAGE_KEY = 'gdsq_v2_court_assignment';
const COURT_TYPES = ['social', 'balanced', 'challenge', 'open', 'custom'];
const THEME_COLORS = ['green', 'blue', 'orange', 'purple', 'gray'];

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

function playerLevel(player) {
  const value = Number(player?.estimatedLevel ?? player?.estimated_level ?? player?.level ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function playerName(player) {
  return String(player?.displayName || player?.nickname || player?.name || '');
}
