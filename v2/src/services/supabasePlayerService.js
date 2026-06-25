// Supabase player service for GDSQ Open Play v2 shared mode.
// Use v2_ tables only.

function normalizeLevel(level) {
  if (typeof level === 'number') return level;
  const value = String(level || '').match(/[0-9]+(\.[0-9]+)?/);
  return value ? Number(value[0]) : 3;
}

function normalizePlayer(row) {
  if (!row) return null;
  const level = normalizeLevel(row.estimated_level);
  return {
    ...row,
    id: row.id,
    eventId: row.event_id,
    organizationId: row.organization_id,
    playerId: row.player_id,
    displayName: row.display_name,
    name: row.display_name,
    nickname: row.display_name,
    estimatedLevel: level,
    estimated_level: level,
    level,
    status: row.status || 'checked_in',
    queueJoinedAt: row.queue_joined_at || row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listEventPlayers(supabase, eventId) {
  const { data, error } = await supabase
    .from('v2_event_players')
    .select('*')
    .eq('event_id', eventId)
    .neq('status', 'removed')
    .order('queue_joined_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizePlayer);
}

export async function checkInPlayer(supabase, payload) {
  const name = String(payload.displayName || payload.name || '').trim();
  if (!name) throw new Error('Player name is required');

  const { data: existing, error: readError } = await supabase
    .from('v2_event_players')
    .select('*')
    .eq('event_id', payload.eventId)
    .ilike('display_name', name)
    .neq('status', 'removed')
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return { ...normalizePlayer(existing), duplicate: true };

  const { data, error } = await supabase
    .from('v2_event_players')
    .insert({
      organization_id: payload.organizationId,
      event_id: payload.eventId,
      player_id: payload.playerId || null,
      display_name: name,
      estimated_level: normalizeLevel(payload.estimatedLevel || payload.level),
      status: payload.status || 'checked_in',
      queue_joined_at: new Date().toISOString()
    })
    .select('*')
    .single();

  if (error) throw error;
  return normalizePlayer(data);
}

export async function updateEventPlayerStatus(supabase, eventPlayerId, status) {
  const { data, error } = await supabase
    .from('v2_event_players')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', eventPlayerId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizePlayer(data);
}

export async function updateEventPlayerLevel(supabase, eventPlayerId, level) {
  const normalizedLevel = normalizeLevel(level);
  const { data, error } = await supabase
    .from('v2_event_players')
    .update({ estimated_level: normalizedLevel, updated_at: new Date().toISOString() })
    .eq('id', eventPlayerId)
    .select('*')
    .single();

  if (error) throw error;
  return normalizePlayer(data);
}
