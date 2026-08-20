import { normalizeEdgeFunctionError } from './edgeFunctionError.js';

const CAPABILITY_PREFIX = 'gdsq_v2_player_capability:';
const LAST_IDENTITY_KEY = 'gdsq_v2_last_identity';
const SMART_QUEUE_CAPABILITY_PREFIX = 'gdsq_v2_smart_queue_capability:';

function localStorageAvailable() {
  return typeof localStorage !== 'undefined';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLevel(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(6, parsed)) : 3;
}

function normalizeProfile(row = {}) {
  return {
    ...row,
    id: row.id || row.playerId || row.player_id,
    playerId: row.id || row.playerId || row.player_id,
    playerCode: row.player_code || row.playerCode || '',
    displayName: row.display_name || row.displayName || 'Player',
    avatarUrl: row.avatar_url || row.avatarUrl || '',
    defaultLevel: Number(row.default_level || row.defaultLevel || 3)
  };
}

function normalizeEventPlayer(row = {}) {
  return {
    ...row,
    id: row.id || row.eventPlayerId || row.event_player_id,
    eventId: row.event_id || row.eventId,
    playerId: row.player_id || row.playerId || null,
    displayName: row.display_name || row.displayName || 'Player',
    name: row.display_name || row.displayName || 'Player',
    nickname: row.display_name || row.displayName || 'Player',
    estimatedLevel: Number(row.estimated_level || row.estimatedLevel || 3),
    level: Number(row.estimated_level || row.estimatedLevel || 3),
    avatarUrl: row.avatar_url || row.avatarUrl || '',
    status: row.status || 'ready',
    queueJoinedAt: row.queue_joined_at || row.queueJoinedAt || row.created_at,
    createdAt: row.created_at || row.createdAt
  };
}

function errorFrom(result, fallback) {
  const error = new Error(result?.error || fallback);
  error.code = result?.code || '';
  return error;
}

export function rememberPlayerCapability({ playerId, capability, playerCode = '', displayName = '', email = '' } = {}) {
  if (!localStorageAvailable() || !playerId || !capability) return;
  localStorage.setItem(`${CAPABILITY_PREFIX}${playerId}`, capability);
  localStorage.setItem(LAST_IDENTITY_KEY, JSON.stringify({ playerId, playerCode, displayName: String(displayName).trim(), email: normalizeEmail(email), savedAt: new Date().toISOString() }));
}

export function capabilityForPlayer(playerId) {
  if (!localStorageAvailable() || !playerId) return '';
  return localStorage.getItem(`${CAPABILITY_PREFIX}${playerId}`) || '';
}

export function rememberedPlayerIdentity() {
  if (!localStorageAvailable()) return null;
  try {
    return JSON.parse(localStorage.getItem(LAST_IDENTITY_KEY) || 'null');
  } catch {
    return null;
  }
}

async function invoke(supabase, body) {
  const { data, error } = await supabase.functions.invoke('v2-player-identity', { body });
  if (error) throw await normalizeEdgeFunctionError(error, 'Player identity request failed');
  if (!data?.ok) throw errorFrom(data, 'Player identity request failed');
  return data;
}

export async function joinCanonicalPlayer(supabase, payload = {}) {
  const displayName = String(payload.displayName || payload.name || '').trim();
  const email = normalizeEmail(payload.email);
  const remembered = rememberedPlayerIdentity();
  const rememberedMatches = remembered
    && String(remembered.displayName || '').trim().toLowerCase() === displayName.toLowerCase()
    && (!email || !remembered.email || normalizeEmail(remembered.email) === email);
  const playerId = payload.playerId || (rememberedMatches ? remembered.playerId : '');
  const capability = payload.capability || capabilityForPlayer(playerId);
  const data = await invoke(supabase, {
    action: 'join',
    eventId: payload.eventId,
    organizationId: payload.organizationId,
    displayName,
    email,
    level: normalizeLevel(payload.level || payload.estimatedLevel),
    avatarDataUrl: payload.avatarUrl || '',
    deviceLabel: payload.deviceLabel || '',
    playerId: playerId || undefined,
    capability: capability || undefined,
    playerCode: payload.playerCode || undefined
  });
  const profile = data.profile ? normalizeProfile(data.profile) : null;
  if (profile && data.capability) rememberPlayerCapability({ playerId: profile.id, playerCode: profile.playerCode, displayName: profile.displayName, email, capability: data.capability });
  if (localStorageAvailable() && data.smartQueueCapability && data.eventPlayer?.id) {
    localStorage.setItem(`${SMART_QUEUE_CAPABILITY_PREFIX}${data.eventPlayer.event_id || payload.eventId}:${data.eventPlayer.id}`, data.smartQueueCapability);
  }
  return {
    ...normalizeEventPlayer(data.eventPlayer),
    profile,
    profileLinked: Boolean(profile),
    profileFallback: false,
    guest: !profile,
    duplicate: Boolean(data.alreadyJoined),
    alreadyJoined: Boolean(data.alreadyJoined),
    identityState: data.identityState || '',
    legacyCandidatesCount: Number(data.legacyCandidatesCount || 0),
    smartQueueCapability: data.smartQueueCapability || ''
  };
}

export async function getOwnPlayerProfile(supabase, { playerId, capability } = {}) {
  const resolvedId = playerId || rememberedPlayerIdentity()?.playerId;
  const resolvedCapability = capability || capabilityForPlayer(resolvedId);
  if (!resolvedId || !resolvedCapability) {
    const error = new Error('PLAYER_CAPABILITY_REQUIRED');
    error.code = 'PLAYER_CAPABILITY_REQUIRED';
    throw error;
  }
  const data = await invoke(supabase, { action: 'getOwnProfile', playerId: resolvedId, capability: resolvedCapability });
  return normalizeProfile(data.profile);
}

export async function updateOwnPlayerProfile(supabase, payload = {}) {
  const playerId = payload.playerId || rememberedPlayerIdentity()?.playerId;
  const capability = payload.capability || capabilityForPlayer(playerId);
  if (!playerId || !capability) {
    const error = new Error('PLAYER_CAPABILITY_REQUIRED');
    error.code = 'PLAYER_CAPABILITY_REQUIRED';
    throw error;
  }
  const data = await invoke(supabase, {
    action: 'updateOwnProfile',
    playerId,
    capability,
    displayName: String(payload.displayName || '').trim(),
    level: payload.level == null ? null : normalizeLevel(payload.level),
    avatarDataUrl: payload.avatarUrl || ''
  });
  return normalizeProfile(data.profile);
}

export async function resolvePlayerCode(supabase, playerCode) {
  const data = await invoke(supabase, { action: 'resolvePlayerCode', playerCode: String(playerCode || '').trim() });
  return normalizeProfile(data.profile);
}

export async function getPublicPlayerHistory(supabase, { organizationId, playerCode } = {}) {
  const data = await invoke(supabase, {
    action: 'getPublicPlayerHistory',
    organizationId,
    playerCode: String(playerCode || '').trim()
  });
  return data.experience;
}

export async function listOpenPlayerEvents(supabase, organizationId) {
  const data = await invoke(supabase, { action: 'listOpenEvents', organizationId });
  return Array.isArray(data.events) ? data.events : [];
}

export async function resolveEventPlayerCodes(supabase, organizationId, eventPlayerIds = []) {
  const data = await invoke(supabase, { action: 'resolveEventPlayerCodes', organizationId, eventPlayerIds });
  return Array.isArray(data.players) ? data.players : [];
}
