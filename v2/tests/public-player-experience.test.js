import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  deviceOwnsPlayer,
  fastReturnJoin,
  loadFastReturnEvents,
  loadPublicPlayerExperience,
  normalizePlayerCode,
  playerHistoryUrl,
  playerQrImageUrl
} from '../src/services/publicPlayerExperienceService.js';

const originalStorage = globalThis.localStorage;
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) || null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};

assert.equal(normalizePlayerCode(' gdsq-0021 '), 'GDSQ-0021');
const historyUrl = playerHistoryUrl('GDSQ-0021', 'https://example.com/v2/openplay.html');
assert.equal(historyUrl, 'https://example.com/v2/player-history.html?code=GDSQ-0021&mode=supabase');
assert.ok(!historyUrl.includes('@'));
assert.ok(!historyUrl.includes('capability'));
assert.ok(playerQrImageUrl('GDSQ-0021', 'https://example.com/v2/openplay.html').includes(encodeURIComponent(historyUrl)));

memory.set('gdsq_v2_last_identity', JSON.stringify({ playerId: 'profile-1', playerCode: 'GDSQ-0021', displayName: 'Don' }));
memory.set('gdsq_v2_player_capability:profile-1', 'a'.repeat(64));
assert.equal(deviceOwnsPlayer('gdsq-0021'), true);
assert.equal(deviceOwnsPlayer('GDSQ-9999'), false);

const calls = [];
const supabase = {
  functions: {
    invoke: async (_name, { body }) => {
      calls.push(body);
      if (body.action === 'getPublicPlayerHistory') return { data: { ok: true, experience: { profile: { playerCode: body.playerCode } } }, error: null };
      if (body.action === 'listOpenEvents') return { data: { ok: true, events: [{ eventId: 'event-1' }] }, error: null };
      if (body.action === 'join') return { data: { ok: true, eventPlayer: { id: 'ep-1', event_id: body.eventId, status: 'ready' }, profile: null, alreadyJoined: true }, error: null };
      return { data: { ok: false, error: 'INVALID_ACTION' }, error: null };
    }
  }
};

const experience = await loadPublicPlayerExperience(supabase, { organizationId: 'org-1', playerCode: 'gdsq-0021' });
assert.equal(experience.profile.playerCode, 'GDSQ-0021');
assert.deepEqual(await loadFastReturnEvents(supabase, 'org-1'), [{ eventId: 'event-1' }]);
const joined = await fastReturnJoin(supabase, { organizationId: 'org-1', eventId: 'event-1', profile: { playerCode: 'GDSQ-0021', displayName: 'Don', defaultLevel: 3.25 } });
assert.equal(joined.status, 'ready');
assert.equal(joined.alreadyJoined, true);
const joinCall = calls.find((call) => call.action === 'join');
assert.equal(joinCall.playerCode, 'GDSQ-0021');
assert.equal(joinCall.email, '');
assert.equal(joinCall.capability, 'a'.repeat(64));

const migration = fs.readFileSync(new URL('../supabase/migrations/20260820163000_player_experience_phase2.sql', import.meta.url), 'utf8');
assert.match(migration, /hall_of_fame_processed_at is not null/i);
assert.match(migration, /limit greatest\(1, least/i);
assert.match(migration, /revoke all on function public\.v2_public_player_experience_phase2[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute[\s\S]*to service_role/i);
assert.doesNotMatch(migration, /v2_test_/i);
assert.doesNotMatch(migration, /\b(update|delete from|truncate)\s+public\.v2_(matches|match_players|events|event_players)\b/i);

const edge = fs.readFileSync(new URL('../supabase/functions/v2-player-identity/index.ts', import.meta.url), 'utf8');
assert.match(edge, /action === 'getPublicPlayerHistory'/);
assert.match(edge, /action === 'listOpenEvents'/);
assert.match(edge, /action === 'resolveEventPlayerCodes'/);
assert.doesNotMatch(edge, /action === 'listPublicPlayerCodes'/);
assert.match(edge, /event\.completed_at \|\| event\.archived_at \|\| event\.hall_of_fame_processed_at/);
assert.match(edge, /function publicReadProfile/);
const publicReadBody = edge.match(/function publicReadProfile[\s\S]*?\n}/)?.[0] || '';
assert.doesNotMatch(publicReadBody, /\bid:/);
assert.doesNotMatch(publicReadBody, /email|user_id|capability/i);

const page = fs.readFileSync(new URL('../player-history.html', import.meta.url), 'utf8');
assert.match(page, /FastReturnEvents|loadFastReturnEvents/);
assert.match(page, /confirmIdentity/);
assert.match(page, /id="qrUrl"/);
assert.match(page, /ยังไม่มีอีเวนต์เปิดรับ/);
assert.match(page, /No event is currently open/);
assert.doesNotMatch(page, /input[^>]+type=["']email/i);

if (originalStorage === undefined) delete globalThis.localStorage;
else globalThis.localStorage = originalStorage;
console.log('public player experience Phase 2 tests passed');
