import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const staticOrigins = new Set([
  'https://donnuttapong-dotcom.github.io',
  'https://gdsq-open-play-live.vercel.app',
  'https://gdsq-open-play-v2-preview.vercel.app',
  'https://gdsq-open-play-v2-preview-39xrb50cf-don-s-projects6.vercel.app',
  'http://127.0.0.1:4173', 'http://127.0.0.1:4174', 'http://127.0.0.1:4175',
  'http://localhost:4173', 'http://localhost:4174', 'http://localhost:4175'
]);

function allowedOrigin(origin: string | null) {
  return Boolean(origin && staticOrigins.has(origin));
}
function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin) ? String(origin) : 'https://donnuttapong-dotcom.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin'
  };
}
function json(body: Record<string, unknown>, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}
function cleanName(value: unknown) { return String(value || '').trim().replace(/\s+/g, ' '); }
function cleanEmail(value: unknown) { return String(value || '').trim().toLowerCase(); }
function cleanLevel(value: unknown) { const number = Number(value); return Number.isFinite(number) ? Math.max(1, Math.min(6, number)) : 3; }
function validId(value: unknown) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }
function validEmail(value: string) { return !value || (value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)); }
function safeError(error: unknown) {
  const message = String(error instanceof Error ? error.message : (error as Record<string, unknown>)?.message || error || 'REQUEST_FAILED');
  const stableCodes = [
    'CAPABILITY_REQUIRED', 'EMAIL_PROFILE_MISMATCH', 'DISPLAY_NAME_TAKEN',
    'DISPLAY_NAME_ALREADY_IN_EVENT', 'AMBIGUOUS_PLAYER_IDENTITY',
    'LEGACY_PLAYER_ALREADY_LINKED', 'LEGACY_PLAYER_LINK_CONFLICT',
    'EVENT_NOT_FOUND', 'EVENT_NOT_OPEN', 'EVENT_FULL', 'PLAYER_NOT_FOUND',
    'DISPLAY_NAME_INVALID', 'EMAIL_INVALID', 'IDENTITY_RESOLUTION_INVALID'
  ];
  const code = stableCodes.find((item) => message.includes(item));
  if (code) return { code, error: code };
  if (/duplicate key|unique constraint/i.test(message)) return { code: 'IDENTITY_CONFLICT', error: 'This email or display name is already in use.' };
  if (/not found/i.test(message)) return { code: 'NOT_FOUND', error: 'The requested player was not found.' };
  return { code: 'REQUEST_FAILED', error: 'Could not complete this player request.' };
}
async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((item) => item.toString(16).padStart(2, '0')).join('');
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((item) => item.toString(16).padStart(2, '0')).join('');
}
function publicProfile(row: Record<string, unknown>) {
  return { id: row.id, player_code: row.player_code, display_name: row.display_name, avatar_url: row.avatar_url || '', default_level: row.default_level, created_at: row.created_at };
}
function publicReadProfile(row: Record<string, unknown>) {
  return { player_code: row.player_code, display_name: row.display_name, avatar_url: row.avatar_url || '', default_level: row.default_level, created_at: row.created_at };
}
function dataUrlFile(value: unknown) {
  const match = String(value || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  if (bytes.byteLength > 420 * 1024) throw new Error('AVATAR_TOO_LARGE');
  return { bytes, contentType: match[1], extension: match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1] };
}
async function saveAvatar(admin: ReturnType<typeof createClient>, playerId: string, source: unknown) {
  const file = dataUrlFile(source);
  if (!file) return '';
  const path = `${playerId}/profile/${crypto.randomUUID()}.${file.extension}`;
  const { error } = await admin.storage.from('v2-player-avatars').upload(path, file.bytes, { contentType: file.contentType, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return admin.storage.from('v2-player-avatars').getPublicUrl(path).data.publicUrl || '';
}
async function requireCapability(admin: ReturnType<typeof createClient>, playerId: string, capability: string) {
  if (!validId(playerId) || !/^[a-f0-9]{64}$/i.test(capability)) throw new Error('CAPABILITY_REQUIRED');
  const { data, error } = await admin.from('v2_player_device_sessions').select('id,player_id,expires_at,revoked_at').eq('player_id', playerId).eq('token_hash', await hash(capability)).maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at || new Date(String(data.expires_at)).getTime() <= Date.now()) throw new Error('CAPABILITY_REQUIRED');
  await admin.from('v2_player_device_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
}
async function issueCapability(admin: ReturnType<typeof createClient>, playerId: string, deviceLabel: unknown) {
  const raw = randomToken();
  const label = String(deviceLabel || '').trim().slice(0, 80) || null;
  const { error } = await admin.from('v2_player_device_sessions').insert({ player_id: playerId, token_hash: await hash(raw), device_label: label, expires_at: new Date(Date.now() + 180 * 86400000).toISOString() });
  if (error) throw error;
  return raw;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (request.method !== 'POST' || (origin && !allowedOrigin(origin))) return json({ ok: false, code: 'NOT_ALLOWED', error: 'Not allowed' }, 403, origin);
  if (!url || !serviceRoleKey) return json({ ok: false, code: 'CONFIGURATION_ERROR', error: 'Player service is unavailable.' }, 503, origin);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== 'string') return json({ ok: false, code: 'INVALID_REQUEST', error: 'Invalid player request.' }, 400, origin);
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const action = body.action;
  try {
    if (action === 'resolvePlayerCode') {
      const playerCode = String(body.playerCode || '').trim().toUpperCase();
      if (!/^GDSQ-\d{4,}$/.test(playerCode)) return json({ ok: false, code: 'INVALID_PLAYER_CODE', error: 'Invalid player code.' }, 400, origin);
      const { data, error } = await admin.from('v2_players').select('id,player_code,display_name,avatar_url,default_level,created_at').eq('player_code', playerCode).eq('status', 'active').maybeSingle();
      if (error) throw error;
      if (!data) return json({ ok: false, code: 'PLAYER_NOT_FOUND', error: 'Player not found.' }, 404, origin);
      return json({ ok: true, profile: publicReadProfile(data) }, 200, origin);
    }

    if (action === 'getPublicPlayerHistory') {
      const playerCode = String(body.playerCode || '').trim().toUpperCase();
      const organizationId = String(body.organizationId || '');
      if (!validId(organizationId) || !/^GDSQ-\d{4,}$/.test(playerCode)) {
        return json({ ok: false, code: 'INVALID_PLAYER_CODE', error: 'Invalid player code.' }, 400, origin);
      }
      const { data, error } = await admin.rpc('v2_public_player_experience_phase2', {
        p_organization_id: organizationId,
        p_player_code: playerCode,
        p_recent_limit: 20,
        p_event_limit: 20
      });
      if (error) throw error;
      return json({ ok: true, experience: data }, 200, origin);
    }

    if (action === 'listOpenEvents') {
      const organizationId = String(body.organizationId || '');
      if (!validId(organizationId)) return json({ ok: false, code: 'INVALID_ORGANIZATION', error: 'Invalid organization.' }, 400, origin);
      const { data, error } = await admin.rpc('v2_list_open_events_phase2', {
        p_organization_id: organizationId,
        p_limit: 20
      });
      if (error) throw error;
      return json({ ok: true, events: Array.isArray(data) ? data : [] }, 200, origin);
    }

    if (action === 'resolveEventPlayerCodes') {
      const organizationId = String(body.organizationId || '');
      if (!validId(organizationId)) return json({ ok: false, code: 'INVALID_ORGANIZATION', error: 'Invalid organization.' }, 400, origin);
      const requestedIds = Array.isArray(body.eventPlayerIds)
        ? [...new Set(body.eventPlayerIds.map((value) => String(value)).filter(validId))].slice(0, 1000)
        : [];
      if (!requestedIds.length) return json({ ok: true, players: [] }, 200, origin);
      const { data: participants, error } = await admin.from('v2_event_players')
        .select('id,player_id')
        .eq('organization_id', organizationId)
        .in('id', requestedIds)
        .neq('status', 'removed');
      if (error) throw error;
      const profileIds = [...new Set((participants || []).map((row) => row.player_id).filter(Boolean))];
      const { data: profiles, error: profileError } = profileIds.length
        ? await admin.from('v2_players').select('id,player_code').eq('organization_id', organizationId).eq('status', 'active').in('id', profileIds)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const codeByProfile = new Map((profiles || []).map((row) => [String(row.id), row.player_code]));
      return json({
        ok: true,
        players: (participants || []).map((row) => ({
          eventPlayerId: row.id,
          playerCode: codeByProfile.get(String(row.player_id)) || ''
        })).filter((row) => row.playerCode)
      }, 200, origin);
    }

    if (action === 'getOwnProfile' || action === 'updateOwnProfile') {
      const playerId = String(body.playerId || ''), capability = String(body.capability || '');
      await requireCapability(admin, playerId, capability);
      const { data: existing, error: existingError } = await admin.from('v2_players').select('*').eq('id', playerId).eq('status', 'active').maybeSingle();
      if (existingError) throw existingError;
      if (!existing) return json({ ok: false, code: 'PLAYER_NOT_FOUND', error: 'Player not found.' }, 404, origin);
      if (action === 'getOwnProfile') return json({ ok: true, profile: publicProfile(existing) }, 200, origin);

      const displayName = cleanName(body.displayName || existing.display_name);
      const level = body.level == null ? Number(existing.default_level || 3) : cleanLevel(body.level);
      if (displayName.length < 2 || displayName.length > 50) return json({ ok: false, code: 'DISPLAY_NAME_INVALID', error: 'Display name must be 2-50 characters.' }, 400, origin);
      const { data: byName, error: nameError } = await admin.from('v2_players').select('id').eq('organization_id', existing.organization_id).ilike('display_name', displayName).neq('id', playerId).maybeSingle();
      if (nameError) throw nameError;
      if (byName) return json({ ok: false, code: 'DISPLAY_NAME_TAKEN', error: 'This display name is already in use.' }, 409, origin);
      const avatarUrl = await saveAvatar(admin, playerId, body.avatarDataUrl);
      const patch: Record<string, unknown> = { display_name: displayName, default_level: level, updated_at: new Date().toISOString() };
      if (avatarUrl) patch.avatar_url = avatarUrl;
      const { data: updated, error: updateError } = await admin.from('v2_players').update(patch).eq('id', playerId).select('*').single();
      if (updateError) throw updateError;
      return json({ ok: true, profile: publicProfile(updated) }, 200, origin);
    }

    if (action !== 'join') return json({ ok: false, code: 'INVALID_ACTION', error: 'Invalid player request.' }, 400, origin);
    const eventId = String(body.eventId || '');
    const organizationId = String(body.organizationId || '');
    const displayName = cleanName(body.displayName);
    const email = cleanEmail(body.email);
    const level = cleanLevel(body.level);
    if (!validId(eventId) || !validId(organizationId) || displayName.length < 2 || displayName.length > 50 || !validEmail(email)) return json({ ok: false, code: 'JOIN_DETAILS_INVALID', error: 'Enter a valid name, level, and optional email.' }, 400, origin);
    const { data: event, error: eventError } = await admin.from('v2_events').select('id,organization_id,status,checkin_open,max_players,matching_mode,completed_at,archived_at,hall_of_fame_processed_at').eq('id', eventId).eq('organization_id', organizationId).maybeSingle();
    if (eventError) throw eventError;
    if (!event) return json({ ok: false, code: 'EVENT_NOT_FOUND', error: 'Event not found.' }, 404, origin);
    if (!['live', 'open', 'active'].includes(String(event.status || '').toLowerCase()) || !event.checkin_open || event.completed_at || event.archived_at || event.hall_of_fame_processed_at) return json({ ok: false, code: 'EVENT_NOT_OPEN', error: 'This event is not open for joining.' }, 409, origin);

    let resolvedPlayerId: string | null = null;
    let resolutionSource: string | null = null;
    const requestedPlayerId = String(body.playerId || '');
    const requestedCapability = String(body.capability || '');
    if (requestedPlayerId || requestedCapability) {
      await requireCapability(admin, requestedPlayerId, requestedCapability);
      resolvedPlayerId = requestedPlayerId;
      resolutionSource = 'capability';
    } else if (body.playerCode) {
      const playerCode = String(body.playerCode).trim().toUpperCase();
      const { data: resolved, error } = await admin.from('v2_players').select('id').eq('organization_id', organizationId).eq('player_code', playerCode).eq('status', 'active').maybeSingle();
      if (error) throw error;
      if (!resolved) throw new Error('PLAYER_NOT_FOUND');
      resolvedPlayerId = String(resolved.id);
      resolutionSource = 'player_code';
    }

    const { data: joined, error: joinError } = await admin.rpc('v2_join_player_identity_phase1', {
      p_organization_id: organizationId,
      p_event_id: eventId,
      p_display_name: displayName,
      p_email: email || null,
      p_level: level,
      p_resolved_player_id: resolvedPlayerId,
      p_resolution_source: resolutionSource
    });
    if (joinError) throw joinError;
    const result = joined as Record<string, unknown>;
    const eventPlayerId = String(result.eventPlayerId || '');
    const profileId = String(result.profileId || '');
    const [{ data: eventPlayer, error: eventPlayerError }, { data: loadedProfile, error: profileError }] = await Promise.all([
      admin.from('v2_event_players').select('*').eq('id', eventPlayerId).single(),
      profileId ? admin.from('v2_players').select('*').eq('id', profileId).single() : Promise.resolve({ data: null, error: null })
    ]);
    if (eventPlayerError || profileError) throw eventPlayerError || profileError;
    let profile = loadedProfile as Record<string, unknown> | null;
    if (profile && result.profileCreated && body.avatarDataUrl) {
      const avatarUrl = await saveAvatar(admin, profileId, body.avatarDataUrl);
      if (avatarUrl) {
        const { data, error } = await admin.from('v2_players').update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq('id', profileId).select('*').single();
        if (error) throw error;
        profile = data;
        const { error: participantAvatarError } = await admin.from('v2_event_players').update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq('id', eventPlayerId);
        if (participantAvatarError) throw participantAvatarError;
      }
    }
    let capability = '', smartQueueCapability = '';
    if (profile && resolutionSource === 'capability') capability = requestedCapability;
    else if (profile && resolutionSource !== 'player_code') capability = await issueCapability(admin, String(profile.id), body.deviceLabel);
    if (String(event.matching_mode || '').toLowerCase() === 'smart_queue' && eventPlayer) {
      const token = randomToken();
      await admin.from('v2_smart_queue_instant_sessions').update({ revoked_at: new Date().toISOString() }).eq('event_id', eventId).eq('event_player_id', eventPlayer.id).is('revoked_at', null);
      const { error } = await admin.from('v2_smart_queue_instant_sessions').insert({ organization_id: organizationId, event_id: eventId, event_player_id: eventPlayer.id, token_hash: await hash(token), expires_at: new Date(Date.now() + 12 * 3600000).toISOString() });
      if (error) throw error;
      smartQueueCapability = token;
    }
    return json({
      ok: true, eventPlayer, profile: profile ? publicProfile(profile) : null,
      capability, smartQueueCapability,
      alreadyJoined: Boolean(result.alreadyJoined),
      identityState: result.identityState || '',
      legacyCandidatesCount: Number(result.legacyCandidatesCount || 0)
    }, 200, origin);
  } catch (error) {
    const safe = safeError(error);
    console.error('v2-player-identity', action, safe.code);
    const status = safe.code === 'CAPABILITY_REQUIRED' ? 401 : /MISMATCH|CONFLICT|TAKEN|ALREADY|AMBIGUOUS|FULL|NOT_OPEN/.test(safe.code) ? 409 : 400;
    return json({ ok: false, ...safe }, status, origin);
  }
});
