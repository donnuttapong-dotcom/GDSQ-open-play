import assert from 'node:assert/strict';
import { checkInPlayer, findPlayerProfileByEmail, getAuthenticatedPlayer } from '../src/services/supabasePlayerService.js';
import { confirmScore } from '../src/services/supabaseMatchService.js';

function result(value) {
  return Promise.resolve(value);
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
  const user = { id: 'auth-user-1', email: 'player@example.com' };
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
  assert.deepEqual(await getAuthenticatedPlayer(supabase), user);
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

console.log('v2 Supabase service tests passed');
