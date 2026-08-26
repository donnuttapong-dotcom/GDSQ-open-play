import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const allowedOrigins = new Set(['https://donnuttapong-dotcom.github.io', 'https://gdsq-open-play-live.vercel.app', 'https://gdsq-open-play-v2-preview.vercel.app', 'https://gdsq-open-play-v2-preview-iejv9ad65-don-s-projects6.vercel.app']);
const allowedAdminEmails = new Set((Deno.env.get('GDSQ_ADMIN_EMAILS') || 'don.nuttapong@gmail.com').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
const openOrganizerActions = new Set([
  'createEvent', 'setEventStatus',
  'smartQueueSavePreference', 'smartQueueRecordMatch',
  'updateEventPlayerStatus', 'updateEventPlayerLevel', 'removeEventPlayer',
  'createMatchPreview', 'updateMatchPreview', 'createMatchNext', 'updateMatchNext', 'cancelMatchNext', 'startMatch', 'cancelMatch', 'confirmScore'
]);
const organizerDeviceActions = new Set(['endEventAndSaveResults', 'deleteEvent']);
const passcodeOnlyAdminResultsActions = new Set([
  'verify', 'listEvents',
  'updateScore', 'updatePlayers', 'deleteMatch',
  'archiveEvent', 'restoreEvent', 'permanentlyDeleteEvent'
]);

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://donnuttapong-dotcom.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
}
function json(body: Record<string, unknown>, status = 200, origin: string | null = null) { return new Response(JSON.stringify(body), { status, headers: cors(origin) }); }
async function hash(value: string) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
function clientIp(request: Request) { return (request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown').split(',')[0].trim(); }
function validId(value: unknown) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }
function randomToken() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join(''); }

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (request.method !== 'POST' || (origin && !allowedOrigins.has(origin))) return json({ ok: false, error: 'Not allowed' }, 403, origin);
  if (!url || !serviceRoleKey) return json({ ok: false, error: 'Admin service is not configured' }, 500, origin);
  const body = await request.json().catch(() => null);
  const action = String(body?.action || ''), passcode = String(body?.passcode || '');
  if (!['verify', 'listEvents', 'listProfiles', 'listMembers', 'getMember', 'listLegacyCandidates', 'linkLegacyHistory', 'listClaims', 'updateProfileName', 'reviewClaim', 'updateScore', 'updatePlayers', 'deleteMatch', 'archiveEvent', 'restoreEvent', 'permanentlyDeleteEvent', 'linkPlayer', 'setRating', 'smartQueueSetEnabled', 'smartQueueSavePreference', 'smartQueueRecordMatch', 'updateEventPlayerStatus', 'updateEventPlayerLevel', 'removeEventPlayer', 'createEvent', 'setEventStatus', 'endEventAndSaveResults', 'deleteEvent', 'createMatchPreview', 'updateMatchPreview', 'createMatchNext', 'updateMatchNext', 'cancelMatchNext', 'startMatch', 'cancelMatch', 'confirmScore'].includes(action) || passcode.length > 128 || (!openOrganizerActions.has(action) && !organizerDeviceActions.has(action) && passcode.length < 5)) return json({ ok: false, error: 'Invalid request' }, 400, origin);
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const ipHash = await hash(clientIp(request));
  let organizerDeviceAuthorized = false;
  if (organizerDeviceActions.has(action)) {
    const eventId = String(body?.eventId || ''), organizationId = String(body?.organizationId || '');
    const organizerToken = String(body?.organizerToken || '');
    if (!validId(eventId) || !validId(organizationId) || !/^[0-9a-f]{64}$/i.test(organizerToken)) {
      return json({ ok: false, code: 'ORGANIZER_DEVICE_KEY_REQUIRED', error: 'This event can only be completed or deleted from its Organizer device' }, 403, origin);
    }
    const tokenHash = await hash(organizerToken);
    const { data: deviceKey, error: deviceKeyError } = await admin
      .from('v2_event_organizer_keys')
      .select('event_id')
      .eq('event_id', eventId)
      .eq('organization_id', organizationId)
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .maybeSingle();
    if (deviceKeyError || !deviceKey) {
      return json({ ok: false, code: 'ORGANIZER_DEVICE_KEY_INVALID', error: 'Organizer device key is missing or invalid' }, 403, origin);
    }
    organizerDeviceAuthorized = true;
    await admin.from('v2_event_organizer_keys').update({ last_used_at: new Date().toISOString() }).eq('event_id', eventId);
  }
  if (!openOrganizerActions.has(action) && !organizerDeviceAuthorized) {
    if (!passcodeOnlyAdminResultsActions.has(action)) {
      const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      const { data: authData, error: authError } = await admin.auth.getUser(token);
      const adminEmail = String(authData?.user?.email || '').trim().toLowerCase();
      if (authError || !authData?.user || !allowedAdminEmails.has(adminEmail)) return json({ ok: false, error: 'Sign in with an authorized Admin account first' }, 403, origin);
    }
    const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin.from('v2_admin_access_attempts').select('*', { count: 'exact', head: true }).eq('ip_hash', ipHash).eq('success', false).gte('created_at', windowStart);
    if (countError) return json({ ok: false, error: 'Admin service unavailable' }, 503, origin);
    if ((count || 0) >= 5) return json({ ok: false, error: 'Too many attempts. Try again in 15 minutes.' }, 429, origin);
    const { data: valid, error: verifyError } = await admin.rpc('v2_admin_verify_passcode', { p_passcode: passcode });
    const success = !verifyError && valid === true;
    await admin.from('v2_admin_access_attempts').insert({ ip_hash: ipHash, action, success });
    if (!success) return json({ ok: false, error: 'Invalid Admin passcode' }, 401, origin);
  }
  const requireLiveEvent = async (eventId: string, organizationId: string) => {
    const { data: liveEvent, error: liveEventError } = await admin
      .from('v2_events')
      .select('id,status,hall_of_fame_processed_at')
      .eq('id', eventId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    return !liveEventError && Boolean(liveEvent) && ['live', 'open', 'active'].includes(String(liveEvent?.status || '').toLowerCase()) && !liveEvent?.hall_of_fame_processed_at;
  };
  if (action === 'verify') return json({ ok: true }, 200, origin);
  if (action === 'setRating') {
    const eventId = String(body?.eventId || ''), organizationId = String(body?.organizationId || '');
    if (!validId(eventId) || !validId(organizationId)) return json({ ok: false, error: 'Invalid event' }, 400, origin);
    const { data: targetEvent, error: eventError } = await admin.from('v2_events').select('id,organization_id').eq('id', eventId).eq('organization_id', organizationId).maybeSingle();
    if (eventError || !targetEvent) return json({ ok: false, error: 'Event not found' }, 404, origin);
    const { data: setting, error: settingError } = await admin.from('v2_gdsq_rating_settings').upsert({ event_id: eventId, organization_id: organizationId, enabled: body?.enabled === true, updated_at: new Date().toISOString() }, { onConflict: 'event_id' }).select('event_id,organization_id,enabled,updated_at').single();
    if (settingError) return json({ ok: false, error: settingError.message || 'Could not update GDSQ Rating' }, 400, origin);
    return json({ ok: true, enabled: setting.enabled, setting }, 200, origin);
  }
  if (action === 'createEvent') {
    const organizationId = String(body?.organizationId || ''), name = String(body?.name || '').trim();
    const courtCount = Number(body?.courtCount), status = String(body?.status || 'draft');
    if (!validId(organizationId) || !name || !Number.isInteger(courtCount)) return json({ ok: false, error: 'Invalid event' }, 400, origin);
    const { data: eventId, error } = await admin.rpc('v2_admin_create_event', { p_organization_id: organizationId, p_name: name, p_event_date: body?.eventDate || null, p_start_time: body?.startTime || '', p_end_time: body?.endTime || '', p_venue_name: body?.venueName || '', p_court_count: courtCount, p_matching_mode: body?.matchingMode || 'standard', p_status: status });
    if (error) return json({ ok: false, error: error.message || 'Could not create event' }, 400, origin);
    const organizerToken = randomToken(), tokenHash = await hash(organizerToken);
    const { error: keyError } = await admin.from('v2_event_organizer_keys').insert({ event_id: eventId, organization_id: organizationId, token_hash: tokenHash });
    if (keyError) {
      await admin.from('v2_events').delete().eq('id', eventId).eq('organization_id', organizationId);
      return json({ ok: false, error: 'Could not create Organizer device key' }, 503, origin);
    }
    const { data: event, error: eventError } = await admin.from('v2_events').select('*, venue:v2_venues(*)').eq('id', eventId).eq('organization_id', organizationId).single();
    if (eventError) return json({ ok: false, error: eventError.message || 'Could not load event' }, 400, origin);
    return json({ ok: true, event, organizerToken }, 200, origin);
  }
  if (action === 'setEventStatus') {
    const eventId = String(body?.eventId || ''), organizationId = String(body?.organizationId || ''), status = String(body?.status || '');
    if (!validId(eventId) || !validId(organizationId)) return json({ ok: false, error: 'Invalid event' }, 400, origin);
    const { error } = await admin.rpc('v2_admin_set_event_status', { p_event_id: eventId, p_organization_id: organizationId, p_status: status, p_ip_hash: ipHash });
    if (error) return json({ ok: false, error: error.message || 'Could not update event' }, 400, origin);
    const { data: event, error: eventError } = await admin.from('v2_events').select('*, venue:v2_venues(*)').eq('id', eventId).eq('organization_id', organizationId).single();
    if (eventError) return json({ ok: false, error: eventError.message || 'Could not load event' }, 400, origin);
    return json({ ok: true, event }, 200, origin);
  }
  if (action === 'endEventAndSaveResults') {
    const eventId = String(body?.eventId || ''), organizationId = String(body?.organizationId || '');
    if (!validId(eventId) || !validId(organizationId)) return json({ ok: false, error: 'Invalid event' }, 400, origin);
    const { data: result, error } = await admin.rpc('v2_admin_end_event_and_save_results', {
      p_event_id: eventId,
      p_organization_id: organizationId,
      p_ip_hash: ipHash
    });
    if (error) return json({ ok: false, error: error.message || 'Could not complete event' }, 409, origin);
    const { data: event, error: eventError } = await admin.from('v2_events').select('*, venue:v2_venues(*)').eq('id', eventId).eq('organization_id', organizationId).single();
    if (eventError) return json({ ok: false, error: eventError.message || 'Could not load completed event' }, 400, origin);
    return json({ ok: true, result, event }, 200, origin);
  }
  if (action === 'deleteEvent') {
    const eventId = String(body?.eventId || ''), organizationId = String(body?.organizationId || '');
    const confirmation = String(body?.confirmation || '');
    if (!validId(eventId) || !validId(organizationId) || !['DELETE_EVENT', 'DELETE_FINALIZED_EVENT'].includes(confirmation)) return json({ ok: false, error: 'Invalid event deletion request' }, 400, origin);
    const { data: result, error } = await admin.rpc('v2_admin_delete_event_stateful', {
      p_event_id: eventId,
      p_organization_id: organizationId,
      p_confirmation: confirmation,
      p_ip_hash: ipHash
    });
    if (error) return json({ ok: false, error: error.message || 'Could not delete event' }, 409, origin);
    return json({ ok: true, result }, 200, origin);
  }
  if (['createMatchPreview', 'updateMatchPreview', 'createMatchNext', 'updateMatchNext', 'cancelMatchNext', 'startMatch', 'cancelMatch', 'confirmScore'].includes(action)) {
    const organizationId = String(body?.organizationId || ''), eventId = String(body?.eventId || ''), matchId = String(body?.matchId || '');
    const playerIds = [...(Array.isArray(body?.teamA) ? body.teamA : []), ...(Array.isArray(body?.teamB) ? body.teamB : [])].map((player) => String(player?.eventPlayerId || player?.event_player_id || player?.id || player || '')).filter(validId);
    let resolvedMatchId = matchId;
    if (!validId(organizationId) || !validId(eventId) || (!['createMatchPreview', 'createMatchNext'].includes(action) && !validId(matchId))) return json({ ok: false, error: 'Invalid match request' }, 400, origin);
    if (!await requireLiveEvent(eventId, organizationId)) return json({ ok: false, error: 'Event is not LIVE' }, 409, origin);
    if (action === 'createMatchPreview') {
      const { data, error } = await admin.rpc('v2_admin_create_match_preview', { p_event_id: eventId, p_organization_id: organizationId, p_court_number: Number(body?.courtNumber), p_event_player_ids: playerIds, p_idempotency_key: body?.idempotencyKey || null, p_ip_hash: ipHash });
      if (error) return json({ ok: false, error: error.message || 'Could not create preview' }, 400, origin);
      resolvedMatchId = String(data || '');
    } else if (action === 'createMatchNext') {
      const { data, error } = await admin.rpc('v2_admin_create_match_next', { p_event_id: eventId, p_organization_id: organizationId, p_court_number: Number(body?.courtNumber), p_event_player_ids: playerIds, p_ip_hash: ipHash });
      if (error) return json({ ok: false, error: error.message || 'Could not create next match' }, 400, origin);
      resolvedMatchId = String(data || '');
    } else if (action === 'updateMatchPreview') {
      if (playerIds.length !== 4) return json({ ok: false, error: 'Choose four different players' }, 400, origin);
      const { error } = await admin.rpc('v2_admin_update_match_preview', { p_match_id: matchId, p_organization_id: organizationId, p_event_player_ids: playerIds, p_ip_hash: ipHash });
      if (error) return json({ ok: false, error: error.message || 'Could not update preview' }, 400, origin);
    } else if (action === 'updateMatchNext') {
      if (playerIds.length !== 4) return json({ ok: false, error: 'Choose four different players' }, 400, origin);
      const { error } = await admin.rpc('v2_admin_update_match_next', { p_match_id: matchId, p_organization_id: organizationId, p_event_player_ids: playerIds, p_ip_hash: ipHash });
      if (error) return json({ ok: false, error: error.message || 'Could not update next match' }, 400, origin);
    } else if (action === 'cancelMatchNext') {
      const { error } = await admin.rpc('v2_admin_cancel_match_next', { p_match_id: matchId, p_organization_id: organizationId, p_ip_hash: ipHash });
      if (error) return json({ ok: false, error: error.message || 'Could not cancel next match' }, 400, origin);
    } else if (action === 'startMatch') {
      const { error } = await admin.rpc('v2_admin_start_match', { p_match_id: matchId, p_organization_id: organizationId, p_ip_hash: ipHash });
      if (error) return json({ ok: false, error: error.message || 'Could not start match' }, 400, origin);
    } else if (action === 'cancelMatch') {
      const { error } = await admin.rpc('v2_admin_cancel_match', { p_match_id: matchId, p_organization_id: organizationId, p_ip_hash: ipHash });
      if (error) return json({ ok: false, error: error.message || 'Could not cancel match' }, 400, origin);
    } else {
      const { error } = await admin.rpc('v2_admin_confirm_score', { p_match_id: matchId, p_organization_id: organizationId, p_team_a_score: Number(body?.teamAScore), p_team_b_score: Number(body?.teamBScore), p_ip_hash: ipHash });
      if (error) return json({ ok: false, error: error.message || 'Could not confirm score' }, 400, origin);
    }
    const { data: match, error: matchError } = await admin.from('v2_matches').select('*, players:v2_match_players(*)').eq('id', resolvedMatchId).eq('organization_id', organizationId).single();
    if (matchError) return json({ ok: false, error: matchError.message || 'Could not load match' }, 400, origin);
    return json({ ok: true, match }, 200, origin);
  }
  if (action === 'smartQueueSetEnabled') {
    const eventId = String(body?.eventId || ''), organizationId = String(body?.organizationId || '');
    if (!validId(eventId) || !validId(organizationId)) return json({ ok: false, error: 'Invalid event' }, 400, origin);
    const { data: targetEvent, error: eventError } = await admin.from('v2_events').select('id').eq('id', eventId).eq('organization_id', organizationId).maybeSingle();
    if (eventError || !targetEvent) return json({ ok: false, error: 'Event not found' }, 404, origin);
    const { data: setting, error } = await admin.from('v2_smart_queue_settings').upsert({ event_id: eventId, organization_id: organizationId, enabled: body?.enabled === true, updated_by: 'admin', updated_at: new Date().toISOString() }, { onConflict: 'event_id' }).select('*').single();
    if (error) return json({ ok: false, error: error.message || 'Could not update Smart Queue' }, 400, origin);
    return json({ ok: true, setting }, 200, origin);
  }
  if (action === 'smartQueueSavePreference') {
    const eventId = String(body?.eventId || ''), organizationId = String(body?.organizationId || ''), eventPlayerId = String(body?.eventPlayerId || '');
    const allowedModes = ['social', 'balanced', 'challenge'];
    const modes = [...new Set(Array.isArray(body?.modes) ? body.modes.map(String).filter((mode: string) => allowedModes.includes(mode)) : [])];
    const preferredMode = modes.includes(String(body?.preferredMode || '')) ? String(body.preferredMode) : modes[0] || null;
    const status = String(body?.status || 'rest');
    if (!validId(eventId) || !validId(organizationId) || !validId(eventPlayerId) || !['ready', 'match_ready', 'playing', 'rest'].includes(status)) return json({ ok: false, error: 'Invalid Smart Queue preference' }, 400, origin);
    if (!await requireLiveEvent(eventId, organizationId)) return json({ ok: false, error: 'Event is not LIVE' }, 409, origin);
    const { data: targetPlayer, error: playerError } = await admin.from('v2_event_players').select('id').eq('id', eventPlayerId).eq('event_id', eventId).eq('organization_id', organizationId).maybeSingle();
    if (playerError || !targetPlayer) return json({ ok: false, error: 'Event player not found' }, 404, origin);
    const { data: preference, error } = await admin.from('v2_smart_queue_preferences').upsert({ event_player_id: eventPlayerId, event_id: eventId, organization_id: organizationId, modes, preferred_mode: preferredMode, queue_status: status, ready_since: status === 'ready' ? String(body?.readySince || new Date().toISOString()) : null, updated_by: String(body?.updatedBy || 'admin') === 'system' ? 'system' : 'admin', updated_at: new Date().toISOString() }, { onConflict: 'event_player_id' }).select('*').single();
    if (error) return json({ ok: false, error: error.message || 'Could not update Smart Queue preference' }, 400, origin);
    return json({ ok: true, preference }, 200, origin);
  }
  if (action === 'smartQueueRecordMatch') {
    const matchId = String(body?.matchId || ''), eventId = String(body?.eventId || ''), organizationId = String(body?.organizationId || '');
    const courtNumber = Number(body?.courtNumber), playMode = String(body?.playMode || ''), state = String(body?.state || 'match_ready');
    if (!validId(matchId) || !validId(eventId) || !validId(organizationId) || !Number.isInteger(courtNumber) || courtNumber < 1 || courtNumber > 10 || !['social', 'balanced', 'challenge'].includes(playMode) || !['match_ready', 'playing', 'confirmed', 'cancelled'].includes(state)) return json({ ok: false, error: 'Invalid Smart Queue match' }, 400, origin);
    if (!await requireLiveEvent(eventId, organizationId)) return json({ ok: false, error: 'Event is not LIVE' }, 409, origin);
    const { data: targetMatch, error: matchError } = await admin.from('v2_matches').select('id').eq('id', matchId).eq('event_id', eventId).eq('organization_id', organizationId).maybeSingle();
    if (matchError || !targetMatch) return json({ ok: false, error: 'Match not found' }, 404, origin);
    const { data: match, error } = await admin.from('v2_smart_queue_matches').upsert({ match_id: matchId, event_id: eventId, organization_id: organizationId, court_number: courtNumber, play_mode: playMode, queue_state: state, updated_at: new Date().toISOString() }, { onConflict: 'match_id' }).select('*').single();
    if (error) return json({ ok: false, error: error.message || 'Could not update Smart Queue match' }, 400, origin);
    return json({ ok: true, match }, 200, origin);
  }
  if (['updateEventPlayerStatus', 'updateEventPlayerLevel', 'removeEventPlayer'].includes(action)) {
    const eventId = String(body?.eventId || ''), organizationId = String(body?.organizationId || ''), eventPlayerId = String(body?.eventPlayerId || '');
    if (!validId(eventId) || !validId(organizationId) || !validId(eventPlayerId)) return json({ ok: false, error: 'Invalid event player request' }, 400, origin);
    if (!await requireLiveEvent(eventId, organizationId)) return json({ ok: false, error: 'Event is not LIVE' }, 409, origin);
    const { data: scopedPlayer, error: scopedPlayerError } = await admin.from('v2_event_players').select('id').eq('id', eventPlayerId).eq('event_id', eventId).eq('organization_id', organizationId).maybeSingle();
    if (scopedPlayerError || !scopedPlayer) return json({ ok: false, error: 'Event player not found' }, 404, origin);
    const rpcName = action === 'updateEventPlayerStatus' ? 'v2_admin_update_event_player_status' : action === 'updateEventPlayerLevel' ? 'v2_admin_update_event_player_level' : 'v2_admin_remove_event_player';
    const rpcPayload = action === 'updateEventPlayerStatus'
      ? { p_event_id: eventId, p_event_player_id: eventPlayerId, p_status: String(body?.status || ''), p_ip_hash: ipHash }
      : action === 'updateEventPlayerLevel'
        ? { p_event_id: eventId, p_event_player_id: eventPlayerId, p_level: Number(body?.level), p_ip_hash: ipHash }
        : { p_event_id: eventId, p_event_player_id: eventPlayerId, p_ip_hash: ipHash };
    const { error: mutationError } = await admin.rpc(rpcName, rpcPayload);
    if (mutationError) return json({ ok: false, error: mutationError.message || 'Could not update event player' }, 400, origin);
    return json({ ok: true }, 200, origin);
  }
  if (action === 'listEvents') {
    const { data: events, error: eventsError } = await admin
      .from('v2_events')
      .select('*')
      .order('event_date', { ascending: false })
      .order('start_time', { ascending: false })
      .order('created_at', { ascending: false });
    if (eventsError) return json({ ok: false, error: eventsError.message || 'Could not load events' }, 400, origin);
    return json({ ok: true, events: events || [] }, 200, origin);
  }
  if (action === 'listProfiles') {
    const { data: profiles, error: profilesError } = await admin
      .from('v2_players')
      .select('id,display_name,email,email_verified_at,default_level,created_at,updated_at')
      .order('display_name', { ascending: true });
    if (profilesError) return json({ ok: false, error: profilesError.message || 'Could not load player profiles' }, 400, origin);
    return json({ ok: true, profiles: profiles || [] }, 200, origin);
  }
  if (action === 'listMembers') {
    const organizationId = String(body?.organizationId || '00000000-0000-4000-8000-000000000001');
    const page = Math.max(1, Math.min(Number(body?.page) || 1, 100000));
    const pageSize = Math.max(1, Math.min(Number(body?.pageSize) || 25, 100));
    const search = String(body?.search || '').trim().slice(0, 80);
    if (!validId(organizationId)) return json({ ok: false, error: 'Invalid organization' }, 400, origin);
    const { data: members, error: membersError } = await admin.rpc('v2_admin_list_members_identity', {
      p_organization_id: organizationId,
      p_search: search,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize
    });
    if (membersError) return json({ ok: false, error: membersError.message || 'Could not load members' }, 400, origin);
    const rows = members || [];
    return json({ ok: true, members: rows, total: Number(rows[0]?.total_count || 0), page, pageSize }, 200, origin);
  }
  if (action === 'getMember') {
    const playerId = String(body?.playerId || '');
    const matchPage = Math.max(1, Math.min(Number(body?.matchPage) || 1, 100000));
    const matchPageSize = Math.max(1, Math.min(Number(body?.matchPageSize) || 30, 100));
    if (!validId(playerId)) return json({ ok: false, error: 'Invalid member id' }, 400, origin);
    const { data: member, error: memberError } = await admin.rpc('v2_admin_get_member_detail_identity', {
      p_player_id: playerId,
      p_match_limit: matchPageSize,
      p_match_offset: (matchPage - 1) * matchPageSize
    });
    if (memberError) return json({ ok: false, error: memberError.message || 'Could not load member history' }, 400, origin);
    return json({ ok: true, member, matchPage, matchPageSize }, 200, origin);
  }
  if (action === 'listLegacyCandidates') {
    const playerId = String(body?.playerId || '');
    if (!validId(playerId)) return json({ ok: false, code: 'INVALID_PLAYER_ID', error: 'Invalid member id' }, 400, origin);
    const { data: candidates, error } = await admin.rpc('v2_admin_list_legacy_player_candidates', { p_canonical_player_id: playerId });
    if (error) return json({ ok: false, code: 'LEGACY_CANDIDATES_FAILED', error: error.message || 'Could not load possible old history' }, 400, origin);
    return json({ ok: true, candidates: candidates || [] }, 200, origin);
  }
  if (action === 'linkLegacyHistory') {
    const playerId = String(body?.playerId || '');
    const eventPlayerIds = Array.isArray(body?.eventPlayerIds) ? [...new Set(body.eventPlayerIds.map(String))] : [];
    if (!validId(playerId) || !eventPlayerIds.length || eventPlayerIds.length > 100 || eventPlayerIds.some((id) => !validId(id))) {
      return json({ ok: false, code: 'INVALID_LEGACY_LINK', error: 'Choose valid historical player records' }, 400, origin);
    }
    const { data: result, error } = await admin.rpc('v2_admin_link_legacy_player_history', {
      p_canonical_player_id: playerId,
      p_event_player_ids: eventPlayerIds,
      p_ip_hash: ipHash,
      p_source: 'admin_member_history'
    });
    if (error) {
      const code = ['LEGACY_PLAYER_ALREADY_LINKED', 'LEGACY_PLAYER_LINK_CONFLICT'].find((item) => String(error.message || '').includes(item)) || 'LEGACY_LINK_FAILED';
      return json({ ok: false, code, error: code }, code === 'LEGACY_LINK_FAILED' ? 400 : 409, origin);
    }
    return json({ ok: true, result }, 200, origin);
  }
  if (action === 'listClaims') {
    const { data: claims, error: claimsError } = await admin
      .from('v2_player_profile_claims')
      .select('id,event_id,event_player_id,player_id,status,admin_note,created_at,reviewed_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100);
    if (claimsError) return json({ ok: false, error: claimsError.message || 'Could not load profile claims' }, 400, origin);
    const eventIds = [...new Set((claims || []).map((row) => row.event_id))];
    const eventPlayerIds = [...new Set((claims || []).map((row) => row.event_player_id))];
    const playerIds = [...new Set((claims || []).map((row) => row.player_id))];
    const [eventsResult, eventPlayersResult, profilesResult] = await Promise.all([
      eventIds.length ? admin.from('v2_events').select('id,name,event_date').in('id', eventIds) : Promise.resolve({ data: [], error: null }),
      eventPlayerIds.length ? admin.from('v2_event_players').select('id,display_name,estimated_level').in('id', eventPlayerIds) : Promise.resolve({ data: [], error: null }),
      playerIds.length ? admin.from('v2_players').select('id,display_name,email').in('id', playerIds) : Promise.resolve({ data: [], error: null })
    ]);
    const relatedError = eventsResult.error || eventPlayersResult.error || profilesResult.error;
    if (relatedError) return json({ ok: false, error: relatedError.message || 'Could not load claim details' }, 400, origin);
    const events = new Map((eventsResult.data || []).map((row) => [row.id, row]));
    const eventPlayers = new Map((eventPlayersResult.data || []).map((row) => [row.id, row]));
    const profiles = new Map((profilesResult.data || []).map((row) => [row.id, row]));
    return json({ ok: true, claims: (claims || []).map((claim) => ({
      ...claim,
      event_name: events.get(claim.event_id)?.name || '',
      event_date: events.get(claim.event_id)?.event_date || '',
      event_player_name: eventPlayers.get(claim.event_player_id)?.display_name || '',
      profile_name: profiles.get(claim.player_id)?.display_name || '',
      profile_email: profiles.get(claim.player_id)?.email || ''
    })) }, 200, origin);
  }
  if (action === 'updateProfileName') {
    const playerId = String(body?.playerId || ''), displayName = String(body?.displayName || '').trim();
    if (!validId(playerId) || displayName.length < 2 || displayName.length > 50) return json({ ok: false, error: 'Invalid player name' }, 400, origin);
    const { error: updateNameError } = await admin.rpc('v2_admin_update_player_display_name', { p_player_id: playerId, p_display_name: displayName, p_ip_hash: ipHash });
    if (updateNameError) return json({ ok: false, error: updateNameError.message || 'Could not update player name' }, 400, origin);
    return json({ ok: true }, 200, origin);
  }
  if (action === 'reviewClaim') {
    const claimId = String(body?.claimId || ''), approve = body?.approve === true, note = String(body?.note || '').trim();
    if (!validId(claimId) || note.length > 200) return json({ ok: false, error: 'Invalid claim review' }, 400, origin);
    const { error: reviewError } = await admin.rpc('v2_admin_review_player_profile_claim', { p_claim_id: claimId, p_approve: approve, p_admin_note: note || null, p_ip_hash: ipHash });
    if (reviewError) return json({ ok: false, error: reviewError.message || 'Could not review profile claim' }, 400, origin);
    return json({ ok: true }, 200, origin);
  }
  if (['archiveEvent', 'restoreEvent', 'permanentlyDeleteEvent'].includes(action)) {
    const eventId = String(body?.eventId || '');
    if (!validId(eventId)) return json({ ok: false, error: 'Invalid event id' }, 400, origin);
    if (action === 'archiveEvent') {
      const { error: archiveError } = await admin.rpc('v2_admin_archive_event', { p_event_id: eventId, p_ip_hash: ipHash });
      if (archiveError) return json({ ok: false, error: archiveError.message || 'Could not archive event' }, 400, origin);
      return json({ ok: true }, 200, origin);
    }
    if (action === 'restoreEvent') {
      const { error: restoreError } = await admin.rpc('v2_admin_restore_event', { p_event_id: eventId, p_ip_hash: ipHash });
      if (restoreError) return json({ ok: false, error: restoreError.message || 'Could not restore event' }, 400, origin);
      return json({ ok: true }, 200, origin);
    }
    if (body?.confirmation !== 'ADMIN_CONFIRMED') return json({ ok: false, error: 'Permanent delete confirmation does not match' }, 400, origin);
    const { data: targetEvent, error: targetEventError } = await admin
      .from('v2_events')
      .select('id,status,hall_of_fame_processed_at')
      .eq('id', eventId)
      .maybeSingle();
    if (targetEventError || !targetEvent) return json({ ok: false, error: 'Event not found' }, 404, origin);
    const archived = ['deleted', 'archived'].includes(String(targetEvent.status || '').toLowerCase());
    if (!archived && targetEvent.hall_of_fame_processed_at) return json({ ok: false, error: 'Finalized event must be archived before permanent deletion' }, 409, origin);
    const deleteRpc = archived ? 'v2_admin_permanently_delete_event' : 'v2_admin_permanently_delete_unfinalized_event';
    const { error: deleteEventError } = await admin.rpc(deleteRpc, { p_event_id: eventId, p_confirmation: 'ADMIN_CONFIRMED', p_ip_hash: ipHash });
    if (deleteEventError) return json({ ok: false, error: deleteEventError.message || 'Could not permanently delete event' }, 400, origin);
    return json({ ok: true }, 200, origin);
  }
  if (action === 'linkPlayer') {
    const eventPlayerId = String(body?.eventPlayerId || ''), email = String(body?.email || '').trim().toLowerCase();
    if (!validId(eventPlayerId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ ok: false, error: 'Invalid player or email' }, 400, origin);
    const { data: playerId, error: linkError } = await admin.rpc('v2_admin_link_event_player_profile', { p_event_player_id: eventPlayerId, p_email: email, p_ip_hash: ipHash });
    if (linkError) return json({ ok: false, error: linkError.message || 'Could not link player profile' }, 400, origin);
    return json({ ok: true, playerId }, 200, origin);
  }
  if (action === 'deleteMatch') {
    const { error: deleteError } = await admin.rpc('v2_admin_soft_delete_match', { p_match_id: body.matchId, p_ip_hash: ipHash });
    if (deleteError) return json({ ok: false, error: deleteError.message || 'Could not delete match' }, 400, origin);
    return json({ ok: true }, 200, origin);
  }
  if (action === 'updatePlayers') {
    const ids = Array.isArray(body.eventPlayerIds) ? body.eventPlayerIds.map(String) : [];
    if (ids.length !== 4 || new Set(ids).size !== 4) return json({ ok: false, error: 'Choose four different players' }, 400, origin);
    const { error: playersError } = await admin.rpc('v2_admin_update_match_players', { p_match_id: body.matchId, p_event_player_ids: ids, p_ip_hash: ipHash });
    if (playersError) return json({ ok: false, error: playersError.message || 'Could not update players' }, 400, origin);
    return json({ ok: true }, 200, origin);
  }
  const teamAScore = Number(body.teamAScore), teamBScore = Number(body.teamBScore);
  if (!Number.isInteger(teamAScore) || !Number.isInteger(teamBScore) || teamAScore < 0 || teamBScore < 0 || teamAScore > 99 || teamBScore > 99 || teamAScore === teamBScore) return json({ ok: false, error: 'Invalid score' }, 400, origin);
  const { error: updateError } = await admin.rpc('v2_admin_update_confirmed_match_score', { p_match_id: body.matchId, p_team_a_score: teamAScore, p_team_b_score: teamBScore, p_ip_hash: ipHash });
  if (updateError) return json({ ok: false, error: updateError.message || 'Could not update score' }, 400, origin);
  return json({ ok: true }, 200, origin);
});
