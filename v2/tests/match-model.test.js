import assert from 'node:assert/strict';
import { matchPlayerIds, normalizeMatch, playerId } from '../src/services/matchModel.js';

const ids = [
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000013',
  '00000000-0000-4000-8000-000000000014'
];

assert.equal(playerId({ event_player_id: ids[0] }), ids[0]);
assert.equal(playerId({ eventPlayerId: ids[1] }), ids[1]);

const normalized = normalizeMatch({
  id: 'match-1',
  event_id: 'event-1',
  organization_id: 'org-1',
  court_number: 2,
  status: 'preview',
  match_mode: 'smart_queue_social',
  players: [
    { event_player_id: ids[3], team: 'B', slot: 2 },
    { event_player_id: ids[1], team: 'A', slot: 2 },
    { event_player_id: ids[2], team: 'B', slot: 1 },
    { event_player_id: ids[0], team: 'A', slot: 1 }
  ]
});

assert.deepEqual(normalized.teamA, ids.slice(0, 2));
assert.deepEqual(normalized.teamB, ids.slice(2));
assert.deepEqual(matchPlayerIds(normalized), ids);
assert.equal(normalized.courtName, 'Court 2');
assert.equal(normalized.match_type, 'smart_queue_social');

console.log('match-model tests passed');
