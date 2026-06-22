// Supabase event service skeleton for v2.
// This file is intentionally not wired to the UI yet.
// Keep v1 untouched. Use v2_ tables only.

export async function listEvents(supabase, organizationId) {
  const { data, error } = await supabase
    .from('v2_events')
    .select('*, venue:v2_venues(*)')
    .eq('organization_id', organizationId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createEvent(supabase, payload) {
  const { data, error } = await supabase
    .from('v2_events')
    .insert({
      organization_id: payload.organizationId,
      venue_id: payload.venueId,
      name: payload.name,
      event_date: payload.eventDate,
      start_time: payload.startTime,
      end_time: payload.endTime,
      status: payload.status || 'draft',
      max_players: payload.maxPlayers || null,
      court_count: payload.courtCount || 1,
      checkin_open: Boolean(payload.checkinOpen)
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateEventStatus(supabase, eventId, status) {
  const patch = {
    status,
    updated_at: new Date().toISOString()
  };
  if (status === 'completed') patch.completed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('v2_events')
    .update(patch)
    .eq('id', eventId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
