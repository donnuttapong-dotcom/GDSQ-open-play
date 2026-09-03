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
const updatedNext = store.updateLocalMatchNext(eventId, next.id, { teamA: [{ id: 'c1' }, { id: 'replacement' }], teamB: roster('d') });
assert.equal(updatedNext.id, next.id, 'Replacing one Up Next player must preserve Match ID');
assert.equal(updatedNext.courtId, next.courtId, 'Replacing one Up Next player must preserve Court');
assert.equal(updatedNext.status, 'queued_next', 'Replacing one Up Next player must preserve queued-next status');
assert.deepEqual(updatedNext.teamA, ['c1', 'replacement'], 'Only the selected Up Next slot must change');
assert.deepEqual(updatedNext.teamB, ['d1', 'd2'], 'The other Up Next team must remain unchanged');
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
const testEdgeSource = fs.readFileSync(new URL('../supabase/functions/v2-test-admin/index.ts', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(new URL('../supabase/migrations/20260826103000_up_next_match_queue.sql', import.meta.url), 'utf8');
const triggerPermissionSource = fs.readFileSync(new URL('../supabase/migrations/20260826170000_up_next_trigger_function_permissions.sql', import.meta.url), 'utf8');
const servicesSource = fs.readFileSync(new URL('../src/services/index.js', import.meta.url), 'utf8');

assert.match(lifecycleSource, /'queued_next'/, 'An unresolved next match must block End Event');
assert.match(openplaySource, /GENERATE ALL NEXT/, 'Organizer UI must expose Generate All Next');
assert.match(openplaySource, /SET NEXT/, 'Organizer UI must expose manual Set Next');
assert.match(openplaySource, /UP NEXT/, 'Organizer UI must render an Up Next card');
assert.match(openplaySource, /data-next-player="\$\{next\.id\}" data-next-slot="\$\{start\}"/, 'Up Next player selectors must always be rendered directly on the card');
assert.doesNotMatch(openplaySource, /data-edit-next|EDIT NEXT/, 'The redundant Edit Next button must be removed');
assert.match(openplaySource, /nextTeamNames[\s\S]*?levelText\(currentEventLevel\(item\)\)/, 'Up Next summary must show exact current Event Levels');
assert.match(openplaySource, /A AVG \$\{levelText\(a\)\} · B AVG \$\{levelText\(b\)\} · GAP/, 'Up Next must display both team averages and the Level gap');
assert.match(openplaySource, /id===selected\|\|\(isReadyForMatch\(player\)&&!busy\.has\(id\)&&!picked\.has\(id\)\)/, 'Replacement options must exclude active and duplicate players while retaining every READY player');
assert.doesNotMatch(openplaySource, /autoRestBlockedIds\(/, 'STANDARD Up Next must not hide READY players behind Auto Rest eligibility');
assert.match(edgeSource, /createMatchNext/, 'Organizer Edge Function must expose next-match creation');
assert.match(edgeSource, /updateMatchNext/, 'Organizer Edge Function must expose next-match editing');
assert.match(edgeSource, /cancelMatchNext/, 'Organizer Edge Function must expose next-match cancellation');
assert.match(testEdgeSource, /\['preview', 'assigned', 'playing', 'pending_score'\]/, 'Test Mode status changes must not treat queued-next as a playing match');
assert.match(testEdgeSource, /cancelledQueuedMatches/, 'Test Mode Rest, Left, and Remove must cancel the affected queued-next match');
assert.match(testEdgeSource, /requestedStatus === 'left'/, 'Test Mode must preserve the Left status instead of converting it to Ready');
assert.match(testEdgeSource, /body\.courtNumber \|\| targetMatch\?\.court_number \|\| 1/, 'Test Mode match edits must retain the existing court when the UI sends only a new roster');
assert.match(testEdgeSource, /body\.courtName \|\| targetMatch\?\.court_name/, 'Test Mode match edits must retain the existing court name');
assert.match(servicesSource, /test\('deleteEvent'[\s\S]*?clearTestAdminSession\(eventId\)[\s\S]*?invalidateTestEvents/, 'Deleting a Test event must clear its local capability before the event list reloads');
assert.match(migrationSource, /v2_matches_one_queued_next_per_court/, 'Database must enforce one queued next match per court');
assert.match(migrationSource, /MATCH_PLAYER_ALREADY_ACTIVE/, 'Database must prevent duplicate player reservations');
assert.match(migrationSource, /v2_promote_queued_next_after_match/, 'Confirm/cancel transitions must promote queued next matches');
for (const helper of ['v2_promote_queued_next_after_match', 'v2_cancel_queued_next_for_unavailable_player', 'v2_block_event_completion_with_queued_next']) {
  assert.match(triggerPermissionSource, new RegExp(`revoke all on function public\\.${helper}\\(\\)[\\s\\S]*?public, anon, authenticated`), `${helper} must not be directly executable by browser roles`);
}

console.log('up next queue tests passed');
