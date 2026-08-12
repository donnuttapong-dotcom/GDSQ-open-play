// Supabase player service for GDSQ Open Play v2 shared mode.
// Use v2_ tables only.

const AVATAR_BUCKET = 'v2-player-avatars';

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

async function authenticatedUser(supabase) {
  const { data, error } = await supabase.auth.getUser();
  if (error && !/session.*missing|auth session missing/i.test(String(error.message || ''))) throw error;
  return data?.user || null;
}

function avatarFile(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  const extension = match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1];
  return { blob: new Blob([bytes], { type: match[1] }), extension };
}

async function uploadAvatar(supabase, dataUrl, eventId, user) {
  const file = avatarFile(dataUrl);
  if (!file || !user?.id) return { url: '', skipped: Boolean(dataUrl) };
  const randomId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${user.id}/${eventId || 'profile'}/${randomId}.${file.extension}`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file.blob, { cacheControl: '31536000', contentType: file.blob.type, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return { url: data?.publicUrl || '', skipped: false };
}

async function upsertPlayerProfile(supabase, payload, name, level) {
  const email = normalizeEmail(payload.email);
  if (!email) return null;
  const user = payload.authUser || await authenticatedUser(supabase);
  if (!user || !user.email_confirmed_at || normalizeEmail(user.email) !== email) return null;
  const base = supabase
    .from('v2_players')
    .select('*')
    .eq('organization_id', payload.organizationId)
    .eq('user_id', user.id)
    .maybeSingle();
  const { data: existing, error: readError } = await base;
  // Older production installs do not have v2_players yet. Joining the event
  // must still work as a guest until the private profile store is available.
  if (readError && isMissingSchemaObject(readError, 'v2_players')) return null;
  if (readError) throw readError;

  const profilePatch = {
    display_name: name,
    email,
    user_id: user.id,
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
  const user = await authenticatedUser(supabase);
  if (!user || !user.email_confirmed_at || normalizeEmail(user.email) !== normalized) return null;
  const { data, error } = await supabase
    .from('v2_players')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
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
  const authUser = await authenticatedUser(supabase);
  let uploadedAvatar = { url: '', skipped: false };
  try {
    uploadedAvatar = await uploadAvatar(supabase, payload.avatarUrl, payload.eventId, authUser);
  } catch (error) {
    uploadedAvatar = { url: '', skipped: true, error };
  }
  const profilePayload = {
    ...payload,
    authUser,
    avatarUrl: uploadedAvatar.url || (/^https?:\/\//i.test(String(payload.avatarUrl || '')) ? payload.avatarUrl : '')
  };
  const profile = await upsertPlayerProfile(supabase, profilePayload, name, level);
  const profileState = {
    profileLinked: Boolean(profile),
    profileFallback: Boolean(requestedEmail && !profile),
    avatarUploadWarning: Boolean(uploadedAvatar.skipped)
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
    const avatarUrl = profile?.avatar_url || profilePayload.avatarUrl || existing.avatar_url || '';
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
  const avatarUrl = profile?.avatar_url || profilePayload.avatarUrl || '';
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

export async function getAuthenticatedPlayer(supabase) {
  const user = await authenticatedUser(supabase);
  return user ? {
    id: user.id,
    email: normalizeEmail(user.email),
    emailVerified: Boolean(user.email_confirmed_at),
    emailVerifiedAt: user.email_confirmed_at || null
  } : null;
}

export async function joinVerifiedPlayerEvent(supabase, payload) {
  const user = await authenticatedUser(supabase);
  if (!user) throw new Error('AUTH_REQUIRED');
  if (!user.email_confirmed_at) throw new Error('EMAIL_NOT_VERIFIED');
  let avatarUrl = '';
  if (payload.avatarUrl) {
    const uploaded = await uploadAvatar(supabase, payload.avatarUrl, payload.eventId, user);
    avatarUrl = uploaded.url || '';
  }
  const { data, error } = await supabase.rpc('v2_join_verified_player_event', {
    p_event_id: payload.eventId,
    p_display_name: String(payload.displayName || '').trim(),
    p_level: normalizeLevel(payload.level),
    p_avatar_url: avatarUrl || null
  });
  if (error) throw error;
  return {
    eventPlayerId: data?.event_player_id,
    playerProfileId: data?.player_profile_id,
    displayName: data?.display_name,
    avatarUrl: data?.avatar_url || '',
    alreadyJoined: Boolean(data?.already_joined),
    emailVerified: Boolean(data?.email_verified)
  };
}

export async function joinInstantPlayerEvent(supabase, payload) {
  const { data, error } = await supabase.rpc('v2_join_instant_player_event', {
    p_event_id: payload.eventId,
    p_display_name: String(payload.displayName || '').trim(),
    p_email: normalizeEmail(payload.email),
    p_level: normalizeLevel(payload.level)
  });
  if (error) throw error;
  return {
    eventPlayerId: data?.event_player_id,
    playerProfileId: data?.player_profile_id,
    displayName: data?.display_name,
    avatarUrl: data?.avatar_url || '',
    alreadyJoined: Boolean(data?.already_joined),
    emailVerified: Boolean(data?.email_verified)
  };
}

export async function updateMyPlayerProfile(supabase, payload) {
  const user = await authenticatedUser(supabase);
  if (!user) throw new Error('AUTH_REQUIRED');
  if (!user.email_confirmed_at) throw new Error('EMAIL_NOT_VERIFIED');
  let avatarUrl = '';
  if (payload.avatarUrl) {
    const uploaded = await uploadAvatar(supabase, payload.avatarUrl, 'profile', user);
    avatarUrl = uploaded.url || '';
  }
  const { data, error } = await supabase.rpc('v2_update_my_player_profile', {
    p_display_name: String(payload.displayName || '').trim(),
    p_avatar_url: avatarUrl || null,
    p_default_level: payload.level == null ? null : normalizeLevel(payload.level)
  });
  if (error) throw error;
  return data;
}

export async function requestPlayerProfileClaim(supabase, eventPlayerId) {
  const { data, error } = await supabase.rpc('v2_request_player_profile_claim', {
    p_event_player_id: eventPlayerId
  });
  if (error) throw error;
  return data;
}

export async function listMyPlayerProfileClaims(supabase) {
  const { data, error } = await supabase
    .from('v2_player_profile_claims')
    .select('id,event_id,event_player_id,player_id,status,admin_note,created_at,reviewed_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function sendPlayerSignInLink(supabase, email, redirectTo) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('Email is required');
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: redirectTo
    }
  });
  if (error) throw error;
  return true;
}

export async function signOutPlayer(supabase) {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  return true;
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
