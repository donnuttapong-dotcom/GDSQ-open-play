import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildEventCompletionSummary,
  eventDeleteConfirmation,
  matchCompletionProblem
} from '../src/logic/system/eventLifecycle.js';
import { generateMatches } from '../src/logic/matchmaking/generateMatches.js';

const players = Array.from({ length: 8 }, (_, index) => ({ id: `p${index + 1}`, status: 'ready' }));
const confirmed = {
  id: 'm1',
  status: 'confirmed',
  teamA: [players[0], players[1]],
  teamB: [players[2], players[3]],
  teamAScore: 11,
  teamBScore: 8,
  winner: 'A'
};

assert.equal(matchCompletionProblem(confirmed), '');
assert.equal(matchCompletionProblem({ ...confirmed, teamB: [players[2], players[2]] }), 'MATCH_REQUIRES_FOUR_UNIQUE_PLAYERS');
assert.equal(matchCompletionProblem({ ...confirmed, teamBScore: 11 }), 'INVALID_SCORE');
assert.equal(matchCompletionProblem({ ...confirmed, winner: 'B' }), 'WINNER_SCORE_MISMATCH');

const readySummary = buildEventCompletionSummary({ event: { id: 'event-1' }, players, matches: [confirmed] });
assert.equal(readySummary.canComplete, true);
assert.equal(readySummary.confirmedMatches, 1);
assert.equal(readySummary.activeMatches, 0);

const activeSummary = buildEventCompletionSummary({
  event: { id: 'event-1' },
  players,
  matches: [confirmed, { ...confirmed, id: 'm2', status: 'playing' }]
});
assert.equal(activeSummary.canComplete, false);
assert.equal(activeSummary.activeMatches, 1);

assert.equal(eventDeleteConfirmation({ hall_of_fame_processed_at: null }), 'DELETE_EVENT');
assert.equal(eventDeleteConfirmation({ hall_of_fame_processed_at: '2026-08-20T00:00:00Z' }), 'DELETE_FINALIZED_EVENT');

// Production-style rotation: 24 players, 3 courts, 4 complete rounds.
const simulationStart = new Date('2026-08-20T12:00:00Z').getTime();
let simulationPlayers = Array.from({ length: 24 }, (_, index) => ({
  id: `qa-player-${index + 1}`,
  name: `QA Player ${index + 1}`,
  status: index >= 22 ? (index === 22 ? 'rest' : 'left') : 'ready',
  matchesPlayed: 0,
  level: 2.5 + (index % 5) * 0.25,
  queueJoinedAt: new Date(simulationStart - (24 - index) * 60_000).toISOString()
}));
const simulationCourts = Array.from({ length: 3 }, (_, index) => ({
  id: `court-${index + 1}`,
  name: `Court ${index + 1}`,
  courtNumber: index + 1
}));
const simulationHistory = [];
const partnerCounts = new Map();

for (let round = 1; round <= 4; round += 1) {
  const generated = generateMatches({
    players: simulationPlayers,
    courts: simulationCourts,
    history: simulationHistory,
    now: simulationStart + round * 15 * 60_000
  });
  assert.equal(generated.previews.length, 3, `Round ${round} must fill all three courts`);
  const selectedIds = generated.previews.flatMap((preview) => [...preview.teamA, ...preview.teamB].map((entry) => entry.id));
  assert.equal(new Set(selectedIds).size, 12, `Round ${round} must use 12 unique players`);
  assert.equal(selectedIds.includes('qa-player-23'), false, 'REST player must stay out of automatic previews');
  assert.equal(selectedIds.includes('qa-player-24'), false, 'LEFT player must stay out of automatic previews');
  assert.equal(generated.previews.every((preview) => preview.balancePercent >= 80), true, `Round ${round} must keep the 80% balance floor`);

  generated.previews.forEach((preview, courtIndex) => {
    for (const team of [preview.teamA, preview.teamB]) {
      const key = team.map((entry) => entry.id).sort().join('|');
      partnerCounts.set(key, (partnerCounts.get(key) || 0) + 1);
    }
    simulationHistory.push({
      id: `qa-round-${round}-court-${courtIndex + 1}`,
      status: 'confirmed',
      teamA: preview.teamA.map((entry) => entry.id),
      teamB: preview.teamB.map((entry) => entry.id),
      teamAScore: 11,
      teamBScore: 8,
      winner: 'A',
      completedAt: new Date(simulationStart + round * 15 * 60_000 + courtIndex * 1000).toISOString()
    });
  });
  const selected = new Set(selectedIds);
  simulationPlayers = simulationPlayers.map((entry) => selected.has(entry.id)
    ? { ...entry, matchesPlayed: entry.matchesPlayed + 1, status: 'ready' }
    : entry);
}

const activeGameCounts = simulationPlayers.filter((entry) => entry.status === 'ready').map((entry) => entry.matchesPlayed);
assert.ok(Math.max(...activeGameCounts) - Math.min(...activeGameCounts) <= 1, 'Four-round rotation must keep game counts within one game');
assert.ok(Math.max(...partnerCounts.values()) <= 2, 'Four-round rotation must minimize repeated partners');

const joinSource = fs.readFileSync(new URL('../join-qr.html', import.meta.url), 'utf8');
const openplaySource = fs.readFileSync(new URL('../openplay.html', import.meta.url), 'utf8');
const servicesSource = fs.readFileSync(new URL('../src/services/index.js', import.meta.url), 'utf8');
const edgeSource = fs.readFileSync(new URL('../supabase/functions/v2-admin-results/index.ts', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(new URL('../supabase/migrations/20260820184000_production_readiness_event_lifecycle.sql', import.meta.url), 'utf8');
const deviceKeyMigrationSource = fs.readFileSync(new URL('../supabase/migrations/20260820190000_event_organizer_device_keys.sql', import.meta.url), 'utf8');

const emailInput = joinSource.match(/<input id="email"[^>]*>/)?.[0] || '';
assert.ok(emailInput, 'QR join page must contain the email field');
assert.doesNotMatch(emailInput, /\srequired(?:\s|>)/, 'QR email must be optional in HTML');
assert.match(joinSource, /if\(email&&!\/\^\\S\+@/, 'QR email validation must run only when an email was entered');
assert.match(joinSource, /services\.rememberedPlayerIdentity\(\)/, 'QR join must recognize a returning player on the same device');
assert.doesNotMatch(joinSource, /joinVerifiedPlayerEvent/, 'QR join must not require email verification');

assert.match(openplaySource, /modal\.id='endEventModal'/, 'End Event must open an explicit confirmation modal');
assert.match(openplaySource, /END EVENT & SAVE RESULTS/, 'End Event modal must name the final save action');
assert.match(openplaySource, /COPY SHARE MESSAGE/, 'Completion success must expose a ready-to-send share message');
assert.match(openplaySource, /has already been included in Hall of Fame/, 'Finalized deletion must show a stronger confirmation warning');
assert.match(servicesSource, /DELETE_FINALIZED_EVENT/, 'Finalized deletion must send the stronger confirmation token');
assert.match(openplaySource, /created before Organizer device control was saved[\s\S]*?Admin Results/, 'Legacy event deletion must direct Organizer to the existing protected Admin path');

assert.match(edgeSource, /organizerDeviceActions = new Set\(\['endEventAndSaveResults', 'deleteEvent'\]\)/, 'Event finalization and deletion must be restricted to the Organizer device');
assert.match(edgeSource, /v2_admin_end_event_and_save_results/, 'Edge Function must call the atomic finalization RPC');
assert.match(edgeSource, /v2_admin_delete_event_stateful/, 'Edge Function must call the state-aware delete RPC');
assert.match(deviceKeyMigrationSource, /enable row level security/, 'Organizer device keys must have RLS enabled');
assert.match(deviceKeyMigrationSource, /revoke all[\s\S]*public, anon, authenticated/, 'Organizer device keys must never be exposed to browser roles');

assert.match(migrationSource, /EVENT_HAS_ACTIVE_MATCHES/, 'Finalization and deletion must block active matches');
assert.match(migrationSource, /EVENT_INVALID_CONFIRMED_MATCHES/, 'Finalization must validate confirmed history');
assert.match(migrationSource, /PLAYER_ACTIVE_IN_MATCH/, 'Player status changes must be blocked during an active match');
assert.match(migrationSource, /delete from public\.v2_events/, 'State-aware deletion must remove exactly the selected event');
assert.doesNotMatch(migrationSource, /delete from public\.v2_players/, 'Event deletion must never delete canonical players');

console.log('production readiness lifecycle tests passed');
