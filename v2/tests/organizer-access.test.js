import assert from 'node:assert/strict';
import fs from 'node:fs';

const serviceSource = fs.readFileSync(new URL('../src/services/index.js', import.meta.url), 'utf8');
const edgeSource = fs.readFileSync(new URL('../supabase/functions/v2-admin-results/index.ts', import.meta.url), 'utf8');

const organizerActionsMatch = edgeSource.match(/const passcodeOnlyActions = new Set\(\[([\s\S]*?)\]\);/);
assert.ok(organizerActionsMatch, 'Passcode-only action allowlist must exist');

const organizerActions = new Set(
  [...organizerActionsMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
);

assert.ok(organizerActions.has('createEvent'), 'Create Event must work with the Admin passcode alone');

for (const action of [
  'setEventStatus',
  'archiveEvent',
  'createMatchPreview',
  'updateMatchPreview',
  'startMatch',
  'cancelMatch',
  'confirmScore',
  'updateEventPlayerStatus',
  'updateEventPlayerLevel',
  'removeEventPlayer',
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

assert.match(edgeSource, /if \(!passcodeOnlyActions\.has\(action\)\) \{[\s\S]*?admin\.auth\.getUser\(token\)/);

const organizerCallMatch = serviceSource.match(/async function organizerAdminCall\([\s\S]*?\n  \}/);
assert.ok(organizerCallMatch, 'Organizer service call must exist');
assert.match(organizerCallMatch[0], /action !== 'createEvent'[\s\S]*?getSession\(/, 'Only Create Event may skip the account session');
assert.match(organizerCallMatch[0], /window\.prompt\('Admin passcode \/ รหัส Admin'\)/);

console.log('organizer passcode access tests passed');
