import assert from 'node:assert/strict';
import { buildEventHistoryStats, calculateEventHistoryRanking, confirmedHistoryMatches } from '../src/logic/stats/confirmedHistoryStats.js';

const players = [
  { id: 'p1', displayName: 'Don', matchesPlayed: 99, wins: 99, pointsFor: 999, pointsAgainst: 0 },
  { id: 'p2', displayName: 'Mild' },
  { id: 'p3', displayName: 'Bank' },
  { id: 'p4', displayName: 'Tee' }
];
const matches = [
  { id: 'm1', status: 'confirmed', teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], teamAScore: 11, teamBScore: 8 },
  { id: 'm2', status: 'deleted', teamA: ['p1', 'p3'], teamB: ['p2', 'p4'], teamAScore: 11, teamBScore: 9 },
  { id: 'm3', status: 'preview', teamA: ['p1', 'p4'], teamB: ['p2', 'p3'], teamAScore: 11, teamBScore: 7 }
];

assert.deepEqual(confirmedHistoryMatches(matches).map((match) => match.id), ['m1']);
const stats = buildEventHistoryStats(players, matches);
const don = stats.find((player) => player.id === 'p1');
assert.deepEqual({ games: don.matchesPlayed, wins: don.wins, pf: don.pointsFor, pa: don.pointsAgainst }, { games: 1, wins: 1, pf: 11, pa: 8 }, 'stored counters must not override confirmed history');
const ranking = calculateEventHistoryRanking(players, matches);
assert.equal(ranking[0].displayName, 'Don');
assert.equal(ranking.reduce((sum, player) => sum + player.matchesPlayed, 0), 4);
assert.equal(ranking.reduce((sum, player) => sum + player.wins, 0), 2);
assert.equal(ranking.reduce((sum, player) => sum + player.losses, 0), 2);
assert.equal(ranking.reduce((sum, player) => sum + player.pointsFor, 0), ranking.reduce((sum, player) => sum + player.pointsAgainst, 0));

// Editing a confirmed score changes derived history, while deleting it removes
// only that match from the calculation. Stored player totals remain irrelevant.
const edited = buildEventHistoryStats(players, [
  { ...matches[0], teamAScore: 8, teamBScore: 11 },
  matches[1],
  matches[2]
]);
const editedDon = edited.find((player) => player.id === 'p1');
assert.deepEqual({ games: editedDon.matchesPlayed, wins: editedDon.wins, losses: editedDon.losses, pf: editedDon.pointsFor, pa: editedDon.pointsAgainst }, { games: 1, wins: 0, losses: 1, pf: 8, pa: 11 });
const deleted = buildEventHistoryStats(players, [matches[1], matches[2]]);
assert.equal(deleted.find((player) => player.id === 'p1').matchesPlayed, 0);

console.log('v2 confirmed history stats tests passed');
