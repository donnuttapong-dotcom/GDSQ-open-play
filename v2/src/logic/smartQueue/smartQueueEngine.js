export const SMART_QUEUE_MODES = Object.freeze(['social', 'balanced', 'challenge']);

export const SMART_QUEUE_WEIGHTS = Object.freeze({
  skill: 45,
  mode: 30,
  fairness: 15,
  variety: 10
});

export const SMART_QUEUE_LEVEL_SPREAD = Object.freeze({
  social: 0.75,
  balanced: 0.75,
  challenge: 1
});

const ACTIVE_MATCH_STATUSES = new Set(['preview', 'assigned', 'playing', 'pending_score', 'queued_next']);
const CONFIRMED_MATCH_STATUSES = new Set(['confirmed', 'completed', 'done', 'finished']);
const MODE_TIE_ORDER = Object.freeze({ balanced: 0, social: 1, challenge: 2 });

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function playerId(value) {
  return String(typeof value === 'string' ? value : value?.id || value?.eventPlayerId || value?.event_player_id || '');
}

function playerLevel(player) {
  return Number(player?.estimatedLevel ?? player?.estimated_level ?? player?.level ?? 0) || 0;
}

function playerName(player) {
  return player?.displayName || player?.display_name || player?.nickname || player?.name || playerId(player);
}

function statusOf(value) {
  return String(value || 'ready').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function matchTeam(match, side) {
  const direct = side === 'A' ? match?.teamA || match?.team_a : match?.teamB || match?.team_b;
  if (Array.isArray(direct) && direct.length) return direct.map(playerId).filter(Boolean);
  return (match?.players || [])
    .filter((row) => String(row.team).toUpperCase() === side)
    .sort((a, b) => Number(a.slot || 0) - Number(b.slot || 0))
    .map((row) => playerId(row.event_player_id || row.eventPlayerId || row))
    .filter(Boolean);
}

function matchTime(match) {
  return new Date(match?.completedAt || match?.completed_at || match?.startedAt || match?.started_at || match?.createdAt || match?.created_at || 0).getTime() || 0;
}

function pairKey(a, b) {
  return [String(a), String(b)].sort().join(':');
}

function combinations(values, size) {
  const result = [];
  function visit(start, chosen) {
    if (chosen.length === size) {
      result.push(chosen.slice());
      return;
    }
    for (let index = start; index <= values.length - (size - chosen.length); index += 1) {
      chosen.push(values[index]);
      visit(index + 1, chosen);
      chosen.pop();
    }
  }
  visit(0, []);
  return result;
}

export function normalizeSmartQueueModes(modes = []) {
  const source = Array.isArray(modes) ? modes : [modes];
  return SMART_QUEUE_MODES.filter((mode) => source.map((value) => String(value).toLowerCase()).includes(mode));
}

export function buildSmartQueueHistory(matches = []) {
  const confirmed = matches
    .filter((match) => CONFIRMED_MATCH_STATUSES.has(statusOf(match?.status)))
    .sort((a, b) => matchTime(b) - matchTime(a));
  const games = new Map();
  const partners = new Map();
  const opponents = new Map();
  const lastMatchPartners = new Set();

  confirmed.forEach((match, matchIndex) => {
    const teamA = matchTeam(match, 'A');
    const teamB = matchTeam(match, 'B');
    [...teamA, ...teamB].forEach((id) => games.set(id, (games.get(id) || 0) + 1));
    const recencyWeight = Math.max(1, 6 - Math.min(matchIndex, 5));
    [teamA, teamB].forEach((team) => {
      if (team.length !== 2) return;
      const key = pairKey(team[0], team[1]);
      partners.set(key, (partners.get(key) || 0) + recencyWeight);
      if (matchIndex === 0) lastMatchPartners.add(key);
    });
    teamA.forEach((a) => teamB.forEach((b) => {
      const key = pairKey(a, b);
      opponents.set(key, (opponents.get(key) || 0) + Math.max(1, Math.ceil(recencyWeight / 2)));
    }));
  });

  return { games, partners, opponents, lastMatchPartners };
}

function activePlayerIds(matches = []) {
  const ids = new Set();
  matches.filter((match) => ACTIVE_MATCH_STATUSES.has(statusOf(match?.status))).forEach((match) => {
    [...matchTeam(match, 'A'), ...matchTeam(match, 'B')].forEach((id) => ids.add(id));
  });
  return ids;
}

function preferenceFor(player, preferences) {
  const id = playerId(player);
  const raw = preferences instanceof Map ? preferences.get(id) : preferences?.[id];
  const modes = normalizeSmartQueueModes(raw?.modes || raw?.playModes || raw?.play_modes || []);
  const preferred = String(raw?.preferredMode || raw?.preferred_mode || '').toLowerCase();
  return {
    ...raw,
    eventPlayerId: id,
    modes,
    preferredMode: modes.includes(preferred) ? preferred : modes[0] || null,
    status: statusOf(raw?.status || raw?.queueStatus || raw?.queue_status || 'rest'),
    readySince: raw?.readySince || raw?.ready_since || player?.queueJoinedAt || player?.queue_joined_at || player?.createdAt || player?.created_at || null
  };
}

function teamAverage(team) {
  return team.reduce((sum, player) => sum + playerLevel(player), 0) / (team.length || 1);
}

function repeatPenalty(teamA, teamB, history) {
  const partnerPairs = [pairKey(playerId(teamA[0]), playerId(teamA[1])), pairKey(playerId(teamB[0]), playerId(teamB[1]))];
  let penalty = 0;
  partnerPairs.forEach((key) => {
    penalty += history.partners.get(key) || 0;
    if (history.lastMatchPartners.has(key)) penalty += 8;
  });
  teamA.forEach((a) => teamB.forEach((b) => {
    penalty += (history.opponents.get(pairKey(playerId(a), playerId(b))) || 0) * 0.35;
  }));
  return penalty;
}

export function chooseBalancedSmartQueueTeams(players = [], history = buildSmartQueueHistory([])) {
  if (players.length !== 4) return null;
  const [a, b, c, d] = players;
  const splits = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]]
  ].map(([teamA, teamB], index) => ({
    teamA,
    teamB,
    index,
    teamGap: Math.abs(teamAverage(teamA) - teamAverage(teamB)),
    repeatPenalty: repeatPenalty(teamA, teamB, history)
  }));
  return splits.sort((left, right) => left.teamGap - right.teamGap || left.repeatPenalty - right.repeatPenalty || left.index - right.index)[0];
}

function fairnessScore(group, preferenceMap, history, now) {
  const gameCounts = group.map((player) => history.games.get(playerId(player)) || 0);
  const eventMaxGames = Math.max(1, ...history.games.values());
  const lowGames = group.reduce((sum, player, index) => sum + (eventMaxGames - gameCounts[index]) / eventMaxGames, 0) / 4;
  const waits = group.map((player) => {
    const timestamp = new Date(preferenceMap.get(playerId(player)).readySince || 0).getTime();
    return timestamp ? clamp((now - timestamp) / 3_600_000) : 0;
  });
  return clamp((waits.reduce((sum, value) => sum + value, 0) / 4) * 0.65 + lowGames * 0.35);
}

function candidateForMode(group, mode, preferenceMap, history, now) {
  const levels = group.map(playerLevel);
  const spread = Math.max(...levels) - Math.min(...levels);
  const split = chooseBalancedSmartQueueTeams(group, history);
  const gameCounts = group.map((player) => history.games.get(playerId(player)) || 0);
  const readyTimes = group.map((player) => new Date(preferenceMap.get(playerId(player)).readySince || 0).getTime() || 0);
  const preferredCount = group.filter((player) => preferenceMap.get(playerId(player)).preferredMode === mode).length;
  const skillScore = clamp(1 - split.teamGap);
  const modeScore = 0.65 + (preferredCount / 4) * 0.35;
  const fairness = fairnessScore(group, preferenceMap, history, now);
  const variety = clamp(1 - split.repeatPenalty / 28);
  const score = skillScore * SMART_QUEUE_WEIGHTS.skill
    + modeScore * SMART_QUEUE_WEIGHTS.mode
    + fairness * SMART_QUEUE_WEIGHTS.fairness
    + variety * SMART_QUEUE_WEIGHTS.variety;
  return {
    mode,
    teamA: split.teamA,
    teamB: split.teamB,
    playerIds: group.map(playerId),
    score: Number(score.toFixed(4)),
    spread: Number(spread.toFixed(2)),
    teamGap: Number(split.teamGap.toFixed(2)),
    repeatPenalty: Number(split.repeatPenalty.toFixed(2)),
    fairnessScore: Number(fairness.toFixed(4)),
    gameMax: Math.max(...gameCounts),
    gameTotal: gameCounts.reduce((sum, value) => sum + value, 0),
    oldestReady: Math.min(...readyTimes.filter(Boolean), Number.MAX_SAFE_INTEGER),
    readyTotal: readyTimes.reduce((sum, value) => sum + value, 0),
    explanation: `${mode} · spread ${spread.toFixed(2)} · team gap ${split.teamGap.toFixed(2)}`
  };
}

function deterministicCandidateOrder(left, right) {
  return left.gameMax - right.gameMax
    || left.gameTotal - right.gameTotal
    || left.oldestReady - right.oldestReady
    || left.readyTotal - right.readyTotal
    || left.teamGap - right.teamGap
    || left.repeatPenalty - right.repeatPenalty
    || right.score - left.score
    || MODE_TIE_ORDER[left.mode] - MODE_TIE_ORDER[right.mode]
    || left.playerIds.join(':').localeCompare(right.playerIds.join(':'));
}

export function generateSmartQueueMatch({ players = [], preferences = [], matches = [], now = Date.now(), candidateLimit = 20 } = {}) {
  const preferenceMap = new Map((preferences || []).map((preference) => [
    String(preference.eventPlayerId || preference.event_player_id || preference.playerId || preference.player_id || ''),
    preference
  ]));
  const active = activePlayerIds(matches);
  const history = buildSmartQueueHistory(matches);
  const candidates = [];

  for (const mode of SMART_QUEUE_MODES) {
    const eligible = players
      .filter((player) => {
        const id = playerId(player);
        const preference = preferenceFor(player, preferenceMap);
        preferenceMap.set(id, preference);
        return id && !active.has(id) && preference.status === 'ready' && preference.modes.includes(mode);
      })
      .sort((left, right) => {
        const leftGames = history.games.get(playerId(left)) || 0;
        const rightGames = history.games.get(playerId(right)) || 0;
        const leftReady = new Date(preferenceMap.get(playerId(left)).readySince || 0).getTime() || 0;
        const rightReady = new Date(preferenceMap.get(playerId(right)).readySince || 0).getTime() || 0;
        return leftGames - rightGames || leftReady - rightReady || playerId(left).localeCompare(playerId(right));
      })
      .slice(0, candidateLimit);
    combinations(eligible, 4).forEach((group) => {
      const candidate = candidateForMode(group, mode, preferenceMap, history, Number(now));
      if (candidate) candidates.push(candidate);
    });
  }

  const best = candidates.sort(deterministicCandidateOrder)[0] || null;
  return {
    match: best,
    consideredGroups: candidates.length,
    eligibleCounts: Object.fromEntries(SMART_QUEUE_MODES.map((mode) => [mode, players.filter((player) => {
      const id = playerId(player);
      const preference = preferenceFor(player, preferenceMap);
      return id && !active.has(id) && preference.status === 'ready' && preference.modes.includes(mode);
    }).length])),
    playerLabel: playerName
  };
}

export function generateSmartQueueMatches({ players = [], preferences = [], matches = [], maxMatches = Infinity, now = Date.now(), candidateLimit = 20 } = {}) {
  const remaining = [...players];
  const generated = [];
  const assignedPlayerIds = new Set();
  let consideredGroups = 0;
  const limit = Math.max(0, Math.min(Math.floor(Number(maxMatches) || 0), Math.floor(remaining.length / 4)));

  while (generated.length < limit && remaining.length >= 4) {
    const result = generateSmartQueueMatch({ players: remaining, preferences, matches, now, candidateLimit });
    consideredGroups += result.consideredGroups;
    if (!result.match) break;
    generated.push(result.match);
    result.match.playerIds.forEach((id) => assignedPlayerIds.add(String(id)));
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (assignedPlayerIds.has(playerId(remaining[index]))) remaining.splice(index, 1);
    }
  }

  return {
    matches: generated,
    consideredGroups,
    assignedPlayerIds: [...assignedPlayerIds],
    remainingPlayerIds: remaining.map(playerId).filter(Boolean)
  };
}
