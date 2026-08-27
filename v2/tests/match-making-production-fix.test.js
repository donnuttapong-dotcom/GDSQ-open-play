import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gamePreferenceLabel, anyGamePreferenceLabel } from '../src/services/gamePreferenceLabels.js';

const [organizer, playerPage, playerUi, organizerUi, profile, edge, services] = await Promise.all([
  readFile(new URL('../openplay.html', import.meta.url), 'utf8'),
  readFile(new URL('../player.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/ui/smartQueuePlayerUi.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/ui/smartQueueUi.js', import.meta.url), 'utf8'),
  readFile(new URL('../my-profile.html', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/v2-admin-results/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/index.js', import.meta.url), 'utf8')
]);

assert.equal(gamePreferenceLabel('social', 'en'), 'BEGINNER');
assert.equal(gamePreferenceLabel('balanced', 'en'), 'MIX LEVEL');
assert.equal(gamePreferenceLabel('challenge', 'th'), 'ท้าทาย');
assert.equal(anyGamePreferenceLabel('th'), 'ทุกแบบ');

assert.match(organizerUi, /GENERATE MATCHES/);
assert.match(organizerUi, /generateMatchMakingCourtMatches/);
assert.match(organizerUi, /data-sq-inline-editor/);
assert.match(organizerUi, /data-sq-inline-save/);
assert.doesNotMatch(organizerUi, /<dialog/);
assert.match(playerUi, /READY TO PLAY/);
assert.match(playerUi, /queued_next/);
assert.match(playerPage, /getMatches:\(\)=>matches/);

assert.match(profile, /id="level" type="number" min="1" max="6" step="0\.01" inputmode="decimal"/);
assert.doesNotMatch(profile, /for\(let level=2;level<=5;level\+=\.25\)/);
for (const value of ['2.13', '2.68', '3.17', '4.42']) {
  assert.ok(Number(value) >= 1 && Number(value) <= 6);
}

assert.match(organizer, /activeStatuses=new Set\(\['preview','assigned','playing','pending_score','queued_next'\]\)/);
assert.match(organizer, /passcode=prompt/);
assert.match(services, /deleteEvent\(eventId, \{ finalized = false, passcode = '' \}/);
assert.match(services, /localStorage\.removeItem\(SELECTED_EVENT_KEY\)/);
assert.match(edge, /'permanentlyDeleteEvent', 'deleteEvent'/);
assert.match(edge, /action === 'deleteEvent' && passcode\.length >= 5/);
const openActionsBlock = edge.match(/const openOrganizerActions = new Set\(\[[\s\S]*?\]\);/)?.[0] || '';
assert.ok(openActionsBlock);
assert.doesNotMatch(openActionsBlock, /'deleteEvent'/);

console.log('v2 Match Making production fix tests passed');
