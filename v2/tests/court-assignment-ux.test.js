import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildAutoAssignmentProposal,
  buildCourtAvailability,
  buildCourtPreset,
  buildPlayerMix,
  getCourtAssignment,
  saveCourtSetup
} from '../src/services/localCourtAssignmentStore.js';

const values = new Map();
globalThis.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};

const beginner = buildCourtPreset('beginner_heavy', 4);
assert.equal(beginner.length, 4);
assert.deepEqual(beginner.map((court) => [court.displayName, court.minLevel, court.maxLevel]), [
  ['BEGINNER FLEX', 2, 2.5],
  ['MIXED LOW', 2.25, 2.75],
  ['MIXED', 2.5, 3],
  ['CHALLENGE', 2.75, 5]
]);
assert.equal(buildCourtPreset('beginner_heavy', 2).length, 2, 'Preset must adapt to fewer courts');
assert.equal(buildCourtPreset('beginner_heavy', 7).length, 7, 'Preset must adapt to additional courts');
assert.ok(buildCourtPreset('beginner_heavy', 7).every((court) => court.minLevel <= court.maxLevel));
assert.ok(buildCourtPreset('all_open', 6).every((court) => court.minLevel === 2 && court.maxLevel === 5));

const players = [
  { id: 'ready-low', estimated_level: 2.25, status: 'ready' },
  { id: 'reserved-low', estimated_level: 2.5, status: 'checked_in' },
  { id: 'rest-low', estimated_level: 2.5, status: 'rest' },
  { id: 'ready-mid', estimated_level: 2.75, status: 'ready' },
  { id: 'ready-high', estimated_level: 3, status: 'ready' },
  { id: 'removed-low', estimated_level: 2.25, status: 'removed' }
];
const availability = buildCourtAvailability(beginner, players, [
  { id: 'preview-1', status: 'preview', teamA: ['reserved-low'], teamB: [] },
  { id: 'history-1', status: 'confirmed', teamA: ['ready-low'], teamB: [] }
]);
assert.deepEqual(availability[1], { eligible: 3, ready: 1 }, 'Ready count must exclude Rest, Removed, and active reservations');
assert.equal(availability[4].ready, 2);

const mix = buildPlayerMix(players);
assert.deepEqual(mix.bands.map((band) => band.count), [1, 2, 1, 1]);
assert.equal(mix.total, 5);
assert.equal(mix.counted, 5);

const hardRangeProposal = buildAutoAssignmentProposal([beginner[0]], players);
assert.equal(hardRangeProposal['ready-low'].courtNumber, 1);
assert.equal(hardRangeProposal['ready-mid'], undefined, 'Hard range must not force a 2.75 player into a 2.00-2.50 court');

const eventId = 'court-preset-history-safety';
values.set(`gdsq_v2_matches:${eventId}`, JSON.stringify([{ id: 'confirmed-1', status: 'confirmed', teamAScore: 11, teamBScore: 8 }]));
const historyBefore = values.get(`gdsq_v2_matches:${eventId}`);
saveCourtSetup(eventId, 4, beginner);
assert.equal(values.get(`gdsq_v2_matches:${eventId}`), historyBefore, 'Saving Court Setup must not mutate match history');
assert.equal(getCourtAssignment(eventId, 4).courts[0].displayName, 'BEGINNER FLEX');

const uiSource = fs.readFileSync(new URL('../src/ui/courtAssignmentUi.js', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../src/styles/courtAssignment.css', import.meta.url), 'utf8');
assert.match(uiSource, /data-apply-preset/, 'Preset must require an explicit Apply action');
assert.match(uiSource, /data-cancel-preset/, 'Preset preview must be cancellable');
assert.match(uiSource, /window\.confirm\(tx\('resetConfirm'/, 'Reset Court must require confirmation');
assert.match(uiSource, /services\.listEventMatches/, 'Ready now must account for active match reservations');
assert.match(cssSource, /@media\(max-width:960px\)\{\.ca-overview-grid\{grid-template-columns:1fr\}\.ca-court-grid\{grid-template-columns:1fr\}/, 'iPad portrait must use a single Court Setup column');
assert.match(cssSource, /\.ca-field input,\.ca-field select,\.ca-bulk-select,\.ca-player-actions select\{min-height:44px\}/, 'Court controls must meet the 44px touch target');

console.log('court assignment UX tests passed');
