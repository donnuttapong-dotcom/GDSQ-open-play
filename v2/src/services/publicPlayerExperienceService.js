import {
  getPublicPlayerHistory,
  joinCanonicalPlayer,
  listOpenPlayerEvents,
  rememberedPlayerIdentity
} from './playerIdentityService.js';

export function normalizePlayerCode(value) {
  return String(value || '').trim().toUpperCase();
}

export function playerHistoryUrl(playerCode, baseUrl = globalThis.location?.href || 'http://localhost/') {
  const url = new URL('./player-history.html', baseUrl);
  url.searchParams.set('code', normalizePlayerCode(playerCode));
  url.searchParams.set('mode', 'supabase');
  return url.toString();
}

export function playerQrImageUrl(playerCode, baseUrl) {
  const target = playerHistoryUrl(playerCode, baseUrl);
  return `https://quickchart.io/qr?size=700&margin=2&text=${encodeURIComponent(target)}`;
}

export async function loadPublicPlayerExperience(supabase, { organizationId, playerCode }) {
  return getPublicPlayerHistory(supabase, {
    organizationId,
    playerCode: normalizePlayerCode(playerCode)
  });
}

export async function loadFastReturnEvents(supabase, organizationId) {
  return listOpenPlayerEvents(supabase, organizationId);
}

export function deviceOwnsPlayer(playerCode) {
  const remembered = rememberedPlayerIdentity();
  return Boolean(remembered?.playerId && normalizePlayerCode(remembered.playerCode) === normalizePlayerCode(playerCode));
}

export async function fastReturnJoin(supabase, { organizationId, eventId, profile }) {
  if (!profile?.playerCode || !profile?.displayName) throw new Error('PLAYER_NOT_FOUND');
  return joinCanonicalPlayer(supabase, {
    organizationId,
    eventId,
    displayName: profile.displayName,
    level: profile.defaultLevel,
    playerCode: profile.playerCode
  });
}
