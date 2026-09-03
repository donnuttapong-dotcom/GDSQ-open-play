import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildMatchHistoryStats,
  effectiveWaitStartedAt,
  generateMatches,
  shouldRest
} from '../src/logic/matchmaking/generateMatches.js';

const now = new Date('2026-09-03T10:00:00+07:00').getTime();
const openplaySource = fs.readFileSync(new URL('../openplay.html', import.meta.url), 'utf8');

function player(id, { level = 3, status = 'ready', minutesWaited = 20, matchesPlayed = 0 } = {}) {
  return {
    id,
    name: id,
    level,
    status,
    matchesPlayed,
    queueJoinedAt: new Date(now - minutesWaited * 60000).toISOString()
  };
}

function match(id, teamA, teamB, minutesAgo, extra = {}) {
  return {
    id,
    status: 'confirmed',
    completedAt: new Date(now - minutesAgo * 60000).toISOString(),
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

function courts(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `court-${index + 1}`,
    name: `Court ${index + 1}`,
    courtNumber: index + 1
  }));
}

// A: READY means eligible even after every player completed two recent matches.
{
  const ids = ['ready-a', 'ready-b', 'ready-c', 'ready-d'];
  const history = [
    match('ready-latest', ['ready-a', 'ready-b'], ['ready-c', 'ready-d'], 1),
    match('ready-previous', ['ready-a', 'ready-b'], ['ready-c', 'ready-d'], 8)
  ];
  const result = generateMatches({ players: ids.map((id) => player(id)), courts: courts(1), history, now });

  assert.equal(result.previews.length, 1);
  assert.deepEqual(selectedIds(result).sort(), ids.sort());
  assert.deepEqual(result.restingPlayers, []);
  assert.deepEqual(result.autoRestCandidates, []);
  assert.equal(shouldRest(player('ready-a'), buildMatchHistoryStats(history)), false);
}

// B: Organizer Manual REST remains a hard exclusion.
{
  const result = generateMatches({
    players: [player('manual-rest', { status: 'resting' }), player('b'), player('c'), player('d')],
    courts: courts(1),
    now
  });
  assert.equal(result.previews.length, 0);
  assert.equal(selectedIds(result).includes('manual-rest'), false);
}

// C: WAIT storage variants remain hard exclusions.
{
  for (const status of ['rest', 'wait']) {
    const blockedId = `manual-${status}`;
    const result = generateMatches({
      players: [player(blockedId, { status }), player('b'), player('c'), player('d')],
      courts: courts(1),
      now
    });
    assert.equal(result.previews.length, 0);
    assert.equal(selectedIds(result).includes(blockedId), false);
  }
}

// D: PLAYING players are excluded while READY players use the free court.
{
  const playing = ['playing-a', 'playing-b', 'playing-c', 'playing-d'].map((id) => player(id, { status: 'playing' }));
  const ready = ['ready-e', 'ready-f', 'ready-g', 'ready-h'].map((id) => player(id));
  const result = generateMatches({ players: [...playing, ...ready], courts: courts(1), now });

  assert.equal(result.previews.length, 1);
  assert.deepEqual(selectedIds(result).sort(), ready.map((entry) => entry.id).sort());
}

// E: Preview and Up Next statuses are unavailable, and Organizer wiring reserves active rosters.
{
  const reserved = [
    player('preview-player', { status: 'preview' }),
    player('next-player', { status: 'queued_next' })
  ];
  const ready = ['ready-1', 'ready-2', 'ready-3', 'ready-4'].map((id) => player(id));
  const result = generateMatches({ players: [...reserved, ...ready], courts: courts(1), now });

  assert.deepEqual(selectedIds(result).sort(), ready.map((entry) => entry.id).sort());
  assert.match(openplaySource, /function reservedMatches\(\)\{return \[\.\.\.activeMatches\(\),\.\.\.nextMatches\(\)\];\}/);
  assert.match(openplaySource, /function activePlayerIds\(exceptId=['"]{2}\)[\s\S]*?reservedMatches\(\)/);
  assert.match(openplaySource, /function readyPlayers\(context=\{\}\)\{const active=context\.activeIds\|\|activePlayerIds\(\);return players\.filter\(p=>isReadyForMatch\(p\)&&!active\.has\(String\(p\.id\)\)\);\}/);
}

// F: a recently completed player loses selection priority to four longer-waiting players.
{
  const result = generateMatches({
    players: [player('recent', { minutesWaited: 60 }), ...['b', 'c', 'd', 'e'].map((id) => player(id, { minutesWaited: 20 }))],
    courts: courts(1),
    history: [match('recent-game', ['recent', 'ghost-1'], ['ghost-2', 'ghost-3'], 2)],
    now
  });

  assert.equal(result.previews.length, 1);
  assert.equal(selectedIds(result).includes('recent'), false);
}

// G: recently played is only a penalty; it cannot block the only valid READY four.
{
  const ids = ['recent', 'b', 'c', 'd'];
  const result = generateMatches({
    players: ids.map((id) => player(id)),
    courts: courts(1),
    history: [match('recent-game', ['recent', 'ghost-1'], ['ghost-2', 'ghost-3'], 2)],
    now
  });

  assert.equal(result.previews.length, 1);
  assert.deepEqual(selectedIds(result).sort(), ids.sort());
}

// H/I: the planner maximizes valid court use before comparing fairness scores.
{
  const eight = Array.from({ length: 8 }, (_, index) => player(`eight-${index + 1}`));
  const twelve = Array.from({ length: 12 }, (_, index) => player(`twelve-${index + 1}`));
  assert.equal(generateMatches({ players: eight, courts: courts(2), now }).previews.length, 2);
  assert.equal(generateMatches({ players: twelve, courts: courts(4), now }).previews.length, 3);
}

// J: one independently free court can generate while three courts remain busy.
{
  const playing = Array.from({ length: 12 }, (_, index) => player(`busy-${index + 1}`, { status: 'playing' }));
  const ready = Array.from({ length: 4 }, (_, index) => player(`waiting-${index + 1}`));
  const result = generateMatches({ players: [...playing, ...ready], courts: [courts(4)[0]], now });

  assert.equal(result.previews.length, 1);
  assert.equal(result.previews[0].courtNumber, 1);
  assert.deepEqual(selectedIds(result).sort(), ready.map((entry) => entry.id).sort());
}

// K: waiting time restarts at the most recent completion, not Event join time.
{
  const history = [
    match('a-latest', ['a', 'ghost-1'], ['ghost-2', 'ghost-3'], 2),
    match('b-latest', ['b', 'ghost-4'], ['ghost-5', 'ghost-6'], 20)
  ];
  const stats = buildMatchHistoryStats(history);
  const a = player('a', { minutesWaited: 60 });
  const b = player('b', { minutesWaited: 20 });

  assert.equal(effectiveWaitStartedAt(a, stats), now - 2 * 60000);
  assert.equal(effectiveWaitStartedAt(b, stats), now - 20 * 60000);
  assert.equal(effectiveWaitStartedAt(b, stats) < effectiveWaitStartedAt(a, stats), true);
}

// L: never-played players retain priority over a recent READY player.
{
  const neverPlayed = ['new-1', 'new-2', 'new-3', 'new-4'];
  const result = generateMatches({
    players: [player('recent'), ...neverPlayed.map((id) => player(id))],
    courts: courts(1),
    history: [match('recent-game', ['recent', 'ghost-1'], ['ghost-2', 'ghost-3'], 2)],
    now
  });
  assert.deepEqual(selectedIds(result).sort(), neverPlayed.sort());
}

// M/N: Manual Pick and STANDARD Up Next both use the same hard-eligible READY pool.
{
  assert.match(openplaySource, /function manualAvailablePlayers\(context=createOrganizerRenderContext\(\)\)\{return smartQueueUi\.isSmartEvent\(\)\?players\.filter[\s\S]*?:readyPlayers\(context\);\}/);
  assert.match(openplaySource, /function generateNextForCourt\(live\)[\s\S]*?generateMatches\(\{players:context\.ready,courts:\[court\],history:matches,rules\}\)/);
  assert.match(openplaySource, /function nextPlayerOptions\(next,slot\)[\s\S]*?isReadyForMatch\(player\)&&!busy\.has\(id\)&&!picked\.has\(id\)/);
  assert.doesNotMatch(openplaySource, /autoRestBlockedIds\(|setAutoRestOverride\(|clearAutoRestOverrides\(/);
}

function pairKey(a, b) {
  return [a, b].sort().join('|');
}

function runSimulation(totalPlayers, courtCount, matchTarget) {
  const roster = Array.from({ length: totalPlayers }, (_, index) => player(`sim-${totalPlayers}-${index + 1}`, { minutesWaited: totalPlayers - index }));
  roster[roster.length - 2].status = 'resting';
  roster[roster.length - 1].status = 'rest';
  const blockedIds = new Set(roster.slice(-2).map((entry) => entry.id));
  const games = new Map(roster.map((entry) => [entry.id, 0]));
  const history = [];
  const active = new Map();
  let clock = now;
  let generated = 0;
  let failedGenerateAttempts = 0;
  let completionCount = 0;

  const currentPlayers = () => {
    const activeIds = new Set([...active.values()].flatMap((entry) => entry.ids));
    return roster.map((entry) => ({
      ...entry,
      status: blockedIds.has(entry.id) ? entry.status : activeIds.has(entry.id) ? 'playing' : 'ready',
      matchesPlayed: games.get(entry.id)
    }));
  };

  const schedule = (preview, sequence) => {
    const ids = [...preview.teamA, ...preview.teamB].map((entry) => entry.id);
    assert.equal(ids.some((id) => blockedIds.has(id)), false);
    const activeIds = new Set([...active.values()].flatMap((entry) => entry.ids));
    assert.equal(ids.some((id) => activeIds.has(id)), false);
    const durationMinutes = 10 + ((sequence * 7 + Number(preview.courtNumber || 1) * 3) % 11);
    active.set(String(preview.courtId), { preview, ids, finishesAt: clock + durationMinutes * 60000 });
    generated += 1;
  };

  const initial = generateMatches({ players: currentPlayers(), courts: courts(courtCount), history, now: clock });
  const initialMaximum = Math.min(courtCount, Math.floor((totalPlayers - blockedIds.size) / 4));
  assert.equal(initial.previews.length, initialMaximum);
  initial.previews.forEach((preview, index) => schedule(preview, index));

  while (completionCount < matchTarget) {
    const [courtId, completed] = [...active.entries()].sort((a, b) => a[1].finishesAt - b[1].finishesAt)[0] || [];
    assert.ok(completed, 'At least one court must remain active during the simulation');
    clock = completed.finishesAt;
    active.delete(courtId);
    completed.ids.forEach((id) => games.set(id, games.get(id) + 1));
    history.push({
      id: `simulation-${totalPlayers}-${completionCount + 1}`,
      status: 'confirmed',
      completedAt: new Date(clock).toISOString(),
      teamA: completed.preview.teamA.map((entry) => entry.id),
      teamB: completed.preview.teamB.map((entry) => entry.id),
      winner: completionCount % 2 === 0 ? 'A' : 'B'
    });
    completionCount += 1;

    const freeCourt = courts(courtCount).find((court) => court.id === courtId);
    const result = generateMatches({ players: currentPlayers(), courts: [freeCourt], history, now: clock });
    const readyCount = currentPlayers().filter((entry) => entry.status === 'ready').length;
    if (readyCount >= 4 && !result.previews.length) failedGenerateAttempts += 1;
    if (result.previews[0]) schedule(result.previews[0], completionCount);

    const activeIds = [...active.values()].flatMap((entry) => entry.ids);
    assert.equal(new Set(activeIds).size, activeIds.length);
  }

  const eligibleGameCounts = roster.filter((entry) => !blockedIds.has(entry.id)).map((entry) => games.get(entry.id));
  const partnerCounts = new Map();
  const opponentCounts = new Map();
  history.forEach((entry) => {
    for (const team of [entry.teamA, entry.teamB]) partnerCounts.set(pairKey(team[0], team[1]), (partnerCounts.get(pairKey(team[0], team[1])) || 0) + 1);
    for (const a of entry.teamA) for (const b of entry.teamB) opponentCounts.set(pairKey(a, b), (opponentCounts.get(pairKey(a, b)) || 0) + 1);
  });

  return {
    completed: completionCount,
    generated,
    failedGenerateAttempts,
    gameSpread: Math.max(...eligibleGameCounts) - Math.min(...eligibleGameCounts),
    maxPartnerRepeats: Math.max(0, ...partnerCounts.values()),
    maxOpponentRepeats: Math.max(0, ...opponentCounts.values())
  };
}

// Realistic simulation: 60 independent, staggered completions across all court sizes.
{
  const reports = [
    runSimulation(16, 2, 15),
    runSimulation(20, 3, 15),
    runSimulation(24, 4, 15),
    runSimulation(28, 4, 15)
  ];
  assert.equal(reports.reduce((sum, report) => sum + report.completed, 0), 60);
  assert.equal(reports.every((report) => report.failedGenerateAttempts === 0), true);
  assert.equal(reports.every((report) => report.gameSpread <= 3), true);
  assert.equal(reports.every((report) => report.maxPartnerRepeats === 1), true);
  console.log('STANDARD READY simulation:', JSON.stringify(reports));
}

console.log('STANDARD READY-based rotation tests passed.');
