import assert from 'node:assert/strict';
import { chooseBalancedSmartQueueTeams, generateSmartQueueMatch } from '../src/logic/smartQueue/smartQueueEngine.js';
import { createSmartQueueStore } from '../src/services/smartQueueService.js';

const player = (id, level) => ({ id, displayName: id.toUpperCase(), estimatedLevel: level });
const players = [player('a', 4), player('b', 3.5), player('c', 3.5), player('d', 3), player('e', 3.25)];
const preference = (id, modes, options = {}) => ({ eventPlayerId: id, modes, preferredMode: options.preferredMode || modes[0], status: options.status || 'ready', readySince: options.readySince || '2026-08-16T08:00:00Z' });

// A/B: four Balanced-compatible players produce a match in their preferred mode.
{
  const balancedPlayers = [player('a', 3.75), player('b', 3.5), player('c', 3.25), player('d', 3)];
  const result = generateSmartQueueMatch({
    players: balancedPlayers,
    preferences: balancedPlayers.map(({ id }) => preference(id, ['social', 'balanced', 'challenge'], { preferredMode: 'balanced' })),
    now: new Date('2026-08-16T09:00:00Z').getTime()
  });
  assert.equal(result.match.mode, 'balanced');
  assert.equal(result.match.teamGap, 0);
  assert.deepEqual(result.match.teamA.map(({ id }) => id).sort(), ['a', 'd']);
  assert.deepEqual(result.match.teamB.map(({ id }) => id).sort(), ['b', 'c']);
}

// F: all three possible splits are evaluated for a 4.0 / 3.5 / 3.5 / 3.0 group.
{
  const split = chooseBalancedSmartQueueTeams(players.slice(0, 4));
  assert.equal(split.teamGap, 0);
  assert.deepEqual(split.teamA.map(({ id }) => id).sort(), ['a', 'd']);
  assert.deepEqual(split.teamB.map(({ id }) => id).sort(), ['b', 'c']);
}

// C: Social-only players can never be placed in Challenge.
{
  const socialPlayers = [player('a', 3.75), player('b', 3.5), player('c', 3.25), player('d', 3)];
  const result = generateSmartQueueMatch({
    players: socialPlayers,
    preferences: socialPlayers.map(({ id }) => preference(id, ['social'])),
    now: new Date('2026-08-16T09:00:00Z').getTime()
  });
  assert.equal(result.match.mode, 'social');
}

// D: the latest shared record changes eligibility immediately.
{
  const compatible = [player('a', 3.75), player('b', 3.5), player('c', 3.25), player('d', 3)];
  const base = [
    preference('a', ['balanced']), preference('b', ['balanced']),
    preference('c', ['social']), preference('d', ['social'])
  ];
  assert.equal(generateSmartQueueMatch({ players: compatible, preferences: base }).match, null);
  const updated = base.map((row) => row.eventPlayerId === 'c' || row.eventPlayerId === 'd' ? { ...row, modes: ['social', 'balanced'], preferredMode: 'balanced' } : row);
  assert.equal(generateSmartQueueMatch({ players: compatible, preferences: updated }).match.mode, 'balanced');
}

// E: PLAYING players are excluded even if their Smart Queue preference is stale READY.
{
  const result = generateSmartQueueMatch({
    players,
    preferences: players.map(({ id }) => preference(id, ['balanced'])),
    matches: [{ id: 'active', status: 'playing', teamA: ['a', 'b'], teamB: ['c', 'd'] }]
  });
  assert.equal(result.match, null);
}

// G: when team balance is equal, a recent partner pairing is avoided.
{
  const equalPlayers = ['a', 'b', 'c', 'd'].map((id) => player(id, 3.5));
  const history = [{ id: 'old', status: 'confirmed', teamA: ['a', 'b'], teamB: ['c', 'd'], teamAScore: 11, teamBScore: 8, completedAt: '2026-08-16T08:30:00Z' }];
  const split = chooseBalancedSmartQueueTeams(equalPlayers, (await import('../src/logic/smartQueue/smartQueueEngine.js')).buildSmartQueueHistory(history));
  assert.notDeepEqual(split.teamA.map(({ id }) => id).sort(), ['a', 'b']);
  assert.notDeepEqual(split.teamB.map(({ id }) => id).sort(), ['c', 'd']);
}

// H: long waiting time increases priority without bypassing the level guardrail.
{
  const pool = [player('a', 3), player('b', 3), player('c', 3.25), player('d', 3.25), player('e', 3.25)];
  const preferences = pool.map(({ id }) => preference(id, ['balanced'], { readySince: id === 'a' ? '2026-08-16T05:00:00Z' : '2026-08-16T08:55:00Z' }));
  const result = generateSmartQueueMatch({ players: pool, preferences, now: new Date('2026-08-16T09:00:00Z').getTime() });
  assert.ok(result.match.playerIds.includes('a'));
  const unsafe = [...pool, player('x', 5)];
  const unsafePreferences = [...preferences, preference('x', ['balanced'], { readySince: '2026-08-15T01:00:00Z' })];
  assert.equal(generateSmartQueueMatch({ players: unsafe, preferences: unsafePreferences, now: new Date('2026-08-16T09:00:00Z').getTime() }).match.playerIds.includes('x'), false);
}

// I/J/K: feature state and Smart Queue metadata are isolated and survive reloads.
{
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const store = createSmartQueueStore({ mode: 'mock' });
  assert.equal((await store.load('event-a')).enabled, false);
  await store.setEnabled({ eventId: 'event-a', organizationId: 'org-a', enabled: true });
  for (const id of ['a', 'b', 'c', 'd']) {
    await store.savePreference({ eventId: 'event-a', organizationId: 'org-a', eventPlayerId: id, modes: ['balanced'], preferredMode: 'balanced', status: 'ready' });
  }
  const ready = await store.recordMatch({ matchId: 'match-a', eventId: 'event-a', organizationId: 'org-a', courtNumber: 1, playMode: 'balanced' });
  assert.equal(ready.state, 'match_ready');
  assert.equal((await store.setMatchState(ready, 'playing')).state, 'playing');
  assert.equal((await store.setMatchState(ready, 'confirmed')).state, 'confirmed');
  const reloaded = await createSmartQueueStore({ mode: 'mock' }).load('event-a');
  assert.equal(reloaded.enabled, true);
  assert.equal(reloaded.preferences.length, 4);
  assert.equal(reloaded.matches[0].state, 'confirmed');
  assert.equal((await store.load('event-b')).enabled, false);
  delete globalThis.localStorage;
}

// Shared mode routes organizer writes through the protected Admin Edge Function.
{
  const adminCalls = [];
  const directWrites = [];
  const fakeSupabase = {
    functions: {
      invoke: async (name, { body }) => {
        adminCalls.push({ name, body });
        if (body.action === 'smartQueueSetEnabled') return { data: { ok: true, setting: { enabled: body.enabled } }, error: null };
        if (body.action === 'smartQueueSavePreference') return { data: { ok: true, preference: { event_player_id: body.eventPlayerId, event_id: body.eventId, organization_id: body.organizationId, modes: body.modes, preferred_mode: body.preferredMode, queue_status: body.status } }, error: null };
        return { data: { ok: true, match: { match_id: body.matchId, event_id: body.eventId, organization_id: body.organizationId, court_number: body.courtNumber, play_mode: body.playMode, queue_state: body.state } }, error: null };
      }
    },
    from: (table) => ({
      upsert: (row) => ({
        select: () => ({
          single: async () => {
            directWrites.push({ table, row });
            return { data: row, error: null };
          }
        })
      })
    })
  };
  const store = createSmartQueueStore({ supabase: fakeSupabase, mode: 'supabase', getAdminPasscode: () => 'test-passcode' });
  await store.setEnabled({ eventId: 'event-a', organizationId: 'org-a', enabled: true });
  await store.savePreference({ eventId: 'event-a', organizationId: 'org-a', eventPlayerId: 'player-a', modes: ['balanced'], preferredMode: 'balanced', status: 'ready', updatedBy: 'admin' });
  await store.recordMatch({ matchId: 'match-a', eventId: 'event-a', organizationId: 'org-a', courtNumber: 1, playMode: 'balanced' });
  assert.deepEqual(adminCalls.map(({ body }) => body.action), ['smartQueueSetEnabled', 'smartQueueSavePreference', 'smartQueueRecordMatch']);
  assert.equal(directWrites.length, 0);
  await store.savePreference({ eventId: 'event-a', organizationId: 'org-a', eventPlayerId: 'player-a', modes: ['social'], preferredMode: 'social', status: 'ready', updatedBy: 'player' });
  assert.equal(directWrites[0].table, 'v2_smart_queue_preferences');
}

console.log('v2 Smart Queue engine tests passed');
