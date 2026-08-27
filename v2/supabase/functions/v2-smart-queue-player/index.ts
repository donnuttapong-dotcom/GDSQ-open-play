import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const origins = new Set(['https://donnuttapong-dotcom.github.io', 'https://gdsq-open-play-live.vercel.app', 'https://gdsq-open-play-v2-preview.vercel.app', 'http://127.0.0.1:4175', 'http://localhost:4175']);

function cors(origin: string | null) { return { 'Access-Control-Allow-Origin': origin && origins.has(origin) ? origin : 'https://donnuttapong-dotcom.github.io', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' }; }
function json(body: Record<string, unknown>, status = 200, origin: string | null = null) { return new Response(JSON.stringify(body), { status, headers: cors(origin) }); }
function validId(value: unknown) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')); }
async function hash(value: string) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes)).map((item) => item.toString(16).padStart(2, '0')).join(''); }

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (request.method !== 'POST' || (origin && !origins.has(origin))) return json({ ok: false, error: 'Not allowed' }, 403, origin);
  if (!url || !serviceRoleKey) return json({ ok: false, error: 'Match Making player service is not configured' }, 500, origin);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || body.action !== 'saveOwnPreference') return json({ ok: false, error: 'Invalid Match Making player request' }, 400, origin);
  const eventId = String(body.eventId || ''), eventPlayerId = String(body.eventPlayerId || ''), capability = String(body.capability || '');
  if (!validId(eventId) || !validId(eventPlayerId) || !/^[a-f0-9]{64}$/i.test(capability)) return json({ ok: false, error: 'Invalid player preference session' }, 401, origin);
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  try {
    const { data: session, error: sessionError } = await admin.from('v2_smart_queue_instant_sessions').select('id,event_id,event_player_id,organization_id,expires_at,revoked_at').eq('event_id', eventId).eq('event_player_id', eventPlayerId).eq('token_hash', await hash(capability)).maybeSingle();
    if (sessionError || !session || session.revoked_at || new Date(session.expires_at).getTime() < Date.now()) return json({ ok: false, error: 'Player preference session expired. Re-open your event QR link.' }, 401, origin);
    const { data: player, error: playerError } = await admin.from('v2_event_players').select('id,event_id,organization_id,status,event:v2_events!inner(id,status,matching_mode)').eq('id', eventPlayerId).eq('event_id', eventId).eq('organization_id', session.organization_id).maybeSingle();
    if (playerError || !player || player.status === 'removed' || !['live', 'open', 'active'].includes(String(player.event?.status || '').toLowerCase()) || String(player.event?.matching_mode || '') !== 'smart_queue') return json({ ok: false, error: 'This player cannot change Match Making preference now' }, 403, origin);
    const allowed = ['social', 'balanced', 'challenge'];
    const modes = [...new Set(Array.isArray(body.modes) ? body.modes.map(String).filter((mode) => allowed.includes(mode)) : [])];
    const status = body.status === 'rest' ? 'rest' : 'ready';
    const preferred = modes.includes(String(body.preferredMode || '')) ? String(body.preferredMode) : modes[0] || null;
    const { data: preference, error } = await admin.from('v2_smart_queue_preferences').upsert({ event_player_id: eventPlayerId, event_id: eventId, organization_id: session.organization_id, modes, preferred_mode: preferred, queue_status: status, ready_since: status === 'ready' ? new Date().toISOString() : null, updated_by: 'player', updated_at: new Date().toISOString() }, { onConflict: 'event_player_id' }).select('*').single();
    if (error) throw error;
    await admin.from('v2_smart_queue_instant_sessions').update({ last_used_at: new Date().toISOString() }).eq('id', session.id);
    return json({ ok: true, preference }, 200, origin);
  } catch (error) {
    console.error('v2-smart-queue-player', error);
    return json({ ok: false, error: error instanceof Error ? error.message : String((error as Record<string, unknown>)?.message || 'Could not save Match Making preference') }, 400, origin);
  }
});
