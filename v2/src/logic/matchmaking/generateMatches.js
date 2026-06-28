export const DEFAULT_MATCHMAKING_RULES = {
  maxConsecutiveGames: 999,
  rotationConsecutiveGameLimit: 2,
  rotationConsecutiveRestLimit: 2,
  enforceAutoRest: false,
  rotationHardPenalty: 20000,
  rotationHardBonus: 9000,
  candidateLimit: 16,
  lowGamesWeight: 260,
  waitMinuteBonus: 12,
  neverPlayedBonus: 1400,
  freshPlayerBonus: 900,
  justPlayedPenalty: 1100,
  consecutivePenalty: 900,
  partnerRepeatPenalty: 110,
  opponentRepeatPenalty: 36,
  levelGapPenalty: 80,
  teamGameGapPenalty: 12,
  groupGameSpreadPenalty: 120
};

function toTime(value) {
  const t = new Date(value || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function matchTime(match, fallbackTime = 0) {
  return toTime(
    match?.completedAt || match?.completed_at ||
    match?.confirmedAt || match?.confirmed_at ||
    match?.endedAt || match?.ended_at ||
    match?.updatedAt || match?.updated_at ||
    match?.startedAt || match?.started_at ||
    match?.createdAt || match?.created_at
  ) || fallbackTime;
}

function playerId(player) {
  return String(player?.id || player?.eventPlayerId || player?.event_player_id || '');
}

function pairKey(a, b) {
  return [String(a), String(b)].sort().join('|');
}

function addPair(map, a, b, count = 1) {
  if (!a || !b || String(a) === String(b)) return;
  const key = pairKey(a, b);
  map.set(key, (map.get(key) || 0) + count);
}

function normalizeTeamIds(team) {
  return (team || [])
    .map((item) => (typeof item === 'string' ? item : item?.id || item?.playerId || item?.eventPlayerId || item?.event_player_id))
    .filter(Boolean)
    .map(String);
}

function teamAOf(match) {
  return normalizeTeamIds(match?.teamA || match?.team_a || match?.A || match?.teams?.A);
}

function teamBOf(match) {
  return normalizeTeamIds(match?.teamB || match?.team_b || match?.B || match?.teams?.B);
}

function normalizeStatus(item) {
  return String(item?.status || 'ready').toLowerCase();
}

function getLevel(player) {
  return Number(player?.level ?? player?.estimated_level ?? player?.estimatedLevel ?? 2.5) || 2.5;
}

function getQueueJoinedAt(player) {
  return toTime(player?.queueJoinedAt || player?.queue_joined_at || player?.createdAt || player?.created_at);
}

function getMatchesPlayed(player, historyStats) {
  const id = playerId(player);
  if (historyStats?.playedCount?.has(id)) return Number(historyStats.playedCount.get(id)) || 0;
  return Number(player?.matchesPlayed ?? player?.matches_played ?? player?.played ?? 0) || 0;
}

function shouldUseMatchInHistory(match) {
  return !['cancelled', 'canceled', 'deleted', 'removed', 'void', 'draft', 'preview'].includes(normalizeStatus(match));
}

export function buildMatchHistoryStats(history = []) {
  const partnerRepeats = new Map();
  const opponentRepeats = new Map();
  const lastPlayedAt = new Map();
  const playedCount = new Map();
  const waves = [];
  const syntheticStepMs = 240000;
  const syntheticBaseMs = 4102444800000;

  const sorted = history
    .map((match, index) => ({ match, index, time: matchTime(match, syntheticBaseMs - index * syntheticStepMs) }))
    .filter(({ match }) => shouldUseMatchInHistory(match))
    .sort((a, b) => b.time - a.time || a.index - b.index);

  for (const item of sorted) {
    const teamA = teamAOf(item.match);
    const teamB = teamBOf(item.match);
    const allPlayers = [...teamA, ...teamB];
    if (allPlayers.length < 4) continue;

    for (let i = 0; i < teamA.length; i += 1) for (let j = i + 1; j < teamA.length; j += 1) addPair(partnerRepeats, teamA[i], teamA[j]);
    for (let i = 0; i < teamB.length; i += 1) for (let j = i + 1; j < teamB.length; j += 1) addPair(partnerRepeats, teamB[i], teamB[j]);
    for (const a of teamA) for (const b of teamB) addPair(opponentRepeats, a, b);

    allPlayers.forEach((id) => {
      const sid = String(id);
      playedCount.set(sid, (playedCount.get(sid) || 0) + 1);
      if (!lastPlayedAt.has(sid) || item.time > lastPlayedAt.get(sid)) lastPlayedAt.set(sid, item.time);
    });

    let wave = waves[waves.length - 1];
    if (!wave || Math.abs(wave.time - item.time) > 180000) {
      wave = { time: item.time, playerIds: new Set() };
      waves.push(wave);
    }
    allPlayers.forEach((id) => wave.playerIds.add(String(id)));
  }

  return { partnerRepeats, opponentRepeats, waves, lastPlayedAt, playedCount };
}

export function countConsecutiveGames(player, historyStats) {
  const id = playerId(player);
  let count = 0;
  for (const wave of historyStats?.waves || []) {
    if (wave.playerIds.has(id)) count += 1;
    else break;
  }
  return count;
}

function countConsecutiveRests(player, historyStats) {
  const id = playerId(player);
  const joinedAt = getQueueJoinedAt(player);
  let count = 0;
  for (const wave of historyStats?.waves || []) {
    if (joinedAt && joinedAt > wave.time + 60000) continue;
    if (wave.playerIds.has(id)) break;
    count += 1;
  }
  return count;
}

export function shouldRest(player, historyStats = { waves: [] }, rules = {}) {
  const mergedRules = { ...DEFAULT_MATCHMAKING_RULES, ...rules };
  if (mergedRules.enforceAutoRest !== true) return false;
  const limit = Math.max(1, Number(mergedRules.rotationConsecutiveGameLimit || 2));
  return countConsecutiveGames(player, historyStats) >= limit;
}

function minutesSinceLastPlayed(player, historyStats, nowMs) {
  const last = historyStats.lastPlayedAt?.get(playerId(player));
  if (!last) return Infinity;
  return Math.max(0, (nowMs - last) / 60000);
}

function playerPriorityScore(player, historyStats, rules, nowMs) {
  const id = playerId(player);
  const games = getMatchesPlayed(player, historyStats);
  const waitMinutes = Math.max(0, (nowMs - getQueueJoinedAt(player)) / 60000);
  const consecutive = countConsecutiveGames(player, historyStats);
  const rests = countConsecutiveRests(player, historyStats);
  const readyBonus = ['ready', 'checked_in'].includes(normalizeStatus(player)) ? -20 : 0;
  const neverPlayedBonus = games === 0 ? rules.neverPlayedBonus : 0;
  const freshPlayerBonus = !historyStats.lastPlayedAt?.has(id) ? rules.freshPlayerBonus : 0;
  const justPlayedPenalty = minutesSinceLastPlayed(player, historyStats, nowMs) < 12 ? rules.justPlayedPenalty : 0;
  const mustRestPenalty = consecutive >= rules.rotationConsecutiveGameLimit ? rules.rotationHardPenalty : 0;
  const mustPlayBonus = rests >= rules.rotationConsecutiveRestLimit ? rules.rotationHardBonus : 0;

  return games * rules.lowGamesWeight + consecutive * rules.consecutivePenalty + justPlayedPenalty + mustRestPenalty + readyBonus - mustPlayBonus - neverPlayedBonus - freshPlayerBonus - waitMinutes * rules.waitMinuteBonus;
}

function combinations(list, size) {
  const out = [];
  const walk = (start, combo) => {
    if (combo.length === size) return out.push([...combo]);
    for (let i = start; i < list.length; i += 1) {
      combo.push(list[i]);
      walk(i + 1, combo);
      combo.pop();
    }
  };
  walk(0, []);
  return out;
}

function groupScore(group, historyStats, rules, nowMs) {
  let repeatScore = 0;
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      const key = pairKey(playerId(group[i]), playerId(group[j]));
      repeatScore += (historyStats.partnerRepeats.get(key) || 0) * 14;
      repeatScore += (historyStats.opponentRepeats.get(key) || 0) * 5;
    }
  }
  const games = group.map((player) => getMatchesPlayed(player, historyStats));
  const spread = Math.max(...games) - Math.min(...games);
  return group.reduce((sum, player) => sum + playerPriorityScore(player, historyStats, rules, nowMs), 0) + repeatScore + spread * rules.groupGameSpreadPenalty;
}

function teamAverageLevel(team) {
  return team.reduce((sum, player) => sum + getLevel(player), 0) / team.length;
}

function pairingScore(teamA, teamB, historyStats, rules) {
  const levelGap = Math.abs(teamAverageLevel(teamA) - teamAverageLevel(teamB));
  const partnerRepeat = (historyStats.partnerRepeats.get(pairKey(playerId(teamA[0]), playerId(teamA[1]))) || 0) + (historyStats.partnerRepeats.get(pairKey(playerId(teamB[0]), playerId(teamB[1]))) || 0);
  let opponentRepeat = 0;
  for (const a of teamA) for (const b of teamB) opponentRepeat += historyStats.opponentRepeats.get(pairKey(playerId(a), playerId(b))) || 0;
  const teamGameGap = Math.abs(teamA.reduce((sum, player) => sum + getMatchesPlayed(player, historyStats), 0) - teamB.reduce((sum, player) => sum + getMatchesPlayed(player, historyStats), 0));
  return levelGap * rules.levelGapPenalty + partnerRepeat * rules.partnerRepeatPenalty + opponentRepeat * rules.opponentRepeatPenalty + teamGameGap * rules.teamGameGapPenalty;
}

function bestTeamSplit(group, historyStats, rules) {
  const splits = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  let best = null;
  for (const [aIndexes, bIndexes] of splits) {
    const teamA = aIndexes.map((index) => group[index]);
    const teamB = bIndexes.map((index) => group[index]);
    const score = pairingScore(teamA, teamB, historyStats, rules);
    if (!best || score < best.score) best = { teamA, teamB, score };
  }
  return best;
}

export function generateMatches({ players = [], courts = [], history = [], rules = {}, now = Date.now() } = {}) {
  const mergedRules = { ...DEFAULT_MATCHMAKING_RULES, ...rules };
  const historyStats = buildMatchHistoryStats(history);
  const courtList = courts.length ? courts : [{ id: 'court-1', name: 'Court 1' }];
  const availablePlayers = players.filter((player) => player && !['playing', 'left', 'removed'].includes(normalizeStatus(player)));
  const restingPlayers = [];

  if (availablePlayers.length < 4) return { previews: [], restingPlayers, availablePlayers, reason: `Not enough eligible players. Need 4, got ${availablePlayers.length}.` };

  const used = new Set();
  const previews = [];

  for (const court of courtList) {
    const availableForCourt = availablePlayers.filter((player) => !used.has(playerId(player)));
    if (availableForCourt.length < 4) break;

    const shortlist = [...availableForCourt]
      .sort((a, b) => playerPriorityScore(a, historyStats, mergedRules, now) - playerPriorityScore(b, historyStats, mergedRules, now))
      .slice(0, mergedRules.candidateLimit);

    let bestGroup = null;
    for (const group of combinations(shortlist, 4)) {
      const score = groupScore(group, historyStats, mergedRules, now);
      if (!bestGroup || score < bestGroup.score) bestGroup = { group, score };
    }

    if (!bestGroup) break;
    const split = bestTeamSplit(bestGroup.group, historyStats, mergedRules);
    bestGroup.group.forEach((player) => used.add(playerId(player)));

    previews.push({
      courtId: court.id || court.name,
      courtName: court.name || court.id,
      teamA: split.teamA,
      teamB: split.teamB,
      fairnessScore: Math.round(bestGroup.score + split.score),
      restBlockedCount: 0
    });
  }

  return { previews, restingPlayers, availablePlayers, reason: previews.length ? 'ok' : 'No court could be assigned.' };
}
