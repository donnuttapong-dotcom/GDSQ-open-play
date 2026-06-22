// Supabase player service skeleton for v2.
// This file is intentionally not wired to the UI yet.
// Use v2_ tables only.

export async function listEventPlayers(supabase, eventId) {
  const { data, error } = await supabase
    .from('v2_event_players')
    .select('*')
    .eq('event_id', eventId)
    .neq('status', 'removed')
    .order('queue_joined_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function checkInPlayer(supabase, payload) {
  // Later: add duplicate detection by phone/email or normalized display_name per event.
  const { data, error } = await supabase
    .from('v2_event_players')
    .insert({
      organization_id: payload.organizationId,
      event_id: payload.eventId,
      player_id: payload.playerId || null,
      display_name: payload.displayName,
      estimated_level: payload.estimatedLevel || null,
      status: payload.status || 'checked_in'
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateEventPlayerStatus(supabase, eventPlayerId, status) {
  const { data, error } = await supabase
    .from('v2_event_players')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', eventPlayerId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
