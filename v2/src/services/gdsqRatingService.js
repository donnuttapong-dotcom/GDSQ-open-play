export const GDSQ_RATING_DEFAULT = false;
export const GDSQ_RATING_K = 0.1;
export const GDSQ_RATING_SPREAD = 0.5;

function isMissingRatingSchema(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return ['42P01', 'PGRST200', 'PGRST204', 'PGRST205'].includes(code) || /v2_gdsq_/i.test(message);
}

export function expectedTeamResult(teamRating, opponentRating) {
  return 1 / (1 + 10 ** ((Number(opponentRating) - Number(teamRating)) / GDSQ_RATING_SPREAD));
}

export function calculateGdsqRatingDelta({ teamRating, opponentRating, won, scoreFor, scoreAgainst }) {
  const expected = expectedTeamResult(teamRating, opponentRating);
  const margin = Math.min(Math.abs(Number(scoreFor) - Number(scoreAgainst)), 10);
  const multiplier = 1 + margin / 20;
  const raw = GDSQ_RATING_K * multiplier * ((won ? 1 : 0) - expected);
  return Math.sign(raw) * Math.round((Math.abs(raw) + Number.EPSILON) * 1000) / 1000;
}

export async function getEventRatingSetting(supabase, eventId) {
  if (!supabase || !eventId) return { enabled: false, available: false };
  const { data, error } = await supabase
    .from('v2_gdsq_rating_settings')
    .select('event_id,organization_id,enabled,updated_at')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) {
    if (isMissingRatingSchema(error)) return { enabled: false, available: false };
    throw error;
  }
  return { enabled: Boolean(data?.enabled), available: true, row: data || null };
}

export async function setEventRatingEnabled(supabase, { eventId, organizationId, enabled, passcode }) {
  if (!supabase || !eventId || !organizationId) throw new Error('Event is required');
  const { data, error } = await supabase.functions.invoke('v2-admin-results', {
    body: { action: 'setRating', eventId, organizationId, enabled: Boolean(enabled), passcode }
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Could not update GDSQ Rating');
  return { enabled: Boolean(data.enabled), available: true, row: data.setting || null };
}

export async function listCurrentGdsqRatings(supabase, organizationId) {
  if (!supabase || !organizationId) return [];
  const { data, error } = await supabase
    .from('v2_gdsq_player_ratings')
    .select('player_id,event_player_id,initial_rating,current_rating,updated_at')
    .eq('organization_id', organizationId);
  if (error) {
    if (isMissingRatingSchema(error)) return [];
    throw error;
  }
  return data || [];
}

export async function listPlayerGdsqRatingHistory(supabase, playerId, limit = 50) {
  if (!supabase || !playerId) return [];
  const { data, error } = await supabase
    .from('v2_gdsq_rating_history')
    .select('player_id,event_player_id,match_id,event_id,rating_before,delta,rating_after,created_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingRatingSchema(error)) return [];
    throw error;
  }
  return data || [];
}
