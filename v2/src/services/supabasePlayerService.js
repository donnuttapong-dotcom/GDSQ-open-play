// Supabase player service for GDSQ Open Play v2 shared mode.
// Use v2_ tables only.

function normalizeLevel(level) {
  if (typeof level === 'number') return level;
  const value = String(level || '').match(/[0-9]+(\.[0-9]+)?/);
  return value ? Number(value[0]) : 3;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isMissingSchemaObject(error, objectName) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return ['PGRST204', 'PGRST205'].includes(code) && message.includes(String(objectName).toLowerCase());
}

async function upsertPlayerProfile(supabase, payload, name, level) {
  const email = normalizeEmail(payload.email);
  if (!email) return null;
  const base = supabase
    .from('v2_players')
    .select('*')
    .eq('organization_id', payload.organizationId)
    .ilike('email', email)
    .maybeSingle();
  const { data: existing, error: readError } = await base;
  // Older production installs do not have v2_players yet. Joining the event
  // must still work as a guest until the private profile store is available.
  if (readError && isMissingSchemaObject(readError, 'v2_players')) return null;
  if (readError) throw readError;

  const profilePatch = {
    display_name: name,
    email,
    default_level: level,
    avatar_url: payload.avatarUrl || existing?.avatar_url || null,
    updated_at: new Date().toISOString()
  };
  if (existing) {
    const { data, error } = await supabase
      .from('v2_players')
      .update(profilePatch)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('v2_players')
    .insert({ organization_id: payload.organizationId, ...profilePatch })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function findPlayerProfileByEmail(supabase, organizationId, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const { data, error } = await supabase
    .from('v2_players')
    .select('*')
    .eq('organization_id', organizationId)
    .ilike('email', normalized)
    .maybeSingle();
  if (error && isMissingSchemaObject(error, 'v2_players')) return null;
  if (error) throw error;
  return data || null;
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
    avatarUrl: row.avatar_url || '',
    avatar_url: row.avatar_url || '',
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
  const level = normalizeLevel(payload.estimatedLevel || payload.level);
  const requestedEmail = normalizeEmail(payload.email);
  const profile = await upsertPlayerProfile(supabase, payload, name, level);
  const profileState = {
    profileLinked: Boolean(profile),
    profileFallback: Boolean(requestedEmail && !profile)
  };

  const existingQuery = supabase
    .from('v2_event_players')
    .select('*')
    .eq('event_id', payload.eventId)
    .neq('status', 'removed')
    .order('queue_joined_at', { ascending: false })
    .limit(1);
  const { data: existing, error: readError } = profile
    ? await existingQuery.eq('player_id', profile.id).maybeSingle()
    : await existingQuery.ilike('display_name', name).maybeSingle();
  if (readError) throw readError;
  if (existing) {
    const eventPlayerPatch = {
      display_name: profile?.display_name || name,
      estimated_level: profile?.default_level || level,
      updated_at: new Date().toISOString()
    };
    const avatarUrl = profile?.avatar_url || payload.avatarUrl || existing.avatar_url || '';
    if (avatarUrl) eventPlayerPatch.avatar_url = avatarUrl;
    let { data, error } = await supabase
      .from('v2_event_players')
      .update(eventPlayerPatch)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error && isMissingSchemaObject(error, 'avatar_url')) {
      delete eventPlayerPatch.avatar_url;
      ({ data, error } = await supabase
        .from('v2_event_players')
        .update(eventPlayerPatch)
        .eq('id', existing.id)
        .select('*')
        .single());
    }
    if (error) throw error;
    return { ...normalizePlayer(data), ...profileState, duplicate: true };
  }

  const eventPlayerPayload = {
    organization_id: payload.organizationId,
    event_id: payload.eventId,
    player_id: profile?.id || payload.playerId || null,
    display_name: profile?.display_name || name,
    estimated_level: profile?.default_level || level,
    status: payload.status || 'checked_in',
    queue_joined_at: new Date().toISOString()
  };
  const avatarUrl = profile?.avatar_url || payload.avatarUrl || '';
  if (avatarUrl) eventPlayerPayload.avatar_url = avatarUrl;
  let { data, error } = await supabase
    .from('v2_event_players')
    .insert(eventPlayerPayload)
    .select('*')
    .single();
  if (error && isMissingSchemaObject(error, 'avatar_url')) {
    delete eventPlayerPayload.avatar_url;
    ({ data, error } = await supabase
      .from('v2_event_players')
      .insert(eventPlayerPayload)
      .select('*')
      .single());
  }

  if (error) throw error;
  return { ...normalizePlayer(data), ...profileState };
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
