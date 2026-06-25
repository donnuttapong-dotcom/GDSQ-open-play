// Supabase event service for GDSQ Open Play v2 shared mode.
// Keep v1 untouched. Use v2_ tables only.

function normalizeEvent(row) {
  if (!row) return null;
  return {
    ...row,
    organizationId: row.organization_id,
    venueId: row.venue_id,
    venueName: row.venue_name || row.venue?.name || 'Venue',
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    maxPlayers: row.max_players,
    courtCount: row.court_count,
    checkinOpen: row.checkin_open,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

export async function listEvents(supabase, organizationId) {
  const { data, error } = await supabase
    .from('v2_events')
    .select('*, venue:v2_venues(*)')
    .eq('organization_id', organizationId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(normalizeEvent);
}

export async function createEvent(supabase, payload) {
  const { data, error } = await supabase
    .from('v2_events')
    .insert({
      organization_id: payload.organizationId,
      venue_id: payload.venueId || null,
      venue_name: payload.venueName || payload.venue || null,
      name: payload.name,
      event_date: payload.eventDate,
      start_time: payload.startTime,
      end_time: payload.endTime,
      status: payload.status || 'draft',
      max_players: payload.maxPlayers || null,
      court_count: Number(payload.courtCount || payload.courts || 1),
      checkin_open: payload.checkinOpen !== false
    })
    .select('*, venue:v2_venues(*)')
    .single();

  if (error) throw error;
  return normalizeEvent(data);
}

export async function updateEventStatus(supabase, eventId, status) {
  const patch = {
    status,
    updated_at: new Date().toISOString()
  };
  if (['completed', 'ended', 'closed'].includes(String(status).toLowerCase())) patch.completed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('v2_events')
    .update(patch)
    .eq('id', eventId)
    .select('*, venue:v2_venues(*)')
    .single();

  if (error) throw error;
  return normalizeEvent(data);
}

export async function deleteEvent(supabase, eventId) {
  const { data, error } = await supabase
    .from('v2_events')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .select('id')
    .single();

  if (error) throw error;
  return { deletedId: data?.id || eventId };
}
