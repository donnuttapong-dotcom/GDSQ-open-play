import assert from 'node:assert/strict';
import fs from 'node:fs';

const serviceSource = fs.readFileSync(new URL('../src/services/index.js', import.meta.url), 'utf8');
const edgeSource = fs.readFileSync(new URL('../supabase/functions/v2-admin-results/index.ts', import.meta.url), 'utf8');

const organizerActionsMatch = edgeSource.match(/const openOrganizerActions = new Set\(\[([\s\S]*?)\]\);/);
assert.ok(organizerActionsMatch, 'Open Organizer action allowlist must exist');

const organizerActions = new Set(
  [...organizerActionsMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
);

for (const action of ['createEvent', 'setEventStatus', 'archiveEvent', 'createMatchPreview', 'updateMatchPreview', 'startMatch', 'cancelMatch', 'confirmScore', 'updateEventPlayerStatus', 'updateEventPlayerLevel', 'removeEventPlayer']) {
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

const organizerCallMatch = serviceSource.match(/async function organizerAdminCall\([\s\S]*?\n  \}/);
assert.ok(organizerCallMatch, 'Organizer service call must exist');
assert.doesNotMatch(organizerCallMatch[0], /getSession\(|window\.prompt|passcode/, 'Live Organizer actions must not request Admin credentials');
assert.ok(!organizerActions.has('updateScore'), 'Historical score editing must remain protected');

console.log('organizer passcode access tests passed');
