import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateMatches } from '../src/logic/matchmaking/generateMatches.js';
import {
  buildMatchMakingCourtProfile,
  chooseBalancedSmartQueueTeams,
  generateMatchMakingCourtMatches,
  matchMakingLevelRole
} from '../src/logic/smartQueue/smartQueueEngine.js';

const player = (id, level, options = {}) => ({
  id,
  displayName: id,
  estimatedLevel: level,
  status: options.status || 'ready',
  queueJoinedAt: options.queueJoinedAt || '2026-08-27T08:00:00Z'
});
const preference = (id, options = {}) => ({
  eventPlayerId: id,
  modes: options.modes || ['social', 'balanced', 'challenge'],
  preferredMode: options.preferredMode || 'balanced',
  status: options.status || 'ready',
  readySince: options.readySince || '2026-08-27T08:00:00Z'
});
const preferencesFor = (players, options = {}) => players.map(({ id }) => preference(id, options));
const generated = (players, courtCount, options = {}) => generateMatchMakingCourtMatches({
  players,
  preferences: options.preferences || preferencesFor(players),
  matches: options.matches || [],
  courts: options.courts || buildMatchMakingCourtProfile(courtCount),
  courtCount,
  now: new Date('2026-08-27T10:00:00Z').getTime()
});

// Court profile: one court is Mix; two or more reserve Beginner and Challenge.
assert.deepEqual(buildMatchMakingCourtProfile(1).map(({ role }) => role), ['balanced']);
assert.deepEqual(buildMatchMakingCourtProfile(2).map(({ role }) => role), ['social', 'challenge']);
assert.deepEqual(buildMatchMakingCourtProfile(5).map(({ role }) => role), ['social', 'challenge', 'balanced', 'balanced', 'balanced']);
assert.equal(buildMatchMakingCourtProfile(12).length, 10);

// Approved all-level behavior: spread never blocks an otherwise eligible group.
{
  const wideMix = [
    player('mix-1', 2), player('mix-2', 2.3),
    player('mix-3', 3.1), player('mix-4', 3.4)
  ];
  const mixResult = generated(wideMix, 1);
  assert.equal(mixResult.matches.length, 1);
  assert.equal(mixResult.matches[0].mode, 'balanced');
  assert.equal(mixResult.matches[0].spread, 1.4);
  assert.match(mixResult.matches[0].explanation, /all eligible/);

  const wideChallenge = [
    player('challenge-1', 2.6), player('challenge-2', 2.75),
    player('challenge-3', 3.7), player('challenge-4', 4)
  ];
  const challengeResult = generated(wideChallenge, 2);
  const challengeMatch = challengeResult.matches.find((match) => match.courtNumber === 2);
  assert.ok(challengeMatch);
  assert.equal(challengeMatch.mode, 'challenge');
  assert.equal(challengeMatch.spread, 1.4);
  assert.equal(challengeMatch.fallback, false);

  const beginner = [
    player('beginner-1', 2), player('beginner-2', 2.1),
    player('beginner-3', 2.2), player('beginner-4', 2.3)
  ];
  const beginnerResult = generated(beginner, 2);
  const beginnerMatch = beginnerResult.matches.find((match) => match.courtNumber === 1);
  assert.ok(beginnerMatch);
  assert.equal(beginnerMatch.mode, 'social');
  assert.equal(beginnerMatch.fallback, false);
}

// A fourth player outside Beginner does not count toward the specialist court.
{
  const pool = [
    player('outside-1', 2), player('outside-2', 2.1),
    player('outside-3', 2.2), player('outside-4', 2.31)
  ];
  const result = generated(pool, 2);
  const court1 = result.matches.find((match) => match.courtNumber === 1);
  assert.ok(court1);
  assert.equal(court1.mode, 'balanced');
  assert.equal(court1.fallback, true);
  assert.ok(result.fallbackCourtNumbers.includes(1));
}

// Challenge starts at exactly 2.60; 2.59 remains Mix Level.
assert.equal(matchMakingLevelRole(player('challenge-low', 2.59)), 'balanced');
assert.equal(matchMakingLevelRole(player('challenge-edge', 2.6)), 'challenge');
assert.equal(matchMakingLevelRole(player('challenge-high', 4.5)), 'challenge');

// Specialist fallback accepts a complete wide-Level group without a spread cap.
{
  const pool = [
    player('fallback-1', 2), player('fallback-2', 2.1),
    player('fallback-3', 2.25), player('fallback-4', 4)
  ];
  const result = generated(pool, 2);
  const court1 = result.matches.find((match) => match.courtNumber === 1);
  assert.ok(court1);
  assert.equal(court1.mode, 'balanced');
  assert.equal(court1.fallback, true);
  assert.equal(court1.spread, 2);
}

// Waiting fairness remains stronger than choosing a visually tighter Level group.
{
  const pool = [
    player('long-low', 2), player('long-high', 3.5),
    player('recent-1', 2.7), player('recent-2', 2.8),
    player('recent-3', 2.9), player('recent-4', 3)
  ];
  const prefs = pool.map(({ id }) => preference(id, {
    readySince: id.startsWith('long-') ? '2026-08-27T05:00:00Z' : '2026-08-27T09:55:00Z'
  }));
  const result = generated(pool, 1, { preferences: prefs });
  assert.ok(result.assignedPlayerIds.includes('long-low'));
  assert.ok(result.assignedPlayerIds.includes('long-high'));
}

// A: 4 Beginner, 4 Challenge and 8 Middle players fill the expected four courts.
{
  const pool = [
    ...[2, 2.1, 2.2, 2.3].map((level, index) => player(`b${index}`, level)),
    ...[2.6, 2.75, 3, 3.25].map((level, index) => player(`c${index}`, level)),
    ...[2.31, 2.35, 2.4, 2.45, 2.5, 2.55, 2.58, 2.59].map((level, index) => player(`m${index}`, level))
  ];
  const result = generated(pool, 4);
  assert.equal(result.matches.length, 4);
  assert.deepEqual(result.matches.sort((a, b) => a.courtNumber - b.courtNumber).map(({ mode }) => mode), ['social', 'challenge', 'balanced', 'balanced']);
  assert.equal(new Set(result.assignedPlayerIds).size, 16);
  assert.equal(result.remainingPlayerIds.length, 0);
}

// B/C: a specialist shortage turns only that generated court into temporary Mix.
{
  const beginnerShortage = [
    ...[2.1, 2.2, 2.3].map((level, index) => player(`b${index}`, level)),
    ...Array.from({ length: 13 }, (_, index) => player(`m${index}`, 2.31 + index * 0.015))
  ];
  const beginnerResult = generated(beginnerShortage, 4);
  const court1 = beginnerResult.matches.find((match) => match.courtNumber === 1);
  assert.equal(court1.mode, 'balanced');
  assert.equal(court1.fallback, true);
  assert.ok(beginnerResult.fallbackCourtNumbers.includes(1));

  const challengeShortage = [
    player('c1', 2.6), player('c2', 2.75),
    ...Array.from({ length: 14 }, (_, index) => player(`m${index}`, 2.31 + index * 0.015))
  ];
  const challengeResult = generated(challengeShortage, 4);
  const court2 = challengeResult.matches.find((match) => match.courtNumber === 2);
  assert.equal(court2.mode, 'balanced');
  assert.equal(court2.fallback, true);
  assert.ok(challengeResult.fallbackCourtNumbers.includes(2));
}

// D/E/F/G: exact decimal boundaries use the live event estimated Level.
assert.equal(matchMakingLevelRole(player('x', 2.01)), 'social');
assert.equal(matchMakingLevelRole(player('x', 2.29)), 'social');
assert.equal(matchMakingLevelRole(player('x', 2.3)), 'social');
assert.equal(matchMakingLevelRole(player('x', 2.31)), 'balanced');
assert.equal(matchMakingLevelRole(player('x', 2.59)), 'balanced');
assert.equal(matchMakingLevelRole(player('x', 2.6)), 'challenge');
assert.equal(matchMakingLevelRole(player('x', 2.61)), 'challenge');
assert.equal(matchMakingLevelRole({ id: 'event-level-wins', estimatedLevel: 2.2, level: 3.5 }), 'social');

// H: fewer games and older waiting players win before a prettier recent option.
{
  const pool = ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => player(id, 2.5));
  const prefs = pool.map(({ id }) => preference(id, { readySince: id === 'p1' ? '2026-08-27T05:00:00Z' : '2026-08-27T09:55:00Z' }));
  const history = [{
    id: 'old-match', status: 'confirmed', teamA: ['p5', 'old-a'], teamB: ['old-b', 'old-c'],
    teamAScore: 11, teamBScore: 8, completedAt: '2026-08-27T09:50:00Z'
  }];
  const result = generated(pool, 1, { preferences: prefs, matches: history });
  assert.ok(result.assignedPlayerIds.includes('p1'));
  assert.ok(!result.assignedPlayerIds.includes('p5'));
}

// Team balancing evaluates all three 2v2 splits.
{
  const split = chooseBalancedSmartQueueTeams([
    player('a', 2.1), player('b', 2.35), player('c', 2.75), player('d', 2.9)
  ]);
  assert.ok(Math.abs(split.teamGap - 0.05) < 1e-9);
}

// I/J/K: fill every possible court, leave only the remainder, and never reuse active players.
{
  const pool24 = Array.from({ length: 24 }, (_, index) => player(`p${index + 1}`, 2.31 + (index % 20) * 0.01));
  const result24 = generated(pool24, 4);
  assert.equal(result24.matches.length, 4);
  assert.equal(new Set(result24.assignedPlayerIds).size, 16);

  const pool17 = Array.from({ length: 17 }, (_, index) => player(`q${index + 1}`, 2.31 + (index % 20) * 0.01));
  const result17 = generated(pool17, 4);
  assert.equal(result17.matches.length, 4);
  assert.equal(result17.remainingPlayerIds.length, 1);

  const active = [{ id: 'active', status: 'queued_next', teamA: ['q1', 'q2'], teamB: ['q3', 'q4'] }];
  const reserved = generated(pool17, 4, { matches: active });
  assert.ok(!reserved.assignedPlayerIds.some((id) => ['q1', 'q2', 'q3', 'q4'].includes(id)));
  assert.equal(new Set(reserved.assignedPlayerIds).size, reserved.assignedPlayerIds.length);
}

// Queue status remains authoritative for future matching.
{
  const pool = ['a', 'b', 'c', 'd', 'resting'].map((id) => player(id, 2.5, { status: id === 'resting' ? 'resting' : 'ready' }));
  const prefs = preferencesFor(pool).map((row) => row.eventPlayerId === 'd' ? { ...row, status: 'rest' } : row);
  const result = generated(pool, 1, { preferences: prefs });
  assert.equal(result.matches.length, 0);
}

// L: STANDARD keeps using its existing generator and court configuration.
{
  const standardPlayers = ['s1', 's2', 's3', 's4'].map((id) => ({ ...player(id, 2.5), estimated_level: 2.5 }));
  const standard = generateMatches({ players: standardPlayers, courts: [{ id: 'standard-court', name: 'Standard Court' }] });
  assert.equal(standard.previews.length, 1);
  assert.equal(standard.previews[0].courtId, 'standard-court');
}

// Historical confirmed match data is read for fairness and never mutated.
{
  const history = [{
    id: 'confirmed-history', status: 'confirmed',
    teamA: ['history-a', 'history-b'], teamB: ['history-c', 'history-d'],
    teamAScore: 11, teamBScore: 8, winner: 'A', completedAt: '2026-08-27T09:00:00Z'
  }];
  const snapshot = structuredClone(history);
  const pool = ['history-a', 'history-b', 'history-c', 'history-d'].map((id, index) => player(id, 2.4 + index * 0.2));
  generated(pool, 1, { matches: history });
  assert.deepEqual(history, snapshot);
}

// UI wiring keeps Match Making isolated and reuses the existing UP NEXT lifecycle.
{
  const [organizer, ui] = await Promise.all([
    readFile(new URL('../openplay.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/smartQueueUi.js', import.meta.url), 'utf8')
  ]);
  assert.match(organizer, /if\(smartQueueUi\.isSmartEvent\(\)\)return smartQueueUi\.generateNextForCourt\(court\)/);
  assert.match(organizer, /if\(smartQueueUi\.isSmartEvent\(\)\)return smartQueueUi\.courtProfile\(\)/);
  assert.match(ui, /generateMatchMakingCourtMatches/);
  assert.match(ui, /MATCH MAKING COURTS/);
  assert.doesNotMatch(ui, />SMART QUEUE</);
}

console.log('v2 Match Making level court tests passed');
