import assert from 'node:assert/strict';
import fs from 'node:fs';

const serviceSource = fs.readFileSync(new URL('../src/services/index.js', import.meta.url), 'utf8');
const edgeSource = fs.readFileSync(new URL('../supabase/functions/v2-admin-results/index.ts', import.meta.url), 'utf8');
const adminResultsSource = fs.readFileSync(new URL('../admin-results.html', import.meta.url), 'utf8');
const deleteUnfinalizedMigration = fs.readFileSync(new URL('../supabase/migrations/20260820105812_admin_delete_unfinalized_event.sql', import.meta.url), 'utf8');

const organizerActionsMatch = edgeSource.match(/const openOrganizerActions = new Set\(\[([\s\S]*?)\]\);/);
assert.ok(organizerActionsMatch, 'Open Organizer action allowlist must exist');

const organizerActions = new Set(
  [...organizerActionsMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
);

for (const action of ['createEvent', 'setEventStatus', 'createMatchPreview', 'updateMatchPreview', 'startMatch', 'cancelMatch', 'confirmScore', 'updateEventPlayerStatus', 'updateEventPlayerLevel', 'removeEventPlayer']) {
  assert.ok(organizerActions.has(action), `${action} must work without Admin credentials`);
}

for (const action of [
  'updateScore',
  'updatePlayers',
  'deleteMatch',
  'restoreEvent',
  'permanentlyDeleteEvent',
  'listMembers',
  'getMember'
]) {
  assert.equal(organizerActions.has(action), false, `${action} must still require an Admin account`);
}

assert.match(edgeSource, /if \(!openOrganizerActions\.has\(action\)\) \{[\s\S]*?admin\.auth\.getUser\(token\)/);
assert.match(edgeSource, /requireLiveEvent[\s\S]*?hall_of_fame_processed_at/, 'Open live actions must reject completed or Hall-finalized events');

const organizerCallMatch = serviceSource.match(/async function organizerAdminCall\([\s\S]*?\n  \}/);
assert.ok(organizerCallMatch, 'Organizer service call must exist');
assert.match(organizerCallMatch[0], /protectedAction = action === 'archiveEvent'/, 'Only archive from the live service remains credential protected');
assert.ok(!organizerActions.has('updateScore'), 'Historical score editing must remain protected');
assert.match(adminResultsSource, /deleteUnfinalized:'ลบอีเว้นท์ทดลอง'/, 'Unfinalized events must expose a clear delete action in Admin Results');
assert.match(adminResultsSource, /isHallOfFameFinalized\(selectedEvent\)/, 'Event controls must distinguish Hall of Fame finalized events');
assert.doesNotMatch(adminResultsSource.match(/async function permanentlyDeleteSelected\([\s\S]*?\n    \}/)?.[0] || '', /prompt\(/, 'Permanent delete must reuse the passcode entered when opening the editor');
assert.match(edgeSource, /v2_admin_permanently_delete_unfinalized_event/, 'The Admin edge path must support direct deletion of an unfinalized event');
assert.match(deleteUnfinalizedMigration, /hall_of_fame_processed_at is not null[\s\S]*?EVENT_ALREADY_FINALIZED/i, 'The delete RPC must block Hall of Fame finalized events');
assert.doesNotMatch(deleteUnfinalizedMigration, /(?:perform|select)\s+public\.v2_finalize|insert\s+into\s+public\.v2_hall_of_fame/i, 'Deleting an unfinalized event must not process Hall of Fame');

console.log('organizer passcode access tests passed');
