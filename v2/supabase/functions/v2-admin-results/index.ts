import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const allowedOrigins = new Set(['https://donnuttapong-dotcom.github.io', 'https://gdsq-open-play-live.vercel.app']);

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

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (request.method !== 'POST' || (origin && !allowedOrigins.has(origin))) return json({ ok: false, error: 'Not allowed' }, 403, origin);
  if (!url || !serviceRoleKey) return json({ ok: false, error: 'Admin service is not configured' }, 500, origin);
  const body = await request.json().catch(() => null);
  const action = String(body?.action || ''), passcode = String(body?.passcode || '');
  if (!['verify', 'updateScore'].includes(action) || passcode.length < 6 || passcode.length > 128) return json({ ok: false, error: 'Invalid request' }, 400, origin);
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const ipHash = await hash(clientIp(request)), windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin.from('v2_admin_access_attempts').select('*', { count: 'exact', head: true }).eq('ip_hash', ipHash).eq('success', false).gte('created_at', windowStart);
  if (countError) return json({ ok: false, error: 'Admin service unavailable' }, 503, origin);
  if ((count || 0) >= 5) return json({ ok: false, error: 'Too many attempts. Try again in 15 minutes.' }, 429, origin);
  const { data: valid, error: verifyError } = await admin.rpc('v2_admin_verify_passcode', { p_passcode: passcode });
  const success = !verifyError && valid === true;
  await admin.from('v2_admin_access_attempts').insert({ ip_hash: ipHash, action, success });
  if (!success) return json({ ok: false, error: 'Invalid Admin passcode' }, 401, origin);
  if (action === 'verify') return json({ ok: true }, 200, origin);
  const teamAScore = Number(body.teamAScore), teamBScore = Number(body.teamBScore);
  if (!Number.isInteger(teamAScore) || !Number.isInteger(teamBScore) || teamAScore < 0 || teamBScore < 0 || teamAScore > 99 || teamBScore > 99 || teamAScore === teamBScore) return json({ ok: false, error: 'Invalid score' }, 400, origin);
  const { error: updateError } = await admin.rpc('v2_admin_update_confirmed_match_score', { p_match_id: body.matchId, p_team_a_score: teamAScore, p_team_b_score: teamBScore, p_ip_hash: ipHash });
  if (updateError) return json({ ok: false, error: updateError.message || 'Could not update score' }, 400, origin);
  return json({ ok: true }, 200, origin);
});
