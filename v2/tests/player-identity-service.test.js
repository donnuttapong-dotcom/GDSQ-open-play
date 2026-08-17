import assert from 'node:assert/strict';
import { joinCanonicalPlayer, capabilityForPlayer, rememberedPlayerIdentity } from '../src/services/playerIdentityService.js';

const stored = new Map();
globalThis.localStorage = {
  getItem: (key) => stored.get(key) || null,
  setItem: (key, value) => stored.set(key, String(value))
};

const calls = [];
const supabase = {
  functions: {
    invoke: async (name, { body }) => {
      calls.push([name, body]);
      return {
        data: {
          ok: true,
          capability: 'a'.repeat(64),
          smartQueueCapability: 'b'.repeat(64),
          alreadyJoined: false,
          profile: { id: 'player-1', player_code: 'GDSQ-0003', display_name: 'Don', default_level: 4, avatar_url: '' },
          eventPlayer: { id: 'event-player-1', event_id: 'event-1', player_id: 'player-1', display_name: 'Don', estimated_level: 4, status: 'ready' }
        },
        error: null
      };
    }
  }
};

const joined = await joinCanonicalPlayer(supabase, { organizationId: 'org-1', eventId: 'event-1', displayName: ' Don ', email: ' DON@OUTLOOK.COM ', level: 4 });
assert.equal(joined.id, 'event-player-1');
assert.equal(joined.playerId, 'player-1');
assert.equal(joined.displayName, 'Don');
assert.equal(joined.profile.playerCode, 'GDSQ-0003');
assert.equal(capabilityForPlayer('player-1'), 'a'.repeat(64));
assert.equal(rememberedPlayerIdentity().playerId, 'player-1');
assert.equal(stored.get('gdsq_v2_smart_queue_capability:event-1:event-player-1'), 'b'.repeat(64));
assert.equal(calls[0][0], 'v2-player-identity');
assert.equal(calls[0][1].email, 'don@outlook.com');
console.log('player identity service tests passed');
