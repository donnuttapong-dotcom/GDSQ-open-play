import assert from 'node:assert/strict';
import { buildMatchHistoryStats, generateMatches, shouldRest } from '../src/logic/matchmaking/generateMatches.js';
import { calculatePlayerRanking } from '../src/logic/ranking/calculatePlayerRanking.js';
import { createLocalMatchPreview, updateLocalMatchPreview, startLocalMatch } from '../src/services/localMatchStore.js';
import { checkInLocalPlayer } from '../src/services/localPlayerStore.js';
import { setLocalPlayerStatus } from '../src/services/localPlayerStatsStore.js';
import { saveScoreDraft } from '../src/services/localDraftService.js';
import { clearLocalEventData } from '../src/services/localEventCleanup.js';
import { buildAutoAssignmentProposal, getCourtAssignment, saveCourtSetup, savePlayerAssignments } from '../src/services/localCourtAssignmentStore.js';

const now = new Date('2026-06-22T10:00:00+07:00').getTime();

function player(id, games, level = 2.5, minutesWaited = 10) {
  return {
    id,
    name: id,
    status: 'ready',
    matchesPlayed: games,
    level,
    queueJoinedAt: new Date(now - minutesWaited * 60000).toISOString()
  };
}

function match(id, teamA, teamB, minutesAgo) {
  return {
    id,
    status: 'confirmed',
    completedAt: new Date(now - minutesAgo * 60000).toISOString(),
    teamA,
    teamB
  };
}

// Test 1: generate one match for four eligible players.
{
  const result = generateMatches({
    players: [player('p1', 0), player('p2', 0), player('p3', 0), player('p4', 0)],
    courts: [{ id: 'c1', name: 'Court 1' }],
    history: [],
    now
  });
  assert.equal(result.previews.length, 1);
  assert.equal(result.previews[0].teamA.length, 2);
  assert.equal(result.previews[0].teamB.length, 2);
}

// Test 2: auto rest blocks a player after two consecutive completed games by default.
{
  const history = [
    match('m2', ['p1', 'p2'], ['p3', 'p4'], 1),
    match('m1', ['p1', 'p5'], ['p6', 'p7'], 7)
  ];
  const result = generateMatches({
    players: [player('p1', 0), player('p2', 0), player('p3', 0), player('p4', 0), player('p5', 0), player('p6', 0), player('p7', 0), player('p8', 0)],
    courts: [{ id: 'c1', name: 'Court 1' }],
    history,
    now
  });
  const selectedIds = [...result.previews[0].teamA, ...result.previews[0].teamB].map((p) => p.id);
  assert.equal(result.restingPlayers.some((p) => p.id === 'p1'), true);
  assert.equal(selectedIds.includes('p1'), false);
}

// Test 2b: auto preview preserves the selected court number for every court.
{
  const result = generateMatches({
    players: Array.from({ length: 8 }, (_, index) => player(`multi-${index + 1}`, 0)),
    courts: [{ id: 'court-1', name: 'Court 1', courtNumber: 1 }, { id: 'court-2', name: 'Court 2', courtNumber: 2 }],
    history: [],
    now
  });
  assert.equal(result.previews.length, 2);
  assert.deepEqual(result.previews.map((preview) => preview.courtNumber), [1, 2]);
}

// Test 2c: a player becomes eligible again after sitting out one completed wave.
{
  const history = [
    match('rest-wave', ['p5', 'p6'], ['p7', 'p8'], 1),
    match('p1-wave-two', ['p1', 'p2'], ['p3', 'p4'], 6),
    match('p1-wave-one', ['p1', 'p5'], ['p6', 'p7'], 12)
  ];
  assert.equal(shouldRest(player('p1', 0), buildMatchHistoryStats(history)), false);
}

// Test 2d: auto rest never blocks the only four players who can form a match.
{
  const history = [
    match('recent', ['p1', 'p2'], ['p3', 'p4'], 1),
    match('previous', ['p1', 'p2'], ['p3', 'p4'], 7)
  ];
  const result = generateMatches({
    players: [player('p1', 0), player('p2', 0), player('p3', 0), player('p4', 0)],
    courts: [{ id: 'c1', name: 'Court 1' }],
    history,
    now
  });
  assert.equal(result.restingPlayers.length, 0);
  assert.equal(result.previews.length, 1);
}

// Test 3: low games players should be prioritized over high games players.
{
  const result = generateMatches({
    players: [
      player('low1', 0),
      player('low2', 0),
      player('low3', 0),
      player('low4', 0),
      player('high1', 5),
      player('high2', 5)
    ],
    courts: [{ id: 'c1', name: 'Court 1' }],
    history: [],
    now
  });
  const selectedIds = [...result.previews[0].teamA, ...result.previews[0].teamB].map((p) => p.id).sort();
  assert.deepEqual(selectedIds, ['low1', 'low2', 'low3', 'low4']);
}

// Test 4: no preview if fewer than four eligible players.
{
  const result = generateMatches({
    players: [player('p1', 0), player('p2', 0), player('p3', 0)],
    courts: [{ id: 'c1', name: 'Court 1' }],
    history: [],
    now
  });
  assert.equal(result.previews.length, 0);
  assert.match(result.reason, /Not enough/);
}

// Test 5: ranking score order.
{
  const ranking = calculatePlayerRanking([
    { id: 'a', name: 'Ann', matchesPlayed: 4, wins: 3, losses: 1, pointsFor: 42, pointsAgainst: 30 },
    { id: 'b', name: 'Bank', matchesPlayed: 4, wins: 2, losses: 2, pointsFor: 38, pointsAgainst: 36 },
    { id: 'c', name: 'Cee', matchesPlayed: 3, wins: 3, losses: 0, pointsFor: 33, pointsAgainst: 20 }
  ]);
  assert.equal(ranking[0].id, 'a');
  assert.equal(ranking[0].rank, 1);
}

// Test 6: persisted previews reject duplicate courts/players and can be edited before start.
{
  const originalStorage = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key)
  };
  const eventId = 'preview-test';
  const first = createLocalMatchPreview({
    eventId,
    courtId: 'court-1',
    courtName: 'Court 1',
    teamA: ['p1', 'p2'],
    teamB: ['p3', 'p4']
  });
  assert.throws(() => createLocalMatchPreview({
    eventId,
    courtId: 'court-1',
    courtName: 'Court 1',
    teamA: ['p5', 'p6'],
    teamB: ['p7', 'p8']
  }), /Court is already in use/);
  assert.throws(() => createLocalMatchPreview({
    eventId,
    courtId: 'court-2',
    courtName: 'Court 2',
    teamA: ['p1', 'p5'],
    teamB: ['p6', 'p7']
  }), /already assigned/);
  const edited = updateLocalMatchPreview(eventId, first.id, { teamA: ['p1', 'p2'], teamB: ['p3', 'p5'] });
  assert.deepEqual(edited.teamB, ['p3', 'p5']);
  assert.equal(startLocalMatch(eventId, first.id).status, 'playing');

  const firstRegistration = checkInLocalPlayer({
    eventId: 'email-event-one',
    displayName: 'Email Player',
    email: 'PLAYER@Example.com',
    level: 3.5
  });
  const returningRegistration = checkInLocalPlayer({
    eventId: 'email-event-two',
    displayName: 'Email Player',
    email: 'player@example.com',
    level: 3.5
  });
  assert.equal(firstRegistration.playerId, returningRegistration.playerId);
  assert.equal(returningRegistration.email, 'player@example.com');

  const guestRegistration = checkInLocalPlayer({
    eventId: 'guest-event',
    displayName: 'Walk-in Guest',
    level: 3
  });
  assert.equal(guestRegistration.playerId, null);
  assert.equal(guestRegistration.email, '');

  const cleanupEventId = 'cleanup-event';
  const cleanupPlayers = ['c1', 'c2', 'c3', 'c4'].map((id) => checkInLocalPlayer({ eventId: cleanupEventId, displayName: id, level: 3 }));
  const cleanupMatch = createLocalMatchPreview({
    eventId: cleanupEventId,
    courtId: 'court-1',
    courtName: 'Court 1',
    teamA: cleanupPlayers.slice(0, 2),
    teamB: cleanupPlayers.slice(2, 4)
  });
  setLocalPlayerStatus(cleanupEventId, ['c1'], 'ready');
  saveScoreDraft(cleanupMatch.id, { teamAScore: 4, teamBScore: 2 });
  localStorage.setItem(`gdsq_v2_my_player:${cleanupEventId}`, 'c1');
  localStorage.setItem(`gdsq_v2_my_player_meta:${cleanupEventId}`, '{}');
  clearLocalEventData(cleanupEventId);
  assert.equal(localStorage.getItem(`gdsq_v2_event_players:${cleanupEventId}`), null);
  assert.equal(localStorage.getItem(`gdsq_v2_matches:${cleanupEventId}`), null);
  assert.equal(localStorage.getItem(`gdsq_v2_player_stats:${cleanupEventId}`), null);
  assert.equal(localStorage.getItem(`gdsq_v2_score_draft:${cleanupMatch.id}`), null);
  assert.equal(localStorage.getItem(`gdsq_v2_my_player:${cleanupEventId}`), null);
  assert.equal(localStorage.getItem(`gdsq_v2_my_player_meta:${cleanupEventId}`), null);

  const assignmentEventA = 'assignment-event-a';
  const assignmentEventB = 'assignment-event-b';
  const defaultAssignment = getCourtAssignment(assignmentEventA, 2);
  assert.equal(defaultAssignment.courts.length, 2);
  assert.deepEqual(defaultAssignment.playerAssignments, {});
  const configuredCourts = defaultAssignment.courts.map((court) => court.courtNumber === 1
    ? { ...court, displayName: 'Social Court', courtType: 'social', minLevel: 2, maxLevel: 3.25, themeColor: 'green' }
    : { ...court, displayName: 'Challenge Court', courtType: 'challenge', minLevel: 3.5, maxLevel: 5, themeColor: 'orange' });
  saveCourtSetup(assignmentEventA, 2, configuredCourts);
  savePlayerAssignments(assignmentEventA, 2, { p1: { courtNumber: 1 } });
  assert.equal(getCourtAssignment(assignmentEventA, 2).courts[0].displayName, 'Social Court');
  assert.equal(getCourtAssignment(assignmentEventA, 2).playerAssignments.p1.courtNumber, 1);
  assert.deepEqual(getCourtAssignment(assignmentEventB, 2).playerAssignments, {});
  const proposed = buildAutoAssignmentProposal(configuredCourts, [
    { id: 'low', estimatedLevel: 2.5 },
    { id: 'high', estimatedLevel: 4 },
    { id: 'outside', estimatedLevel: 1.5 }
  ]);
  assert.equal(proposed.low.courtNumber, 1);
  assert.equal(proposed.high.courtNumber, 2);
  assert.equal(proposed.outside, undefined);
  globalThis.localStorage = originalStorage;
}

console.log('v2 logic tests passed');
