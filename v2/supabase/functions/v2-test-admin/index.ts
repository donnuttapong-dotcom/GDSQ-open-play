import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const origins = new Set(['https://donnuttapong-dotcom.github.io', 'https://gdsq-open-play-live.vercel.app', 'https://gdsq-open-play-v2-preview.vercel.app', 'http://127.0.0.1:4175', 'http://localhost:4175']);
const allowedActions = new Set(['createEvent', 'authorize', 'getOrganizerState', 'getEvent', 'listPlayers', 'listMatches', 'listPreferences', 'exit', 'endTest', 'checkInPlayer', 'addTestPlayers', 'setPlayerStatus', 'updatePlayerLevel', 'removePlayer', 'createMatchPreview', 'updateMatchPreview', 'startMatch', 'cancelMatch', 'confirmScore', 'savePreference', 'resetMatches', 'resetQueue', 'resetEvent', 'deleteEvent']);
const activeStatuses = ['preview', 'assigned', 'playing', 'pending_score'];

// Vercel gives every deployment a unique URL. Restrict it to this project's
// deployment naming pattern instead of rejecting a valid preview before it
// can reach the Test Admin capability checks below.
function allowedOrigin(origin: string | null) {
  return Boolean(origin && (origins.has(origin) || /^https:\/\/gdsq-open-play-v2-preview-[a-z0-9-]+-don-s-projects6\.vercel\.app$/i.test(origin)));
}
function cors(origin: string | null) { return { 'Access-Control-Allow-Origin': allowedOrigin(origin) ? String(origin) : 'https://donnuttapong-dotcom.github.io', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }; }
function json(body: Record<string, unknown>, status = 200, origin: string | null = null) { return new Response(JSON.stringify(body), { status, headers: cors(origin) }); }
function validId(value: unknown) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }
function playerId(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value) : String((value as Record<string, unknown>)?.id || (value as Record<string, unknown>)?.playerId || (value as Record<string, unknown>)?.player_id || (value as Record<string, unknown>)?.eventPlayerId || (value as Record<string, unknown>)?.event_player_id || ''); }
function matchIds(body: Record<string, unknown>) { return { teamA: (Array.isArray(body.teamA) ? body.teamA : []).map(playerId).filter(Boolean), teamB: (Array.isArray(body.teamB) ? body.teamB : []).map(playerId).filter(Boolean) }; }
function normalizeLevel(value: unknown) { return Math.max(2, Math.min(8, Math.round(Number(value || 3) * 4) / 4)); }
function base64Url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
function fromBase64Url(value: string) { const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)); }
async function digest(value: string) { const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(result)).map((item) => item.toString(16).padStart(2, '0')).join(''); }
async function sign(value: string) { const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(serviceRoleKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', secret, new TextEncoder().encode(value)))); }
async function tokenFor(payload: Record<string, unknown>) { const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload))); return `${encoded}.${await sign(encoded)}`; }
async function verifyToken(value: string) { const [encoded, signature] = String(value || '').split('.'); if (!encoded || !signature || signature !== await sign(encoded)) return null; try { return JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))); } catch { return null; } }
function ip(request: Request) { return (request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown').split(',')[0].trim(); }
function normalizeMatch(match: Record<string, unknown>) {
  const rows = Array.isArray(match.players) ? match.players as Record<string, unknown>[] : [];
  const team = (side: string) => rows.filter((row) => String(row.team || '').toUpperCase() === side).sort((a, b) => Number(a.slot || 0) - Number(b.slot || 0)).map((row) => playerId(row.event_player_id)).filter(Boolean);
  const courtNumber = Number(match.court_number || match.courtNumber) || null;
  const courtName = String(match.court_name || match.courtName || (courtNumber ? `Court ${courtNumber}` : 'Court -'));
  const matchMode = String(match.match_mode || match.matchMode || match.match_type || 'fair');
  return { ...match, eventId: match.event_id, organizationId: match.organization_id, courtNumber, court_number: courtNumber, courtName, court_name: courtName, teamA: team('A'), teamB: team('B'), teamAScore: match.team_a_score ?? null, teamBScore: match.team_b_score ?? null, startedAt: match.started_at || null, completedAt: match.completed_at || null, matchMode, match_type: matchMode };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (request.method !== 'POST' || (origin && !allowedOrigin(origin))) return json({ ok: false, error: 'Not allowed' }, 403, origin);
  if (!url || !serviceRoleKey) return json({ ok: false, error: 'Test Admin service is not configured' }, 500, origin);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action || '');
  if (!body || !allowedActions.has(action)) return json({ ok: false, error: 'Invalid Test Admin request' }, 400, origin);
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const ipHash = await digest(ip(request));

  async function verifyPasscode(passcode: unknown) {
    const value = String(passcode || '');
    if (value.length < 5 || value.length > 128) return false;
    const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await admin.from('v2_admin_access_attempts').select('*', { count: 'exact', head: true }).eq('ip_hash', ipHash).eq('success', false).gte('created_at', windowStart);
    if ((count || 0) >= 5) throw new Error('Too many attempts. Try again in 15 minutes.');
    const { data: valid, error } = await admin.rpc('v2_admin_verify_passcode', { p_passcode: value });
    const success = !error && valid === true;
    await admin.from('v2_admin_access_attempts').insert({ ip_hash: ipHash, action: `test:${action}`, success });
    return success;
  }

  async function issue(event: Record<string, unknown>) {
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const { data: session, error } = await admin.from('v2_test_admin_sessions').insert({ event_id: event.id, organization_id: event.organization_id, expires_at: expiresAt }).select('id,event_id,organization_id,expires_at').single();
    if (error) throw error;
    return tokenFor({ sid: session.id, eventId: session.event_id, organizationId: session.organization_id, environment: 'test', exp: new Date(expiresAt).getTime() });
  }

  async function requireSession() {
    const claims = await verifyToken(String(body.capability || ''));
    const eventId = String(body.eventId || '');
    if (!claims || claims.environment !== 'test' || !validId(eventId) || claims.eventId !== eventId || Number(claims.exp || 0) < Date.now()) throw new Error('Test Admin session expired. Enter the passcode again.');
    const { data: session, error } = await admin.from('v2_test_admin_sessions').select('id,event_id,organization_id,expires_at,revoked_at,last_used_at,event:v2_test_events!inner(id,environment)').eq('id', claims.sid).eq('event_id', eventId).maybeSingle();
    if (error || !session || session.revoked_at || new Date(session.expires_at).getTime() < Date.now() || session.event?.environment !== 'test') throw new Error('Test Admin session is not valid.');
    // Reads are authorized on every request, but do not create a database write
    // for every poll. Activity is only recorded at most once every five minutes.
    if (!session.last_used_at || Date.now() - new Date(session.last_used_at).getTime() >= 5 * 60 * 1000) await admin.from('v2_test_admin_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', session.id);
    return { eventId, organizationId: session.organization_id };
  }

  async function fetchMatch(matchId: string) {
    const { data, error } = await admin.from('v2_test_matches').select('*, players:v2_test_match_players(*)').eq('id', matchId).single();
    if (error) throw error;
    return normalizeMatch(data);
  }

  async function releasePlayers(match: Record<string, unknown>, scope: { eventId: string }) {
    const ids = [...(match.teamA as string[] || []), ...(match.teamB as string[] || [])];
    const { data: resting, error: preferenceError } = await admin.from('v2_test_smart_queue_preferences').select('event_player_id').eq('event_id', scope.eventId).eq('queue_status', 'rest').in('event_player_id', ids);
    if (preferenceError) throw preferenceError;
    const restIds = new Set((resting || []).map((row) => String(row.event_player_id)));
    const readyIds = ids.filter((id) => !restIds.has(String(id)));
    if (!readyIds.length) return;
    const { error } = await admin.from('v2_test_event_players').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('event_id', scope.eventId).in('id', readyIds);
    if (error) throw error;
  }

  try {
    if (action === 'createEvent') {
      if (!await verifyPasscode(body.passcode)) return json({ ok: false, error: 'Invalid Test Admin passcode' }, 401, origin);
      const name = String(body.name || '').trim(); const organizationId = String(body.organizationId || '00000000-0000-4000-8000-000000000001');
      if (!name || !validId(organizationId)) return json({ ok: false, error: 'Invalid test event' }, 400, origin);
      const { data: event, error } = await admin.from('v2_test_events').insert({ organization_id: organizationId, name, venue_name: String(body.venueName || 'Test Venue'), event_date: String(body.eventDate || new Date().toISOString().slice(0, 10)), start_time: String(body.startTime || '16:00'), end_time: String(body.endTime || '18:00'), court_count: Math.max(1, Math.min(10, Number(body.courtCount || 4))), status: String(body.status || 'live'), matching_mode: body.matchingMode === 'smart_queue' ? 'smart_queue' : 'standard', environment: 'test' }).select('*').single();
      if (error) throw error;
      return json({ ok: true, event, capability: await issue(event) }, 200, origin);
    }
    if (action === 'authorize') {
      const eventId = String(body.eventId || '');
      if (!validId(eventId) || !await verifyPasscode(body.passcode)) return json({ ok: false, error: 'Invalid Test Admin passcode' }, 401, origin);
      const { data: event, error } = await admin.from('v2_test_events').select('*').eq('id', eventId).eq('environment', 'test').maybeSingle();
      if (error || !event) return json({ ok: false, error: 'Test event not found' }, 404, origin);
      return json({ ok: true, event, capability: await issue(event) }, 200, origin);
    }

    const scope = await requireSession();
    if (action === 'exit') { await admin.from('v2_test_admin_sessions').update({ revoked_at: new Date().toISOString() }).eq('event_id', scope.eventId).is('revoked_at', null); return json({ ok: true }, 200, origin); }
    if (action === 'getOrganizerState') {
      const [eventResult, playersResult, matchesResult, preferencesResult] = await Promise.all([
        admin.from('v2_test_events').select('*').eq('id', scope.eventId).single(),
        admin.from('v2_test_event_players').select('*').eq('event_id', scope.eventId).neq('status', 'removed').order('queue_joined_at'),
        admin.from('v2_test_matches').select('*, players:v2_test_match_players(*)').eq('event_id', scope.eventId).order('created_at', { ascending: false }),
        admin.from('v2_test_smart_queue_preferences').select('*').eq('event_id', scope.eventId)
      ]);
      const stateError = eventResult.error || playersResult.error || matchesResult.error || preferencesResult.error;
      if (stateError) throw stateError;
      return json({ ok: true, event: eventResult.data, players: playersResult.data || [], matches: (matchesResult.data || []).map(normalizeMatch), preferences: preferencesResult.data || [] }, 200, origin);
    }
    if (action === 'getEvent') { const { data: event, error } = await admin.from('v2_test_events').select('*').eq('id', scope.eventId).single(); if (error) throw error; return json({ ok: true, event }, 200, origin); }
    if (action === 'listPlayers') { const { data: players, error } = await admin.from('v2_test_event_players').select('*').eq('event_id', scope.eventId).neq('status', 'removed').order('queue_joined_at'); if (error) throw error; return json({ ok: true, players: players || [] }, 200, origin); }
    if (action === 'listMatches') { const { data: matches, error } = await admin.from('v2_test_matches').select('*, players:v2_test_match_players(*)').eq('event_id', scope.eventId).order('created_at', { ascending: false }); if (error) throw error; return json({ ok: true, matches: (matches || []).map(normalizeMatch) }, 200, origin); }
    if (action === 'listPreferences') { const { data: preferences, error } = await admin.from('v2_test_smart_queue_preferences').select('*').eq('event_id', scope.eventId); if (error) throw error; return json({ ok: true, preferences: preferences || [] }, 200, origin); }
    if (action === 'endTest') { const { data: event, error } = await admin.from('v2_test_events').update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', scope.eventId).eq('environment', 'test').select('*').single(); if (error) throw error; return json({ ok: true, event }, 200, origin); }
    if (action === 'checkInPlayer') {
      const displayName = String(body.displayName || '').trim(); if (!displayName || displayName.length > 50) return json({ ok: false, error: 'Invalid test player name' }, 400, origin);
      const { data: existing, error: existingError } = await admin.from('v2_test_event_players').select('id').eq('event_id', scope.eventId).ilike('display_name', displayName).neq('status', 'removed').maybeSingle();
      if (existingError) throw existingError;
      if (existing) return json({ ok: false, error: 'Test player name already exists in this event' }, 409, origin);
      const { data, error } = await admin.from('v2_test_event_players').insert({ organization_id: scope.organizationId, event_id: scope.eventId, display_name: displayName, estimated_level: normalizeLevel(body.level), status: 'ready', queue_joined_at: new Date().toISOString() }).select('*').single();
      if (error) throw error; return json({ ok: true, player: data }, 200, origin);
    }
    if (action === 'addTestPlayers') {
      const requested = Array.isArray(body.players) ? body.players : [];
      if (!requested.length || requested.length > 24) return json({ ok: false, error: 'Add between 1 and 24 test players' }, 400, origin);
      const names = requested.map((row) => String((row as Record<string, unknown>)?.displayName || '').trim());
      const normalizedNames = names.map((name) => name.toLowerCase());
      if (names.some((name) => !name || name.length > 50) || new Set(normalizedNames).size !== names.length) return json({ ok: false, error: 'Test player names must be unique' }, 400, origin);
      const { data: existing, error: existingError } = await admin.from('v2_test_event_players').select('display_name').eq('event_id', scope.eventId).neq('status', 'removed');
      if (existingError) throw existingError;
      const existingNames = new Set((existing || []).map((row) => String(row.display_name || '').trim().toLowerCase()));
      if (normalizedNames.some((name) => existingNames.has(name))) return json({ ok: false, error: 'A Test player name already exists in this event' }, 409, origin);
      const now = new Date().toISOString();
      const { data: created, error: createError } = await admin.from('v2_test_event_players').insert(requested.map((row, index) => ({
        organization_id: scope.organizationId,
        event_id: scope.eventId,
        display_name: names[index],
        estimated_level: normalizeLevel((row as Record<string, unknown>)?.level),
        status: 'ready',
        queue_joined_at: now
      }))).select('*');
      if (createError || !created) throw createError || new Error('Could not add Test players');
      const preferences = Array.isArray(body.preferences) ? body.preferences : [];
      if (preferences.length) {
        const rows = created.map((player, index) => {
          const source = preferences[index] as Record<string, unknown> || {};
          const modes = [...new Set(Array.isArray(source.modes) ? source.modes.map(String).filter((mode) => ['social', 'balanced', 'challenge'].includes(mode)) : [])];
          return { event_player_id: player.id, event_id: scope.eventId, organization_id: scope.organizationId, modes, preferred_mode: modes.includes(String(source.preferredMode || '')) ? String(source.preferredMode) : modes[0] || null, queue_status: 'ready', ready_since: now, updated_by: 'admin', updated_at: now };
        });
        const { error: preferenceError } = await admin.from('v2_test_smart_queue_preferences').upsert(rows, { onConflict: 'event_player_id' });
        if (preferenceError) throw preferenceError;
      }
      return json({ ok: true, players: created }, 200, origin);
    }
    if (action === 'setPlayerStatus' || action === 'updatePlayerLevel' || action === 'removePlayer') {
      const id = String(body.playerId || ''); if (!validId(id)) return json({ ok: false, error: 'Invalid test player' }, 400, origin);
      if (action !== 'updatePlayerLevel') {
        const { count, error: activeError } = await admin.from('v2_test_match_players').select('id,match:v2_test_matches!inner(status)', { count: 'exact', head: true }).eq('event_id', scope.eventId).eq('event_player_id', id).in('match.status', activeStatuses);
        if (activeError) throw activeError;
        if (count) return json({ ok: false, error: 'Finish or cancel the active match before changing this player' }, 409, origin);
      }
      const patch = action === 'setPlayerStatus' ? { status: ['ready', 'rest'].includes(String(body.status)) ? body.status : 'ready', updated_at: new Date().toISOString() } : action === 'updatePlayerLevel' ? { estimated_level: normalizeLevel(body.level), updated_at: new Date().toISOString() } : { status: 'removed', updated_at: new Date().toISOString() };
      const { data, error } = await admin.from('v2_test_event_players').update(patch).eq('id', id).eq('event_id', scope.eventId).select('*').single(); if (error) throw error; return json({ ok: true, player: data }, 200, origin);
    }
    if (action === 'createMatchPreview' || action === 'updateMatchPreview') {
      const { teamA, teamB } = matchIds(body); const ids = [...teamA, ...teamB];
      if (ids.length !== 4 || new Set(ids).size !== 4 || ids.some((id) => !validId(id))) return json({ ok: false, error: 'Choose four different test players' }, 400, origin);
      const court = Math.max(1, Math.min(10, Number(body.courtNumber || 1)));
      const { data: matchId, error } = await admin.rpc('v2_test_save_match_preview', {
        p_event_id: scope.eventId, p_organization_id: scope.organizationId, p_court_number: court, p_court_name: String(body.courtName || `Court ${court}`), p_team_a: teamA, p_team_b: teamB, p_match_mode: String(body.matchMode || body.match_type || 'fair'), p_fairness_score: body.fairnessScore == null ? null : Number(body.fairnessScore), p_idempotency_key: action === 'createMatchPreview' ? String(body.idempotencyKey || '') || null : null, p_match_id: action === 'updateMatchPreview' ? String(body.matchId || '') : null
      });
      if (error) throw error;
      return json({ ok: true, match: await fetchMatch(String(matchId)) }, 200, origin);
    }
    if (action === 'savePreference') {
      const eventPlayerId = String(body.eventPlayerId || ''); const modes = [...new Set(Array.isArray(body.modes) ? body.modes.map(String).filter((mode) => ['social', 'balanced', 'challenge'].includes(mode)) : [])];
      if (!validId(eventPlayerId)) return json({ ok: false, error: 'Invalid test player preference' }, 400, origin);
      const { data: participant, error: playerError } = await admin.from('v2_test_event_players').select('id').eq('id', eventPlayerId).eq('event_id', scope.eventId).neq('status', 'removed').maybeSingle();
      if (playerError || !participant) return json({ ok: false, error: 'Test player not found' }, 404, origin);
      const { data, error } = await admin.from('v2_test_smart_queue_preferences').upsert({ event_player_id: eventPlayerId, event_id: scope.eventId, organization_id: scope.organizationId, modes, preferred_mode: modes.includes(String(body.preferredMode || '')) ? String(body.preferredMode) : modes[0] || null, queue_status: body.status === 'rest' ? 'rest' : 'ready', ready_since: body.status === 'rest' ? null : new Date().toISOString(), updated_by: String(body.updatedBy || 'admin') === 'player' ? 'player' : 'admin', updated_at: new Date().toISOString() }, { onConflict: 'event_player_id' }).select('*').single(); if (error) throw error; return json({ ok: true, preference: data }, 200, origin);
    }
    if (action === 'resetMatches' || action === 'resetEvent') { const { error } = await admin.from('v2_test_matches').delete().eq('event_id', scope.eventId); if (error) throw error; }
    if (action === 'resetQueue' || action === 'resetEvent') {
      const { error: playerError } = await admin.from('v2_test_event_players').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('event_id', scope.eventId).neq('status', 'removed'); if (playerError) throw playerError;
      const { error: preferenceError } = await admin.from('v2_test_smart_queue_preferences').update({ queue_status: 'ready', ready_since: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('event_id', scope.eventId); if (preferenceError) throw preferenceError;
    }
    if (action === 'deleteEvent') { const { error } = await admin.from('v2_test_events').delete().eq('id', scope.eventId).eq('environment', 'test'); if (error) throw error; }
    if (['resetMatches', 'resetQueue', 'resetEvent', 'deleteEvent'].includes(action)) return json({ ok: true }, 200, origin);

    const matchId = String(body.matchId || ''); if (!validId(matchId)) return json({ ok: false, error: 'Invalid test match' }, 400, origin);
    if (action === 'startMatch' || action === 'cancelMatch' || action === 'confirmScore') {
      if (action === 'confirmScore') {
        const existing = await fetchMatch(matchId);
        if (existing.status === 'confirmed') return json({ ok: true, match: existing }, 200, origin);
      }
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const allowedFrom = action === 'startMatch' ? ['preview'] : action === 'cancelMatch' ? activeStatuses : ['playing', 'pending_score'];
      if (action === 'startMatch') Object.assign(patch, { status: 'playing', started_at: new Date().toISOString() });
      if (action === 'cancelMatch') patch.status = 'cancelled';
      if (action === 'confirmScore') { const a = Number(body.teamAScore), b = Number(body.teamBScore); if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 99 || b > 99 || a === b) return json({ ok: false, error: 'Invalid score' }, 400, origin); Object.assign(patch, { status: 'confirmed', team_a_score: a, team_b_score: b, winner: a > b ? 'A' : 'B', completed_at: new Date().toISOString() }); }
      const { data: transition, error } = await admin.from('v2_test_matches').update(patch).eq('id', matchId).eq('event_id', scope.eventId).in('status', allowedFrom).select('id').maybeSingle();
      if (error) throw error;
      if (!transition) {
        const latest = await fetchMatch(matchId);
        if (action === 'confirmScore' && latest.status === 'confirmed') return json({ ok: true, match: latest }, 200, origin);
        return json({ ok: false, error: 'Match changed in another session. Refresh and try again.' }, 409, origin);
      }
      const match = await fetchMatch(matchId);
      const ids = [...match.teamA, ...match.teamB];
      if (action === 'startMatch') { const { error: playerError } = await admin.from('v2_test_event_players').update({ status: 'playing', updated_at: new Date().toISOString() }).eq('event_id', scope.eventId).in('id', ids); if (playerError) throw playerError; }
      if (action === 'cancelMatch' || action === 'confirmScore') await releasePlayers(match, scope);
      return json({ ok: true, match }, 200, origin);
    }
    return json({ ok: true }, 200, origin);
  } catch (error) {
    console.error('v2-test-admin', error);
    return json({ ok: false, error: error instanceof Error ? error.message : String((error as Record<string, unknown>)?.message || 'Test Admin request failed') }, 400, origin);
  }
});
