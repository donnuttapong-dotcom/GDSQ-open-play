import assert from 'node:assert/strict';
import {
  buildMatchHistoryStats,
  countConsecutiveGames,
  generateMatches,
  shouldRest
} from '../src/logic/matchmaking/generateMatches.js';

const now = new Date('2026-09-03T10:00:00+07:00').getTime();

function player(id, level = 3, status = 'ready', minutesWaited = 0, matchesPlayed = 0) {
  return {
    id,
    name: id,
    level,
    status,
    matchesPlayed,
    queueJoinedAt: new Date(now - minutesWaited * 60000).toISOString()
  };
}

function match(id, teamA, teamB, secondsAgo, extra = {}) {
  return {
    id,
    status: 'confirmed',
    completedAt: new Date(now - secondsAgo * 1000).toISOString(),
    teamA,
    teamB,
    ...extra
  };
}

function selectedIds(result) {
  return result.previews
    .flatMap((preview) => [...preview.teamA, ...preview.teamB])
    .map((entry) => entry.id);
}

function teamContainsPair(preview, firstId, secondId) {
  return [preview.teamA, preview.teamB].some((team) => {
    const ids = team.map((entry) => entry.id);
    return ids.includes(firstId) && ids.includes(secondId);
  });
}

function consecutiveHistory(ids, prefix = 'rotation') {
  return [
    match(`${prefix}-latest`, [ids[0], ids[1]], [ids[2], ids[3]], 60),
    match(`${prefix}-previous`, [ids[0], ids[1]], [ids[2], ids[3]], 120)
  ];
}

// A: non-Auto-Rest players fill all possible courts before soft-rest players.
{
  const autoRestIds = ['auto-a', 'auto-b', 'auto-c', 'auto-d'];
  const normalIds = Array.from({ length: 8 }, (_, index) => `normal-${index + 1}`);
  const result = generateMatches({
    players: [...autoRestIds, ...normalIds].map((id) => player(id)),
    courts: [{ id: 'court-1' }, { id: 'court-2' }, { id: 'court-3' }, { id: 'court-4' }],
    history: consecutiveHistory(autoRestIds),
    now
  });

  assert.equal(result.previews.length, 2);
  assert.equal(result.autoRestFallbackUsed, false);
  assert.deepEqual(selectedIds(result).sort(), normalIds.sort());
  assert.deepEqual(result.restingPlayers.map((entry) => entry.id).sort(), autoRestIds.sort());
}

// B: retry with an Auto Rest player when the preferred four cannot meet balance.
{
  const result = generateMatches({
    players: [
      player('auto', 4),
      player('normal-1', 2),
      player('normal-2', 2),
      player('normal-3', 2),
      player('normal-4', 4)
    ],
    courts: [{ id: 'court-1' }],
    history: consecutiveHistory(['auto', 'ghost-1', 'ghost-2', 'ghost-3']),
    now
  });

  assert.equal(result.previews.length, 1);
  assert.equal(result.autoRestFallbackUsed, true);
  assert.deepEqual(result.autoRestUsed, ['auto']);
  assert.equal(selectedIds(result).includes('auto'), true);
  assert.equal(result.previews[0].balancePercent >= 80, true);
}

// C: Organizer Manual REST remains a hard exclusion.
{
  const result = generateMatches({
    players: [player('manual-rest', 3, 'resting'), player('ready-1'), player('ready-2'), player('ready-3')],
    courts: [{ id: 'court-1' }],
    history: [],
    now
  });

  assert.equal(result.previews.length, 0);
  assert.equal(selectedIds(result).includes('manual-rest'), false);
}

// D: WAIT storage variants remain hard exclusions.
{
  for (const status of ['rest', 'wait']) {
    const result = generateMatches({
      players: [player(`manual-${status}`, 3, status), player('ready-1'), player('ready-2'), player('ready-3')],
      courts: [{ id: 'court-1' }],
      history: [],
      now
    });
    assert.equal(result.previews.length, 0);
    assert.equal(selectedIds(result).includes(`manual-${status}`), false);
  }
}

// E: the caller can pass the single free court while other-court players are busy.
{
  const busy = Array.from({ length: 12 }, (_, index) => player(`busy-${index + 1}`, 3, 'playing'));
  const waiting = Array.from({ length: 6 }, (_, index) => player(`waiting-${index + 1}`));
  const result = generateMatches({
    players: [...busy, ...waiting],
    courts: [{ id: 'court-1', courtNumber: 1 }],
    history: [],
    now
  });

  assert.equal(result.previews.length, 1);
  assert.equal(result.previews[0].courtNumber, 1);
  assert.equal(selectedIds(result).some((id) => id.startsWith('busy-')), false);
}

// F: staggered completions remain six actual match opportunities, not one wave.
{
  const history = [0, 50, 100, 150, 200, 250].map((secondsAgo, index) => {
    const ids = index < 2 ? ['streak', `a-${index}`, `b-${index}`, `c-${index}`] : [`d-${index}`, `e-${index}`, `f-${index}`, `g-${index}`];
    return match(`staggered-${index}`, ids.slice(0, 2), ids.slice(2), secondsAgo);
  });
  const stats = buildMatchHistoryStats(history);

  assert.equal(stats.matchSequence.length, 6);
  assert.equal(stats.waves.length, 6);
  assert.equal(countConsecutiveGames(player('streak'), stats), 2);
  assert.equal(shouldRest(player('streak'), stats), true);
}

// G: one later completed match without the player serves the Auto Rest obligation.
{
  const history = consecutiveHistory(['rest-release', 'ghost-1', 'ghost-2', 'ghost-3']);
  assert.equal(shouldRest(player('rest-release'), buildMatchHistoryStats(history)), true);

  history.push(match('sat-out-opportunity', ['other-1', 'other-2'], ['other-3', 'other-4'], 30));
  assert.equal(shouldRest(player('rest-release'), buildMatchHistoryStats(history)), false);
}

// H: fewer than four non-rest players may be supplemented from Auto Rest.
{
  const autoRestIds = ['auto-1', 'auto-2', 'auto-3'];
  const result = generateMatches({
    players: [...autoRestIds, 'normal-1', 'normal-2', 'normal-3'].map((id) => player(id)),
    courts: [{ id: 'court-1' }],
    history: consecutiveHistory(['auto-1', 'auto-2', 'auto-3', 'ghost']),
    now
  });

  assert.equal(result.previews.length, 1);
  assert.equal(result.autoRestFallbackUsed, true);
  assert.equal(result.autoRestUsed.length >= 1, true);
}

// I: fallback relaxes only Auto Rest; partner and balance rules remain enforced.
{
  const history = [
    match('latest-partner', ['auto', 'normal-1'], ['ghost-1', 'ghost-2'], 60, { winner: 'A' }),
    match('previous-auto', ['auto', 'ghost-3'], ['ghost-4', 'ghost-5'], 120, { winner: 'B' })
  ];
  const result = generateMatches({
    players: [
      player('auto', 4),
      player('normal-1', 2),
      player('normal-2', 2),
      player('normal-3', 2),
      player('normal-4', 4)
    ],
    courts: [{ id: 'court-1' }],
    history,
    now
  });

  assert.equal(result.previews.length, 1);
  assert.equal(result.autoRestFallbackUsed, true);
  assert.equal(result.previews[0].balancePercent >= 80, true);
  assert.equal(teamContainsPair(result.previews[0], 'auto', 'normal-1'), false);
}

// Realistic rotation: 24 players, four courts, staggered completion times.
{
  const players = Array.from({ length: 24 }, (_, index) => player(`sim-${index + 1}`, 3, 'ready', 20));
  const history = [];
  const games = new Map(players.map((entry) => [entry.id, 0]));
  const sitStreaks = new Map(players.map((entry) => [entry.id, 0]));
  let maxSitStreak = 0;
  let failedGenerateAttempts = 0;
  let fallbackUses = 0;

  for (let round = 0; round < 6; round += 1) {
    const roundNow = now + round * 10 * 60000;
    const result = generateMatches({
      players: players.map((entry) => ({ ...entry, matchesPlayed: games.get(entry.id) })),
      courts: Array.from({ length: 4 }, (_, index) => ({ id: `court-${index + 1}`, courtNumber: index + 1 })),
      history,
      now: roundNow
    });

    if (result.previews.length !== 4) failedGenerateAttempts += 1;
    if (result.autoRestFallbackUsed) fallbackUses += 1;
    const playing = new Set(selectedIds(result));
    for (const entry of players) {
      if (playing.has(entry.id)) {
        games.set(entry.id, games.get(entry.id) + 1);
        sitStreaks.set(entry.id, 0);
      } else {
        const nextSitStreak = sitStreaks.get(entry.id) + 1;
        sitStreaks.set(entry.id, nextSitStreak);
        maxSitStreak = Math.max(maxSitStreak, nextSitStreak);
      }
    }

    result.previews.forEach((preview, courtIndex) => {
      history.push({
        id: `simulation-${round + 1}-${courtIndex + 1}`,
        status: 'confirmed',
        completedAt: new Date(roundNow + courtIndex * 50000).toISOString(),
        teamA: preview.teamA.map((entry) => entry.id),
        teamB: preview.teamB.map((entry) => entry.id),
        winner: courtIndex % 2 === 0 ? 'A' : 'B'
      });
    });
  }

  const gameCounts = [...games.values()];
  assert.equal(failedGenerateAttempts, 0);
  assert.equal(Math.max(...gameCounts) - Math.min(...gameCounts) <= 2, true);
  assert.equal(maxSitStreak <= 2, true);
  assert.equal(fallbackUses >= 0, true);
}

console.log('STANDARD Auto Rest regression tests passed.');
