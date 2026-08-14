import assert from 'node:assert/strict';
import {
  calculateGdsqRatingDelta,
  expectedTeamResult,
  getEventRatingSetting,
  setEventRatingEnabled
} from '../src/services/gdsqRatingService.js';

assert.equal(expectedTeamResult(3, 3), 0.5);
assert.equal(calculateGdsqRatingDelta({ teamRating: 3, opponentRating: 3, won: true, scoreFor: 11, scoreAgainst: 8 }), 0.058);
assert.equal(calculateGdsqRatingDelta({ teamRating: 3, opponentRating: 3, won: false, scoreFor: 8, scoreAgainst: 11 }), -0.058);
assert.ok(calculateGdsqRatingDelta({ teamRating: 2.5, opponentRating: 3.5, won: true, scoreFor: 11, scoreAgainst: 9 }) > 0.1);

function queryResult(value) { return Promise.resolve(value); }

{
  const supabase = {
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return queryResult({ data: null, error: null }); }
      };
      return chain;
    }
  };
  assert.deepEqual(await getEventRatingSetting(supabase, 'event-1'), { enabled: false, available: true, row: null });
}

{
  const calls = [];
  const supabase = {
    functions: {
      invoke(name, options) {
        calls.push({ name, options });
        return queryResult({ data: { ok: true, enabled: true, setting: { event_id: 'event-1' } }, error: null });
      }
    }
  };
  const setting = await setEventRatingEnabled(supabase, { eventId: 'event-1', organizationId: 'org-1', enabled: true });
  assert.equal(setting.enabled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'v2-admin-results');
  assert.equal(calls[0].options.body.enabled, true);
  assert.equal(calls[0].options.body.passcode, undefined);
}

{
  const supabase = {
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return queryResult({ data: null, error: { code: '42P01', message: 'relation does not exist' } }); }
      };
      return chain;
    }
  };
  assert.deepEqual(await getEventRatingSetting(supabase, 'event-1'), { enabled: false, available: false });
}

console.log('v2 GDSQ Rating tests passed');
