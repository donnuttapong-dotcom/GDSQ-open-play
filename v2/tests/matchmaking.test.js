import assert from 'node:assert/strict';
import { generateMatches } from '../src/logic/matchmaking/generateMatches.js';
import { calculatePlayerRanking } from '../src/logic/ranking/calculatePlayerRanking.js';

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

// Test 2: player with two consecutive games must rest.
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
  assert.equal(ranking[0].id, 'c');
  assert.equal(ranking[0].rank, 1);
}

console.log('v2 logic tests passed');
