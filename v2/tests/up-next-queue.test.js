import assert from 'node:assert/strict';
import fs from 'node:fs';

const values = new Map();
globalThis.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};

const store = await import('../src/services/localMatchStore.js');
const eventId = 'up-next-test-event';
const roster = (prefix) => [0, 1].map((index) => ({ id: `${prefix}${index + 1}` }));

const current = store.createLocalMatchPreview({ eventId, courtId: 'court-1', courtNumber: 1, courtName: 'Court 1', teamA: roster('a'), teamB: roster('b') });
store.startLocalMatch(eventId, current.id);
const next = store.createLocalMatchNext({ eventId, courtId: 'court-1', courtNumber: 1, courtName: 'Court 1', teamA: roster('c'), teamB: roster('d') });
assert.equal(next.status, 'queued_next');
assert.throws(() => store.createLocalMatchNext({ eventId, courtId: 'court-1', courtNumber: 1, teamA: roster('e'), teamB: roster('f') }), /already has a next match/i);
assert.throws(() => store.createLocalMatchNext({ eventId, courtId: 'court-2', courtNumber: 2, teamA: roster('a'), teamB: roster('e') }), /Court is not playing|active match/i);

store.confirmLocalScore(eventId, current.id, { teamAScore: 11, teamBScore: 8 });
let matches = store.listLocalEventMatches(eventId);
assert.equal(matches.find((match) => match.id === current.id).status, 'confirmed');
assert.equal(matches.find((match) => match.id === next.id).status, 'preview', 'Confirming the current match promotes its queued next match without starting it');
store.startLocalMatch(eventId, next.id);
const startedNext = store.listLocalEventMatches(eventId).find((match) => match.id === next.id);
assert.equal(startedNext.status, 'playing');

const queuedAgain = store.createLocalMatchNext({ eventId, courtId: 'court-1', courtNumber: 1, courtName: 'Court 1', teamA: roster('e'), teamB: roster('f') });
store.cancelLocalMatch(eventId, queuedAgain.id, { reason: 'next_cancelled' });
matches = store.listLocalEventMatches(eventId);
assert.equal(matches.find((match) => match.id === queuedAgain.id).status, 'cancelled', 'Cancelling a queued next match releases its reservation');
assert.equal(matches.filter((match) => match.status === 'confirmed').length, 1, 'Queued actions do not create confirmed history');

const lifecycleSource = fs.readFileSync(new URL('../src/logic/system/eventLifecycle.js', import.meta.url), 'utf8');
const openplaySource = fs.readFileSync(new URL('../openplay.html', import.meta.url), 'utf8');
const edgeSource = fs.readFileSync(new URL('../supabase/functions/v2-admin-results/index.ts', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(new URL('../supabase/migrations/20260826103000_up_next_match_queue.sql', import.meta.url), 'utf8');

assert.match(lifecycleSource, /'queued_next'/, 'An unresolved next match must block End Event');
assert.match(openplaySource, /GENERATE ALL NEXT/, 'Organizer UI must expose Generate All Next');
assert.match(openplaySource, /SET NEXT/, 'Organizer UI must expose manual Set Next');
assert.match(openplaySource, /UP NEXT/, 'Organizer UI must render an Up Next card');
assert.match(edgeSource, /createMatchNext/, 'Organizer Edge Function must expose next-match creation');
assert.match(edgeSource, /updateMatchNext/, 'Organizer Edge Function must expose next-match editing');
assert.match(edgeSource, /cancelMatchNext/, 'Organizer Edge Function must expose next-match cancellation');
assert.match(migrationSource, /v2_matches_one_queued_next_per_court/, 'Database must enforce one queued next match per court');
assert.match(migrationSource, /MATCH_PLAYER_ALREADY_ACTIVE/, 'Database must prevent duplicate player reservations');
assert.match(migrationSource, /v2_promote_queued_next_after_match/, 'Confirm/cancel transitions must promote queued next matches');

console.log('up next queue tests passed');
