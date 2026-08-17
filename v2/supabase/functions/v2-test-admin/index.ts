import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const origins = new Set(['https://donnuttapong-dotcom.github.io', 'https://gdsq-open-play-live.vercel.app', 'http://127.0.0.1:4175', 'http://localhost:4175']);
const allowedActions = new Set(['createEvent', 'authorize', 'getEvent', 'listPlayers', 'listMatches', 'listPreferences', 'exit', 'endTest', 'checkInPlayer', 'setPlayerStatus', 'updatePlayerLevel', 'removePlayer', 'createMatchPreview', 'updateMatchPreview', 'startMatch', 'cancelMatch', 'confirmScore', 'savePreference', 'resetMatches', 'resetQueue', 'resetEvent', 'deleteEvent']);

function cors(origin: string | null) {
  return { 'Access-Control-Allow-Origin': origin && origins.has(origin) ? origin : 'https://donnuttapong-dotcom.github.io', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
}
function json(body: Record<string, unknown>, status = 200, origin: string | null = null) { return new Response(JSON.stringify(body), { status, headers: cors(origin) }); }
function validId(value: unknown) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }
function base64Url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
function fromBase64Url(value: string) { const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)); }
async function digest(value: string) { const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(result)).map((item) => item.toString(16).padStart(2, '0')).join(''); }
async function sign(value: string) { const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(serviceRoleKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', secret, new TextEncoder().encode(value)))); }
async function tokenFor(payload: Record<string, unknown>) { const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload))); return `${encoded}.${await sign(encoded)}`; }
async function verifyToken(value: string) { const [encoded, signature] = String(value || '').split('.'); if (!encoded || !signature || signature !== await sign(encoded)) return null; try { return JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))); } catch { return null; } }
function ip(request: Request) { return (request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown').split(',')[0].trim(); }
function normalizeLevel(value: unknown) { return Math.max(2, Math.min(8, Math.round(Number(value || 3) * 4) / 4)); }
function matchRows(eventId: string, organizationId: string, matchId: string, teamA: string[], teamB: string[]) { return [...teamA, ...teamB].map((eventPlayerId, index) => ({ organization_id: organizationId, event_id: eventId, match_id: matchId, event_player_id: eventPlayerId, team: index < 2 ? 'A' : 'B', slot: index < 2 ? index + 1 : index - 1 })); }

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (request.method !== 'POST' || (origin && !origins.has(origin))) return json({ ok: false, error: 'Not allowed' }, 403, origin);
  if (!url || !serviceRoleKey) return json({ ok: false, error: 'Test Admin service is not configured' }, 500, origin);
  const body = await request.json().catch(() => null);
  const action = String(body?.action || '');
  if (!allowedActions.has(action)) return json({ ok: false, error: 'Invalid Test Admin request' }, 400, origin);
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
    const claims = await verifyToken(String(body?.capability || ''));
    const eventId = String(body?.eventId || '');
    if (!claims || claims.environment !== 'test' || !validId(eventId) || claims.eventId !== eventId || Number(claims.exp || 0) < Date.now()) throw new Error('Test Admin session expired. Enter the passcode again.');
    const { data: session, error } = await admin.from('v2_test_admin_sessions').select('id,event_id,organization_id,expires_at,revoked_at,event:v2_test_events!inner(id,environment)').eq('id', claims.sid).eq('event_id', eventId).maybeSingle();
    if (error || !session || session.revoked_at || new Date(session.expires_at).getTime() < Date.now() || session.event?.environment !== 'test') throw new Error('Test Admin session is not valid.');
    await admin.from('v2_test_admin_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', session.id);
    return { eventId, organizationId: session.organization_id };
  }

  try {
    if (action === 'createEvent') {
      if (!await verifyPasscode(body?.passcode)) return json({ ok: false, error: 'Invalid Test Admin passcode' }, 401, origin);
      const name = String(body?.name || '').trim(); const organizationId = String(body?.organizationId || '00000000-0000-4000-8000-000000000001');
      if (!name || !validId(organizationId)) return json({ ok: false, error: 'Invalid test event' }, 400, origin);
      const { data: event, error } = await admin.from('v2_test_events').insert({ organization_id: organizationId, name, venue_name: String(body?.venueName || 'Test Venue'), event_date: String(body?.eventDate || new Date().toISOString().slice(0, 10)), start_time: String(body?.startTime || '16:00'), end_time: String(body?.endTime || '18:00'), court_count: Math.max(1, Math.min(10, Number(body?.courtCount || 4))), status: String(body?.status || 'live'), matching_mode: body?.matchingMode === 'smart_queue' ? 'smart_queue' : 'standard', environment: 'test' }).select('*').single();
      if (error) throw error;
      return json({ ok: true, event, capability: await issue(event) }, 200, origin);
    }
    if (action === 'authorize') {
      const eventId = String(body?.eventId || '');
      if (!validId(eventId) || !await verifyPasscode(body?.passcode)) return json({ ok: false, error: 'Invalid Test Admin passcode' }, 401, origin);
      const { data: event, error } = await admin.from('v2_test_events').select('*').eq('id', eventId).eq('environment', 'test').maybeSingle();
      if (error || !event) return json({ ok: false, error: 'Test event not found' }, 404, origin);
      return json({ ok: true, event, capability: await issue(event) }, 200, origin);
    }
    const scope = await requireSession();
    if (action === 'exit') { await admin.from('v2_test_admin_sessions').update({ revoked_at: new Date().toISOString() }).eq('event_id', scope.eventId).is('revoked_at', null); return json({ ok: true }, 200, origin); }
    if (action === 'getEvent') { const { data: event, error } = await admin.from('v2_test_events').select('*').eq('id', scope.eventId).single(); if (error) throw error; return json({ ok: true, event }, 200, origin); }
    if (action === 'listPlayers') { const { data: players, error } = await admin.from('v2_test_event_players').select('*').eq('event_id', scope.eventId).neq('status', 'removed').order('queue_joined_at'); if (error) throw error; return json({ ok: true, players: players || [] }, 200, origin); }
    if (action === 'listMatches') { const { data: matches, error } = await admin.from('v2_test_matches').select('*, players:v2_test_match_players(*)').eq('event_id', scope.eventId).order('created_at', { ascending: false }); if (error) throw error; return json({ ok: true, matches: matches || [] }, 200, origin); }
    if (action === 'listPreferences') { const { data: preferences, error } = await admin.from('v2_test_smart_queue_preferences').select('*').eq('event_id', scope.eventId); if (error) throw error; return json({ ok: true, preferences: preferences || [] }, 200, origin); }
    if (action === 'endTest') { const { data: event, error } = await admin.from('v2_test_events').update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', scope.eventId).eq('environment', 'test').select('*').single(); if (error) throw error; return json({ ok: true, event }, 200, origin); }
    if (action === 'checkInPlayer') {
      const displayName = String(body?.displayName || '').trim(); if (!displayName || displayName.length > 50) return json({ ok: false, error: 'Invalid test player name' }, 400, origin);
      const { data, error } = await admin.from('v2_test_event_players').insert({ organization_id: scope.organizationId, event_id: scope.eventId, display_name: displayName, estimated_level: normalizeLevel(body?.level), status: 'ready', queue_joined_at: new Date().toISOString() }).select('*').single();
      if (error) throw error; return json({ ok: true, player: data }, 200, origin);
    }
    if (action === 'setPlayerStatus' || action === 'updatePlayerLevel' || action === 'removePlayer') {
      const id = String(body?.playerId || ''); if (!validId(id)) return json({ ok: false, error: 'Invalid test player' }, 400, origin);
      const patch = action === 'setPlayerStatus' ? { status: ['ready', 'rest', 'playing', 'removed'].includes(String(body?.status)) ? body.status : 'ready', updated_at: new Date().toISOString() } : action === 'updatePlayerLevel' ? { estimated_level: normalizeLevel(body?.level), updated_at: new Date().toISOString() } : { status: 'removed', updated_at: new Date().toISOString() };
      const { data, error } = await admin.from('v2_test_event_players').update(patch).eq('id', id).eq('event_id', scope.eventId).select('*').single(); if (error) throw error; return json({ ok: true, player: data }, 200, origin);
    }
    if (action === 'createMatchPreview' || action === 'updateMatchPreview') {
      const teamA = Array.isArray(body?.teamA) ? body.teamA.map(String) : []; const teamB = Array.isArray(body?.teamB) ? body.teamB.map(String) : []; const ids = [...teamA, ...teamB];
      if (ids.length !== 4 || new Set(ids).size !== 4 || ids.some((id) => !validId(id))) return json({ ok: false, error: 'Choose four different test players' }, 400, origin);
      const { data: participants, error: participantError } = await admin.from('v2_test_event_players').select('id').eq('event_id', scope.eventId).in('id', ids).neq('status', 'removed'); if (participantError || participants?.length !== 4) return json({ ok: false, error: 'Invalid test players' }, 400, origin);
      let matchId = String(body?.matchId || '');
      if (action === 'createMatchPreview') {
        const court = Math.max(1, Math.min(10, Number(body?.courtNumber || 1)));
        const { data: active, error: activeError } = await admin.from('v2_test_matches').select('id,court_number,players:v2_test_match_players(event_player_id)').eq('event_id', scope.eventId).in('status', ['preview', 'playing']); if (activeError) throw activeError;
        if ((active || []).some((match) => Number(match.court_number) === court || (match.players || []).some((row: Record<string, unknown>) => ids.includes(String(row.event_player_id))))) return json({ ok: false, error: 'Court or player is already in an active test match' }, 409, origin);
        const { data: match, error } = await admin.from('v2_test_matches').insert({ organization_id: scope.organizationId, event_id: scope.eventId, court_number: court, status: 'preview' }).select('*').single(); if (error) throw error; matchId = match.id;
      } else {
        const { data: match, error } = await admin.from('v2_test_matches').select('id,status').eq('id', matchId).eq('event_id', scope.eventId).eq('status', 'preview').maybeSingle(); if (error || !match) return json({ ok: false, error: 'Preview not found' }, 404, origin);
        await admin.from('v2_test_match_players').delete().eq('match_id', matchId);
      }
      const { error: rowsError } = await admin.from('v2_test_match_players').insert(matchRows(scope.eventId, scope.organizationId, matchId, teamA, teamB)); if (rowsError) throw rowsError;
      const { data: match, error: matchError } = await admin.from('v2_test_matches').select('*, players:v2_test_match_players(*)').eq('id', matchId).single(); if (matchError) throw matchError; return json({ ok: true, match }, 200, origin);
    }
    if (action === 'savePreference') {
      const eventPlayerId = String(body?.eventPlayerId || ''); const modes = [...new Set(Array.isArray(body?.modes) ? body.modes.map(String).filter((mode: string) => ['social', 'balanced', 'challenge'].includes(mode)) : [])];
      if (!validId(eventPlayerId)) return json({ ok: false, error: 'Invalid test player preference' }, 400, origin);
      const { data, error } = await admin.from('v2_test_smart_queue_preferences').upsert({ event_player_id: eventPlayerId, event_id: scope.eventId, organization_id: scope.organizationId, modes, preferred_mode: modes[0] || null, queue_status: body?.status === 'rest' ? 'rest' : 'ready', ready_since: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'event_player_id' }).select('*').single(); if (error) throw error; return json({ ok: true, preference: data }, 200, origin);
    }
    if (action === 'resetMatches' || action === 'resetEvent') { const { error } = await admin.from('v2_test_matches').delete().eq('event_id', scope.eventId); if (error) throw error; }
    if (action === 'resetQueue' || action === 'resetEvent') { const { error } = await admin.from('v2_test_event_players').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('event_id', scope.eventId).neq('status', 'removed'); if (error) throw error; }
    if (action === 'deleteEvent') { const { error } = await admin.from('v2_test_events').delete().eq('id', scope.eventId).eq('environment', 'test'); if (error) throw error; }
    if (['resetMatches', 'resetQueue', 'resetEvent', 'deleteEvent'].includes(action)) return json({ ok: true }, 200, origin);

    const matchId = String(body?.matchId || ''); if (!validId(matchId)) return json({ ok: false, error: 'Invalid test match' }, 400, origin);
    if (action === 'startMatch' || action === 'cancelMatch' || action === 'confirmScore') {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (action === 'startMatch') { patch.status = 'playing'; patch.started_at = new Date().toISOString(); }
      if (action === 'cancelMatch') patch.status = 'cancelled';
      if (action === 'confirmScore') { const a = Number(body?.teamAScore), b = Number(body?.teamBScore); if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 99 || b > 99 || a === b) return json({ ok: false, error: 'Invalid score' }, 400, origin); Object.assign(patch, { status: 'confirmed', team_a_score: a, team_b_score: b, winner: a > b ? 'A' : 'B', completed_at: new Date().toISOString() }); }
      const { data: match, error } = await admin.from('v2_test_matches').update(patch).eq('id', matchId).eq('event_id', scope.eventId).select('*, players:v2_test_match_players(*)').single(); if (error) throw error;
      if (action === 'cancelMatch' || action === 'confirmScore') { const ids = (match.players || []).map((row: Record<string, unknown>) => row.event_player_id); await admin.from('v2_test_event_players').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('event_id', scope.eventId).in('id', ids).neq('status', 'rest'); }
      if (action === 'startMatch') { const ids = (match.players || []).map((row: Record<string, unknown>) => row.event_player_id); await admin.from('v2_test_event_players').update({ status: 'playing', updated_at: new Date().toISOString() }).eq('event_id', scope.eventId).in('id', ids); }
      return json({ ok: true, match }, 200, origin);
    }
    return json({ ok: true }, 200, origin);
  } catch (error) {
    console.error('v2-test-admin', error);
    return json({ ok: false, error: error instanceof Error ? error.message : 'Test Admin request failed' }, 400, origin);
  }
});
