import assert from 'node:assert/strict';
import { checkInPlayer, findPlayerProfileByEmail, getAuthenticatedPlayer, joinVerifiedPlayerEvent, joinInstantPlayerEvent, updateMyPlayerProfile, requestPlayerProfileClaim } from '../src/services/supabasePlayerService.js';
import { confirmScore, updateConfirmedScore, updateMatchPreview } from '../src/services/supabaseMatchService.js';
import { invokeTestAdmin } from '../src/services/testAdminService.js';
import { normalizeEdgeFunctionError } from '../src/services/edgeFunctionError.js';
import { chooseCurrentOrganizerEvent } from '../src/services/organizerEventSelection.js';

function result(value) {
  return Promise.resolve(value);
}

function memoryStorage(seed = {}) {
  const storage = { ...seed };
  Object.defineProperties(storage, {
    getItem: { enumerable: false, value(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? String(storage[key]) : null; } },
    setItem: { enumerable: false, value(key, value) { storage[key] = String(value); } },
    removeItem: { enumerable: false, value(key) { delete storage[key]; } },
    clear: { enumerable: false, value() { Object.keys(storage).forEach((key) => delete storage[key]); } }
  });
  return storage;
}

// Default Organizer loading must prefer the active event over a completed
// event remembered by the same device. An explicit URL remains authoritative.
{
  const completed = { id: 'event-old', status: 'completed' };
  const live = { id: 'event-live', status: 'live' };
  assert.equal(chooseCurrentOrganizerEvent([completed, live], { selectedEventId: completed.id }).id, live.id);
  assert.equal(chooseCurrentOrganizerEvent([completed, live], { explicitEventId: completed.id, selectedEventId: live.id }).id, completed.id);
}

function playerServiceFake({ user = null, existingProfile = null, existingEventPlayer = null } = {}) {
  const operations = [];
  const rows = {
    v2_players: existingProfile,
    v2_event_players: existingEventPlayer
  };

  function query(table) {
    const state = { table, action: 'select', payload: null, filters: [] };
    const chain = {
      select() { return chain; },
      eq(field, value) { state.filters.push(['eq', field, value]); return chain; },
      ilike(field, value) { state.filters.push(['ilike', field, value]); return chain; },
      neq(field, value) { state.filters.push(['neq', field, value]); return chain; },
      order() { return chain; },
      limit() { return chain; },
      update(payload) { state.action = 'update'; state.payload = payload; return chain; },
      insert(payload) { state.action = 'insert'; state.payload = payload; return chain; },
      maybeSingle() {
        operations.push({ ...state });
        return result({ data: rows[table] || null, error: null });
      },
      single() {
        operations.push({ ...state });
        if (state.action === 'insert' || state.action === 'update') {
          const base = table === 'v2_players'
            ? { id: 'profile-1', organization_id: 'org-1', ...state.payload }
            : { id: 'event-player-1', event_id: 'event-1', organization_id: 'org-1', created_at: new Date().toISOString(), ...state.payload };
          rows[table] = base;
          return result({ data: base, error: null });
        }
        return result({ data: rows[table], error: null });
      }
    };
    return chain;
  }

  return {
    operations,
    auth: {
      getUser: () => result(user
        ? { data: { user }, error: null }
        : { data: { user: null }, error: { message: 'Auth session missing' } })
    },
    from: query,
    storage: {
      from: () => ({
        upload: () => result({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/avatar.webp' } })
      })
    }
  };
}

// Guest registration remains available without an authenticated profile.
{
  const supabase = playerServiceFake();
  const player = await checkInPlayer(supabase, {
    organizationId: 'org-1',
    eventId: 'event-1',
    displayName: 'Walk-in Guest',
    level: 3
  });
  assert.equal(player.displayName, 'Walk-in Guest');
  assert.equal(player.playerId, null);
  assert.equal(player.profileLinked, false);
  assert.equal(player.profileFallback, false);
  const insert = supabase.operations.find((operation) => operation.table === 'v2_event_players' && operation.action === 'insert');
  assert.equal('avatar_url' in insert.payload, false);
}

// Supplying an email while signed out does not expose or create a public profile.
{
  const supabase = playerServiceFake();
  const player = await checkInPlayer(supabase, {
    organizationId: 'org-1',
    eventId: 'event-1',
    displayName: 'Email Guest',
    email: 'guest@example.com',
    level: 3.25
  });
  assert.equal(player.profileFallback, true);
  assert.equal(supabase.operations.some((operation) => operation.table === 'v2_players'), false);
  assert.equal(await findPlayerProfileByEmail(supabase, 'org-1', 'guest@example.com'), null);
}

// A verified email creates an owner-scoped profile and links the event player.
{
  const user = { id: 'auth-user-1', email: 'player@example.com', email_confirmed_at: '2026-08-12T01:00:00.000Z' };
  const supabase = playerServiceFake({ user });
  const player = await checkInPlayer(supabase, {
    organizationId: 'org-1',
    eventId: 'event-1',
    displayName: 'Verified Player',
    email: 'PLAYER@example.com',
    level: 4
  });
  assert.equal(player.profileLinked, true);
  assert.equal(player.profileFallback, false);
  assert.equal(player.playerId, 'profile-1');
  const profileInsert = supabase.operations.find((operation) => operation.table === 'v2_players' && operation.action === 'insert');
  assert.equal(profileInsert.payload.user_id, user.id);
  assert.equal(profileInsert.payload.email, 'player@example.com');
  assert.deepEqual(await getAuthenticatedPlayer(supabase), {
    id: user.id,
    email: user.email,
    emailVerified: true,
    emailVerifiedAt: user.email_confirmed_at
  });
}

// Strict QR registration requires verified auth and delegates the atomic join to one RPC.
{
  const calls = [];
  const user = { id: 'auth-user-2', email: 'qr@example.com', email_confirmed_at: '2026-08-12T02:00:00.000Z' };
  const supabase = {
    auth: { getUser: () => result({ data: { user }, error: null }) },
    rpc(name, payload) {
      calls.push([name, payload]);
      return result({ data: { event_player_id: 'ep-1', player_profile_id: 'profile-2', display_name: 'QR Player', already_joined: false, email_verified: true }, error: null });
    }
  };
  const joined = await joinVerifiedPlayerEvent(supabase, { eventId: 'event-1', displayName: ' QR Player ', level: 3.5 });
  assert.equal(joined.eventPlayerId, 'ep-1');
  assert.equal(joined.emailVerified, true);
  assert.deepEqual(calls, [['v2_join_verified_player_event', { p_event_id: 'event-1', p_display_name: 'QR Player', p_level: 3.5, p_avatar_url: null }]]);
}

// Unverified sessions cannot create a permanent QR profile.
{
  const supabase = { auth: { getUser: () => result({ data: { user: { id: 'unverified', email: 'new@example.com' } }, error: null }) } };
  await assert.rejects(() => joinVerifiedPlayerEvent(supabase, { eventId: 'event-1', displayName: 'New Player', level: 3 }), /EMAIL_NOT_VERIFIED/);
}

// Instant QR registration does not use Auth or trigger an email delivery.
{
  const calls = [];
  const supabase = {
    rpc(name, payload) {
      calls.push([name, payload]);
      return result({ data: { event_player_id: 'ep-instant', player_profile_id: 'profile-instant', display_name: 'Walk In', already_joined: false, email_verified: false, smart_queue_preference_capability: 'capability-token' }, error: null });
    }
  };
  const joined = await joinInstantPlayerEvent(supabase, { eventId: 'event-1', displayName: ' Walk In ', email: ' WALKIN@OUTLOOK.COM ', level: 3.75 });
  assert.equal(joined.eventPlayerId, 'ep-instant');
  assert.equal(joined.emailVerified, false);
  assert.equal(joined.smartQueueCapability, 'capability-token');
  assert.deepEqual(calls, [['v2_join_instant_player_event_with_smart_queue_session', { p_event_id: 'event-1', p_display_name: 'Walk In', p_email: 'walkin@outlook.com', p_level: 3.75 }]]);
}

// Profile edits and historical claims use their owner-scoped RPCs.
{
  const calls = [];
  const user = { id: 'auth-user-3', email: 'owner@example.com', email_confirmed_at: '2026-08-12T03:00:00.000Z' };
  const supabase = {
    auth: { getUser: () => result({ data: { user }, error: null }) },
    rpc(name, payload) {
      calls.push([name, payload]);
      return result({ data: name === 'v2_request_player_profile_claim' ? 'claim-1' : { id: 'profile-3', display_name: payload.p_display_name }, error: null });
    }
  };
  const updated = await updateMyPlayerProfile(supabase, { displayName: 'Owner Name', level: 4.25 });
  const claimId = await requestPlayerProfileClaim(supabase, 'event-player-old');
  assert.equal(updated.display_name, 'Owner Name');
  assert.equal(claimId, 'claim-1');
  assert.deepEqual(calls, [
    ['v2_update_my_player_profile', { p_display_name: 'Owner Name', p_avatar_url: null, p_default_level: 4.25 }],
    ['v2_request_player_profile_claim', { p_event_player_id: 'event-player-old' }]
  ]);
}

// Score confirmation uses the database transaction guard before returning.
{
  const rpcCalls = [];
  const row = {
    id: 'match-1',
    event_id: 'event-1',
    organization_id: 'org-1',
    court_number: 1,
    status: 'confirmed',
    team_a_score: 11,
    team_b_score: 8,
    winner: 'A',
    players: []
  };
  const supabase = {
    rpc(name, payload) {
      rpcCalls.push([name, payload]);
      return result({ error: null });
    },
    from() {
      let selection = '';
      const chain = {
        select(value) { selection = value; return chain; },
        eq() { return chain; },
        single() {
          return result({
            data: selection === 'id,status' ? { id: row.id, status: 'playing' } : row,
            error: null
          });
        }
      };
      return chain;
    }
  };
  const confirmed = await confirmScore(supabase, row.id, { teamAScore: 11, teamBScore: 8 });
  assert.equal(confirmed.status, 'confirmed');
  assert.deepEqual(rpcCalls, [['v2_confirm_score_safely', {
    p_match_id: 'match-1',
    p_team_a_score: 11,
    p_team_b_score: 8
  }]]);
}

// Preview roster changes use one database transaction and preserve player order.
{
  const rpcCalls = [];
  const row = {
    id: 'preview-1',
    event_id: 'event-1',
    organization_id: 'org-1',
    court_number: 1,
    status: 'preview',
    players: [
      { event_player_id: 'p1', team: 'A', slot: 1 },
      { event_player_id: 'p2', team: 'A', slot: 2 },
      { event_player_id: 'p3', team: 'B', slot: 1 },
      { event_player_id: 'p4', team: 'B', slot: 2 }
    ]
  };
  const supabase = {
    rpc(name, payload) {
      rpcCalls.push([name, payload]);
      return result({ error: null });
    },
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        single() { return result({ data: row, error: null }); }
      };
      return chain;
    }
  };
  const updated = await updateMatchPreview(supabase, row.id, {
    teamA: ['p4', 'p2'],
    teamB: ['p3', 'p1']
  });
  assert.deepEqual(updated.teamA, ['p1', 'p2']);
  assert.deepEqual(rpcCalls, [['v2_update_match_preview_safely', {
    p_match_id: 'preview-1',
    p_event_player_ids: ['p4', 'p2', 'p3', 'p1']
  }]]);
}

// Historical score corrections must not use a normal player RPC.
{
  const rpcCalls = [];
  const row = {
    id: 'confirmed-1', event_id: 'event-1', organization_id: 'org-1', court_number: 1,
    status: 'confirmed', team_a_score: 9, team_b_score: 11, winner: 'B', players: []
  };
  const supabase = {
    rpc(name, payload) { rpcCalls.push([name, payload]); return result({ error: null }); },
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        single() { return result({ data: row, error: null }); }
      };
      return chain;
    }
  };
  await assert.rejects(
    updateConfirmedScore(supabase, row.id, { teamAScore: 11, teamBScore: 9 }),
    /authorized Admin Results Editor/
  );
  assert.deepEqual(rpcCalls, []);
}

// Edge errors preserve the response status and message for actionable Organizer feedback.
{
  const normalized = await normalizeEdgeFunctionError({
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify({ error: 'Sign in with an authorized Admin account first' }), { status: 403, headers: { 'content-type': 'application/json' } })
  });
  assert.equal(normalized.message, 'Sign in with an authorized Admin account first');
  assert.equal(normalized.status, 403);
}

// Expired Test Admin capabilities are removed after a 401 to stop repeated polling.
{
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = memoryStorage({ 'gdsq_v2_test_admin_session:event-stale': 'expired-capability' });
  const supabase = {
    functions: {
      invoke: () => result({
        data: null,
        error: { message: 'non-2xx', context: new Response(JSON.stringify({ error: 'Test Admin session expired', code: 'TEST_ADMIN_UNAUTHORIZED' }), { status: 401, headers: { 'content-type': 'application/json' } }) }
      })
    }
  };
  await assert.rejects(() => invokeTestAdmin(supabase, 'getEvent', { eventId: 'event-stale' }), /expired/);
  assert.equal(globalThis.localStorage.getItem('gdsq_v2_test_admin_session:event-stale'), null);
  globalThis.localStorage = previousLocalStorage;
}

console.log('v2 Supabase service tests passed');
