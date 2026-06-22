export const DEFAULT_MATCHMAKING_RULES = {
  maxConsecutiveGames: 2,
  candidateLimit: 10,
  lowGamesWeight: 120,
  waitMinuteBonus: 2,
  consecutivePenalty: 55,
  partnerRepeatPenalty: 90,
  opponentRepeatPenalty: 24,
  levelGapPenalty: 80,
  teamGameGapPenalty: 12,
  groupGameSpreadPenalty: 38
};

function toTime(value) {
  const t = new Date(value || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function playerId(player) {
  return String(player?.id || '');
}

function pairKey(a, b) {
  return [String(a), String(b)].sort().join('|');
}

function addPair(map, a, b, count = 1) {
  if (!a || !b || String(a) === String(b)) return;
  const key = pairKey(a, b);
  map.set(key, (map.get(key) || 0) + count);
}

function getMatchesPlayed(player) {
  return Number(player?.matchesPlayed ?? player?.matches_played ?? 0) || 0;
}

function getLevel(player) {
  return Number(player?.level ?? player?.estimated_level ?? 2.5) || 2.5;
}

function getQueueJoinedAt(player) {
  return toTime(player?.queueJoinedAt || player?.queue_joined_at || player?.created_at);
}

function normalizeTeamIds(team) {
  return (team || []).map((item) => (typeof item === 'string' ? item : item?.id || item?.playerId || item?.eventPlayerId)).filter(Boolean).map(String);
}

export function buildMatchHistoryStats(history = []) {
  const partnerRepeats = new Map();
  const opponentRepeats = new Map();
  const waves = [];

  const sorted = [...history].sort((a, b) => toTime(b.completedAt || b.completed_at || b.startedAt || b.createdAt) - toTime(a.completedAt || a.completed_at || a.startedAt || a.createdAt));

  for (const match of sorted) {
    const time = toTime(match.completedAt || match.completed_at || match.startedAt || match.createdAt);
    const teamA = normalizeTeamIds(match.teamA || match.A || match.teams?.A);
    const teamB = normalizeTeamIds(match.teamB || match.B || match.teams?.B);

    for (let i = 0; i < teamA.length; i += 1) {
      for (let j = i + 1; j < teamA.length; j += 1) addPair(partnerRepeats, teamA[i], teamA[j]);
    }
    for (let i = 0; i < teamB.length; i += 1) {
      for (let j = i + 1; j < teamB.length; j += 1) addPair(partnerRepeats, teamB[i], teamB[j]);
    }
    for (const a of teamA) for (const b of teamB) addPair(opponentRepeats, a, b);

    let wave = waves[waves.length - 1];
    if (!wave || Math.abs(wave.time - time) > 180000) {
      wave = { time, playerIds: new Set() };
      waves.push(wave);
    }
    [...teamA, ...teamB].forEach((id) => wave.playerIds.add(String(id)));
  }

  return { partnerRepeats, opponentRepeats, waves };
}

export function countConsecutiveGames(player, historyStats) {
  const id = playerId(player);
  let count = 0;
  for (const wave of historyStats.waves || []) {
    if (wave.playerIds.has(id)) count += 1;
    else break;
  }
  return count;
}

export function shouldRest(player, historyStats, rules = DEFAULT_MATCHMAKING_RULES) {
  return countConsecutiveGames(player, historyStats) >= rules.maxConsecutiveGames;
}

function playerPriorityScore(player, historyStats, rules, nowMs) {
  const games = getMatchesPlayed(player);
  const waitMinutes = Math.max(0, (nowMs - getQueueJoinedAt(player)) / 60000);
  const consecutive = countConsecutiveGames(player, historyStats);
  const readyBonus = player?.status === 'ready' ? -10 : 0;

  return (
    games * rules.lowGamesWeight +
    consecutive * rules.consecutivePenalty +
    readyBonus -
    waitMinutes * rules.waitMinuteBonus
  );
}

function combinations(list, size) {
  const out = [];
  const walk = (start, combo) => {
    if (combo.length === size) {
      out.push([...combo]);
      return;
    }
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
      repeatScore += (historyStats.partnerRepeats.get(key) || 0) * 12;
      repeatScore += (historyStats.opponentRepeats.get(key) || 0) * 3;
    }
  }

  const games = group.map(getMatchesPlayed);
  const gameSpread = Math.max(...games) - Math.min(...games);

  return (
    group.reduce((sum, player) => sum + playerPriorityScore(player, historyStats, rules, nowMs), 0) +
    repeatScore +
    gameSpread * rules.groupGameSpreadPenalty
  );
}

function teamAverageLevel(team) {
  return team.reduce((sum, player) => sum + getLevel(player), 0) / team.length;
}

function pairingScore(teamA, teamB, historyStats, rules) {
  const levelGap = Math.abs(teamAverageLevel(teamA) - teamAverageLevel(teamB));
  const partnerRepeat =
    (historyStats.partnerRepeats.get(pairKey(playerId(teamA[0]), playerId(teamA[1]))) || 0) +
    (historyStats.partnerRepeats.get(pairKey(playerId(teamB[0]), playerId(teamB[1]))) || 0);
  let opponentRepeat = 0;
  for (const a of teamA) {
    for (const b of teamB) opponentRepeat += historyStats.opponentRepeats.get(pairKey(playerId(a), playerId(b))) || 0;
  }
  const teamGameGap = Math.abs(
    teamA.reduce((sum, player) => sum + getMatchesPlayed(player), 0) -
      teamB.reduce((sum, player) => sum + getMatchesPlayed(player), 0)
  );

  return (
    levelGap * rules.levelGapPenalty +
    partnerRepeat * rules.partnerRepeatPenalty +
    opponentRepeat * rules.opponentRepeatPenalty +
    teamGameGap * rules.teamGameGapPenalty
  );
}

function bestTeamSplit(group, historyStats, rules) {
  const splits = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]]
  ];
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
  const eligiblePlayers = players.filter((player) => player && player.status !== 'playing' && player.status !== 'left' && player.status !== 'removed');
  const restingPlayers = eligiblePlayers.filter((player) => shouldRest(player, historyStats, mergedRules));
  const availablePlayers = eligiblePlayers.filter((player) => !shouldRest(player, historyStats, mergedRules));

  if (availablePlayers.length < 4) {
    return {
      previews: [],
      restingPlayers,
      availablePlayers,
      reason: `Not enough eligible players. Need 4, got ${availablePlayers.length}.`
    };
  }

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
      restBlockedCount: restingPlayers.length
    });
  }

  return {
    previews,
    restingPlayers,
    availablePlayers,
    reason: previews.length ? 'ok' : 'No court could be assigned.'
  };
}
