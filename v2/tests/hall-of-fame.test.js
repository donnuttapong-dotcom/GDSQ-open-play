import assert from 'node:assert/strict';
import { buildHallOfFame } from '../src/services/hallOfFameService.js';

const events = [
  { id: 'e1', name: 'Event One', event_date: '2026-08-06', status: 'deleted' },
  { id: 'e2', name: 'Event Two', event_date: '2026-08-12', status: 'completed' }
];
const eventPlayers = [
  { id: 'ep1', event_id: 'e1', player_id: 'profile-1', display_name: 'Don', estimated_level: 4.25 },
  { id: 'ep2', event_id: 'e1', display_name: 'Guest A', estimated_level: 3 },
  { id: 'ep3', event_id: 'e1', display_name: 'Guest B', estimated_level: 3 },
  { id: 'ep4', event_id: 'e1', display_name: 'Guest C', estimated_level: 3 },
  { id: 'ep5', event_id: 'e2', player_id: 'profile-1', display_name: 'Don Updated', estimated_level: 4.5 },
  { id: 'ep6', event_id: 'e2', display_name: 'Guest D', estimated_level: 3 },
  { id: 'ep7', event_id: 'e2', display_name: 'Guest E', estimated_level: 3 },
  { id: 'ep8', event_id: 'e2', display_name: 'Guest F', estimated_level: 3 }
];
const matchPlayers = [
  ['m1','ep1','A',1],['m1','ep2','A',2],['m1','ep3','B',1],['m1','ep4','B',2],
  ['m2','ep5','B',1],['m2','ep6','B',2],['m2','ep7','A',1],['m2','ep8','A',2]
].map(([match_id,event_player_id,team,slot])=>({match_id,event_player_id,team,slot}));
const baseMatches = [
  { id: 'm1', event_id: 'e1', status: 'confirmed', team_a_score: 11, team_b_score: 8, completed_at: '2026-08-06T13:00:00Z' },
  { id: 'm2', event_id: 'e2', status: 'confirmed', team_a_score: 11, team_b_score: 9, completed_at: '2026-08-12T13:00:00Z' }
];

const initial = buildHallOfFame({ events, eventPlayers, matches: baseMatches, matchPlayers });
const don = initial.players.find((player) => player.id === 'profile-1');
assert.equal(initial.totalRegisteredPlayers, 1);
assert.equal(initial.totalEvents, 2);
assert.equal(initial.totalMatches, 2);
assert.equal(don.eventsJoined, 2, 'same profile id across events must create one career');
assert.deepEqual({ games: don.matchesPlayed, wins: don.wins, losses: don.losses, pf: don.pointsFor, pa: don.pointsAgainst }, { games: 2, wins: 1, losses: 1, pf: 20, pa: 19 });
assert.equal(JSON.stringify(initial).includes('@'), false, 'public Hall of Fame output must not include email');

const edited = buildHallOfFame({ events, eventPlayers, matches: [{ ...baseMatches[0], team_a_score: 7, team_b_score: 11 }, baseMatches[1]], matchPlayers });
assert.equal(edited.players.find((player) => player.id === 'profile-1').wins, 0, 'historical score edit must recalculate career wins');

const afterDelete = buildHallOfFame({ events, eventPlayers, matches: [{ ...baseMatches[0], status: 'deleted' }, baseMatches[1]], matchPlayers });
const afterDeleteDon = afterDelete.players.find((player) => player.id === 'profile-1');
assert.equal(afterDelete.totalMatches, 1);
assert.equal(afterDeleteDon.matchesPlayed, 1);
assert.equal(afterDeleteDon.eventHistory.some((event) => event.id === 'e1'), false, 'deleted match must affect only its event');
assert.equal(afterDeleteDon.eventHistory.some((event) => event.id === 'e2'), true, 'another event must remain unchanged');

console.log('v2 Hall of Fame tests passed');
