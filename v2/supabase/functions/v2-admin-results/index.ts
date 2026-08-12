import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const allowedOrigins = new Set(['https://donnuttapong-dotcom.github.io', 'https://gdsq-open-play-live.vercel.app']);
const allowedAdminEmails = new Set((Deno.env.get('GDSQ_ADMIN_EMAILS') || 'don.nuttapong@gmail.com').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));

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

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (request.method !== 'POST' || (origin && !allowedOrigins.has(origin))) return json({ ok: false, error: 'Not allowed' }, 403, origin);
  if (!url || !serviceRoleKey) return json({ ok: false, error: 'Admin service is not configured' }, 500, origin);
  const body = await request.json().catch(() => null);
  const action = String(body?.action || ''), passcode = String(body?.passcode || '');
  if (!['verify', 'listEvents', 'listProfiles', 'listClaims', 'updateProfileName', 'reviewClaim', 'updateScore', 'updatePlayers', 'deleteMatch', 'archiveEvent', 'restoreEvent', 'permanentlyDeleteEvent', 'linkPlayer'].includes(action) || passcode.length < 5 || passcode.length > 128) return json({ ok: false, error: 'Invalid request' }, 400, origin);
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const adminEmail = String(authData?.user?.email || '').trim().toLowerCase();
  if (authError || !authData?.user || !allowedAdminEmails.has(adminEmail)) return json({ ok: false, error: 'Sign in with an authorized Admin account first' }, 403, origin);
  const ipHash = await hash(clientIp(request)), windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin.from('v2_admin_access_attempts').select('*', { count: 'exact', head: true }).eq('ip_hash', ipHash).eq('success', false).gte('created_at', windowStart);
  if (countError) return json({ ok: false, error: 'Admin service unavailable' }, 503, origin);
  if ((count || 0) >= 5) return json({ ok: false, error: 'Too many attempts. Try again in 15 minutes.' }, 429, origin);
  const { data: valid, error: verifyError } = await admin.rpc('v2_admin_verify_passcode', { p_passcode: passcode });
  const success = !verifyError && valid === true;
  await admin.from('v2_admin_access_attempts').insert({ ip_hash: ipHash, action, success });
  if (!success) return json({ ok: false, error: 'Invalid Admin passcode' }, 401, origin);
  if (action === 'verify') return json({ ok: true }, 200, origin);
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
  if (action === 'listClaims') {
    const { data: claims, error: claimsError } = await admin
      .from('v2_player_profile_claims')
      .select('id,event_id,event_player_id,player_id,status,admin_note,created_at,reviewed_at')
      .order('created_at', { ascending: false });
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
    const { error: deleteEventError } = await admin.rpc('v2_admin_permanently_delete_event', { p_event_id: eventId, p_confirmation: 'ADMIN_CONFIRMED', p_ip_hash: ipHash });
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
