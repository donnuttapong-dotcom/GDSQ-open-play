export const DEFAULT_MATCHMAKING_RULES = {
  maxConsecutiveGames: 2,
  rotationConsecutiveGameLimit: 2,
  rotationConsecutiveRestLimit: 2,
  enforceAutoRest: true,
  enforceUniquePartners: true,
  separatePreviousWinningTeams: true,
  separatePreviousLosingTeams: true,
  maxConsecutiveWaitRounds: 2,
  minBalancePercent: 80,
  rotationHardPenalty: 20000,
  rotationHardBonus: 9000,
  candidateLimit: 24,
  candidatePlanLimit: 72,
  lowGamesWeight: 520,
  waitMinuteBonus: 12,
  neverPlayedBonus: 1400,
  freshPlayerBonus: 900,
  justPlayedPenalty: 1100,
  consecutivePenalty: 900,
  partnerRepeatPenalty: 110,
  opponentRepeatPenalty: 90,
  recentOpponentRepeatPenalty: 600,
  recentGroupRepeatPenalty: 5000,
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

function groupKey(players) {
  return players.map((player) => typeof player === 'string' ? player : playerId(player)).filter(Boolean).sort().join('|');
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
  const winningPartnerRepeats = new Map();
  const losingPartnerRepeats = new Map();
  const lastPlayedAt = new Map();
  const playedCount = new Map();
  const recentOpponentPairs = new Set();
  const recentGroupKeys = new Set();
  const waves = [];
  const syntheticStepMs = 240000;
  const syntheticBaseMs = 4102444800000;

  const sorted = history
    .map((match, index) => ({ match, index, time: matchTime(match, syntheticBaseMs - index * syntheticStepMs) }))
    .filter(({ match }) => shouldUseMatchInHistory(match))
    .sort((a, b) => b.time - a.time || a.index - b.index);

  for (const [historyIndex, item] of sorted.entries()) {
    const teamA = teamAOf(item.match);
    const teamB = teamBOf(item.match);
    const allPlayers = [...teamA, ...teamB];
    if (allPlayers.length < 4) continue;

    for (let i = 0; i < teamA.length; i += 1) for (let j = i + 1; j < teamA.length; j += 1) addPair(partnerRepeats, teamA[i], teamA[j]);
    for (let i = 0; i < teamB.length; i += 1) for (let j = i + 1; j < teamB.length; j += 1) addPair(partnerRepeats, teamB[i], teamB[j]);
    for (const a of teamA) for (const b of teamB) addPair(opponentRepeats, a, b);

    // The recent window is deliberately stricter than older history. It keeps
    // the same four people from being sent straight back onto a court together.
    if (historyIndex < 8) {
      recentGroupKeys.add(groupKey(allPlayers));
      for (const a of teamA) for (const b of teamB) recentOpponentPairs.add(pairKey(a, b));
    }

    const winner = matchWinner(item.match);
    const winningTeam = winner === 'A' ? teamA : winner === 'B' ? teamB : [];
    const losingTeam = winner === 'A' ? teamB : winner === 'B' ? teamA : [];
    for (let i = 0; i < winningTeam.length; i += 1) for (let j = i + 1; j < winningTeam.length; j += 1) addPair(winningPartnerRepeats, winningTeam[i], winningTeam[j]);
    for (let i = 0; i < losingTeam.length; i += 1) for (let j = i + 1; j < losingTeam.length; j += 1) addPair(losingPartnerRepeats, losingTeam[i], losingTeam[j]);

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

  return { partnerRepeats, opponentRepeats, winningPartnerRepeats, losingPartnerRepeats, recentOpponentPairs, recentGroupKeys, waves, lastPlayedAt, playedCount };
}

function matchWinner(match) {
  const winner = String(match?.winner || match?.winningTeam || match?.winning_team || '').trim().toUpperCase();
  if (winner === 'A' || winner === 'TEAM A') return 'A';
  if (winner === 'B' || winner === 'TEAM B') return 'B';
  const scoreA = Number(match?.teamAScore ?? match?.team_a_score);
  const scoreB = Number(match?.teamBScore ?? match?.team_b_score);
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB) || scoreA === scoreB) return '';
  return scoreA > scoreB ? 'A' : 'B';
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
      repeatScore += historyStats.recentOpponentPairs?.has(key) ? rules.recentOpponentRepeatPenalty : 0;
    }
  }
  const games = group.map((player) => getMatchesPlayed(player, historyStats));
  const spread = Math.max(...games) - Math.min(...games);
  return group.reduce((sum, player) => sum + playerPriorityScore(player, historyStats, rules, nowMs), 0) + repeatScore + spread * rules.groupGameSpreadPenalty;
}

function teamAverageLevel(team) {
  return team.reduce((sum, player) => sum + getLevel(player), 0) / team.length;
}

function balancePercent(teamA, teamB) {
  const gap = Math.abs(teamAverageLevel(teamA) - teamAverageLevel(teamB));
  return Math.max(0, Math.round(100 - Math.min(gap, 2.5) / 2.5 * 100));
}

function teamPairKey(team) {
  return pairKey(playerId(team[0]), playerId(team[1]));
}

function teamPairIsAllowed(team, historyStats, rules) {
  const key = teamPairKey(team);
  if (rules.enforceUniquePartners && (historyStats.partnerRepeats.get(key) || 0) > 0) return false;
  if (rules.separatePreviousWinningTeams && (historyStats.winningPartnerRepeats.get(key) || 0) > 0) return false;
  if (rules.separatePreviousLosingTeams && (historyStats.losingPartnerRepeats.get(key) || 0) > 0) return false;
  return true;
}

function pairingScore(teamA, teamB, historyStats, rules) {
  const levelGap = Math.abs(teamAverageLevel(teamA) - teamAverageLevel(teamB));
  const partnerRepeat = (historyStats.partnerRepeats.get(pairKey(playerId(teamA[0]), playerId(teamA[1]))) || 0) + (historyStats.partnerRepeats.get(pairKey(playerId(teamB[0]), playerId(teamB[1]))) || 0);
  let opponentRepeat = 0;
  for (const a of teamA) for (const b of teamB) {
    const key = pairKey(playerId(a), playerId(b));
    opponentRepeat += historyStats.opponentRepeats.get(key) || 0;
    if (historyStats.recentOpponentPairs?.has(key)) opponentRepeat += rules.recentOpponentRepeatPenalty / Math.max(1, rules.opponentRepeatPenalty);
  }
  const teamGameGap = Math.abs(teamA.reduce((sum, player) => sum + getMatchesPlayed(player, historyStats), 0) - teamB.reduce((sum, player) => sum + getMatchesPlayed(player, historyStats), 0));
  return levelGap * rules.levelGapPenalty + partnerRepeat * rules.partnerRepeatPenalty + opponentRepeat * rules.opponentRepeatPenalty + teamGameGap * rules.teamGameGapPenalty;
}

function bestTeamSplit(group, historyStats, rules) {
  const splits = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  let best = null;
  for (const [aIndexes, bIndexes] of splits) {
    const teamA = aIndexes.map((index) => group[index]);
    const teamB = bIndexes.map((index) => group[index]);
    const balance = balancePercent(teamA, teamB);
    if (balance < rules.minBalancePercent) continue;
    if (!teamPairIsAllowed(teamA, historyStats, rules) || !teamPairIsAllowed(teamB, historyStats, rules)) continue;
    const score = pairingScore(teamA, teamB, historyStats, rules);
    if (!best || score < best.score || (score === best.score && balance > best.balancePercent)) best = { teamA, teamB, score, balancePercent: balance };
  }
  return best;
}

export function generateMatches({ players = [], courts = [], history = [], rules = {}, now = Date.now() } = {}) {
  const mergedRules = { ...DEFAULT_MATCHMAKING_RULES, ...rules };
  const historyStats = buildMatchHistoryStats(history);
  const courtList = courts.length ? courts : [{ id: 'court-1', name: 'Court 1' }];
  const eligiblePlayers = players.filter((player) => player && ['ready', 'checked_in'].includes(normalizeStatus(player)));
  const proposedRestingPlayers = mergedRules.enforceAutoRest ? eligiblePlayers.filter((player) => shouldRest(player, historyStats, mergedRules)) : [];
  const proposedRestingIds = new Set(proposedRestingPlayers.map(playerId));
  const restedAvailablePlayers = eligiblePlayers.filter((player) => !proposedRestingIds.has(playerId(player)));
  // A rest rule must never stall an Open Play session. If it leaves fewer than
  // one full match, release the rest queue and let the fairness scoring choose.
  const canRestWithoutBlockingPlay = restedAvailablePlayers.length >= 4;
  const restingPlayers = canRestWithoutBlockingPlay ? proposedRestingPlayers : [];
  const availablePlayers = canRestWithoutBlockingPlay ? restedAvailablePlayers : eligiblePlayers;

  if (availablePlayers.length < 4) return { previews: [], restingPlayers, availablePlayers, reason: `Not enough eligible players. Need 4, got ${availablePlayers.length}.` };

  const waitedTooLong = availablePlayers.filter((player) => countConsecutiveRests(player, historyStats) >= mergedRules.maxConsecutiveWaitRounds);
  const waitLimitIds = new Set(waitedTooLong.map(playerId));
  let searchBudget = 1200;

  function candidatesForCourt(courtIndex, usedIds) {
    const court = courtList[courtIndex];
    const minLevel = Number.isFinite(Number(court?.minLevel)) ? Number(court.minLevel) : -Infinity;
    const maxLevel = Number.isFinite(Number(court?.maxLevel)) ? Number(court.maxLevel) : Infinity;
    const availableForCourt = availablePlayers.filter((player) => !usedIds.has(playerId(player)) && getLevel(player) >= minLevel && getLevel(player) <= maxLevel);
    if (availableForCourt.length < 4) return [];

    const remainingSlots = Math.min(availableForCourt.length, (courtList.length - courtIndex) * 4);
    const waitingForCourt = availableForCourt.filter((player) => waitLimitIds.has(playerId(player)));
    // Ensure every player who has sat out two completed rounds is placed before
    // the available court capacity runs out.
    const requiredWaitingPlayers = Math.min(4, Math.max(0, waitingForCourt.length - Math.max(0, remainingSlots - 4)));
    const priorityList = [...availableForCourt]
      .sort((a, b) => playerPriorityScore(a, historyStats, mergedRules, now) - playerPriorityScore(b, historyStats, mergedRules, now));
    const forcedCandidates = priorityList.filter((player) => waitLimitIds.has(playerId(player)));
    const shortlist = [...forcedCandidates, ...priorityList.filter((player) => !waitLimitIds.has(playerId(player)))]
      .slice(0, Math.max(mergedRules.candidateLimit, forcedCandidates.length));

    const evaluated = combinations(shortlist, 4)
      .filter((group) => group.filter((player) => waitLimitIds.has(playerId(player))).length >= requiredWaitingPlayers)
      .map((group) => {
        const split = bestTeamSplit(group, historyStats, mergedRules);
        return split ? { group, split, recentGroup: historyStats.recentGroupKeys?.has(groupKey(group)), score: groupScore(group, historyStats, mergedRules, now) + split.score + (historyStats.recentGroupKeys?.has(groupKey(group)) ? mergedRules.recentGroupRepeatPenalty : 0) } : null;
      })
      .filter(Boolean);
    // Do not repeat the same four-player court when another valid group exists.
    const noRecentGroup = evaluated.filter((candidate) => !candidate.recentGroup);
    return (noRecentGroup.length ? noRecentGroup : evaluated)
      .sort((a, b) => a.score - b.score)
      .slice(0, mergedRules.candidatePlanLimit);
  }

  function toPreview(court, candidate) {
    return {
      courtId: court.id || court.name,
      courtNumber: Number(court.courtNumber ?? court.court_number) || Number(String(court.id || court.name || '').match(/\d+/)?.[0]) || null,
      courtName: court.name || court.id,
      teamA: candidate.split.teamA,
      teamB: candidate.split.teamB,
      fairnessScore: Math.round(candidate.score),
      balancePercent: candidate.split.balancePercent,
      restBlockedCount: 0
    };
  }

  function planCourts(courtIndex, usedIds, planned) {
    const remainingPlayers = availablePlayers.filter((player) => !usedIds.has(playerId(player)));
    if (courtIndex >= courtList.length || remainingPlayers.length < 4 || searchBudget <= 0) return planned;
    const candidates = candidatesForCourt(courtIndex, usedIds);
    if (!candidates.length) return planned;

    let bestPlan = planned;
    const maximumPreviewCount = planned.length + Math.min(courtList.length - courtIndex, Math.floor(remainingPlayers.length / 4));
    for (const candidate of candidates) {
      if (searchBudget-- <= 0) break;
      const nextUsed = new Set(usedIds);
      candidate.group.forEach((player) => nextUsed.add(playerId(player)));
      const nextPlan = planCourts(courtIndex + 1, nextUsed, [...planned, toPreview(courtList[courtIndex], candidate)]);
      if (nextPlan.length > bestPlan.length || (nextPlan.length === bestPlan.length && nextPlan.reduce((sum, preview) => sum + preview.fairnessScore, 0) < bestPlan.reduce((sum, preview) => sum + preview.fairnessScore, 0))) bestPlan = nextPlan;
      if (bestPlan.length === maximumPreviewCount) return bestPlan;
    }
    return bestPlan;
  }

  const previews = planCourts(0, new Set(), []);
  const used = new Set(previews.flatMap((preview) => [...preview.teamA, ...preview.teamB].map(playerId)));

  const unservedWaitLimitPlayers = waitedTooLong.filter((player) => !used.has(playerId(player)));
  const reason = previews.length
    ? 'ok'
    : 'No court could be assigned without repeating partners or dropping below the 80% balance target.';
  return {
    previews,
    restingPlayers,
    availablePlayers,
    reason,
    constraints: {
      minBalancePercent: mergedRules.minBalancePercent,
      waitedTwoRounds: waitedTooLong.map(playerId),
      unservedWaitLimitPlayers: unservedWaitLimitPlayers.map(playerId)
    }
  };
}
